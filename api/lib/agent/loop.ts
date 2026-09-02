import { randomUUID } from 'node:crypto'

import { containsAgentProtocolInvocation, recoverAgentProtocolToolCalls, stripAgentProtocolArtifacts } from '../../../shared/agent-output.js'
import type {
  AgentExecutionMode,
  AgentMessagePart,
  AgentStreamEventBody,
  AgentAttachmentMeta,
  AgentTodoItem,
  AgentTokenUsage,
  AgentToolDraft,
  CreativeFreedom,
  StoryCompilerMode,
  CreditModelTier,
} from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import { chatWithTools, type ChatMessage, type ToolCallRequest } from '../ai-service.js'
import { DataAccessError, prisma } from '../prisma.js'
import { getModelTierRuntime } from '../credits.js'
import { readManagedImageDataUrl } from '../agent-attachment-storage.js'
import { applySessionToolPolicy, getAgentDefinition, getToolsForAgent, type AgentDefinition } from './agents.js'
import { deregisterActiveRun, registerActiveRun } from './active-runs.js'
import { clearRunBaselines } from './baseline.js'
import { assembleContext } from './context.js'
import { captureUserDirectives, compactSessionContext } from './context-engine.js'
import { syncNovelMemoryProjection } from './story-memory.js'
import { resolveAgent2FeatureFlags } from '../agent2-feature-flags.js'
import { createRunEventBus, disposeRunEventBus, type RunEventBus } from './events.js'
import {
  cancelAllQuestions,
  grantAlwaysAllow,
  hasAlwaysAllow,
  rejectAllApprovals,
  waitForApproval,
} from './permissions.js'
import { getToolByName, toOpenAITools } from './tools/registry.js'
import { coerceToolArgumentEnvelope } from './tools/argument-coercion.js'
import { loadSessionTodoItems, renderTodoItems } from './tools/todo-tools.js'
import type { AgentTool, ToolContext } from './tools/types.js'
import { autoNameSession } from './session-title.js'
import { buildTaskSpec } from './task-spec.js'
import { taskSpecSchema, type TaskSpec } from '../../../shared/contracts/index.js'

/**
 * Agent Loop 执行内核（plan/13 §4.3）。
 * while 循环：LLM → tool_calls → 执行 → tool 消息回填 → 再 LLM，直到 finishReason !== 'tool_calls'。
 * - 错误即观察：工具失败不中断 run，错误信息回填给模型自愈
 * - 审批暂停-恢复：'ask' 工具挂起循环等待前端批复，超时视为拒绝
 * - maxTurns + token 预算双保险防失控计费
 * 进行中 run 的登记表（activeRuns Map 及查询/停止函数）已拆至 active-runs.ts。
 */

export type ExecuteAgentRunParams = {
  runId: string
  sessionId: string
  userId: string
  novelId: string
  chapterId: string | null
  mode: AgentExecutionMode
  prompt: string
  selection?: { text: string; start?: number; end?: number } | null
  /** 本轮附带附件元数据：持久化为用户消息 attachment parts 并注入上下文 */
  attachments?: AgentAttachmentMeta[]
  agentType?: string
  creativeFreedom?: CreativeFreedom
  qualityMode?: StoryCompilerMode
  /** 从 paused 恢复：历史含本 run 已持久化的消息，prompt 换成续跑指令 */
  resume?: boolean
  modelTier?: CreditModelTier
  customModelId?: string | null
  reasoningEffort?: import('../../../shared/contracts/index.js').ModelReasoningEffort
  tokenBudget?: number
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
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // upsert 让网络重试与同一 messageId 的补写保持幂等，也允许最终完整 parts
      // 覆盖早期不完整快照，避免直播可见但刷新后缺失。
      await prisma.agentMessage.upsert({
        where: { id },
        create: { id, runId, sessionId, role, parts: parts as unknown as object },
        update: { role, parts: parts as unknown as object },
      })
      return
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)))
      }
    }
  }
  console.error('[agent-loop] 消息持久化失败', runId, lastError)
  throw lastError
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

/** 工具参数流式进度的节流步长：每多生成这么多参数字符才发一次 tool.delta，控制事件量 */
const TOOL_ARGS_PROGRESS_STEP = 200

/** 连续结构写失败达到阈值后硬熔断，禁止模型换参数盲试或“先建错卷再搬”。 */
const STRUCTURE_MUTATION_TOOLS = new Set([
  'chapter_create',
  'chapter_move',
  'chapter_move_to_volume',
  'chapter_split',
  'chapter_merge',
  'volume_create',
  'volume_update',
  'volume_move',
  'volume_delete',
])
const STRUCTURE_FAILURE_LIMIT = 3

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
  /** 附属分部：子 Agent 内嵌执行产生的内部工具调用卡片，随父消息一并落库与直播 */
  extraParts?: AgentMessagePart[]
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

  // 单引号字符串修复：模型常见用单引号包字符串（JSON 不认单引号），逐字符把不在双引号内的
  // 单引号当成字符串定界符换成双引号；双引号内内容原样保留，避免误伤；“撇号”位于双引号内会被
  // 正常跳过。这条只是候选之一，parse 失败时继续尝试其它候选，不会破坏原 JSON。
  const repairSingleQuoteStrings = (input: string): string => {
    let out = ''
    let inDouble = false
    let inSingle = false
    let i = 0
    while (i < input.length) {
      const char = input[i]
      if (inDouble) {
        out += char
        if (char === '\\') {
          out += input[i + 1] ?? ''
          i += 2
          continue
        }
        if (char === '"') inDouble = false
        i += 1
        continue
      }
      if (inSingle) {
        if (char === '\\') {
          out += '\\\\'
          i += 1
          continue
        }
        if (char === "'") {
          out += '"'
          inSingle = false
          i += 1
          continue
        }
        if (char === '"') {
          out += '\\"'
          i += 1
          continue
        }
        if (char === '\n') {
          out += '\\n'
          i += 1
          continue
        }
        if (char === '\r') {
          out += '\\r'
          i += 1
          continue
        }
        if (char === '\t') {
          out += '\\t'
          i += 1
          continue
        }
        out += char
        i += 1
        continue
      }
      if (char === '"') {
        inDouble = true
        out += char
        i += 1
        continue
      }
      if (char === "'") {
        inSingle = true
        out += '"'
        i += 1
        continue
      }
      out += char
      i += 1
    }
    return out
  }

  for (const candidate of [...attempts]) {
    attempts.push(repairTruncated(candidate))
  }

  for (const candidate of [...attempts]) {
    attempts.push(repairSingleQuoteStrings(candidate))
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

/** 从尚未闭合的工具 JSON 中读取已生成的字符串字段，用于编辑器实时预览。 */
function readStreamingJsonString(raw: string, key: string): string | undefined {
  const marker = new RegExp(`"${key}"\\s*:\\s*"`, 'g')
  let match: RegExpExecArray | null = null
  let latest: RegExpExecArray | null = null
  while ((match = marker.exec(raw))) latest = match
  if (!latest) return undefined
  let value = ''
  for (let index = latest.index + latest[0].length; index < raw.length; index += 1) {
    const char = raw[index]
    if (char === '"') return value
    if (char !== '\\') { value += char; continue }
    const escaped = raw[++index]
    if (escaped === undefined) break
    if (escaped === 'n') value += '\n'
    else if (escaped === 'r') value += '\r'
    else if (escaped === 't') value += '\t'
    else if (escaped === 'b') value += '\b'
    else if (escaped === 'f') value += '\f'
    else if (escaped === 'u') {
      const code = raw.slice(index + 1, index + 5)
      if (/^[0-9a-f]{4}$/i.test(code)) { value += String.fromCharCode(Number.parseInt(code, 16)); index += 4 }
      else break
    } else value += escaped
  }
  return value
}

function extractStreamingToolDraft(toolName: string, raw: string): AgentToolDraft | undefined {
  const chapterContentKey = toolName === 'chapter_edit_range' ? 'newText' : 'content'
  if (['chapter_create', 'chapter_write', 'chapter_append', 'chapter_edit_range'].includes(toolName)) {
    const content = readStreamingJsonString(raw, chapterContentKey)
    if (content === undefined) return undefined
    return { kind: 'chapter', toolName, targetId: readStreamingJsonString(raw, 'chapterId'), title: readStreamingJsonString(raw, 'title'), content }
  }
  if (toolName === 'plan_save') {
    const content = readStreamingJsonString(raw, 'content')
    if (content === undefined) return undefined
    return { kind: 'plan', toolName, targetId: readStreamingJsonString(raw, 'planId'), title: readStreamingJsonString(raw, 'title'), content }
  }
  return undefined
}

export async function handleToolCall(
  call: ToolCallRequest,
  tools: AgentTool[],
  ctx: ToolContext,
  /** 最小事件接口：主 run 传 RunEventBus，子 Agent 内嵌执行传 ToolContext.emit 包装（结构兼容） */
  bus: { emit: (event: AgentStreamEventBody) => void },
  messageId: string,
  runId: string,
  /** 非 undefined 表示本次调用发生在子 Agent 内嵌执行内部：事件与卡片带 subagentCallId 归属标记，审批透传到父 run */
  subagent?: { callId: string },
): Promise<ToolCallOutcome> {
  const startedAt = Date.now()
  const tool = tools.find((candidate) => candidate.name === call.name) ?? getToolByName(call.name)
  // 子 Agent 归属标记：随事件与持久化分部下发，前端据此把卡片分组到所属子 Agent 容器内
  const subagentMark = subagent ? { subagentCallId: subagent.callId } : {}
  const basePart = {
    type: 'tool-call' as const,
    callId: call.id,
    toolName: call.name,
    title: tool?.title ?? call.name,
    ...subagentMark,
  }

  // 参数解析与校验：先容错修复常见格式毛病，实在修不好再作为观察回填让模型自行修正
  let parsedArgs: unknown = {}
  try {
    parsedArgs = call.arguments ? parseToolArgsTolerant(call.arguments) : {}
  } catch {
    const observation = `工具 ${call.name} 的参数不是合法 JSON，本次调用完全没有执行。请立即重新发起同一个工具调用：字符串内的换行必须写成 \\n，不要用 Markdown 围栏包裹参数；如果正文很长，改用 chapter_write 写开头部分，再用 chapter_append 分 2-3 次追加剩余段落，避免单次参数过长被截断。绝对禁止放弃重试或改在回复正文里完成该操作。原始参数：${call.arguments.slice(0, 400)}`
    bus.emit({ type: 'tool.call', messageId, callId: call.id, toolName: call.name, title: basePart.title, args: null, ...subagentMark })
    bus.emit({
      type: 'tool.result',
      messageId,
      callId: call.id,
      toolName: call.name,
      ok: false,
      summary: '参数解析失败',
      durationMs: Date.now() - startedAt,
      ...subagentMark,
    })
    return { observation, part: { ...basePart, args: null, status: 'failed', summary: '参数解析失败' } }
  }

  // 先统一修复兼容网关常见的二次包装、字符串化 JSON、参数列表与顶层 null，
  // 再交给复杂工具做字段级语义归一化。
  parsedArgs = coerceToolArgumentEnvelope(parsedArgs)
  if (tool?.coerceArgs) {
    parsedArgs = tool.coerceArgs(parsedArgs)
  }

  // 审批预判（与下方执行前判定同一公式）：提前给事件流打标，供前端与审计识别自动批准的工具调用
  const autoApproved =
    (env.agentAutoApprove && !tool?.alwaysConfirm) ||
    tool === undefined ||
    tool.permission[ctx.mode] !== 'ask' ||
    (hasAlwaysAllow(ctx.sessionId, tool.name) && !tool.dangerous)

  bus.emit({ type: 'tool.call', messageId, callId: call.id, toolName: call.name, title: basePart.title, args: parsedArgs, autoApproved, ...subagentMark })

  const fail = (summary: string, observation: string, status: 'failed' | 'denied'): ToolCallOutcome => {
    bus.emit({
      type: 'tool.result',
      messageId,
      callId: call.id,
      toolName: call.name,
      ok: false,
      summary,
      durationMs: Date.now() - startedAt,
      ...subagentMark,
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

  // 审批：'ask' 且未被会话级“总是允许”覆盖时，挂起等待前端批复；
  // 全权限开关（默认开）短路审批：产品决策为 agent 自主判断所有动作，翻 env 可回退
  const needAsk =
    permission === 'ask' &&
    (tool.alwaysConfirm || !env.agentAutoApprove) &&
    !(hasAlwaysAllow(ctx.sessionId, tool.name) && !tool.dangerous && !tool.alwaysConfirm)

  if (needAsk) {
    const expiresAt = new Date(Date.now() + env.agentApprovalTimeoutMs).toISOString()
    await prisma.agentRun.update({ where: { id: runId }, data: { status: 'awaiting_approval' } }).catch(() => {})
    bus.emit({
      type: 'permission.ask',
      callId: call.id,
      toolName: tool.name,
      title: tool.title,
      args: validated.data,
      allowAlways: !tool.dangerous && !tool.alwaysConfirm,
      expiresAt,
    })

    const decision = await waitForApproval(runId, call.id, tool.name, env.agentApprovalTimeoutMs, ctx.signal)
    bus.emit({ type: 'permission.resolved', callId: call.id, approved: decision.approved })
    await prisma.agentRun.update({ where: { id: runId }, data: { status: 'running' } }).catch(() => {})

    if (!decision.approved) {
      const reason = decision.timedOut ? '审批超时，视为拒绝' : '用户拒绝了本次操作'
      return fail(reason, `${reason}：工具 ${call.name} 未执行。请尊重用户决定，换一种方式完成任务或直接说明情况。`, 'denied')
    }

    if (decision.alwaysAllow && !tool.dangerous && !tool.alwaysConfirm) {
      grantAlwaysAllow(ctx.sessionId, tool.name)
    }
  }

  // 高危工具审计（发布/归档/删除类）：未经用户挂起审批即执行时在服务端日志留痕，供事后核查
  if (!needAsk && tool.dangerous) {
    console.warn('[agent-loop] 高危工具自动批准执行', { runId, userId: ctx.userId, novelId: ctx.novelId, toolName: tool.name })
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
      ...subagentMark,
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
    if (error instanceof DataAccessError && error.code.startsWith('CREDITS_')) throw error
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
  // 事件协议用 succeeded，DB 枚举用 completed
  const dbStatus = status === 'succeeded' ? 'completed' : status

  const finalizedRun = await prisma.agentRun
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
      select: { userId: true, sessionId: true, novelId: true },
    })
    .catch((error) => {
      console.error('[agent-loop] run 状态落库失败', runId, error)
      return null
    })

  if (status !== 'paused' && finalizedRun) {
    await Promise.all([
      compactSessionContext(finalizedRun.userId, finalizedRun.sessionId, false).catch((error) => {
        console.error('[agent-loop] 对话结束后自动整理上下文失败', runId, error)
      }),
      syncNovelMemoryProjection(finalizedRun.userId, finalizedRun.novelId).catch((error) => {
        console.error('[agent-loop] 对话结束后自动更新作品记忆失败', runId, error)
      }),
    ])
  }

  if (status === 'paused') {
    bus.emit({ type: 'run.paused', reason: 'user_stop' })
  } else {
    bus.emit({ type: 'run.finished', status, usage, artifacts: [], outputSummary })
  }

  rejectAllApprovals(runId)
  cancelAllQuestions(runId)
  if (status !== 'paused') {
    clearRunBaselines(runId)
  }
  deregisterActiveRun(runId)
  await disposeRunEventBus(runId)
}

/** 启动（或续跑）一次 Agent Loop run：异步执行，调用方不等待 */
export async function executeAgentRun(params: ExecuteAgentRunParams): Promise<void> {
  const runId = params.runId
  const agent: AgentDefinition = getAgentDefinition(params.agentType ?? 'orchestrator')
  const controller = new AbortController()
  const bus = createRunEventBus(runId)

  registerActiveRun(runId, { controller, bus, sessionId: params.sessionId, userId: params.userId })

  const usage = emptyUsage()
  let turn = 0

  try {
    const modelRuntime = await getModelTierRuntime(params.modelTier ?? 'speed', params.userId, params.customModelId, params.reasoningEffort)
    const runtimeModelName = modelRuntime.modelName ?? agent.model
    const storedRun = await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date(), errorMessage: null },
      select: { taskSpec: true },
    })
    await prisma.agentSession.update({
      where: { id: params.sessionId },
      data: { lastRunAt: new Date() },
    }).catch(() => {})

    bus.emit({
      type: 'run.started',
      agent: { type: agent.type, title: agent.title, model: modelRuntime.tier },
      mode: params.mode,
      title: params.prompt.slice(0, 80),
    })

    const prompt = params.resume ? '请继续完成之前的任务。' : params.prompt
    // 附件以 additive attachment parts 随用户消息持久化：气泡缩略图回显 + 历史压缩可见
    const attachmentParts: AgentMessagePart[] = (params.attachments ?? []).map((attachment) => ({
      type: 'attachment',
      kind: attachment.kind,
      name: attachment.name,
      url: attachment.url,
      size: attachment.size,
    }))
    const userMessageId = randomUUID()
    await persistMessage(userMessageId, runId, params.sessionId, 'user', [
      { type: 'text', text: prompt },
      ...attachmentParts,
    ])

    const parsedTaskSpec = taskSpecSchema.safeParse(storedRun.taskSpec)
    let taskSpec: TaskSpec = parsedTaskSpec.success
      ? parsedTaskSpec.data
      : buildTaskSpec({
          runId,
          novelId: params.novelId,
          chapterId: params.chapterId,
          prompt: params.prompt,
          selection: params.selection,
          creativeFreedom: params.creativeFreedom,
          qualityMode: params.qualityMode,
        })
    let taskSpecChanged = !parsedTaskSpec.success
    const protectsEarlierContent = taskSpec.postconditions.some((item) => item.code === 'EARLIER_CONTENT_UNCHANGED')
    if (protectsEarlierContent && (!params.resume || !taskSpec.scope.chapterIds?.length)) {
      const existingChapters = await prisma.chapter.findMany({
        where: { novelId: params.novelId, authorId: params.userId },
        select: { id: true },
      })
      taskSpec = {
        ...taskSpec,
        scope: { ...taskSpec.scope, chapterIds: existingChapters.map((chapter) => chapter.id) },
      }
      taskSpecChanged = true
    }
    if (taskSpecChanged) {
      await prisma.agentRun.update({ where: { id: runId }, data: { taskSpec: taskSpec as unknown as object } })
    }
    if (!params.resume) {
      await captureUserDirectives({
        userId: params.userId,
        novelId: params.novelId,
        sessionId: params.sessionId,
        chapterId: params.chapterId,
        sourceMessageId: userMessageId,
        taskSpec,
        prompt: params.prompt,
      })
    }
    // 仅压缩已终态的旧 run；当前正在执行的消息永不进入检查点。
    await compactSessionContext(params.userId, params.sessionId, false).catch((error) => {
      console.error('[agent-loop] 自动上下文压缩失败，继续使用无损近期历史', runId, error)
    })

    // 首次对话且仍是默认标题时异步自动命名（仅一次，不阻塞循环）
    if (!params.resume) {
      void autoNameSession({
        sessionId: params.sessionId,
        userId: params.userId,
        novelId: params.novelId,
        prompt: params.prompt,
      })
    }

    const imageAttachments = (params.attachments ?? []).filter((attachment) => attachment.kind === 'image')
    const directImageInputs = modelRuntime.visionEnabled
      ? await Promise.all(imageAttachments.map(async (attachment) => ({ attachment, dataUrl: await readManagedImageDataUrl(attachment.url) })))
      : []
    const directVisionEnabled = imageAttachments.length > 0
      && directImageInputs.length === imageAttachments.length
      && directImageInputs.every((item) => Boolean(item.dataUrl))

    const assembledContext = await assembleContext({
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
      attachments: params.attachments ?? [],
      visionEnabled: directVisionEnabled,
      taskSpec,
      modelTier: modelRuntime.tier,
    })
    const messages: ChatMessage[] = assembledContext.messages
    // 子 Agent 目录注入：主控据此按触发条件用 subagent_run 像调工具一样内嵌调用子 Agent（codex/Zcode 模式）
    if (agent.type === 'orchestrator') {
      const { renderSubagentCatalog } = await import('./productivity.js')
      const catalog = await renderSubagentCatalog(params.userId, params.novelId)
      if (catalog) {
        const firstSystem = messages.find((message) => message.role === 'system')
        if (firstSystem && typeof firstSystem.content === 'string') {
          firstSystem.content = `${firstSystem.content}\n\n${catalog}`
        } else {
          messages.unshift({ role: 'system', content: catalog })
        }
      }
    }
    if (directVisionEnabled) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message?.role !== 'user' || typeof message.content !== 'string') continue
        message.content = [
          { type: 'text', text: message.content },
          ...directImageInputs.flatMap((item) => item.dataUrl ? [{ type: 'image_url' as const, image_url: { url: item.dataUrl, detail: 'auto' as const } }] : []),
        ]
        break
      }
    }

    if (assembledContext.skillRoute) {
      const skillRoute = assembledContext.skillRoute
      const candidates = skillRoute.candidates.map(({ skill, score, reasonCodes }) => ({
        id: skill.id,
        name: skill.name,
        version: skill.version,
        score: Math.round(score * 100) / 100,
        reasonCodes,
      }))
      const selected = skillRoute.selected.map((skill) => ({
        id: skill.id,
        name: skill.name,
        version: skill.version,
      }))
      // P0 可观测：selected 即本轮已完整注入的 Skill，而不是“可能会加载”的候选。
      await prisma.agentSkillRun.upsert({
        where: { runId },
        create: {
          runId,
          userId: params.userId,
          novelId: params.novelId,
          phase: skillRoute.phase,
          routerVersion: skillRoute.routerVersion,
          candidates,
          selected,
          loaded: selected,
          reasonCodes: skillRoute.reasonCodes,
          confidence: skillRoute.confidence,
          estimatedTokens: skillRoute.estimatedTokens,
        },
        update: {
          phase: skillRoute.phase,
          routerVersion: skillRoute.routerVersion,
          candidates,
          selected,
          loaded: selected,
          reasonCodes: skillRoute.reasonCodes,
          confidence: skillRoute.confidence,
          estimatedTokens: skillRoute.estimatedTokens,
        },
      })
      bus.emit({
        type: 'skill.route',
        phase: skillRoute.phase,
        candidates: candidates.map(({ id, name, version }) => ({ id, name, version })),
        selected,
        reasonCodes: skillRoute.reasonCodes,
        confidence: skillRoute.confidence,
        estimatedTokens: skillRoute.estimatedTokens,
        skippedReason: skillRoute.skippedReason,
      })
    }

    const featureFlags = resolveAgent2FeatureFlags(params.userId)
    const sessionPolicy = await prisma.agentSession.findUnique({ where: { id: params.sessionId }, select: { toolPolicy: true, sandboxMode: true } })
    const scopedTools = getToolsForAgent(agent, params.mode, featureFlags)
    const tools = applySessionToolPolicy(
      scopedTools,
      params.mode,
      sessionPolicy?.toolPolicy,
      sessionPolicy?.sandboxMode === 'read_only' || sessionPolicy?.sandboxMode === 'full_access' ? sessionPolicy.sandboxMode : 'workspace',
    )
    const openAITools = toOpenAITools(tools)
    const maxTurns = env.agentMaxTurns
    const runTokenBudget = Math.min(env.agentRunTokenBudget, Math.max(500, params.tokenBudget ?? env.agentRunTokenBudget))

    const toolContext: ToolContext = {
      userId: params.userId,
      novelId: params.novelId,
      chapterId: params.chapterId,
      sessionId: params.sessionId,
      runId,
      protectedChapterIds: protectsEarlierContent ? new Set(taskSpec.scope.chapterIds ?? []) : undefined,
      callId: '',
      mode: params.mode,
      creativeFreedom: taskSpec.creativeFreedom,
      qualityMode: taskSpec.qualityMode,
      // 子 Agent 跟随主 run 的模型与额度计费：custom 档直接消耗用户自己的 token，内置档按倍率扣 credits
      modelRuntime,
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
    let consecutiveStructureFailures = 0
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
        (sum, message) => sum + (typeof message.content === 'string'
          ? message.content.length
          : Array.isArray(message.content) ? message.content.reduce((partSum, part) => partSum + (part.type === 'text' ? part.text.length : 0), 0) : 0),
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

      // 工具执行条提前显示：模型还在流式生成工具参数（写章节正文可能持续分钟级）时
      // 就先播报 tool.call（args 为 null），前端按 callId upsert，执行完毕的正式事件就地更新同一张卡片
      const announcedToolNames = new Map<string, string>()
      const toolArgsProgress = new Map<string, { chars: number; lastEmitted: number }>()
      const streamingToolArgs = new Map<string, string>()

      const result = await chatWithTools({
        messages,
        tools: openAITools,
        model: runtimeModelName,
        providerBaseUrl: modelRuntime.baseUrl,
        providerApiKey: modelRuntime.apiKey,
        provider: modelRuntime.provider,
        reasoningEffort: modelRuntime.reasoningEffort,
        temperature: taskSpec.creativeFreedom === 'stable' ? 0.45 : taskSpec.creativeFreedom === 'bold' ? 0.85 : 0.65,
        onChunk: (chunk) => {
          if (chunk.type === 'text-delta') {
            // 最终答复与 reasoning 使用同一实时通道逐 token 展示；本轮若随后出现工具调用，
            // text.final 会把已播出的执行旁白原位归入 reasoning，不留下重复正文。
            bus.emit({ type: 'text.delta', messageId, delta: chunk.delta })
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
              const rawArgs = `${streamingToolArgs.get(chunk.id) ?? ''}${chunk.delta}`
              streamingToolArgs.set(chunk.id, rawArgs)
              const toolName = announcedToolNames.get(chunk.id) ?? ''
              const draft = extractStreamingToolDraft(toolName, rawArgs)
              if (draft || progress.chars - progress.lastEmitted >= TOOL_ARGS_PROGRESS_STEP) {
                progress.lastEmitted = progress.chars
                bus.emitTransient({ type: 'tool.delta', messageId, callId: chunk.id, argsChars: progress.chars, ...(draft ? { draft } : {}) })
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
          turn,
          modelTier: modelRuntime.tier,
          multiplierBps: modelRuntime.multiplierBps,
        },
      })

      addUsage(usage, result.usage)
      await prisma.agentRun.update({ where: { id: runId }, data: { currentTurn: turn } }).catch(() => {})

      const recoveredToolCalls = result.toolCalls.length === 0
        ? recoverAgentProtocolToolCalls(result.content).map((call, index) => ({
            id: `recovered_${messageId}_${index}`,
            name: call.name,
            arguments: call.arguments,
          }))
        : []
      const effectiveToolCalls = result.toolCalls.length > 0 ? result.toolCalls : recoveredToolCalls

      messages.push({
        role: 'assistant',
        content: recoveredToolCalls.length > 0 ? null : (result.content || null),
        reasoning: result.reasoning || undefined,
        toolCalls: effectiveToolCalls.length > 0 ? effectiveToolCalls : undefined,
      })

      const cleanContent = result.content ? stripAgentProtocolArtifacts(result.content) : ''
      // 只要本轮真实产生工具调用，同行文本就是执行旁白而非最终答复，一律改道思考区。
      const demoteNarration = effectiveToolCalls.length > 0 && Boolean(cleanContent)

      // text.delta 已实时显示供应商原始流；无论最终是否有干净文本，都要发 text.final 做归一化，
      // 这样 DSML/乱码被清洗成空串时能立即从界面移除，而不是残留到刷新前。
      if (result.content) bus.emit({ type: 'text.final', messageId, text: cleanContent, asReasoning: demoteNarration })

      const parts: AgentMessagePart[] = []
      if (result.reasoning || (demoteNarration && cleanContent)) {
        parts.push({
          type: 'reasoning',
          text: demoteNarration
            ? [result.reasoning, cleanContent].filter(Boolean).join('\n')
            : (result.reasoning as string),
        })
      }
      if (cleanContent && !demoteNarration) {
        parts.push({ type: 'text', text: cleanContent })
        lastAssistantText = cleanContent
      }

      const invalidToolProtocol =
        effectiveToolCalls.length === 0 &&
        (result.finishReason === 'tool_calls' || containsAgentProtocolInvocation(result.content) || looksLikePseudoToolCall(result.content, toolNameList))

      if (invalidToolProtocol) {
        if (pseudoToolCallRetries < 2) {
          pseudoToolCallRetries += 1
          // 协议失败的执行叙述不能作为真实交付落库；只保留 reasoning 供展开排障。
          const diagnosticParts = parts.filter((part) => part.type === 'reasoning')
          await persistMessage(messageId, runId, params.sessionId, 'assistant', diagnosticParts)
          bus.emit({ type: 'step.finish', turn, usage: result.usage })
          messages.push({
            role: 'user',
            content:
              '[系统/P0] 你刚才没有产生任何可执行的 function call，却返回了工具协议标记或伪调用文本；操作完全没有执行。立即使用 API 原生 function calling 重试，正文信道必须为空。禁止输出 <invoke>、</invoke>、<tool_call>、<parameter>、</parameter> 或任何工具参数文本。',
          })
          continue
        }

        const failureText = '模型连续返回无效工具调用协议，本轮已安全停止，未将这些文本视为已执行操作。请重新发起任务。'
        bus.emit({ type: 'text.delta', messageId, delta: failureText })
        await persistMessage(messageId, runId, params.sessionId, 'assistant', [{ type: 'text', text: failureText }])
        bus.emit({ type: 'step.finish', turn, usage: result.usage })
        await finalizeRun(runId, bus, 'failed', usage, turn, failureText, failureText)
        return
      }

      if (effectiveToolCalls.length === 0) {
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

      let structureCircuitTripped = false
      for (const call of effectiveToolCalls) {
        if (controller.signal.aborted) {
          throw new DOMException('run aborted', 'AbortError')
        }
        const outcome = await handleToolCall(call, tools, { ...toolContext, callId: call.id, messageId }, bus, messageId, runId)
        if (call.name === 'plan_save' && outcome.part.status === 'success') {
          planSavePerformed = true
        }
        // 同步待办清单快照：防早停拦截与预算收尾都依赖它判断任务是否真的做完
        if (call.name === 'todo_write' && outcome.part.status === 'success' && outcome.part.display?.kind === 'todoList') {
          todoItems = outcome.part.display.items
        }
        if (STRUCTURE_MUTATION_TOOLS.has(call.name)) {
          if (outcome.part.status === 'success') {
            consecutiveStructureFailures = 0
          } else if (outcome.part.status === 'failed') {
            consecutiveStructureFailures += 1
            if (consecutiveStructureFailures >= STRUCTURE_FAILURE_LIMIT) {
              structureCircuitTripped = true
            }
          }
        }
        parts.push(outcome.part)
        // 子 Agent 内嵌执行产生的内部工具卡片随父消息一并直播与落库，刷新后仍可展开查看
        if (outcome.extraParts?.length) parts.push(...outcome.extraParts)
        messages.push({ role: 'tool', toolCallId: call.id, content: outcome.observation })
        if (structureCircuitTripped) {
          break
        }
      }

      await persistMessage(messageId, runId, params.sessionId, 'assistant', parts)
      bus.emit({ type: 'step.finish', turn, usage: result.usage })

      if (structureCircuitTripped) {
        const failureText = '卷章结构操作已连续失败 3 次，安全熔断已停止后续写入，避免重复建章、错卷和序号进一步漂移。请检查任务状态中的变更后重新发起。'
        const failureMessageId = randomUUID()
        bus.emit({ type: 'message.start', messageId: failureMessageId, role: 'assistant' })
        bus.emit({ type: 'text.delta', messageId: failureMessageId, delta: failureText })
        await persistMessage(failureMessageId, runId, params.sessionId, 'assistant', [{ type: 'text', text: failureText }])
        await finalizeRun(runId, bus, 'failed', usage, turn, failureText, failureText)
        return
      }

      if (usage.totalTokens >= runTokenBudget) {
        messages.push({
          role: 'user',
          content: '[系统] 本次运行的 token 预算已用尽，请立即停止调用工具，用一段话总结目前的进展与剩余工作。',
        })
        const wrapUp = await chatWithTools({
          messages,
          tools: [],
          model: runtimeModelName,
          providerBaseUrl: modelRuntime.baseUrl,
          providerApiKey: modelRuntime.apiKey,
          provider: modelRuntime.provider,
          reasoningEffort: modelRuntime.reasoningEffort,
          temperature: taskSpec.creativeFreedom === 'stable' ? 0.45 : taskSpec.creativeFreedom === 'bold' ? 0.85 : 0.65,
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
            turn: null,
            modelTier: modelRuntime.tier,
            multiplierBps: modelRuntime.multiplierBps,
          },
        })
        addUsage(usage, wrapUp.usage)
        const cleanWrapUp = stripAgentProtocolArtifacts(wrapUp.content)
        if (wrapUp.content) {
          bus.emit({ type: 'text.final', messageId, text: cleanWrapUp, asReasoning: false })
        }
        if (cleanWrapUp) {
          await persistMessage(randomUUID(), runId, params.sessionId, 'assistant', [
            { type: 'text', text: cleanWrapUp },
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
            cleanWrapUp.slice(0, 300),
            `本次运行的 token 预算已用尽，待办还剩 ${todoLeft} 项未完成。点击「继续执行」让 Agent 接着跑完。`,
          )
          return
        }
        await finalizeRun(runId, bus, 'succeeded', usage, turn, `已达 token 预算上限：${cleanWrapUp.slice(0, 300)}`)
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

    if (error instanceof DataAccessError && error.code.startsWith('CREDITS_')) {
      const messageId = randomUUID()
      const message = error.code === 'CREDITS_EXHAUSTED'
        ? '今日创作额度已用尽，任务已安全停止。邀请好友注册可获得额外额度。'
        : error.message
      bus.emit({ type: 'message.start', messageId, role: 'assistant' })
      bus.emit({ type: 'text.delta', messageId, delta: message })
      await persistMessage(messageId, runId, params.sessionId, 'assistant', [{ type: 'text', text: message }])
      bus.emit({ type: 'error', code: error.code.toLowerCase(), message, recoverable: false })
      await finalizeRun(runId, bus, 'failed', usage, turn, message, message)
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    console.error('[agent-loop] run 执行异常', runId, error)
    bus.emit({ type: 'error', code: 'loop_crashed', message, recoverable: false })
    await finalizeRun(runId, bus, 'failed', usage, turn, '', message)
  }
}
