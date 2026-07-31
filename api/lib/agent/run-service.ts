import type { Response } from 'express'

import type { Prisma } from '@prisma/client'

import type {
  AgentRollbackSnapshot,
  AgentStreamEvent,
  AgentUIMessage,
  StartAgentLoopRunRequest,
  StartAgentLoopRunResponse,
} from '../../../shared/contracts/index.js'
import type { AgentMessagePart } from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import { DataAccessError, prisma } from '../prisma.js'
import { getRunEventBus, loadPersistedEvents } from './events.js'
import {
  countActiveRunsByUser,
  executeAgentRun,
  getActiveRun,
  getActiveRunIdBySession,
  hasActiveRunInSession,
  stopAgentRun,
} from './loop.js'
import { resolveApproval, resolveQuestionAnswer } from './permissions.js'

/**
 * Agent Loop 新链路的路由服务层（plan/13 §4.9）。
 * 旧 legacy 链路继续走 agent-service.ts，由 AGENT_ENGINE 开关分流。
 */

export function assertLoopEngineEnabled() {
  if (env.agentEngine !== 'loop') {
    throw new DataAccessError(
      501,
      'AGENT_ENGINE_DISABLED',
      '当前部署形态不支持 Agent 循环引擎（serverless 请使用本地/PM2 部署）。',
    )
  }
}

export async function startLoopRun(
  userId: string,
  input: StartAgentLoopRunRequest,
): Promise<StartAgentLoopRunResponse> {
  assertLoopEngineEnabled()

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
      throw new DataAccessError(404, 'NOT_FOUND', '章节不存在或不属于该作品。')
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

/** 路由分流依据：新链路 run 走事件总线 SSE，legacy 走旧版回放 */
export async function getRunEngine(userId: string, runId: string): Promise<'loop' | 'legacy'> {
  const run = await findOwnedLoopRun(userId, runId)
  return run.engine === 'loop' ? 'loop' : 'legacy'
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
  assertLoopEngineEnabled()
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

export type NovelPlanArtifact = {
  id: string
  runId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

function toNovelPlanArtifact(artifact: {
  id: string
  runId: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
}): NovelPlanArtifact {
  return {
    id: artifact.id,
    runId: artifact.runId,
    title: artifact.title,
    content: artifact.content,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  }
}

/** 作品维度拉取“计划文件夹”内容：跨会话/跨任务窗口聚合 savedAsPlan 的产物 */
export async function listNovelPlanArtifacts(
  userId: string,
  novelId: string,
): Promise<{ items: NovelPlanArtifact[] }> {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, authorId: userId },
    select: { id: true },
  })

  if (!novel) {
    throw new DataAccessError(404, 'NOT_FOUND', '作品不存在或无权访问。')
  }

  const artifacts = await prisma.agentArtifact.findMany({
    where: {
      artifactType: 'chapterPlan',
      metadata: { path: ['savedAsPlan'], equals: true },
      run: { userId, novelId },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, runId: true, title: true, content: true, createdAt: true, updatedAt: true },
  })

  // 同名去重（plan/14 §四 B3）：历史重复落盘的同名计划只保留最后更新的一份，无需数据迁移
  const latestByTitle = new Map<string, (typeof artifacts)[number]>()
  for (const artifact of artifacts) {
    const kept = latestByTitle.get(artifact.title)
    if (!kept || artifact.updatedAt >= kept.updatedAt) {
      latestByTitle.set(artifact.title, artifact)
    }
  }
  const deduped = artifacts.filter((artifact) => latestByTitle.get(artifact.title)?.id === artifact.id)

  return { items: deduped.map(toNovelPlanArtifact) }
}

/** 更新计划：改名/改正文，或 saved=false 从计划文件夹移除（保留产物本体与任务历史） */
export async function updateNovelPlanArtifact(
  userId: string,
  artifactId: string,
  patch: { title?: string; content?: string; saved?: boolean },
): Promise<{ item: NovelPlanArtifact }> {
  const artifact = await prisma.agentArtifact.findFirst({
    where: { id: artifactId, artifactType: 'chapterPlan', run: { userId } },
  })

  if (!artifact) {
    throw new DataAccessError(404, 'NOT_FOUND', '计划不存在或无权访问。')
  }

  const metadata =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? { ...(artifact.metadata as Record<string, unknown>) }
      : {}

  if (typeof patch.saved === 'boolean') {
    metadata.savedAsPlan = patch.saved
  }

  const updated = await prisma.agentArtifact.update({
    where: { id: artifact.id },
    data: {
      ...(typeof patch.title === 'string' ? { title: patch.title.slice(0, 160) || '未命名计划' } : {}),
      ...(typeof patch.content === 'string' ? { content: patch.content } : {}),
      metadata: metadata as Prisma.InputJsonValue,
    },
    select: { id: true, runId: true, title: true, content: true, createdAt: true, updatedAt: true },
  })

  return { item: toNovelPlanArtifact(updated) }
}

/** 拉取会话消息（parts 结构），用于历史恢复与切换会话；回滚快照仅服务端使用，返回前剥离；
 * 附带 activeRunId：前端刷新后据此续接进行中的任务直播 */
export async function listLoopSessionMessages(
  userId: string,
  sessionId: string,
): Promise<{ messages: AgentUIMessage[]; activeRunId: string | null }> {
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  })

  if (!session) {
    throw new DataAccessError(404, 'NOT_FOUND', '会话不存在或无权访问。')
  }

  const records = await prisma.agentMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  return {
    messages: records.map((record) => ({
      id: record.id,
      runId: record.runId,
      role: record.role as 'user' | 'assistant',
      parts: (record.parts as unknown as AgentMessagePart[]).map((part) =>
        part.type === 'tool-call' && part.snapshot ? { ...part, snapshot: undefined } : part,
      ),
      createdAt: record.createdAt.toISOString(),
    })),
    activeRunId: getActiveRunIdBySession(sessionId),
  }
}

async function findOwnedSessionMessage(userId: string, sessionId: string, messageId: string) {
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, novelId: true },
  })

  if (!session) {
    throw new DataAccessError(404, 'NOT_FOUND', '会话不存在或无权访问。')
  }

  const message = await prisma.agentMessage.findFirst({
    where: { id: messageId, sessionId },
  })

  if (!message) {
    throw new DataAccessError(404, 'NOT_FOUND', '消息不存在或已被删除。')
  }

  if (hasActiveRunInSession(sessionId)) {
    throw new DataAccessError(409, 'RUN_IN_PROGRESS', '当前会话有任务正在执行，请先停止后再操作。')
  }

  return { session, message }
}

/** 删除一轮对话：按消息所属 run 整轮删除（级联清理消息/事件），不恢复工作区内容 */
export async function deleteLoopSessionMessage(
  userId: string,
  sessionId: string,
  messageId: string,
): Promise<{ deleted: true; runId: string }> {
  const { message } = await findOwnedSessionMessage(userId, sessionId, messageId)

  await prisma.$transaction(async (tx) => {
    await tx.projectMemoryEntry.deleteMany({ where: { runId: message.runId } })
    await tx.agentArtifact.deleteMany({ where: { runId: message.runId } })
    await tx.agentRun.delete({ where: { id: message.runId } }).catch(() => {})
  })

  return { deleted: true, runId: message.runId }
}

type CollectedRollback =
  | { kind: 'snapshot'; snapshot: AgentRollbackSnapshot }
  | { kind: 'created_chapter'; chapterId: string }

/** 从一批消息中按时间正序收集可回滚动作（快照 + 新建章节） */
function collectRollbackActions(records: Array<{ parts: unknown }>): CollectedRollback[] {
  const actions: CollectedRollback[] = []

  for (const record of records) {
    const parts = record.parts as AgentMessagePart[]
    if (!Array.isArray(parts)) {
      continue
    }
    for (const part of parts) {
      if (part.type !== 'tool-call' || part.status !== 'success') {
        continue
      }
      if (part.toolName === 'chapter_create' && part.display?.kind === 'chapterRef') {
        actions.push({ kind: 'created_chapter', chapterId: part.display.chapterId })
        continue
      }
      if (part.snapshot) {
        actions.push({ kind: 'snapshot', snapshot: part.snapshot })
      }
    }
  }

  return actions
}

/**
 * 回退到某轮对话之前：逆序重放该轮及之后所有写操作的快照（新建章节直接删除），
 * 然后删除这些 run（级联清理消息/事件/记忆/产物）。
 */
export async function rollbackLoopSessionFromMessage(
  userId: string,
  sessionId: string,
  messageId: string,
): Promise<{ rolledBack: true; removedRunCount: number }> {
  const { session, message } = await findOwnedSessionMessage(userId, sessionId, messageId)

  const targetRun = await prisma.agentRun.findUnique({
    where: { id: message.runId },
    select: { id: true, createdAt: true },
  })

  if (!targetRun) {
    throw new DataAccessError(404, 'NOT_FOUND', '对应的任务记录不存在。')
  }

  const runs = await prisma.agentRun.findMany({
    where: { sessionId, createdAt: { gte: targetRun.createdAt } },
    select: { id: true },
  })
  const runIds = runs.map((run) => run.id)

  const records = await prisma.agentMessage.findMany({
    where: { runId: { in: runIds } },
    orderBy: { createdAt: 'asc' },
    select: { parts: true },
  })

  // 后发生的先恢复：同一字段多次写入时最终回到最早的 previousValue
  const actions = collectRollbackActions(records).reverse()

  await prisma.$transaction(async (tx) => {
    for (const action of actions) {
      if (action.kind === 'created_chapter') {
        await tx.chapter.deleteMany({ where: { id: action.chapterId, novelId: session.novelId } })
        continue
      }

      const { snapshot } = action
      if (snapshot.target === 'chapter') {
        const exists = await tx.chapter.findFirst({
          where: { id: snapshot.targetId, novelId: session.novelId },
          select: { id: true },
        })
        if (!exists) {
          continue
        }
        if (snapshot.field === 'content') {
          const content = snapshot.previousValue ?? ''
          await tx.chapter.update({
            where: { id: snapshot.targetId },
            data: { content, wordCount: content.length },
          })
        } else if (snapshot.field === 'title') {
          await tx.chapter.update({
            where: { id: snapshot.targetId },
            data: { title: snapshot.previousValue ?? '' },
          })
        }
        continue
      }

      // novel 字段快照：白名单内逐字段恢复，status 需要枚举合法才写回
      if (snapshot.field === 'title' && snapshot.previousValue !== null) {
        await tx.novel.update({ where: { id: session.novelId }, data: { title: snapshot.previousValue } })
      } else if (snapshot.field === 'summary') {
        await tx.novel.update({ where: { id: session.novelId }, data: { summary: snapshot.previousValue } })
      } else if (snapshot.field === 'coverPrompt') {
        await tx.novel.update({ where: { id: session.novelId }, data: { coverPrompt: snapshot.previousValue } })
      } else if (snapshot.field === 'coverAssetId') {
        await tx.novel.update({ where: { id: session.novelId }, data: { coverAssetId: snapshot.previousValue } })
      } else if (
        snapshot.field === 'status' &&
        (snapshot.previousValue === 'draft' ||
          snapshot.previousValue === 'published' ||
          snapshot.previousValue === 'archived')
      ) {
        await tx.novel.update({
          where: { id: session.novelId },
          data: { status: snapshot.previousValue },
        })
      }
    }

    // 重算作品统计（章节数/总字数）
    const chapters = await tx.chapter.findMany({
      where: { novelId: session.novelId },
      select: { wordCount: true },
    })
    await tx.novel.update({
      where: { id: session.novelId },
      data: {
        chapterCount: chapters.length,
        wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      },
    })

    await tx.projectMemoryEntry.deleteMany({ where: { runId: { in: runIds } } })
    await tx.agentArtifact.deleteMany({ where: { runId: { in: runIds } } })
    await tx.agentRun.deleteMany({ where: { id: { in: runIds } } })
  })

  return { rolledBack: true, removedRunCount: runIds.length }
}
