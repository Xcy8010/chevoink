import { randomUUID } from 'node:crypto'

import type {
  AgentExecutionMode,
  AgentMessagePart,
  AgentTodoItem,
  AgentTokenUsage,
} from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import { chatWithTools, type ChatMessage, type ToolCallRequest } from '../ai-service.js'
import { prisma } from '../prisma.js'
import { getAgentDefinition, getToolsForAgent, type AgentDefinition } from './agents.js'
import { clearRunBaselines } from './baseline.js'
import { assembleContext } from './context.js'
import { createRunEventBus, disposeRunEventBus, type RunEventBus } from './events.js'
import {
  cancelAllQuestions,
  grantAlwaysAllow,
  hasAlwaysAllow,
  rejectAllApprovals,
  waitForApproval,
} from './permissions.js'
import { getToolByName, toOpenAITools } from './tools/registry.js'
import { loadSessionTodoItems, renderTodoItems } from './tools/todo-tools.js'
import type { AgentTool, ToolContext } from './tools/types.js'
import { autoNameSession } from './session-title.js'

/**
 * Agent Loop 执行内核（plan/13 §4.3）。
 * while 循环：LLM → tool_calls → 执行 → tool 消息回填 → 再 LLM，直到 finishReason !== 'tool_calls'。
 * - 错误即观察：工具失败不中断 run，错误信息回填给模型自愈
 * - 审批暂停-恢复：'ask' 工具挂起循环等待前端批复，超时视为拒绝
 * - maxTurns + token 预算双保险防失控计费
 */

type ActiveRun = {
  controller: AbortController
  bus: RunEventBus
  sessionId: string
  userId: string
}

const activeRuns = new Map<string, ActiveRun>()

export function getActiveRun(runId: string): ActiveRun | undefined {
  return activeRuns.get(runId)
}

export function countActiveRunsByUser(userId: string): number {
  let count = 0
  for (const run of activeRuns.values()) {
    if (run.userId === userId) {
      count += 1
    }
  }
  return count
}

export function hasActiveRunInSession(sessionId: string): boolean {
  for (const run of activeRuns.values()) {
    if (run.sessionId === sessionId) {
      return true
    }
  }
  return false
}

/** 查询会话内进行中的 run id：前端刷新后恢复直播/停止入口用 */
export function getActiveRunIdBySession(sessionId: string): string | null {
  for (const [runId, run] of activeRuns) {
    if (run.sessionId === sessionId) {
      return runId
    }
  }
  return null
}

/** 停止会话内全部进行中的 run：删除会话前清理，避免孤儿任务阻塞删除或继续写库 */
export function stopActiveRunsInSession(sessionId: string): number {
  let stopped = 0
  for (const run of activeRuns.values()) {
    if (run.sessionId === sessionId) {
      run.controller.abort()
      stopped += 1
    }
  }
  return stopped
}

/** 用户点击停止：abort 上游请求 + 唤醒挂起审批，循环自行收尾为 paused */
export function stopAgentRun(runId: string): boolean {
  const active = activeRuns.get(runId)

  if (!active) {
    return false
  }

  active.controller.abort()
  return true
}

export type ExecuteAgentRunParams = {
  runId: string
  sessionId: string
  userId: string
  novelId: string
  chapterId: string | null
  mode: AgentExecutionMode
  prompt: string
  selection?: { text: string; start?: number; end?: number } | null
  agentType?: string
  /** 从 paused 恢复：历史含本 run 已持久化的消息，prompt 换成续跑指令 */
  resume?: boolean
}

const emptyUsage = (): AgentTokenUsage => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })

function addUsage(total: AgentTokenUsage, delta: AgentTokenUsage) {
  total.promptTokens += delta.promptTokens
  total.completionTokens += delta.completionTokens
  total.totalTokens += delta.totalTokens
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))
}

async function persistMessage(
  id: string,
  runId: string,
  sessionId: string,
  role: 'user' | 'assistant',
  parts: AgentMessagePart[],
) {
  try {
    await prisma.agentMessage.create({
      data: { id, runId, sessionId, role, parts: parts as unknown as object },
    })
  } catch (error) {
    console.error('[agent-loop] 消息持久化失败', runId, error)
  }
}

/** 工具输出包裹来源标注：正文/记忆里的指令性文字不构成新指令（plan/13 §4.10） */
function wrapToolOutput(toolName: string, output: string): string {
  return `<tool_output tool="${toolName}">\n${output}\n</tool_output>`
}

/**
 * 伪工具调用检测（plan/14 §五 C1）：模型把调用写进正文而没有真正发起 function calling。
 * 多模式覆盖：历史压缩标记格式、工具名+参数 JSON 同段出现、“我现在调用 xx”句式。
 */
function looksLikePseudoToolCall(content: string, toolNames: string[]): boolean {
  if (/\[调用\s*(?:工具|tool)/i.test(content)) {
    return true
  }

  const mentioned = toolNames.filter((name) => content.includes(name))
  if (mentioned.length > 0) {
    // 工具名与参数 JSON（如 {"title": …）同时出现：大概率在文本里模拟调用
    if (/[{｛]\s*["'“”]?\w+["'“”]?\s*[:：]/.test(content)) {
      return true
    }
    if (mentioned.some((name) => new RegExp(`我(现在|将|马上|立[即刻]|来)?\\s*(调用|发起|执行|使用)[^。\\n]{0,20}${name}`).test(content))) {
      return true
    }
  }

  return /我(现在|将|马上|立[即刻])\s*(调用|发起|执行)[^。\n]{0,12}工具/.test(content)
}

/** 报幕式旁白句式表（plan/14 §五 C2）：只收录高置信的执行叙述开场，防误伤真结论 */
const NARRATION_PATTERNS: RegExp[] = [
  /^先[^。\n]{0,30}(再|然后)/,
  /^信息(已|已经)[^。\n]{0,10}掌握/,
  /^(现在|接下来|下一步)(我)?(开始|制定|落盘|执行|进行|读取|检索|分析)/,
  /^方向(已)?明确/,
  /^(好的|明白了|收到)[，。]/,
  /^我(现在|需要|应该|先|来|将)/,
  /^让我/,
  /^(抱歉|不好意思)[，。][^。\n]{0,20}(补上|重新|纠正)/,
  /^根据[^。\n]{0,10}模式的规则/,
]

/** 中间轮次的短正文若命中旁白句式，判定为执行叙述（应进思考区而非正文） */
function isNarrationOnly(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed || trimmed.length > 160) {
    return false
  }
  return NARRATION_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/** 旁白熔断的流式缓冲上限：超过即视为真结论，转实时流式 */
const NARRATION_BUFFER_LIMIT = 160

/** 工具参数流式进度的节流步长：每多生成这么多参数字符才发一次 tool.delta，控制事件量 */
const TOOL_ARGS_PROGRESS_STEP = 200

/** 长上下文防稀释阈值（plan/14 §三 A4）：超过后每轮在队尾刷新一条轻量提醒 */
const CONTEXT_REMINDER_THRESHOLD_CHARS = 60000

/** 上下文瘦身阈值：messages 总字符超过后，把久远轮次的工具输出压缩成摘要，
 * 支撑百轮长任务不撞模型上下文窗口（deepseek 128K token ≈ 中文 15 万字符量级） */
const CONTEXT_SLIM_THRESHOLD_CHARS = 150000
/** 瘦身时保留最近 N 条工具输出不动：近期结果是当前决策的主要依据 */
const CONTEXT_SLIM_KEEP_RECENT_TOOL_OUTPUTS = 8

/** 长任务上下文瘦身：久远工具输出原文已落库/已被后续轮次消化，压成短摘要释放窗口；
 * 模型需要旧内容时可重新调用读取类工具（chapter_read/plan_read 等）取回 */
function slimEarlyToolOutputs(messages: ChatMessage[]) {
  const toolIndexes: number[] = []
  for (let index = 0; index < messages.length; index++) {
    if (messages[index].role === 'tool') {
      toolIndexes.push(index)
    }
  }

  const cutoff = toolIndexes.length - CONTEXT_SLIM_KEEP_RECENT_TOOL_OUTPUTS
  for (let k = 0; k < cutoff; k++) {
    const message = messages[toolIndexes[k]] as Extract<ChatMessage, { role: 'tool' }>
    if (message.content.length > 600 && !message.content.startsWith('[工具输出已压缩]')) {
      message.content = `[工具输出已压缩] ${message.content.slice(0, 300)}…（原 ${message.content.length} 字，内容已落库，需要时重新调用读取工具获取）`
    }
  }
}

type ToolCallOutcome = {
  observation: string
  part: Extract<AgentMessagePart, { type: 'tool-call' }>
}

/** 容错 JSON 解析：模型生成长正文参数时最常见的三类毛病可自动修复，
 * 避免一整章内容因一个未转义换行符就全部作废重写：
 * 1. 字符串内部出现未转义的控制字符（真换行/制表符）
 * 2. 参数被 ```json 围栏或前后多余文本包裹
 * 3. 输出被 length 截断导致字符串/花括号未闭合 */
function parseToolArgsTolerant(raw: string): unknown {
  const attempts: string[] = [raw]

  // 剥离 Markdown 围栏与前后多余文本：取第一个 { 到最后一个 } 之间
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first > 0 || (first >= 0 && last >= 0 && last < raw.length - 1)) {
    attempts.push(raw.slice(first, last + 1))
  }

  // 转义字符串内部的裸控制字符（逐字符扫描，只在引号内替换，不破坏结构性空白）
  const escapeControlChars = (input: string): string => {
    let out = ''
    let inString = false
    for (let i = 0; i < input.length; i++) {
      const char = input[i]
      if (inString) {
        if (char === '\\' && i + 1 < input.length) {
          out += char + input[i + 1]
          i += 1
          continue
        }
        if (char === '"') {
          inString = false
          out += char
          continue
        }
        if (char === '\n') {
          out += '\\n'
          continue
        }
        if (char === '\r') {
          out += '\\r'
          continue
        }
        if (char === '\t') {
          out += '\\t'
          continue
        }
        out += char
        continue
      }
      if (char === '"') {
        inString = true
      }
      out += char
    }
    return out
  }

  for (const candidate of [...attempts]) {
    attempts.push(escapeControlChars(candidate))
  }

  // 截断修复：扫描未闭合的字符串与括号栈，补齐后再试
  const repairTruncated = (input: string): string => {
    let inString = false
    const stack: string[] = []
    for (let i = 0; i < input.length; i++) {
      const char = input[i]
      if (inString) {
        if (char === '\\') {
          i += 1
        } else if (char === '"') {
          inString = false
        }
        continue
      }
      if (char === '"') {
        inString = true
      } else if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']')
      } else if (char === '}' || char === ']') {
        stack.pop()
      }
    }
    let repaired = input
    if (inString) {
      repaired += '"'
    }
    while (stack.length > 0) {
      repaired += stack.pop()
    }
    return repaired
  }

  for (const candidate of [...attempts]) {
    attempts.push(repairTruncated(candidate))
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate)
    } catch {
      // 继续下一个候选
    }
  }

  throw new Error('参数无法解析为 JSON')
}

async function handleToolCall(
  call: ToolCallRequest,
  tools: AgentTool[],
  ctx: ToolContext,
  bus: RunEventBus,
  messageId: string,
  runId: string,
): Promise<ToolCallOutcome> {
  const startedAt = Date.now()
  const tool = tools.find((candidate) => candidate.name === call.name) ?? getToolByName(call.name)
  const basePart = {
    type: 'tool-call' as const,
    callId: call.id,
    toolName: call.name,
    title: tool?.title ?? call.name,
  }

  // 参数解析与校验：先容错修复常见格式毛病，实在修不好再作为观察回填让模型自行修正
  let parsedArgs: unknown = {}
  try {
    parsedArgs = call.arguments ? parseToolArgsTolerant(call.arguments) : {}
  } catch {
    const observation = `工具 ${call.name} 的参数不是合法 JSON，本次调用完全没有执行。请立即重新发起同一个工具调用：字符串内的换行必须写成 \\n，不要用 Markdown 围栏包裹参数；如果正文很长，改用 chapter_write 写开头部分，再用 chapter_append 分 2-3 次追加剩余段落，避免单次参数过长被截断。绝对禁止放弃重试或改在回复正文里完成该操作。原始参数：${call.arguments.slice(0, 400)}`
    bus.emit({ type: 'tool.call', messageId, callId: call.id, toolName: call.name, title: basePart.title, args: null })
    bus.emit({
      type: 'tool.result',
      messageId,
      callId: call.id,
      toolName: call.name,
      ok: false,
      summary: '参数解析失败',
      durationMs: Date.now() - startedAt,
    })
    return { observation, part: { ...basePart, args: null, status: 'failed', summary: '参数解析失败' } }
  }

  bus.emit({ type: 'tool.call', messageId, callId: call.id, toolName: call.name, title: basePart.title, args: parsedArgs })

  const fail = (summary: string, observation: string, status: 'failed' | 'denied'): ToolCallOutcome => {
    bus.emit({
      type: 'tool.result',
      messageId,
      callId: call.id,
      toolName: call.name,
      ok: false,
      summary,
      durationMs: Date.now() - startedAt,
    })
    return { observation, part: { ...basePart, args: parsedArgs, status, summary } }
  }

  if (!tool) {
    return fail('未知工具', `工具 ${call.name} 不存在。可用工具见 tools 列表，请换用正确的工具。`, 'failed')
  }

  const permission = tool.permission[ctx.mode]

  if (permission === 'deny') {
    return fail(
      '当前模式禁止',
      `工具 ${call.name} 在 ${ctx.mode} 模式下被禁止。请改用只读工具，或提示用户切换模式。`,
      'denied',
    )
  }

  const validated = tool.parameters.safeParse(parsedArgs)

  if (!validated.success) {
    const issues = validated.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('；')
    // 附带当前章节 ID：缺 chapterId 是最高发的校验失败，直接喂给模型避免它盲猜或多耗一轮去查
    const chapterHint = ctx.chapterId ? `作者当前正在编辑的章节 chapterId=${ctx.chapterId}。` : ''
    return fail('参数校验失败', `工具 ${call.name} 参数校验失败：${issues}。${chapterHint}本次调用完全没有执行，请补齐/修正参数后立即重新发起同一个工具调用，绝对禁止放弃重试或改在回复正文里完成该操作。`, 'failed')
  }

  // 审批：'ask' 且未被会话级"总是允许"覆盖时，挂起等待前端批复
  const needAsk = permission === 'ask' && !(hasAlwaysAllow(ctx.sessionId, tool.name) && !tool.dangerous)

  if (needAsk) {
    const expiresAt = new Date(Date.now() + env.agentApprovalTimeoutMs).toISOString()
    await prisma.agentRun.update({ where: { id: runId }, data: { status: 'awaiting_approval' } }).catch(() => {})
    bus.emit({
      type: 'permission.ask',
      callId: call.id,
      toolName: tool.name,
      title: tool.title,
      args: validated.data,
      allowAlways: !tool.dangerous,
      expiresAt,
    })

    const decision = await waitForApproval(runId, call.id, tool.name, env.agentApprovalTimeoutMs, ctx.signal)
    bus.emit({ type: 'permission.resolved', callId: call.id, approved: decision.approved })
    await prisma.agentRun.update({ where: { id: runId }, data: { status: 'running' } }).catch(() => {})

    if (!decision.approved) {
      const reason = decision.timedOut ? '审批超时，视为拒绝' : '用户拒绝了本次操作'
      return fail(reason, `${reason}：工具 ${call.name} 未执行。请尊重用户决定，换一种方式完成任务或直接说明情况。`, 'denied')
    }

    if (decision.alwaysAllow && !tool.dangerous) {
      grantAlwaysAllow(ctx.sessionId, tool.name)
    }
  }

  try {
    const result = await tool.execute(ctx, validated.data)
    const durationMs = Date.now() - startedAt
    const summary = result.summary ?? `${tool.title}完成`

    bus.emit({
      type: 'tool.result',
      messageId,
      callId: call.id,
      toolName: call.name,
      ok: true,
      summary,
      display: result.display,
      durationMs,
    })

    return {
      observation: wrapToolOutput(tool.name, result.output),
      part: {
        ...basePart,
        args: validated.data,
        status: 'success',
        summary,
        display: result.display,
        durationMs,
        // 写操作快照随消息落库，供「回退到本轮对话前」逆序恢复
        snapshot: result.snapshot,
      },
    }
  } catch (error) {
    // 错误即观察：不中断 run，把错误回填给模型自行重试或换路
    const message = error instanceof Error ? error.message : String(error)
    return fail('执行失败', `工具 ${call.name} 执行失败：${message}。可以调整参数重试，或换用其他工具。`, 'failed')
  }
}

async function finalizeRun(
  runId: string,
  bus: RunEventBus,
  status: 'succeeded' | 'failed' | 'cancelled' | 'paused',
  usage: AgentTokenUsage,
  currentTurn: number,
  outputSummary: string,
  errorMessage?: string,
) {
  if (status === 'paused') {
    bus.emit({ type: 'run.paused', reason: 'user_stop' })
  } else {
    bus.emit({ type: 'run.finished', status, usage, artifacts: [], outputSummary })
  }

  // 事件协议用 succeeded，DB 枚举用 completed
  const dbStatus = status === 'succeeded' ? 'completed' : status

  await prisma.agentRun
    .update({
      where: { id: runId },
      data: {
        status: dbStatus,
        outputSummary: outputSummary || null,
        errorMessage: errorMessage ?? null,
        usage: usage as unknown as object,
        currentTurn,
        finishedAt: status === 'paused' ? null : new Date(),
      },
    })
    .catch((error) => console.error('[agent-loop] run 状态落库失败', runId, error))

  rejectAllApprovals(runId)
  cancelAllQuestions(runId)
  if (status !== 'paused') {
    clearRunBaselines(runId)
  }
  activeRuns.delete(runId)
  await disposeRunEventBus(runId)
}

/** 启动（或续跑）一次 Agent Loop run：异步执行，调用方不等待 */
export async function executeAgentRun(params: ExecuteAgentRunParams): Promise<void> {
  const runId = params.runId
  const agent: AgentDefinition = getAgentDefinition(params.agentType ?? 'orchestrator')
  const controller = new AbortController()
  const bus = createRunEventBus(runId)

  activeRuns.set(runId, { controller, bus, sessionId: params.sessionId, userId: params.userId })

  const usage = emptyUsage()
  let turn = 0

  try {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date(), errorMessage: null },
    })
    await prisma.agentSession.update({
      where: { id: params.sessionId },
      data: { lastRunAt: new Date() },
    }).catch(() => {})

    bus.emit({
      type: 'run.started',
      agent: { type: agent.type, title: agent.title, model: agent.model },
      mode: params.mode,
      title: params.prompt.slice(0, 80),
    })

    const prompt = params.resume ? '请继续完成之前的任务。' : params.prompt
    await persistMessage(randomUUID(), runId, params.sessionId, 'user', [{ type: 'text', text: prompt }])

    // 首次对话且仍是默认标题时异步自动命名（仅一次，不阻塞循环）
    if (!params.resume) {
      void autoNameSession({
        sessionId: params.sessionId,
        userId: params.userId,
        novelId: params.novelId,
        prompt: params.prompt,
      })
    }

    const messages: ChatMessage[] = await assembleContext({
      agent,
      mode: params.mode,
      sessionId: params.sessionId,
      // 续跑时不排除本 run 已持久化的消息（'' 匹配所有 run）
      runId: params.resume ? '' : runId,
      userId: params.userId,
      novelId: params.novelId,
      chapterId: params.chapterId,
      prompt,
      selection: params.selection,
    })

    const tools = getToolsForAgent(agent, params.mode)
    const openAITools = toOpenAITools(tools)
    const maxTurns = env.agentMaxTurns

    const toolContext: ToolContext = {
      userId: params.userId,
      novelId: params.novelId,
      chapterId: params.chapterId,
      sessionId: params.sessionId,
      runId,
      callId: '',
      mode: params.mode,
      emit: (event) => bus.emit(event),
      signal: controller.signal,
    }

    let lastAssistantText = ''
    // 模型把工具调用写成正文文本而非真正 function calling 时的纠偏重试次数
    let pseudoToolCallRetries = 0
    const toolNameList = tools.map((tool) => tool.name)
    // C3：规划类任务必须以 plan_save 落盘收尾，只聊天不落盘时回填提醒
    const expectsPlanSave = params.mode === 'plan' && /(规划|大纲|计划)/.test(params.prompt)
    let planSavePerformed = false
    let planSaveReminders = 0
    // 长任务防早停：待办清单（todo_write 维护）未全部完成就想收尾时，回填强指令让它接着执行
    // 续跑时从会话恢复既有清单，新任务从空开始（避免上一个任务的残留待办干扰）
    let todoItems: AgentTodoItem[] = params.resume ? await loadSessionTodoItems(params.sessionId) : []
    let todoReminders = 0
    // A4：长上下文提醒消息（单实例，每轮移除后重新追加到队尾，保证只存在一条且最靠近当前轮）
    const contextReminder: ChatMessage = {
      role: 'user',
      content: `[系统提醒] 对话已较长，重申信道纪律：工具循环中间轮次正文保持为空；正文只写给作者的最终结论（不超过 2 句 80 字）；规划产出走 plan_save，修订带 planId；需要作者决策用 ask_user。当前模式：${params.mode}。`,
    }

    while (turn < maxTurns) {
      turn += 1

      // A4 长上下文防稀释：超过阈值后每轮把提醒刷新到队尾，拉回系统约束注意力
      const reminderIndex = messages.indexOf(contextReminder)
      if (reminderIndex >= 0) {
        messages.splice(reminderIndex, 1)
      }
      const totalChars = messages.reduce(
        (sum, message) => sum + (typeof message.content === 'string' ? message.content.length : 0),
        0,
      )
      if (totalChars > CONTEXT_REMINDER_THRESHOLD_CHARS) {
        messages.push(contextReminder)
      }
      // 上下文逼近模型窗口时压缩久远工具输出，长任务（连写多章）才能持续跑下去
      if (totalChars > CONTEXT_SLIM_THRESHOLD_CHARS) {
        slimEarlyToolOutputs(messages)
      }

      const messageId = randomUUID()
      bus.emit({ type: 'message.start', messageId, role: 'assistant' })

      // C2 旁白熔断：正文先攛一小段缓冲，短旁白等轮次结束后裁决是否改道进思考区；超过上限视为真结论，转实时流式
      let textBuffer = ''
      let textStreamed = false

      // 工具执行条提前显示：模型还在流式生成工具参数（写章节正文可能持续分钟级）时
      // 就先播报 tool.call（args 为 null），前端按 callId upsert，执行完毕的正式事件就地更新同一张卡片
      const announcedToolNames = new Map<string, string>()
      const toolArgsProgress = new Map<string, { chars: number; lastEmitted: number }>()

      const result = await chatWithTools({
        messages,
        tools: openAITools,
        model: agent.model,
        onChunk: (chunk) => {
          if (chunk.type === 'text-delta') {
            if (textStreamed) {
              bus.emit({ type: 'text.delta', messageId, delta: chunk.delta })
              return
            }
            textBuffer += chunk.delta
            if (textBuffer.length > NARRATION_BUFFER_LIMIT) {
              bus.emit({ type: 'text.delta', messageId, delta: textBuffer })
              textStreamed = true
              textBuffer = ''
            }
          } else if (chunk.type === 'reasoning-delta') {
            bus.emit({ type: 'reasoning.delta', messageId, delta: chunk.delta })
          } else if (chunk.type === 'tool-call-start') {
            // name 可能分片累加到达：每次变化都重发，前端 upsert 后标题自动修正
            if (chunk.id && announcedToolNames.get(chunk.id) !== chunk.name) {
              announcedToolNames.set(chunk.id, chunk.name)
              bus.emit({
                type: 'tool.call',
                messageId,
                callId: chunk.id,
                toolName: chunk.name,
                title: getToolByName(chunk.name)?.title ?? chunk.name,
                args: null,
              })
            }
          } else if (chunk.type === 'tool-call-arguments-delta') {
            if (chunk.id) {
              const progress = toolArgsProgress.get(chunk.id) ?? { chars: 0, lastEmitted: 0 }
              progress.chars += chunk.delta.length
              toolArgsProgress.set(chunk.id, progress)
              if (progress.chars - progress.lastEmitted >= TOOL_ARGS_PROGRESS_STEP) {
                progress.lastEmitted = progress.chars
                bus.emit({ type: 'tool.delta', messageId, callId: chunk.id, argsChars: progress.chars })
              }
            }
          }
        },
        signal: controller.signal,
        usageLog: {
          userId: params.userId,
          action: 'agentLoopTurn',
          novelId: params.novelId,
          chapterId: params.chapterId,
          targetType: 'agentRun',
          targetId: runId,
        },
      })

      addUsage(usage, result.usage)
      await prisma.agentRun.update({ where: { id: runId }, data: { currentTurn: turn } }).catch(() => {})

      messages.push({
        role: 'assistant',
        content: result.content || null,
        reasoning: result.reasoning || undefined,
        toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      })

      // C2 旁白熔断裁决：中间轮次（后续还有工具调用）的短旁白降级为 reasoning 推送，不删内容只改道；最终轮正文永不改道
      const demoteNarration =
        !textStreamed &&
        result.finishReason === 'tool_calls' &&
        !!result.content &&
        isNarrationOnly(result.content)

      if (!textStreamed && textBuffer) {
        if (demoteNarration) {
          bus.emit({ type: 'reasoning.delta', messageId, delta: `\n${textBuffer}` })
        } else {
          bus.emit({ type: 'text.delta', messageId, delta: textBuffer })
        }
      }

      const parts: AgentMessagePart[] = []
      if (result.reasoning || (demoteNarration && result.content)) {
        parts.push({
          type: 'reasoning',
          text: demoteNarration
            ? [result.reasoning, result.content].filter(Boolean).join('\n')
            : (result.reasoning as string),
        })
      }
      if (result.content && !demoteNarration) {
        parts.push({ type: 'text', text: result.content })
        lastAssistantText = result.content
      }

      if (result.finishReason !== 'tool_calls') {
        // 伪工具调用：模型把调用写进了正文（压缩标记/参数 JSON/“我现在调用”句式），实际没有执行。回填系统提示让它重新发起真调用，而不是直接结束 run
        if (result.content && looksLikePseudoToolCall(result.content, toolNameList) && pseudoToolCallRetries < 2) {
          pseudoToolCallRetries += 1
          await persistMessage(messageId, runId, params.sessionId, 'assistant', parts)
          bus.emit({ type: 'step.finish', turn, usage: result.usage })
          messages.push({
            role: 'user',
            content:
              '[系统] 你刚才把工具调用写成了文本，并没有发起真正的工具调用，操作完全没有执行。请立刻通过 function calling 重新发起需要的工具调用，绝对不要在回复文本里描述、模拟或预告调用。',
          })
          continue
        }

        // C3：规划类任务未经 plan_save 落盘就想收尾，回填提醒（最多 2 次）防止全程只聊天不落盘
        if (expectsPlanSave && !planSavePerformed && planSaveReminders < 2) {
          planSaveReminders += 1
          await persistMessage(messageId, runId, params.sessionId, 'assistant', parts)
          bus.emit({ type: 'step.finish', turn, usage: result.usage })
          messages.push({
            role: 'user',
            content:
              '[系统] 规划模式的产出必须通过 plan_save 工具写入「计划」文件夹，目前尚未落盘。请立即调用 plan_save 保存完整计划（修订既有计划请带 planId），不要在正文里输出计划内容。',
          })
          continue
        }

        // 防早停：待办清单还有未完成项就想结束（典型症状：连写六章只写两章就问“要不要继续”），
        // 回填强指令让它接着执行下一条待办，最多拦截 4 次避免死循环
        const unfinishedTodos = todoItems.filter((item) => item.status !== 'completed')
        if (unfinishedTodos.length > 0 && todoReminders < 4) {
          todoReminders += 1
          await persistMessage(messageId, runId, params.sessionId, 'assistant', parts)
          bus.emit({ type: 'step.finish', turn, usage: result.usage })
          messages.push({
            role: 'user',
            content: `[系统] 待办清单还有 ${unfinishedTodos.length} 项未完成：\n${renderTodoItems(unfinishedTodos)}\n任务尚未结束，严禁现在收尾，也严禁停下来问作者“要不要继续”。请立即继续执行下一条未完成的待办，每完成一条就用 todo_write 更新状态；确实无法完成的项，用 todo_write 标记为 completed 并在最后收尾时向作者说明原因。`,
          })
          continue
        }

        await persistMessage(messageId, runId, params.sessionId, 'assistant', parts)
        bus.emit({ type: 'step.finish', turn, usage: result.usage })
        await finalizeRun(runId, bus, 'succeeded', usage, turn, lastAssistantText.slice(0, 300))
        return
      }

      for (const call of result.toolCalls) {
        if (controller.signal.aborted) {
          throw new DOMException('run aborted', 'AbortError')
        }
        const outcome = await handleToolCall(call, tools, { ...toolContext, callId: call.id }, bus, messageId, runId)
        if (call.name === 'plan_save' && outcome.part.status === 'success') {
          planSavePerformed = true
        }
        // 同步待办清单快照：防早停拦截与预算收尾都依赖它判断任务是否真的做完
        if (call.name === 'todo_write' && outcome.part.status === 'success' && outcome.part.display?.kind === 'todoList') {
          todoItems = outcome.part.display.items
        }
        parts.push(outcome.part)
        messages.push({ role: 'tool', toolCallId: call.id, content: outcome.observation })
      }

      await persistMessage(messageId, runId, params.sessionId, 'assistant', parts)
      bus.emit({ type: 'step.finish', turn, usage: result.usage })

      if (usage.totalTokens >= env.agentRunTokenBudget) {
        messages.push({
          role: 'user',
          content: '[系统] 本次运行的 token 预算已用尽，请立即停止调用工具，用一段话总结目前的进展与剩余工作。',
        })
        const wrapUp = await chatWithTools({
          messages,
          tools: [],
          model: agent.model,
          onChunk: (chunk) => {
            if (chunk.type === 'text-delta') {
              bus.emit({ type: 'text.delta', messageId, delta: chunk.delta })
            }
          },
          signal: controller.signal,
          usageLog: {
            userId: params.userId,
            action: 'agentLoopWrapUp',
            novelId: params.novelId,
            chapterId: params.chapterId,
            targetType: 'agentRun',
            targetId: runId,
          },
        })
        addUsage(usage, wrapUp.usage)
        if (wrapUp.content) {
          await persistMessage(randomUUID(), runId, params.sessionId, 'assistant', [
            { type: 'text', text: wrapUp.content },
          ])
        }
        // 待办未完成时以 failed 收尾：前端据此展示「继续执行」按钮，一键接着跑完剩余待办
        const todoLeft = todoItems.filter((item) => item.status !== 'completed').length
        if (todoLeft > 0) {
          await finalizeRun(
            runId,
            bus,
            'failed',
            usage,
            turn,
            wrapUp.content.slice(0, 300),
            `本次运行的 token 预算已用尽，待办还剩 ${todoLeft} 项未完成。点击「继续执行」让 Agent 接着跑完。`,
          )
          return
        }
        await finalizeRun(runId, bus, 'succeeded', usage, turn, `已达 token 预算上限：${wrapUp.content.slice(0, 300)}`)
        return
      }
    }

    // 轮次上限：优雅收尾而非硬报错
    await finalizeRun(
      runId,
      bus,
      'failed',
      usage,
      turn,
      lastAssistantText.slice(0, 300),
      `已达最大轮次上限（${env.agentMaxTurns} 轮），任务未完成。可点击"继续"让 Agent 接着执行。`,
    )
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      await finalizeRun(runId, bus, 'paused', usage, turn, '已被用户停止，可随时继续。')
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    console.error('[agent-loop] run 执行异常', runId, error)
    bus.emit({ type: 'error', code: 'loop_crashed', message, recoverable: false })
    await finalizeRun(runId, bus, 'failed', usage, turn, '', message)
  }
}
