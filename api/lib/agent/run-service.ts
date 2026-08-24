import type { Response } from 'express'

import type { AgentRun as AgentRunRecord } from '@prisma/client'

import type {
  AgentActionHandoff,
  AgentActionPlan,
  AgentActionResponse,
  AgentArtifact,
  AgentArtifactApplyStrategy,
  AgentExecutionAgent,
  AgentExecutionMode,
  AgentRouteDecision,
  AgentRuleBundle,
  AgentRun,
  AgentSession,
  AgentStoryMemoryDigest,
  AgentStreamEvent,
  AgentWorkspaceToolPolicy,
  CreateAgentSessionRequest,
  ProjectMemoryEntry,
  StartAgentLoopRunRequest,
  StartAgentLoopRunResponse,
  UpdateAgentSessionRequest,
} from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import { DataAccessError, prisma } from '../prisma.js'
import { getRunEventBus, loadPersistedEvents } from './events.js'
import {
  countActiveRunsByUser,
  getActiveRun,
  hasActiveRunInSession,
  stopAgentRun,
} from './active-runs.js'
import { executeAgentRun } from './loop.js'
import { resolveApproval, resolveQuestionAnswer } from './permissions.js'
import { isDefaultSessionTitle } from './session-title.js'

/**
 * Agent Loop 新链路的路由服务层（plan/13 §4.9）。
 * 阶段 K：legacy 链路（agent-service.ts）已物理删除，本文件是 Agent 服务层唯一入口；
 * sessions CRUD 与历史回放自 legacy 迁入（行为原样保留，供任务窗口体系消费）。
 * 阶段 P3：计划产物拆至 plan-artifacts.ts、会话消息/删除/回滚拆至 session-messages.ts。
 */

export async function startLoopRun(
  userId: string,
  input: StartAgentLoopRunRequest,
): Promise<StartAgentLoopRunResponse> {
  const session = await prisma.agentSession.findFirst({
    where: { id: input.sessionId, userId },
  })

  if (!session) {
    throw new DataAccessError(404, 'NOT_FOUND', '会话不存在或无权访问。')
  }

  if (session.novelId !== input.novelId) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '会话与作品不匹配。')
  }

  // 同一 session 仅允许 1 个进行中的 run；单用户全局并发受 env 限制
  if (hasActiveRunInSession(session.id)) {
    throw new DataAccessError(409, 'RUN_IN_PROGRESS', '当前会话已有任务在执行，请先停止或等待完成。')
  }

  if (countActiveRunsByUser(userId) >= env.agentUserMaxConcurrent) {
    throw new DataAccessError(409, 'RUN_LIMIT', `同时进行的任务数已达上限（${env.agentUserMaxConcurrent}），请稍后再试。`)
  }

  const chapterId = input.chapterId?.trim() || null

  if (chapterId) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId: session.novelId, authorId: userId },
      select: { id: true },
    })
    if (!chapter) {
      // 独立错误码：前端据此丢弃失效 chapterId 重试；严禁与会话 404 共用 NOT_FOUND，
      // 否则前端会把「章节被回退删除」误判成「会话被删除」而清空整段对话
      throw new DataAccessError(404, 'CHAPTER_NOT_FOUND', '章节不存在或不属于该作品。')
    }
  }

  const run = await prisma.agentRun.create({
    data: {
      sessionId: session.id,
      userId,
      novelId: session.novelId,
      chapterId,
      // DB 枚举 act ↔ 契约 build
      mode: input.mode === 'build' ? 'act' : input.mode,
      action: 'workspaceAgent',
      agentType: 'writingOrchestrator',
      status: 'queued',
      engine: 'loop',
      inputSummary: input.prompt.slice(0, 300),
    },
  })

  // 异步执行循环，路由立即返回，前端连 stream 拿事件
  void executeAgentRun({
    runId: run.id,
    sessionId: session.id,
    userId,
    novelId: session.novelId,
    chapterId,
    mode: input.mode,
    prompt: input.prompt,
    selection: input.selection ?? null,
    attachments: input.attachments ?? [],
  })

  return {
    runId: run.id,
    sessionId: session.id,
    status: 'running',
    streamUrl: `/api/agent/runs/${run.id}/stream`,
  }
}

async function findOwnedLoopRun(userId: string, runId: string) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId },
  })

  if (!run) {
    throw new DataAccessError(404, 'NOT_FOUND', '任务不存在或无权访问。')
  }

  return run
}

/**
 * SSE 直推：live（订阅事件总线）与 replay（读 AgentRunEvent）统一为同一事件源。
 * 响应带 id: {seq}，客户端重连带 Last-Event-ID，从 seq+1 续传。
 */
export async function streamLoopRun(
  userId: string,
  runId: string,
  sinceSeq: number,
  res: Response,
): Promise<void> {
  const run = await findOwnedLoopRun(userId, runId)

  if (run.engine !== 'loop') {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '该任务不是循环引擎运行，请走旧版事件回放。')
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const writeEvent = (event: AgentStreamEvent) => {
    res.write(`id: ${event.seq}\n`)
    res.write(`event: ${event.type}\n`)
    res.write(`data: ${JSON.stringify(event)}\n\n`)
    ;(res as Response & { flush?: () => void }).flush?.()
  }

  const bus = getRunEventBus(runId)

  if (bus) {
    // live：补发历史 + 实时订阅；终态事件后由客户端关闭，服务端兜底监听断开
    // 心跳注释行：等待审批/提问期间长时间无事件，防止 Nginx 空闲超时掰断 SSE
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n')
      ;(res as Response & { flush?: () => void }).flush?.()
    }, 20000)

    const unsubscribe = bus.subscribe((event) => {
      writeEvent(event)
      if (event.type === 'run.finished' || event.type === 'run.paused' || (event.type === 'error' && !event.recoverable)) {
        unsubscribe()
        clearInterval(heartbeat)
        res.end()
      }
    }, sinceSeq)

    res.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
    return
  }

  // replay：run 已结束（或进程重启），从 DB 重放真实事件
  const events = await loadPersistedEvents(runId, sinceSeq)
  for (const event of events) {
    writeEvent(event)
  }

  // 进程重启后的孤儿/已收尾 run：持久化事件里可能永远没有终态事件，
  // 直播中的前端会无限重连并卡在“执行中”。按 DB 终态补发合成终态事件收尾。
  const hasTerminal = events.some(
    (event) => event.type === 'run.finished' || event.type === 'run.paused' || (event.type === 'error' && !event.recoverable),
  )
  if (!hasTerminal) {
    const latest = await prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true, outputSummary: true } })
    const nextSeq = (events.length > 0 ? events[events.length - 1].seq : sinceSeq) + 1
    const base = { seq: nextSeq, runId, ts: new Date().toISOString() }
    if (latest?.status === 'paused') {
      writeEvent({ ...base, type: 'run.paused', reason: 'user_stop' })
    } else {
      const status = latest?.status === 'completed' ? 'succeeded' : latest?.status === 'cancelled' ? 'cancelled' : 'failed'
      writeEvent({
        ...base,
        type: 'run.finished',
        status,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        artifacts: [],
        outputSummary: latest?.outputSummary ?? '',
      })
    }
  }
  res.end()
}

export async function resolveLoopRunApproval(
  userId: string,
  runId: string,
  callId: string,
  approved: boolean,
  alwaysAllow: boolean,
): Promise<{ resolved: boolean }> {
  await findOwnedLoopRun(userId, runId)

  const resolved = resolveApproval(runId, callId, approved, alwaysAllow)

  if (!resolved) {
    throw new DataAccessError(409, 'APPROVAL_NOT_PENDING', '该审批已处理或已超时。')
  }

  return { resolved: true }
}

/** 回答 ask_user 工具的挂起提问，唤醒循环继续执行 */
export async function resolveLoopRunQuestion(
  userId: string,
  runId: string,
  callId: string,
  answer: string,
): Promise<{ resolved: boolean }> {
  await findOwnedLoopRun(userId, runId)

  const resolved = resolveQuestionAnswer(runId, callId, answer)

  if (!resolved) {
    throw new DataAccessError(409, 'QUESTION_NOT_PENDING', '该提问已处理或已超时。')
  }

  return { resolved: true }
}

export async function stopLoopRun(userId: string, runId: string): Promise<{ stopped: boolean }> {
  const run = await findOwnedLoopRun(userId, runId)

  const stopped = stopAgentRun(runId)

  if (!stopped) {
    // 内存里没有活跃 run 但 DB 还停在进行中：进程重启（部署 reload/崩溃）遗留的孤儿任务，
    // 就地收尾为 paused 并补一条中断说明消息，避免用户永远无法暂停/看不到终止原因
    if (run.status === 'queued' || run.status === 'running' || run.status === 'awaiting_approval') {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'paused', errorMessage: '任务因服务重启而中断，已就地停止。' },
      })
      await prisma.agentMessage
        .create({
          data: {
            runId: run.id,
            sessionId: run.sessionId,
            role: 'assistant',
            parts: [
              { type: 'text', text: '任务已终止（服务重启导致执行中断）。直接发送“继续”，我会接着完成剩余待办。' },
            ] as unknown as object,
          },
        })
        .catch(() => {})
      return { stopped: true }
    }
    throw new DataAccessError(409, 'RUN_NOT_ACTIVE', '任务不在运行中，无需停止。')
  }

  return { stopped: true }
}

/**
 * 进程启动兜底：上一个进程被杀（部署 reload/崩溃）时遗留的进行中 run 无人收尾，
 * 前端会永远显示“执行中”、暂停接口报“任务不在运行中”。启动时统一标记为 failed，
 * 并在会话里补一条终止说明消息，让刷新后的对话结尾能看到终止原因。
 */
export async function recoverOrphanLoopRuns(): Promise<void> {
  try {
    const orphans = await prisma.agentRun.findMany({
      where: { engine: 'loop', status: { in: ['queued', 'running', 'awaiting_approval'] } },
      select: { id: true, sessionId: true },
    })

    if (orphans.length === 0) {
      return
    }

    await prisma.agentRun.updateMany({
      where: { id: { in: orphans.map((run) => run.id) } },
      data: {
        status: 'failed',
        errorMessage: '服务更新导致任务中断。点击「继续执行」或直接发送“继续”，我会接着完成剩余工作。',
        finishedAt: new Date(),
      },
    })

    await prisma.agentMessage.createMany({
      data: orphans.map((run) => ({
        runId: run.id,
        sessionId: run.sessionId,
        role: 'assistant' as const,
        parts: [
          { type: 'text', text: '任务已终止（服务更新导致执行中断）。直接发送“继续”，我会接着完成剩余待办。' },
        ] as unknown as object,
      })),
    })

    console.log(`[agent-loop] 启动清理：${orphans.length} 个遗留进行中任务已标记为中断`)
  } catch (error) {
    console.error('[agent-loop] 启动清理遗留任务失败', error)
  }
}

export async function continueLoopRun(
  userId: string,
  runId: string,
): Promise<StartAgentLoopRunResponse> {
  const run = await findOwnedLoopRun(userId, runId)

  if (run.engine !== 'loop') {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '仅循环引擎任务支持续跑。')
  }

  if (run.status !== 'paused' && run.status !== 'failed') {
    throw new DataAccessError(409, 'RUN_NOT_PAUSED', '仅暂停或中断的任务可以继续。')
  }

  if (getActiveRun(runId) || hasActiveRunInSession(run.sessionId)) {
    throw new DataAccessError(409, 'RUN_IN_PROGRESS', '当前会话已有任务在执行。')
  }

  void executeAgentRun({
    runId: run.id,
    sessionId: run.sessionId,
    userId,
    novelId: run.novelId,
    chapterId: run.chapterId,
    mode: run.mode === 'act' ? 'build' : run.mode,
    prompt: run.inputSummary ?? '请继续完成之前的任务。',
    resume: true,
  })

  return {
    runId: run.id,
    sessionId: run.sessionId,
    status: 'running',
    streamUrl: `/api/agent/runs/${run.id}/stream`,
  }
}

// ---------------------------------------------------------------------------
// 阶段 K2：sessions CRUD 与历史回放（自 legacy agent-service.ts 迁入，行为原样保留）
// ---------------------------------------------------------------------------

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? value : value.toISOString()
}

function asMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asAgentActionPlan(value: unknown): AgentActionPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const plan = value as Record<string, unknown>
  if (
    (plan.mode !== 'plan' && plan.mode !== 'execute' && plan.mode !== 'review') ||
    typeof plan.summary !== 'string' ||
    !Array.isArray(plan.steps)
  ) {
    return null
  }

  return plan as unknown as AgentActionPlan
}

function asAgentWorkspaceToolPolicy(value: unknown): AgentWorkspaceToolPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const policy = value as Record<string, unknown>
  if (
    (policy.mode !== 'plan' && policy.mode !== 'build' && policy.mode !== 'review') ||
    !Array.isArray(policy.tools)
  ) {
    return null
  }

  return policy as unknown as AgentWorkspaceToolPolicy
}

function asAgentExecutionAgent(value: unknown): AgentExecutionAgent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const validAgentType = [
    'writingOrchestrator',
    'storyPlanner',
    'draftWriter',
    'continuityEditor',
    'styleEditor',
    'loreLibrarian',
    'coverPromptAgent',
  ].includes(String(candidate.agentType))

  if (!validAgentType || (candidate.role !== 'primary' && candidate.role !== 'specialist')) {
    return null
  }

  if (typeof candidate.title !== 'string' || typeof candidate.description !== 'string') {
    return null
  }

  return candidate as unknown as AgentExecutionAgent
}

function buildExecutionAgent(agentType: AgentRun['agentType']): AgentExecutionAgent {
  switch (agentType) {
    case 'writingOrchestrator':
      return {
        agentType,
        role: 'primary',
        title: '主控 Agent',
        description: '负责理解当前指令、组织工作区上下文，并决定交给哪个专职代理处理。',
      }
    case 'storyPlanner':
      return {
        agentType,
        role: 'specialist',
        title: '剧情规划 Agent',
        description: '负责章节规划、结构拆解、书名与章节名提案等前置设计任务。',
      }
    case 'draftWriter':
      return {
        agentType,
        role: 'specialist',
        title: '正文写作 Agent',
        description: '负责起草正文、续写章节，并把可执行写作结果交回工作台。',
      }
    case 'continuityEditor':
      return {
        agentType,
        role: 'specialist',
        title: '连续性审阅 Agent',
        description: '负责检查设定冲突、时间线问题和章节之间的连续性。',
      }
    case 'styleEditor':
      return {
        agentType,
        role: 'specialist',
        title: '文风编辑 Agent',
        description: '负责改写、润色和局部表达优化，不直接承担全章规划。',
      }
    case 'loreLibrarian':
      return {
        agentType,
        role: 'specialist',
        title: '设定检索 Agent',
        description: '负责读取作品上下文、设定摘要和历史记忆，为当前任务补全背景。',
      }
    case 'coverPromptAgent':
      return {
        agentType,
        role: 'specialist',
        title: '封面提示词 Agent',
        description: '负责整理封面画面描述和视觉提示词，不介入正文写作接口。',
      }
  }
}

function asAgentRouteDecision(value: unknown): AgentRouteDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const sourceAgent = asAgentExecutionAgent(candidate.sourceAgent)
  const targetAgent = asAgentExecutionAgent(candidate.targetAgent)

  if (!sourceAgent || !targetAgent) {
    return null
  }

  if (
    typeof candidate.task !== 'string' ||
    typeof candidate.intentLabel !== 'string' ||
    typeof candidate.summary !== 'string'
  ) {
    return null
  }

  return {
    sourceAgent,
    targetAgent,
    task: candidate.task,
    intentLabel: candidate.intentLabel,
    summary: candidate.summary,
    factors: Array.isArray(candidate.factors)
      ? candidate.factors.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function asAgentRuleBundle(value: unknown): AgentRuleBundle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.rules)) {
    return null
  }

  const rules = candidate.rules.filter((rule): rule is string => typeof rule === 'string')
  return {
    summary: candidate.summary,
    rules,
  }
}

function asAgentStoryMemoryDigest(value: unknown): AgentStoryMemoryDigest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.items)) {
    return null
  }

  const items = candidate.items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return []
    }

    const entry = item as Record<string, unknown>
    if (
      typeof entry.title !== 'string' ||
      typeof entry.memoryType !== 'string' ||
      typeof entry.excerpt !== 'string'
    ) {
      return []
    }

    return [
      {
        title: entry.title,
        memoryType: entry.memoryType as ProjectMemoryEntry['memoryType'],
        excerpt: entry.excerpt,
      },
    ]
  })

  return {
    summary: candidate.summary,
    items,
  }
}

function asAgentActionHandoff(value: unknown): AgentActionHandoff | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentActionHandoff>
  if (
    (candidate.sourceMode !== 'plan' && candidate.sourceMode !== 'build' && candidate.sourceMode !== 'review') ||
    (candidate.targetMode !== 'plan' && candidate.targetMode !== 'build' && candidate.targetMode !== 'review') ||
    typeof candidate.title !== 'string' ||
    typeof candidate.summary !== 'string' ||
    typeof candidate.confirmLabel !== 'string'
  ) {
    return null
  }

  return candidate as AgentActionHandoff
}

function hydrateHandoffSource(
  handoff: AgentActionHandoff | null,
  runId: string,
  artifactId: string,
): AgentActionHandoff | null {
  if (!handoff) {
    return null
  }

  return {
    ...handoff,
    sourceRunId: handoff.sourceRunId ?? runId,
    sourceArtifactId: handoff.sourceArtifactId ?? artifactId,
  }
}

function defaultArtifactApplyStrategies(
  artifactType: AgentArtifact['artifactType'],
): AgentArtifactApplyStrategy[] {
  if (artifactType === 'chapterDraft') {
    return ['replaceChapterContent', 'appendChapterContent']
  }

  if (artifactType === 'chapterContinuation') {
    return ['appendChapterContent', 'replaceChapterContent']
  }

  if (artifactType === 'rewriteSelection' || artifactType === 'polishSelection') {
    return ['replaceChapterContent']
  }

  if (artifactType === 'chapterPlan' || artifactType === 'continuityReview') {
    return ['saveChapterSummary']
  }

  if (artifactType === 'coverPrompt') {
    return ['setNovelCoverPrompt']
  }

  return []
}

function resolveArtifactApplyStrategies(record: {
  artifactType: AgentArtifact['artifactType']
  metadata?: Record<string, unknown> | null
}): AgentArtifactApplyStrategy[] {
  const metadata = record.metadata ?? null

  if (Array.isArray(metadata?.availableApplyStrategies)) {
    return metadata.availableApplyStrategies.filter(
      (strategy): strategy is AgentArtifactApplyStrategy => typeof strategy === 'string',
    )
  }

  const task = typeof metadata?.workspaceTask === 'string' ? metadata.workspaceTask : null
  if (
    task === 'generate-novel-title' ||
    task === 'generate-chapter-titles' ||
    task === 'read-story-context' ||
    task === 'workspace-agent'
  ) {
    return []
  }

  return defaultArtifactApplyStrategies(record.artifactType)
}

function toAgentSession(record: {
  id: string
  userId: string
  novelId: string
  title: string
  status: AgentSession['status']
  lastRunAt?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}): AgentSession {
  return {
    id: record.id,
    userId: record.userId,
    novelId: record.novelId,
    title: record.title,
    status: record.status,
    lastRunAt: toIso(record.lastRunAt),
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

function toAgentRun(record: {
  id: string
  sessionId: string
  userId: string
  novelId: string
  chapterId?: string | null
  mode: AgentRun['mode']
  action: string | null
  agentType: AgentRun['agentType']
  status: AgentRun['status']
  inputSummary?: string | null
  outputSummary?: string | null
  errorMessage?: string | null
  startedAt?: Date | string | null
  finishedAt?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}): AgentRun {
  return {
    id: record.id,
    sessionId: record.sessionId,
    userId: record.userId,
    novelId: record.novelId,
    chapterId: record.chapterId ?? null,
    mode: record.mode,
    // Prisma 枚举比契约宽（含 workspaceAgent），any 时代即原样透传，此处保持透传语义
    action: record.action as unknown as AgentRun['action'],
    agentType: record.agentType,
    status: record.status,
    inputSummary: record.inputSummary ?? null,
    outputSummary: record.outputSummary ?? null,
    errorMessage: record.errorMessage ?? null,
    startedAt: toIso(record.startedAt),
    finishedAt: toIso(record.finishedAt),
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

function toAgentArtifact(record: {
  id: string
  runId: string
  artifactType: AgentArtifact['artifactType']
  title: string
  summary?: string | null
  content: string
  metadata?: unknown
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}): AgentArtifact {
  const metadata = asMetadataRecord(record.metadata)

  return {
    id: record.id,
    runId: record.runId,
    artifactType: record.artifactType,
    title: record.title,
    summary: record.summary ?? null,
    content: record.content,
    metadata,
    availableApplyStrategies: resolveArtifactApplyStrategies({
      artifactType: record.artifactType,
      metadata,
    }),
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

function toProjectMemoryEntry(record: {
  id: string
  runId?: string | null
  novelId: string
  sourceChapterId?: string | null
  memoryType: ProjectMemoryEntry['memoryType']
  title: string
  content: string
  importance?: number | null
  embeddingRef?: string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}): ProjectMemoryEntry {
  return {
    id: record.id,
    runId: record.runId ?? null,
    novelId: record.novelId,
    sourceChapterId: record.sourceChapterId ?? null,
    memoryType: record.memoryType,
    title: record.title,
    content: record.content,
    importance: record.importance ?? 50,
    embeddingRef: record.embeddingRef ?? null,
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

async function ensureOwnedNovel(userId: string, novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
  })

  if (!novel) {
    throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '未找到作品。')
  }

  if (novel.authorId !== userId) {
    throw new DataAccessError(403, 'NOVEL_FORBIDDEN', '当前账号无权访问该作品。')
  }

  return novel
}

async function ensureOwnedSession(userId: string, sessionId: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
  })

  if (!session) {
    throw new DataAccessError(404, 'AGENT_SESSION_NOT_FOUND', '未找到会话。')
  }

  if (session.userId !== userId) {
    throw new DataAccessError(403, 'AGENT_SESSION_FORBIDDEN', '当前账号无权访问该会话。')
  }

  return session
}

function buildAgentRunResultPayload(
  run: AgentRunRecord,
  artifacts: Awaited<ReturnType<typeof prisma.agentArtifact.findMany>>,
  memoryEntries: Awaited<ReturnType<typeof prisma.projectMemoryEntry.findMany>>,
): AgentActionResponse['data'] {
  const artifactItems = artifacts.map(toAgentArtifact)
  const memoryItems = memoryEntries.map(toProjectMemoryEntry)
  const firstArtifact = artifactItems[0] ?? null
  const executionMode =
    firstArtifact?.metadata && typeof firstArtifact.metadata === 'object'
      ? ((firstArtifact.metadata as Record<string, unknown>).executionMode as AgentExecutionMode | null | undefined) ?? null
      : null
  const activeAgent =
    asAgentExecutionAgent(firstArtifact?.metadata?.activeAgent) ?? buildExecutionAgent(run.agentType)
  const routeDecision = asAgentRouteDecision(firstArtifact?.metadata?.routeDecision)
  const ruleBundle = asAgentRuleBundle(firstArtifact?.metadata?.ruleBundle)
  const storyMemoryDigest = asAgentStoryMemoryDigest(firstArtifact?.metadata?.storyMemoryDigest)
  const actionPlan = asAgentActionPlan(firstArtifact?.metadata?.actionPlan)
  const toolPolicy = asAgentWorkspaceToolPolicy(firstArtifact?.metadata?.toolPolicy)
  const stepResults =
    firstArtifact?.metadata && typeof firstArtifact.metadata === 'object'
      ? ((firstArtifact.metadata as Record<string, unknown>).stepResults as AgentActionResponse['data']['stepResults']) ?? null
      : null
  const handoff = hydrateHandoffSource(
    asAgentActionHandoff(firstArtifact?.metadata?.handoff),
    run.id,
    firstArtifact?.id ?? '',
  )

  return {
    run: toAgentRun(run),
    artifacts: artifactItems,
    memoryEntries: memoryItems,
    artifact: firstArtifact,
    title: firstArtifact?.title ?? 'Agent 结果',
    content: firstArtifact?.content ?? '',
    summary: firstArtifact?.summary ?? null,
    artifactType: firstArtifact?.artifactType ?? null,
    activeAgent,
    routeDecision,
    ruleBundle,
    storyMemoryDigest,
    executionMode,
    actionPlan,
    stepResults,
    handoff,
    toolPolicy,
    stream: {
      liveUrl: `/api/agent/runs/${run.id}/stream`,
      replayUrl: `/api/agent/runs/${run.id}/stream`,
    },
    result: firstArtifact?.content ?? '',
    prompt: run.inputSummary ?? undefined,
    outline: firstArtifact?.artifactType === 'chapterPlan' ? firstArtifact.content : undefined,
  }
}

export async function listAgentSessionsData(userId: string, novelId?: string) {
  const items = await prisma.agentSession.findMany({
    where: {
      userId,
      ...(novelId ? { novelId } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
  })

  // 空且未命名的会话不进入列表：只有产生过对话（lastRunAt）或已被命名的会话才保留展示
  const visible = items.filter((session) => session.lastRunAt || !isDefaultSessionTitle(session.title))

  return {
    items: visible.map(toAgentSession),
  }
}

export async function createAgentSessionData(userId: string, input: CreateAgentSessionRequest) {
  const novel = await ensureOwnedNovel(userId, input.novelId)

  const session = await prisma.agentSession.create({
    data: {
      userId,
      novelId: input.novelId,
      title: input.title?.trim() || `${novel.title} 写作会话`,
      status: 'active',
    },
  })

  return {
    session: toAgentSession(session),
  }
}

export async function updateAgentSessionData(
  userId: string,
  sessionId: string,
  input: UpdateAgentSessionRequest,
) {
  const session = await ensureOwnedSession(userId, sessionId)
  const nextTitle = input.title?.trim()

  if (!nextTitle) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '请提供会话标题。')
  }

  const updatedSession = await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      title: nextTitle.slice(0, 160),
    },
  })

  return {
    session: toAgentSession(updatedSession),
  }
}

export async function deleteAgentSessionData(userId: string, sessionId: string) {
  const session = await ensureOwnedSession(userId, sessionId)

  await prisma.$transaction(async (tx) => {
    const runs = await tx.agentRun.findMany({
      where: { sessionId: session.id },
      select: { id: true },
    })
    const runIds = runs.map((run) => run.id)

    if (runIds.length > 0) {
      await tx.projectMemoryEntry.deleteMany({
        where: {
          runId: { in: runIds },
        },
      })

      await tx.agentArtifact.deleteMany({
        where: {
          runId: { in: runIds },
        },
      })

      await tx.agentRun.deleteMany({
        where: { sessionId: session.id },
      })
    }

    await tx.agentSession.delete({
      where: { id: session.id },
    })
  })

  return {
    sessionId: session.id,
    deleted: true as const,
  }
}

/** 任务窗口体系的历史回放：按 run 聚合产物与记忆，恢复历史计划/大纲等工件 */
export async function listAgentSessionHistoryData(userId: string, sessionId: string) {
  await ensureOwnedSession(userId, sessionId)

  const runs = await prisma.agentRun.findMany({
    where: {
      sessionId,
    },
    orderBy: [{ createdAt: 'asc' }],
  })

  if (runs.length === 0) {
    return {
      items: [],
    }
  }

  const runIds = runs.map((run) => run.id)
  const [artifacts, memoryEntries] = await prisma.$transaction([
    prisma.agentArtifact.findMany({
      where: {
        runId: {
          in: runIds,
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    }),
    prisma.projectMemoryEntry.findMany({
      where: {
        runId: {
          in: runIds,
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    }),
  ])

  const artifactMap = new Map<string, typeof artifacts>()
  for (const artifact of artifacts) {
    const existing = artifactMap.get(artifact.runId) ?? []
    existing.push(artifact)
    artifactMap.set(artifact.runId, existing)
  }

  const memoryMap = new Map<string, typeof memoryEntries>()
  for (const entry of memoryEntries) {
    if (!entry.runId) {
      continue
    }

    const existing = memoryMap.get(entry.runId) ?? []
    existing.push(entry)
    memoryMap.set(entry.runId, existing)
  }

  return {
    items: runs.map((run) =>
      buildAgentRunResultPayload(run, artifactMap.get(run.id) ?? [], memoryMap.get(run.id) ?? []),
    ),
  }
}
