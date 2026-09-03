import { z } from 'zod'

import type {
  AgentExecutionMode,
  AgentMessagePart,
  AgentToolDisplayPayload,
  CreditModelTier,
  ModelReasoningEffort,
} from '../../../../shared/contracts/index.js'
import { env } from '../../../config/env.js'
import { prisma } from '../../prisma.js'
import { countActiveRunsByUser, hasActiveRunInSession } from '../active-runs.js'
import { coerceToolArgumentEnvelope } from './argument-coercion.js'
import { defineTool, type ToolContext } from './types.js'

/**
 * 跨任务并行协作工具（作者需求：a 窗口派生 b/c/d 分头写第 1/2/3 章 → a 等待 → a 审查 → a 补发提示词 → 再等 → 收尾）。
 *
 * 与 subagent_run 的本质区别：
 * - subagent_run 是内嵌执行，复用父 run 的消息空间，串行、无独立窗口；
 * - 这里派生的是真正独立的任务窗口（独立 AgentSession + 独立 AgentRun），因此可以真正并行，
 *   作者也能点进任一窗口看它自己的对话流。
 *
 * 两条硬约束：
 * 1. 派生窗口自身禁用这三个工具（loop 按 session.spawnedFromSessionId 剥除 + 本文件二次拦截），
 *    否则 b 再派生 e、e 再派生 f 会指数级打爆并发与额度；
 * 2. 并发走编排专用额度（env.agentOrchestrationMaxConcurrent），不放宽普通交互额度。
 */

const WRITE_PERMISSION = { plan: 'ask', build: 'ask', review: 'ask' } as const
const READ_PERMISSION = { plan: 'allow', build: 'allow', review: 'allow' } as const

/** 派生窗口需被剥除的工具名：loop 组装工具时据此过滤，与本文件内的二次拦截互为双保险 */
export const ORCHESTRATION_TOOL_NAMES: ReadonlySet<string> = new Set(['task_spawn', 'task_wait', 'task_send'])

/** 轮询间隔：3s 足够贴合体感，又不会把 DB 打满 */
const POLL_INTERVAL_MS = 3000
/** 单个窗口回填给主控的交付内容上限：够审查，又不至于一次读爆上下文 */
const DELIVERY_CHARS = 1800

type WindowStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'awaiting' | 'timeout'

/** DB run 状态 → 编排视角的窗口状态；paused/awaiting_approval 需要作者去那个窗口处理，不能无限等 */
const TERMINAL_STATUS: Record<string, WindowStatus> = {
  completed: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  paused: 'awaiting',
  awaiting_approval: 'awaiting',
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

function clipDelivery(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > DELIVERY_CHARS ? `${trimmed.slice(0, DELIVERY_CHARS)}…（内容已截断）` : trimmed
}

/** 只取模型对外可见的文本；reasoning 是内部思考，不作为交付内容 */
function assistantText(parts: AgentMessagePart[]): string {
  return parts
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n\n')
    .trim()
}

/** 派生窗口的运行契约：交付摘要必须自包含，否则主控只能拿到「已完成」这种废话 */
export function composeSpawnPrompt(brief: string, inherit: 'brief' | 'transcript'): string {
  const origin = inherit === 'transcript'
    ? '你继承了主控任务窗口的完整对话记录，可直接沿用其中已确认的设定与风格。'
    : '你没有主控窗口的对话记录，需要的设定请用工具自行读取作品与章节。'
  return [
    '【跨任务并行分工】你是主控任务窗口派生出的独立任务窗口，只负责下面这一份工作。',
    origin,
    '',
    brief.trim(),
    '',
    '【交付要求】',
    '1. 只做本窗口分到的部分，不要改动其他窗口负责的章节，避免并行互相覆盖。',
    '2. 完成后在最后一条回复里给出自包含的交付摘要：完成状态（done / blocked）、实际改动的章节与字数、做了哪些关键取舍、遗留问题。',
    '3. 主控窗口会直接读取这条摘要来审查，只写「已完成」会导致审查失败并被打回重做。',
    '4. 你不能再派生新的任务窗口；需要协作或有阻塞，写进交付摘要交回主控处理。',
  ].join('\n')
}

/** 该会话是否为派生窗口：派生窗口不得再编排，防止递归式并发爆炸 */
async function assertNotSpawnedWindow(sessionId: string): Promise<string | null> {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: { spawnedFromSessionId: true },
  })
  if (!session?.spawnedFromSessionId) return null
  return '当前窗口本身是主控窗口派生出来的并行分支，按并发治理规则不能再派生或调度其他窗口。请把需要协作的部分写进交付摘要，交回主控窗口处理。'
}

/** 派生窗口最新状态：未开始/执行中/失败/取消/暂停都算未完成，只有 succeeded 算交付完毕 */
type SpawnedWindowStatus = WindowStatus | 'not_started'
const UNFINISHED_STATUS: ReadonlySet<SpawnedWindowStatus> = new Set(['not_started', 'running', 'failed', 'cancelled', 'awaiting', 'timeout'])
const STATUS_LABEL: Record<SpawnedWindowStatus, string> = {
  not_started: '未开始',
  running: '执行中',
  succeeded: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  awaiting: '已暂停待作者处理',
  timeout: '等待超时',
}

/** 本会话派生出的子窗口及其最新状态（主控调度与续跑协作共用的唯一事实源） */
async function listSpawnedWindows(sessionId: string): Promise<Array<{ id: string; title: string; status: SpawnedWindowStatus }>> {
  const children = await prisma.agentSession.findMany({
    where: { spawnedFromSessionId: sessionId },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { id: true, title: true },
  })
  const windows: Array<{ id: string; title: string; status: SpawnedWindowStatus }> = []
  for (const child of children) {
    const childRun = await prisma.agentRun.findFirst({
      where: { sessionId: child.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    })
    const status: SpawnedWindowStatus = !childRun ? 'not_started' : (TERMINAL_STATUS[childRun.status] ?? 'running')
    windows.push({ id: child.id, title: child.title || '未命名窗口', status })
  }
  return windows
}

/** 中断续跑协作强制规则：上一轮异常终止（或本次就是续跑 run）且存在未完成派生窗口时，
 * 逐窗口给出可执行动作清单，并声明正文写入硬拦截，防止作者一句「继续」被模型理解成
 * 「在本窗口把子窗口没干完的活重干一遍」 */
export async function buildOrchestrationResumeNote(sessionId: string, currentRunId: string, isResume: boolean): Promise<string> {
  const windows = await listSpawnedWindows(sessionId)
  const unfinished = windows.filter((item) => UNFINISHED_STATUS.has(item.status))
  if (unfinished.length === 0) return ''

  let triggered = isResume
  if (!triggered) {
    const lastRun = await prisma.agentRun.findFirst({
      where: { sessionId, id: { not: currentRunId } },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    })
    triggered = Boolean(lastRun && (lastRun.status === 'failed' || lastRun.status === 'paused' || lastRun.status === 'cancelled'))
  }
  if (!triggered) return ''

  // 命中续跑协作：登记硬拦截，本轮主窗口在子窗口收尾前写正文会被 guard 拦下并导回 task_send/task_wait
  markOrchestrationGuardedRun(currentRunId)

  const lines = windows.map((item) => {
    const action =
      item.status === 'succeeded'
        ? '直接取其交付摘要审查'
        : item.status === 'running' || item.status === 'not_started'
          ? '直接用 task_wait 传入该窗口 ID 收交付'
          : '先用 task_send 向该窗口投递续跑指令（写明从何处继续、交付要求），再 task_wait 等交付'
    return `- ${item.title}（${item.id}）：${STATUS_LABEL[item.status]} → ${action}`
  })
  return [
    '[系统强制规则·中断续跑协作] 上一轮任务异常中断，本会话派生的任务窗口工作尚未完成：',
    ...lines,
    '本轮第一个动作必须是上面的 task_wait / task_send，完成之前禁止调用任何正文写入工具、禁止在本窗口亲自重写这些窗口未完成的章节（服务端对正文写入硬拦截，调用会被直接驳回）。',
    'task_send 会立即在目标窗口开启新一轮执行，失败过的窗口同样能被重新驱动，不要以为窗口失败就只能自己重做。',
    '全部窗口交付后逐个审查：合格则汇总向作者汇报；不合格用 task_send 发返工要求再 task_wait。本窗口只负责调度、审查与汇报。',
    '唯一例外：作者在本轮明确要求「你自己写/亲自接手/不用等那些窗口」时，才允许本窗口直接写正文。',
  ].join('\n')
}

/** 续跑协作硬拦截覆盖的正文写入工具：子窗口未收尾前主窗口不得代写 */
const ORCHESTRATION_GUARD_TOOL_NAMES: ReadonlySet<string> = new Set(['chapter_write', 'chapter_append', 'chapter_edit_range'])

/** 命中续跑协作的 run：硬拦截登记（进程内即可，run 与进程同生命周期） */
const guardedRunIds = new Set<string>()
/** 每个 run 的拦截计数：拦两次后放行，避免模型与护栏空转烧轮次 */
const guardBlockCount = new Map<string, number>()

export function markOrchestrationGuardedRun(runId: string): void {
  guardedRunIds.add(runId)
  guardBlockCount.delete(runId)
}

/** 续跑协作硬约束：命中续跑协作的 run 里，子窗口未收尾前拦截主窗口正文写入并导回 task_send/task_wait */
export async function assertOrchestrationResumeGuard(runId: string, sessionId: string, toolName: string): Promise<string | null> {
  if (!guardedRunIds.has(runId) || !ORCHESTRATION_GUARD_TOOL_NAMES.has(toolName)) return null
  const windows = await listSpawnedWindows(sessionId)
  const unfinished = windows.filter((item) => UNFINISHED_STATUS.has(item.status))
  if (unfinished.length === 0) {
    guardedRunIds.delete(runId)
    return null
  }
  const blocked = (guardBlockCount.get(runId) ?? 0) + 1
  guardBlockCount.set(runId, blocked)
  if (blocked > 2) {
    // 已尽到提醒义务：再拦只会烧轮次，放行但保留观察让模型自行负责
    guardedRunIds.delete(runId)
    return null
  }
  const names = unfinished.map((item) => `「${item.title}」`).join('、')
  return `续跑协作硬约束：本会话仍有未完成的派生任务窗口${names}，它们负责的章节不允许由本窗口代写，本次调用未执行。请立即改为：执行中/未开始的窗口用 task_wait 收交付；失败/取消/暂停的窗口用 task_send 投递续跑指令（写明从何处继续与交付要求，它会立即在该窗口开启新一轮执行），再 task_wait 等交付并逐个审查。只有作者本轮明确说「你自己写/亲自接手」时才允许本窗口写正文。`
}

/** 派生 run 跟随主控窗口的模型档位，避免并行窗口偷偷降档或用错自定义模型 */
async function inheritModelConfig(runId: string): Promise<{
  modelTier?: CreditModelTier
  customModelId?: string
  reasoningEffort?: ModelReasoningEffort
}> {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: { modelTier: true, customModelId: true, reasoningEffort: true },
  })
  if (!run) return {}
  // 这两列在 DB 里是自由文本，写入时已经 startLoopRun 校验，回读时必然是合法档位
  return {
    modelTier: run.modelTier as CreditModelTier,
    customModelId: run.customModelId ?? undefined,
    reasoningEffort: run.reasoningEffort as ModelReasoningEffort,
  }
}

type LatestRun = { runId: string; status: string; title: string }

async function latestRunPerSession(userId: string, sessionIds: string[]): Promise<Map<string, LatestRun>> {
  const sessions = await prisma.agentSession.findMany({
    where: { id: { in: sessionIds }, userId },
    select: { id: true, title: true },
  })
  const titles = new Map(sessions.map((session) => [session.id, session.title]))
  if (titles.size === 0) return new Map()

  const runs = await prisma.agentRun.findMany({
    where: { sessionId: { in: [...titles.keys()] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
    select: { id: true, sessionId: true, status: true },
  })

  const latest = new Map<string, LatestRun>()
  for (const run of runs) {
    if (latest.has(run.sessionId)) continue
    latest.set(run.sessionId, { runId: run.id, status: run.status, title: titles.get(run.sessionId) ?? '未命名任务' })
  }
  return latest
}

async function deliveryOf(sessionId: string, runId: string): Promise<string> {
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { outputSummary: true } })
  const summary = run?.outputSummary?.trim() ?? ''
  const messages = await prisma.agentMessage.findMany({
    where: { sessionId, runId, role: 'assistant' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 6,
    select: { parts: true },
  })
  // 末条回复优先作为交付摘要正体；末条无正文（如以纯工具调用收尾）时回捞近期回复，
  // 避免把「有产出但末条是工具轮」误判成没有交付
  const text =
    messages
      .map((message) => assistantText((message.parts ?? []) as AgentMessagePart[]))
      .find((candidate) => candidate.length > 0) ?? ''
  return clipDelivery(text || summary) || '（该窗口没有产出可读的交付内容）'
}

function orchestrationDisplay(
  mode: 'spawn' | 'wait' | 'send',
  detail: string,
  windows: Array<{ sessionId: string; title: string; status: WindowStatus; summary?: string; inherit?: 'brief' | 'transcript' }>,
): AgentToolDisplayPayload {
  return { kind: 'taskOrchestration', mode, detail, windows }
}

function emitSpawned(
  ctx: ToolContext,
  sessions: Array<{ sessionId: string; runId: string; novelId: string; title: string; inherit?: 'brief' | 'transcript' }>,
) {
  if (sessions.length === 0) return
  ctx.emit({ type: 'task.spawned', messageId: ctx.messageId ?? '', callId: ctx.callId, sessions })
}

export const taskSpawnTool = defineTool({
  name: 'task_spawn',
  title: '派生并行任务窗口',
  description:
    '派生 1~5 个独立的任务窗口并让它们立刻并行开工（每个窗口有自己的对话流，作者可点进去看）。用于可切分且互不重叠的批量创作，例如同时写第 1/2/3 章。派生后必须用 task_wait 等待它们的交付摘要并逐个审查；发现问题用 task_send 把返工要求投递回对应窗口。禁止用它拆分同一章的同一段内容（并行写同一处会互相覆盖），也禁止在派生出的窗口里再次调用本工具。',
  parameters: z.object({
    tasks: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(60).describe('任务窗口标题，如「第 12 章正文」'),
          brief: z
            .string()
            .trim()
            .min(20)
            .max(400)
            .describe('简明任务提示词（硬上限 400 字，建议 200 字内）：目标章节、目标字数、至多 3 条关键约束与验收标准。禁止粘贴长篇设定或剧情梗概——派生窗口会用工具自读作品与计划；brief 过长会导致整包参数被截断、窗口拿到半截任务'),
        }),
      )
      .min(1)
      .max(5)
      .describe('每个元素派生一个窗口，互相之间必须没有写入冲突；单次建议 ≤3 个任务，更多请等这批结束后再派生'),
    inherit: z
      .enum(['brief', 'transcript'])
      .default('brief')
      .describe('brief=只给上面的任务提示词（省 token，适合任务自包含）；transcript=复制当前窗口的完整对话作为分支副本（适合依赖本窗口讨论过的大量设定）'),
    mode: z.enum(['plan', 'build', 'review']).default('build').describe('派生窗口的执行模式，写正文用 build'),
  }),
  coerceArgs(raw) {
    // 校验前兜底：信封解包 + 超长截断 + 超额任务裁剪，不让 zod 失败白耗重试轮
    // （brief 超 400 字是派生失败的高频原因，截断保留前 400 字比整包打回更符合作者意图）
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const unwrapped = coerceToolArgumentEnvelope(raw)
    const source = (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)
      ? unwrapped
      : raw) as Record<string, unknown>
    const next = { ...source }
    if (Array.isArray(next.tasks)) {
      next.tasks = next.tasks.slice(0, 5).map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        const task = { ...(item as Record<string, unknown>) }
        if (typeof task.brief === 'string') task.brief = task.brief.trim().slice(0, 400)
        if (typeof task.title === 'string') task.title = task.title.trim().slice(0, 60)
        return task
      })
    } else if (next.tasks && typeof next.tasks === 'object') {
      next.tasks = [next.tasks]
    }
    return next
  },
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const blocked = await assertNotSpawnedWindow(ctx.sessionId)
    if (blocked) return { output: blocked, summary: '派生窗口不能再派生' }

    const limit = env.agentSpawnMaxParallel
    const remaining = Math.max(0, env.agentOrchestrationMaxConcurrent - countActiveRunsByUser(ctx.userId))
    const allowed = Math.min(args.tasks.length, limit, remaining)

    if (allowed === 0) {
      return {
        output:
          remaining === 0
            ? `并行任务窗口已达上限（${env.agentOrchestrationMaxConcurrent} 个同时执行），现在无法派生。请先用 task_wait 等已有窗口结束，或自己顺序完成。`
            : '没有可派生的任务。',
        summary: '并行额度已满',
      }
    }

    const skipped = args.tasks.slice(allowed)
    const modelConfig = await inheritModelConfig(ctx.runId)
    const { startLoopRun, forkAgentSessionData } = await import('../run-service.js')

    const spawned: Array<{ sessionId: string; runId: string; novelId: string; title: string; inherit: 'brief' | 'transcript' }> = []
    const failures: string[] = []

    for (const task of args.tasks.slice(0, allowed)) {
      const title = task.title.slice(0, 160)
      try {
        let sessionId: string
        if (args.inherit === 'transcript') {
          const forked = await forkAgentSessionData(ctx.userId, ctx.sessionId)
          sessionId = forked.session.id
          await prisma.agentSession.update({
            where: { id: sessionId },
            data: { title, spawnedFromSessionId: ctx.sessionId, spawnedFromRunId: ctx.runId },
          })
        } else {
          const created = await prisma.agentSession.create({
            data: {
              userId: ctx.userId,
              novelId: ctx.novelId,
              title,
              status: 'active',
              spawnedFromSessionId: ctx.sessionId,
              spawnedFromRunId: ctx.runId,
            },
            select: { id: true },
          })
          sessionId = created.id
        }

        const started = await startLoopRun(
          ctx.userId,
          {
            sessionId,
            novelId: ctx.novelId,
            // 章节交由派生窗口自行定位：主控当前章节对它往往是错的
            chapterId: null,
            mode: args.mode as AgentExecutionMode,
            prompt: composeSpawnPrompt(task.brief, args.inherit),
            creativeFreedom: ctx.creativeFreedom,
            qualityMode: ctx.qualityMode,
            ...modelConfig,
            agentProfile: 'orchestrator',
          },
          { concurrencyScope: 'orchestration' },
        )
        spawned.push({ sessionId, runId: started.runId, novelId: ctx.novelId, title, inherit: args.inherit })
      } catch (error) {
        // 单个窗口拉起失败不该拖垮整批：记为观察让模型决定重试还是自己顺序做
        failures.push(`${title}：${error instanceof Error ? error.message : '派生失败'}`)
      }
    }

    emitSpawned(ctx, spawned)

    const lines = [
      spawned.length > 0
        ? `已派生 ${spawned.length} 个并行任务窗口，它们正在同时执行：`
        : '没有成功派生任何任务窗口。',
      ...spawned.map((item) => `- ${item.title}｜任务 ID ${item.sessionId}`),
    ]
    if (skipped.length > 0) {
      lines.push(
        `另有 ${skipped.length} 个任务因并行上限（单次最多 ${limit} 个、同时最多 ${env.agentOrchestrationMaxConcurrent} 个）未派生：${skipped
          .map((task) => task.title)
          .join('、')}。等这批结束后可再派生。`,
      )
    }
    if (failures.length > 0) lines.push(`派生失败：${failures.join('；')}`)
    if (spawned.length > 0) {
      lines.push(
        `下一步：用 task_wait 传入上面的任务 ID 等待交付（mode=all），拿到交付摘要后逐个审查；不合格用 task_send 把返工要求发回对应窗口。`,
      )
    }

    return {
      output: lines.join('\n'),
      summary: spawned.length > 0 ? `派生 ${spawned.length} 个并行窗口` : '派生失败',
      display: orchestrationDisplay(
        'spawn',
        spawned.length > 0 ? `${spawned.length} 个任务窗口并行执行中` : '未派生任务窗口',
        spawned.map((item) => ({ sessionId: item.sessionId, title: item.title, status: 'running' as const, inherit: item.inherit })),
      ),
    }
  },
})

export const taskWaitTool = defineTool({
  name: 'task_wait',
  title: '等待任务窗口',
  description:
    '阻塞等待指定任务窗口执行结束，并取回它们的交付摘要用于审查。mode=all 等全部结束，mode=any 只要有一个结束就返回。超时会返回「仍在执行」，此时可再次调用继续等。等到结果后必须逐个审查交付摘要，不要直接宣布完成。',
  parameters: z.object({
    sessionIds: z.array(z.string().trim().min(1)).min(1).max(10).describe('要等待的任务窗口 ID（task_spawn 返回的任务 ID）'),
    mode: z.enum(['all', 'any']).default('all'),
    timeoutSeconds: z
      .number()
      .int()
      .min(10)
      .default(600)
      .describe('本次最长等待秒数；写正文的窗口通常需要几分钟，建议 600'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    const ids = [...new Set(args.sessionIds.map((id) => id.trim()).filter(Boolean))].filter((id) => id !== ctx.sessionId)
    if (ids.length === 0) {
      return { output: '没有可等待的任务窗口（不能等待当前窗口自己，那会死锁）。', summary: '等待目标无效' }
    }

    const timeoutMs = Math.min(args.timeoutSeconds, env.agentTaskWaitMaxSeconds) * 1000
    const deadline = Date.now() + timeoutMs
    const settled = new Map<string, { title: string; status: WindowStatus; runId: string | null }>()

    while (true) {
      const latest = await latestRunPerSession(ctx.userId, ids)

      for (const id of ids) {
        if (settled.has(id)) continue
        const run = latest.get(id)
        if (!run) {
          // 会话不存在（被删）或从未跑过 run：直接判定为失败，否则会死等到超时
          settled.set(id, { title: '未知任务窗口', status: 'failed', runId: null })
          continue
        }
        const terminal = TERMINAL_STATUS[run.status]
        if (terminal) settled.set(id, { title: run.title, status: terminal, runId: run.runId })
      }

      const finished = args.mode === 'any' ? settled.size > 0 : settled.size >= ids.length
      if (finished || ctx.signal.aborted || Date.now() >= deadline) break
      await sleep(POLL_INTERVAL_MS, ctx.signal)
    }

    const latest = await latestRunPerSession(ctx.userId, ids)
    const windows: Array<{ sessionId: string; title: string; status: WindowStatus; summary?: string }> = []
    const lines: string[] = []

    for (const id of ids) {
      const done = settled.get(id)
      if (!done) {
        const pending = latest.get(id)
        windows.push({ sessionId: id, title: pending?.title ?? '未知任务窗口', status: 'timeout' })
        lines.push(`- ${pending?.title ?? id}（${id}）：仍在执行，本次等待已超时。可再次调用 task_wait 续等。`)
        continue
      }
      if (done.status === 'awaiting') {
        windows.push({ sessionId: id, title: done.title, status: 'awaiting' })
        lines.push(`- ${done.title}（${id}）：已暂停，需要作者进入该窗口处理（等待审批或被手动停止）。`)
        continue
      }
      if (done.status === 'failed' || done.status === 'cancelled') {
        const summary = done.runId ? await deliveryOf(id, done.runId) : '该任务窗口不存在或没有执行记录。'
        windows.push({ sessionId: id, title: done.title, status: done.status, summary })
        lines.push(`- ${done.title}（${id}）：${done.status === 'failed' ? '执行失败' : '已取消'}。${summary}`)
        continue
      }
      const summary = done.runId ? await deliveryOf(id, done.runId) : ''
      // 无交付兜底：多数是任务简报被截断或窗口跑偏，给主控明确的补救路径而不是让它瞎猜
      const advice = summary.startsWith('（该窗口没有产出可读的交付内容）')
        ? '该窗口没有可读交付：任务简报可能被截断或执行跑偏。请点进该窗口查看对话，或用 task_send 发送修正指令要求它重做并给出交付摘要。'
        : ''
      windows.push({ sessionId: id, title: done.title, status: 'succeeded', summary })
      lines.push(`- ${done.title}（${id}）：已完成。交付摘要：\n${summary}${advice}`)
    }

    const succeeded = windows.filter((item) => item.status === 'succeeded').length
    const header = ctx.signal.aborted
      ? '等待被中止。'
      : `等待结束：${succeeded}/${ids.length} 个窗口已完成。`

    return {
      output: [header, ...lines, '请逐个审查上面的交付内容；有问题用 task_send 把具体返工要求发回对应窗口，然后再次 task_wait。'].join('\n'),
      summary: `等待 ${ids.length} 个窗口，${succeeded} 个完成`,
      display: orchestrationDisplay('wait', header, windows),
    }
  },
})

export const taskSendTool = defineTool({
  name: 'task_send',
  title: '向任务窗口发送提示词',
  description:
    '把提示词投递到指定任务窗口的输入框并直接发送，等价于作者在那个窗口里手动输入回车（会在该窗口开启新一轮执行）。用于审查后把返工要求发回派生窗口。目标窗口若仍在执行，必须先 task_wait 等它结束；发送后需再次 task_wait 等新一轮结果。',
  parameters: z.object({
    sessionId: z.string().trim().min(1).describe('目标任务窗口 ID'),
    prompt: z.string().trim().min(1).describe('要发送的提示词：写清楚哪里不合格、按什么标准返工、验收口径'),
    mode: z.enum(['plan', 'build', 'review']).default('build'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const blocked = await assertNotSpawnedWindow(ctx.sessionId)
    if (blocked) return { output: blocked, summary: '派生窗口不能调度其他窗口' }

    if (args.sessionId === ctx.sessionId) {
      return { output: '不能向当前窗口自己发送提示词，那会导致自我递归。', summary: '目标窗口无效' }
    }

    const target = await prisma.agentSession.findFirst({
      where: { id: args.sessionId, userId: ctx.userId },
      select: { id: true, title: true, novelId: true },
    })
    if (!target) {
      return { output: '目标任务窗口不存在或不属于当前作者，无法投递。请先用 task_spawn 派生或让作者确认任务 ID。', summary: '目标窗口不存在' }
    }

    if (hasActiveRunInSession(target.id)) {
      return {
        output: `「${target.title}」当前正在执行，无法插入新提示词。请先用 task_wait 等它结束，再投递返工要求。`,
        summary: '目标窗口忙',
      }
    }

    if (countActiveRunsByUser(ctx.userId) >= env.agentOrchestrationMaxConcurrent) {
      return {
        output: `并行任务窗口已达上限（${env.agentOrchestrationMaxConcurrent} 个同时执行），请先用 task_wait 等已有窗口结束再投递。`,
        summary: '并行额度已满',
      }
    }

    const modelConfig = await inheritModelConfig(ctx.runId)
    const { startLoopRun } = await import('../run-service.js')

    try {
      const started = await startLoopRun(
        ctx.userId,
        {
          sessionId: target.id,
          novelId: target.novelId,
          chapterId: null,
          mode: args.mode as AgentExecutionMode,
          prompt: `${args.prompt.trim()}\n\n【返工要求】改完后仍需在最后一条回复里给出自包含的交付摘要（完成状态、改了哪些章节与字数、遗留问题），主控窗口会再次审查。`,
          creativeFreedom: ctx.creativeFreedom,
          qualityMode: ctx.qualityMode,
          ...modelConfig,
          agentProfile: 'orchestrator',
        },
        { concurrencyScope: 'orchestration' },
      )

      emitSpawned(ctx, [{ sessionId: target.id, runId: started.runId, novelId: target.novelId, title: target.title }])

      return {
        output: `已把提示词发送到「${target.title}」（${target.id}）并开始执行。下一步用 task_wait 传入该任务 ID 等待新一轮交付，再做审查。`,
        summary: `已投递到「${target.title}」`,
        display: orchestrationDisplay('send', `提示词已发送到「${target.title}」`, [
          { sessionId: target.id, title: target.title, status: 'running' },
        ]),
      }
    } catch (error) {
      return {
        output: `投递失败：${error instanceof Error ? error.message : '未知错误'}。可稍后重试或自己接手这部分工作。`,
        summary: '投递失败',
      }
    }
  },
})
