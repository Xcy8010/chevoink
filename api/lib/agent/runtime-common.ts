import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { DataAccessError, prisma } from '../prisma.js'

export const DURABLE_RUNTIME_VERSION = 1
export type RuntimeTx = Prisma.TransactionClient

export function runtimeError(code: string, message: string): never {
  throw new DataAccessError(409, code, message)
}

export function runtimeId(value: unknown, max = 64): asserts value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > max) {
    runtimeError('RUNTIME_INPUT_INVALID', '持久执行请求身份无效。')
  }
}

function canonical(value: unknown, depth = 0): string {
  if (depth > 32) return runtimeError('RUNTIME_INPUT_INVALID', '持久执行数据嵌套过深。')
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${Array.from(value, item => canonical(item, depth + 1)).join(',')}]`
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], depth + 1)}`).join(',')}}`
  }
  return runtimeError('RUNTIME_INPUT_INVALID', '持久执行数据不是合法JSON。')
}

export function runtimeJson(value: unknown): { value: Prisma.InputJsonValue; hash: string } {
  const text = canonical(value)
  if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) runtimeError('RUNTIME_PAYLOAD_TOO_LARGE', '持久执行回执超过允许大小，需要分块交付。')
  // JSON null at the top level has a distinct Prisma sentinel; use an object envelope instead.
  if (value === null) runtimeError('RUNTIME_INPUT_INVALID', '回执必须使用非空JSON信封。')
  return { value: JSON.parse(text), hash: createHash('sha256').update(text).digest('hex') }
}

/** The callback is database-only: it may retry. Never put a provider/network call here. */
export async function runtimeTransaction<T>(work: (tx: RuntimeTx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 })
    } catch (error) {
      // Raw SELECT ... FOR UPDATE can surface PostgreSQL serialization/deadlock
      // failures as P2010, not P2034. Retry the entire DB-only transaction with a
      // fresh snapshot; never classify by localized message text.
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError
        && (['P2034', 'P2002'].includes(error.code)
          || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))
      if (conflict && attempt < 2) continue
      throw error
    }
  }
  return runtimeError('RUNTIME_CONCURRENCY_CONFLICT', '执行状态更新冲突，请核对后重试。')
}

export async function databaseNow(tx: RuntimeTx): Promise<Date> {
  const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  return row.now
}

export async function lockOwnedRun(tx: RuntimeTx, userId: string, runId: string) {
  runtimeId(userId); runtimeId(runId)
  await tx.$queryRaw`SELECT id FROM agent_runs WHERE id = ${runId} AND user_id = ${userId} FOR UPDATE`
  const run = await tx.agentRun.findFirst({ where: { id: runId, userId } })
  if (!run) return runtimeError('RUNTIME_SCOPE_MISMATCH', '任务不存在或不属于当前用户。')
  return run
}

export async function lockRunRoot(tx: RuntimeTx, userId: string, runId: string) {
  const run = await lockOwnedRun(tx, userId, runId)
  if (run.runtimeProtocolVersion !== DURABLE_RUNTIME_VERSION || !run.taskRootId) runtimeError('RUNTIME_VERSION_MISMATCH', '任务尚未建立兼容的持久执行协议。')
  await tx.$queryRaw`SELECT id FROM agent_task_roots WHERE id = ${run.taskRootId} FOR UPDATE`
  const root = await tx.agentTaskRoot.findUnique({ where: { id: run.taskRootId } })
  if (!root || root.userId !== userId || root.sessionId !== run.sessionId || root.novelId !== run.novelId) return runtimeError('RUNTIME_SCOPE_MISMATCH', '持久任务范围不匹配。')
  if (root.protocolVersion !== DURABLE_RUNTIME_VERSION) runtimeError('RUNTIME_VERSION_MISMATCH', '持久任务需要兼容版本的执行器。')
  return { run, root }
}

const count = z.number().int().nonnegative().max(2147483647)
export const durableChatResultSchema = z.object({
  content: z.string(), reasoning: z.string(), finishReason: z.enum(['stop', 'tool_calls', 'length']),
  toolCalls: z.array(z.object({ id: z.string(), name: z.string(), arguments: z.string(), incomplete: z.boolean().optional() })),
  usage: z.object({ promptTokens: count, completionTokens: count, totalTokens: count, promptCacheHitTokens: count.nullable(), promptCacheMissTokens: count.nullable() }),
}).strict()

/** Shared wire format. Kept independent of dispatch/reduction to avoid a cycle. */
export const formatDurableToolObservation = (action: string, output: string) => `<tool_output tool="${action}">\n${output}\n</tool_output>`

export const TOOL_OBSERVATION_INLINE_BYTES = 64 * 1024
export function formatReferencedToolObservation(action: string, output: string, source: { operationId: string; resultHash: string }) {
  return formatDurableToolObservation(action, JSON.stringify({ archivedToolOutput: true, ...source, totalChars: output.length,
    instruction: '结果原文已保存。使用 execution_context_read 传入operationId、resultHash、offset和limit分页回读。此引用不是已读取原文，不授予修改基线，也不表示任务完成。' }))
}

export function matchesToolObservation(action: string, output: string, observed: string, source: { operationId: string; resultHash: string }) {
  return observed === formatDurableToolObservation(action, output) || observed === formatReferencedToolObservation(action, output, source)
}

export const STRUCTURE_MUTATIONS = ['volume_update', 'volume_move', 'volume_delete', 'chapter_move', 'chapter_move_to_volume', 'chapter_split', 'chapter_merge'] as const

export function structureContentTargets(action: string, args: Record<string, unknown>): string[] {
  return action === 'chapter_split' ? [String(args.chapterId)] : action === 'chapter_merge' ? [String(args.targetChapterId), String(args.sourceChapterId)] : []
}

export const durablePauseSchema = z.discriminatedUnion('reason', [
  z.object({ reason: z.literal('user_stop'), runIds: z.array(z.string()) }).strict(),
  z.object({ reason: z.literal('needs_input'), runIds: z.array(z.string()),
    sourceRevision: z.number().int().nonnegative(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ reason: z.literal('model_stalled'), runIds: z.array(z.string()),
    sourceRevision: z.number().int().nonnegative(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
])
export const MODEL_STALLED_MESSAGE = '模型连续未执行承诺的动作或输出不完整，任务已暂停而非完成。已保存内容与原任务状态保留，请补充指示后继续。'
