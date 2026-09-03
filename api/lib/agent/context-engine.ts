import { createHash, randomUUID } from 'node:crypto'

import type {
  AgentMessagePart,
  ContextCheckpoint,
  ContextCheckpointSummary,
  ContextDetail,
  ContextDetailRecord,
  ContextState,
  TaskSpec,
  UserDirective,
} from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import { DataAccessError, prisma } from '../prisma.js'
import { extractDirectiveCandidates } from './task-spec.js'

const WARNING_THRESHOLD = 0.65
const COMPACTION_THRESHOLD = 0.78
const RECENT_TAIL_MESSAGES = 24

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2)
}

function jsonText(value: unknown): string {
  return JSON.stringify(value)
}

function directiveRecord(record: {
  id: string; novelId: string; sessionId: string | null; volumeId: string | null; chapterId: string | null
  taskSpecId: string | null; scope: string; kind: string; text: string; status: string; sourceMessageId: string
  supersededBy: string | null; createdAt: Date; updatedAt: Date
}): UserDirective {
  return {
    ...record,
    scope: record.scope as UserDirective['scope'],
    kind: record.kind as UserDirective['kind'],
    status: record.status as UserDirective['status'],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

export async function captureUserDirectives(input: {
  userId: string
  novelId: string
  sessionId: string
  chapterId: string | null
  sourceMessageId: string
  taskSpec: TaskSpec
  prompt: string
}): Promise<UserDirective[]> {
  const candidates = extractDirectiveCandidates(input.prompt)
  const created: UserDirective[] = []
  for (const candidate of candidates) {
    const existing = await prisma.userDirective.findFirst({
      where: { novelId: input.novelId, status: 'active', kind: candidate.kind, text: candidate.text },
    })
    if (existing) {
      created.push(directiveRecord(existing))
      continue
    }
    const record = await prisma.userDirective.create({
      data: {
        userId: input.userId,
        novelId: input.novelId,
        sessionId: input.sessionId,
        chapterId: input.chapterId,
        taskSpecId: input.taskSpec.id,
        scope: input.chapterId ? 'chapter' : 'global',
        kind: candidate.kind,
        text: candidate.text,
        sourceMessageId: input.sourceMessageId,
      },
    })
    created.push(directiveRecord(record))
  }
  return created
}

export async function listActiveDirectives(userId: string, novelId: string): Promise<UserDirective[]> {
  const records = await prisma.userDirective.findMany({
    where: { userId, novelId, status: 'active' },
    orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }],
  })
  return records.map(directiveRecord)
}

export async function saveDirective(input: {
  userId: string; novelId: string; sessionId: string; chapterId: string | null; sourceMessageId: string
  text: string; kind: UserDirective['kind']; scope: UserDirective['scope']
}): Promise<UserDirective> {
  const record = await prisma.userDirective.create({ data: { ...input, volumeId: null } })
  return directiveRecord(record)
}

export async function supersedeDirective(userId: string, novelId: string, directiveId: string, replacement?: string): Promise<UserDirective> {
  const current = await prisma.userDirective.findFirst({ where: { id: directiveId, userId, novelId, status: 'active' } })
  if (!current) throw new DataAccessError(404, 'DIRECTIVE_NOT_FOUND', '指令不存在、已失效或不属于当前作品。')
  if (!replacement?.trim()) {
    return directiveRecord(await prisma.userDirective.update({ where: { id: current.id }, data: { status: 'cancelled' } }))
  }
  const nextId = randomUUID()
  const [, next] = await prisma.$transaction([
    prisma.userDirective.update({ where: { id: current.id }, data: { status: 'superseded', supersededBy: nextId } }),
    prisma.userDirective.create({
      data: {
        id: nextId, userId, novelId, sessionId: current.sessionId, volumeId: current.volumeId,
        chapterId: current.chapterId, taskSpecId: current.taskSpecId, scope: current.scope, kind: current.kind,
        text: replacement.trim(), sourceMessageId: current.sourceMessageId,
      },
    }),
  ])
  return directiveRecord(next)
}

export function renderDirectiveDigest(directives: UserDirective[]): string | null {
  if (!directives.length) return null
  return `[系统] 作者长期有效指令账本（优先级高于旧对话；仅 active 生效）：\n${directives.map((item) => `- [${item.kind}/${item.scope}] ${item.text} (directiveId=${item.id})`).join('\n')}`
}

function messageText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return (parts as AgentMessagePart[]).map((part) => {
    if (part.type === 'text') return part.text
    if (part.type === 'attachment') return `[附件 ${part.name}]`
    if (part.type === 'tool-call') {
      return `[工具 ${part.toolName}${part.summary ? `：${part.summary}` : ''}]`
    }
    return ''
  }).filter(Boolean).join('\n')
}

function mergeUnique(...lists: string[][]): string[] {
  return [...new Set(lists.flat().map((item) => item.trim()).filter(Boolean))]
}

function checkpointRecord(record: {
  id: string; sessionId: string; runId: string | null; sourceMessageCount: number; sourceTokens: number
  summaryTokens: number; model: string; version: number; sourceHash: string; summary: unknown; validation: unknown; createdAt: Date
}): ContextCheckpoint {
  return {
    id: record.id, sessionId: record.sessionId, runId: record.runId, sourceMessageCount: record.sourceMessageCount,
    sourceTokens: record.sourceTokens, summaryTokens: record.summaryTokens, model: record.model, version: record.version,
    sourceHash: record.sourceHash, summary: record.summary as ContextCheckpointSummary,
    validation: record.validation as ContextCheckpoint['validation'], createdAt: record.createdAt.toISOString(),
  }
}

export function renderCheckpointDigest(checkpoint: ContextCheckpoint): string {
  const s = checkpoint.summary
  return `[系统] 已验证的历史上下文检查点（checkpointId=${checkpoint.id}）：\n目标：${s.goals.join('；') || '无'}\n约束：${s.constraints.join('；') || '无'}\n决策：${s.decisions.join('；') || '无'}\n已完成：${s.completed.join('；') || '无'}\n待处理：${s.pending.join('；') || '无'}\n工具凭据：${s.toolReceipts.map((item) => `${item.toolName}:${item.summary}${item.artifactId ? `(${item.artifactId})` : ''}`).join('；') || '无'}。如需原文细节请重新调用读取工具，禁止凭摘要补写事实。`
}

export async function compactSessionContext(userId: string, sessionId: string, force = false): Promise<ContextCheckpoint | null> {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, userId }, select: { id: true, novelId: true } })
  if (!session) throw new DataAccessError(404, 'AGENT_SESSION_NOT_FOUND', 'Agent 会话不存在。')
  const [previous, directives, records] = await Promise.all([
    prisma.contextCheckpoint.findFirst({ where: { sessionId }, orderBy: { createdAt: 'desc' } }),
    listActiveDirectives(userId, session.novelId),
    prisma.agentMessage.findMany({
      where: { sessionId, run: { status: { in: ['completed', 'failed', 'cancelled'] } } },
      orderBy: { createdAt: 'asc' },
      include: { run: { select: { inputSummary: true, outputSummary: true, status: true } } },
    }),
  ])
  const afterPrevious = previous ? records.filter((item) => item.createdAt > previous.sourceEndedAt) : records
  const source = afterPrevious.slice(0, Math.max(0, afterPrevious.length - RECENT_TAIL_MESSAGES))
  const totalText = records.map((item) => messageText(item.parts)).join('\n')
  const usageRatio = estimateTokens(totalText) / env.agentContextWindowTokens
  if (!force && usageRatio < COMPACTION_THRESHOLD) return null
  if (source.length === 0) return previous ? checkpointRecord(previous) : null

  const priorSummary = previous?.summary as ContextCheckpointSummary | undefined
  const goals = source.filter((item) => item.role === 'user').map((item) => messageText(item.parts).slice(0, 240))
  const completed = source.filter((item) => item.role === 'assistant').flatMap((item) => item.run.outputSummary ? [item.run.outputSummary] : [])
  const receipts = source.flatMap((item) => {
    if (!Array.isArray(item.parts)) return []
    return (item.parts as unknown as AgentMessagePart[]).flatMap((part) => part.type === 'tool-call' && part.status === 'success'
      ? [{ toolName: part.toolName, summary: part.summary ?? '执行成功', artifactId: null }]
      : [])
  })
  const constraints = directives.filter((item) => item.kind === 'must' || item.kind === 'must_not').map((item) => item.text)
  const decisions = directives.filter((item) => item.kind === 'decision').map((item) => item.text)
  const summary: ContextCheckpointSummary = {
    goals: mergeUnique(priorSummary?.goals ?? [], goals).slice(-30),
    // 约束与决策以 active 账本重建，避免已 superseded/cancelled 的旧要求从历史摘要复活。
    constraints: mergeUnique(constraints),
    decisions: mergeUnique(decisions),
    completed: mergeUnique(priorSummary?.completed ?? [], completed).slice(-40),
    pending: priorSummary?.pending ?? [],
    toolReceipts: [...(priorSummary?.toolReceipts ?? []), ...receipts].slice(-60),
    directiveIds: directives.map((item) => item.id),
  }
  const hardIds = directives.filter((item) => item.kind === 'must' || item.kind === 'must_not').map((item) => item.id)
  const missingDirectiveIds = hardIds.filter((id) => !summary.directiveIds.includes(id))
  const validation = {
    hardConstraintRetention: hardIds.length === 0 ? 1 : (hardIds.length - missingDirectiveIds.length) / hardIds.length,
    missingDirectiveIds,
    valid: missingDirectiveIds.length === 0,
  }
  if (!validation.valid) throw new DataAccessError(409, 'CONTEXT_COMPACTION_VALIDATION_FAILED', '上下文压缩未完整保留硬约束，已拒绝生成检查点。')
  const sourceText = source.map((item) => `${item.id}:${item.role}:${messageText(item.parts)}`).join('\n')
  const created = await prisma.contextCheckpoint.create({
    data: {
      sessionId, runId: source.at(-1)?.runId ?? null, sourceMessageCount: source.length,
      sourceMessageIds: source.map((item) => item.id), sourceStartedAt: source[0].createdAt,
      sourceEndedAt: source.at(-1)!.createdAt, sourceTokens: estimateTokens(sourceText),
      summaryTokens: estimateTokens(jsonText(summary)), model: 'deterministic-v1', version: (previous?.version ?? 0) + 1,
      sourceHash: createHash('sha256').update(`${previous?.sourceHash ?? ''}\n${sourceText}`).digest('hex'),
      summary: summary as unknown as object, validation,
    },
  })
  return checkpointRecord(created)
}

export async function getContextState(userId: string, sessionId: string): Promise<ContextState> {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, userId }, select: { novelId: true } })
  if (!session) throw new DataAccessError(404, 'AGENT_SESSION_NOT_FOUND', 'Agent 会话不存在。')
  const [checkpoint, directives, records] = await Promise.all([
    prisma.contextCheckpoint.findFirst({ where: { sessionId }, orderBy: { createdAt: 'desc' } }),
    listActiveDirectives(userId, session.novelId),
    prisma.agentMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' }, select: { parts: true, createdAt: true } }),
  ])
  const recent = checkpoint ? records.filter((item) => item.createdAt > checkpoint.sourceEndedAt) : records
  const estimatedTokens = estimateTokens(recent.map((item) => messageText(item.parts)).join('\n')) + (checkpoint?.summaryTokens ?? 0)
  return {
    estimatedTokens, contextWindowTokens: env.agentContextWindowTokens,
    usageRatio: estimatedTokens / env.agentContextWindowTokens, warningThreshold: WARNING_THRESHOLD,
    compactionThreshold: COMPACTION_THRESHOLD, activeDirectiveCount: directives.length,
    checkpoint: checkpoint ? checkpointRecord(checkpoint) : null,
  }
}

export async function loadContextCheckpoint(sessionId: string): Promise<{ checkpoint: ContextCheckpoint | null; sourceEndedAt: Date | null }> {
  const record = await prisma.contextCheckpoint.findFirst({ where: { sessionId }, orderBy: { createdAt: 'desc' } })
  return { checkpoint: record ? checkpointRecord(record) : null, sourceEndedAt: record?.sourceEndedAt ?? null }
}

function detailRecord(record: { id: string; role: string; parts: unknown; createdAt: Date }, sourceEndedAt: Date | null): ContextDetailRecord {
  const text = messageText(record.parts)
  return {
    id: record.id,
    role: record.role,
    createdAt: record.createdAt.toISOString(),
    estimatedTokens: estimateTokens(text),
    excerpt: text.slice(0, 160),
    inWindow: sourceEndedAt ? record.createdAt > sourceEndedAt : true,
  }
}

/** 上下文详情弹窗数据源：records/checkpoints 走 DB 倒序分页；final 视图与占用卡同口径，窗口消息内存正序切片分页 */
export async function getContextDetail(
  userId: string,
  sessionId: string,
  view: 'records' | 'checkpoints' | 'final',
  page: number,
  pageSize: number,
): Promise<ContextDetail> {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, userId }, select: { novelId: true } })
  if (!session) throw new DataAccessError(404, 'AGENT_SESSION_NOT_FOUND', 'Agent 会话不存在。')
  const skip = (page - 1) * pageSize

  if (view === 'checkpoints') {
    const [total, rows] = await Promise.all([
      prisma.contextCheckpoint.count({ where: { sessionId } }),
      prisma.contextCheckpoint.findMany({ where: { sessionId }, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    ])
    return { view, items: rows.map(checkpointRecord), total, page, pageSize }
  }

  const checkpoint = await prisma.contextCheckpoint.findFirst({ where: { sessionId }, orderBy: { createdAt: 'desc' } })

  if (view === 'records') {
    const [total, rows] = await Promise.all([
      prisma.agentMessage.count({ where: { sessionId } }),
      prisma.agentMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: { id: true, role: true, parts: true, createdAt: true },
      }),
    ])
    return { view, items: rows.map((item) => detailRecord(item, checkpoint?.sourceEndedAt ?? null)), total, page, pageSize }
  }

  const [directives, windowRows] = await Promise.all([
    listActiveDirectives(userId, session.novelId),
    prisma.agentMessage.findMany({
      where: checkpoint
        ? { sessionId, createdAt: { gt: checkpoint.sourceEndedAt } }
        : { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, parts: true, createdAt: true },
    }),
  ])
  const sourceEndedAt = checkpoint?.sourceEndedAt ?? null
  const items = windowRows.map((item) => detailRecord(item, sourceEndedAt))
  const windowTokens = estimateTokens(windowRows.map((item) => messageText(item.parts)).join('\n'))
  const checkpointTokens = checkpoint?.summaryTokens ?? 0
  return {
    view: 'final',
    estimatedTokens: windowTokens + checkpointTokens,
    checkpointTokens,
    checkpointDigest: checkpoint ? renderCheckpointDigest(checkpointRecord(checkpoint)) : null,
    directiveDigest: renderDirectiveDigest(directives),
    window: { items: items.slice(skip, skip + pageSize), total: items.length, page, pageSize },
  }
}
