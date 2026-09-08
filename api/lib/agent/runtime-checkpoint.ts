import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { readTaskBudgetInTransaction, taskTurnLimit } from './runtime-budget.js'
import { readExecutionStateInTransaction } from './runtime-state.js'
import { databaseNow, runtimeError, runtimeId, runtimeJson, type RuntimeTx } from './runtime-common.js'
import { withRunLease, type RunLeaseToken } from './runtime-lease.js'
import { STRUCTURE_MUTATIONS } from './runtime-common.js'

const snapshotSchema = z.object({
  version: z.literal(1), taskRootId: z.string().min(1).max(64),
  context: z.string().trim().min(1), remainingWork: z.array(z.string().trim().min(1)).min(1),
  trigger: z.enum(['budget', 'turns']).optional(),
}).strict()
export const contentRevisionProgressSchema = z.object({
  kind: z.literal('content_revision'), targetId: z.string().min(1).max(64),
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/), afterHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(value => value.beforeHash !== value.afterHash)

export const structureRevisionProgressSchema = z.object({ kind: z.literal('structure_revision'), targetId: z.string().min(1).max(64),
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/), afterHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(value => value.beforeHash !== value.afterHash)
export const durableProgressSchema = z.union([contentRevisionProgressSchema, structureRevisionProgressSchema])
export const CHECKPOINT_ACTIONS = ['chapter_create', 'chapter_write', 'chapter_append', 'chapter_edit_range', 'plan_save', 'continuity_validate', 'quality_analyze', ...STRUCTURE_MUTATIONS]

/** Internal executor only. The tool adapter must produce progress from its committed revision,
 * never from model prose or a todo update. No provider calls inside this transaction. */
type CheckpointInput = {
  expectedCheckpointCount: number; progressOperationId: string; snapshot: unknown;
}

export async function commitRuntimeCheckpoint(token: RunLeaseToken, input: CheckpointInput) {
  return withRunLease({ ...token }, checkpointWrite(token, input))
}

/** Caller holds the same lease/root transaction as the execution-frame update. */
export async function commitRuntimeCheckpointInTransaction(tx: RuntimeTx, token: RunLeaseToken, input: CheckpointInput) {
  return checkpointWrite(token, input)(tx)
}

function checkpointWrite(token: RunLeaseToken, input: CheckpointInput) {
  const lease = { ...token }
  runtimeId(input.progressOperationId)
  const expected = input.expectedCheckpointCount
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= 2147483647) runtimeError('RUNTIME_INPUT_INVALID', '检查点序号无效。')
  const parsed = snapshotSchema.safeParse(input.snapshot)
  if (!parsed.success || parsed.data.taskRootId !== lease.taskRootId) return runtimeError('RUNTIME_SCOPE_MISMATCH', '检查点必须绑定原任务和未完成工作。')
  const snapshot = runtimeJson(parsed.data)
  const progressOperationId = input.progressOperationId
  const request = runtimeJson({ expectedCheckpointCount: expected, progressOperationId, snapshot: snapshot.value })
  const index = expected + 1
  const eventKey = `checkpoint:${lease.taskRootId}:${index}`
  return async (tx: RuntimeTx) => {
    const state = await readTaskBudgetInTransaction(tx, lease.taskRootId)
    const existing = await tx.agentRuntimeCheckpoint.findUnique({ where: { taskRootId_checkpointIndex: { taskRootId: lease.taskRootId, checkpointIndex: index } } })
    if (existing) {
      if (existing.requestHash !== request.hash) runtimeError('RUNTIME_IDENTITY_CONFLICT', '同一检查点不能绑定不同内容。')
      if (existing.snapshotHash !== snapshot.hash || runtimeJson(existing.snapshot).hash !== snapshot.hash
        || existing.progressOperationId !== progressOperationId || state.budget.checkpointCount < index) runtimeError('RUNTIME_RECEIPT_INVALID', '检查点回执损坏。')
      const event = await tx.agentExecutionOutbox.findUnique({ where: { eventKey } })
      if (!event || event.taskRootId !== lease.taskRootId || event.type !== 'checkpoint.committed'
        || runtimeJson(event.payload).hash !== runtimeJson({ checkpointIndex: index, snapshotHash: snapshot.hash, progressOperationId }).hash) runtimeError('RUNTIME_RECEIPT_INVALID', '检查点事件缺失或损坏。')
      return existing
    }
    if (state.budget.checkpointCount !== expected) runtimeError('RUNTIME_CHECKPOINT_CONFLICT', '检查点已推进，请恢复已保存的状态。')
    if (index > state.policy.maxCheckpoints || state.budget.compactionCount >= state.policy.maxCompactions) runtimeError('RUNTIME_CHECKPOINT_LIMIT', '已到检查点或压缩上限。')
    const now = await databaseNow(tx)
    if (now.getTime() - state.budget.taskRoot.createdAt.getTime() >= state.policy.longWallClockMs) runtimeError('RUNTIME_WALL_CLOCK_EXHAUSTED', '已到原任务长任务墙钟上限。')
    if (state.unresolvedAttempts > 0n) runtimeError('RUNTIME_RECONCILIATION_REQUIRED', '仍有未确认用量，不能扩大预算。')
    if (state.usedTokens >= BigInt(state.policy.tokenCeiling)) runtimeError('RUNTIME_TOKEN_CEILING', '已到原任务累计硬顶。')
    if (parsed.data.trigger === 'turns') {
      const execution = await readExecutionStateInTransaction(tx, lease.taskRootId)
      if (execution.frame.state.phase !== 'idle' || execution.frame.state.pendingOperationId
        || execution.frame.state.checkpointIndex !== state.budget.checkpointCount) runtimeError('RUNTIME_STATE_CONFLICT', '轮次检查点需要已收尾的原执行位置。')
      if (execution.frame.state.turn < taskTurnLimit(state.policy, state.budget.checkpointCount)) runtimeError('RUNTIME_CHECKPOINT_NOT_DUE', '原轮次片尚未用尽。')
    } else if (state.usedTokens < BigInt(state.budget.tokenLimit)) runtimeError('RUNTIME_CHECKPOINT_NOT_DUE', '预算片尚未用尽，不能提前扩额。')
    const operation = await tx.agentOperation.findUnique({ where: { id: progressOperationId }, include: { effectReceipt: true } })
    const receipt = operation?.effectReceipt
    const progress = durableProgressSchema.safeParse(receipt?.result && typeof receipt.result === 'object' && !Array.isArray(receipt.result) ? receipt.result.progress : undefined)
    if (!operation || operation.taskRootId !== lease.taskRootId || operation.status !== 'succeeded'
      || !CHECKPOINT_ACTIONS.includes(operation.action)
      || !receipt || !progress.success || !operation.inputSnapshot || runtimeJson(operation.inputSnapshot).hash !== operation.inputHash
      || runtimeJson(receipt.result).hash !== receipt.resultHash) runtimeError('RUNTIME_PROGRESS_REQUIRED', '需要本任务已提交的正文、计划或结构进展，不能用待办或模型陈述扩额。')
    if (progress.success && progress.data.kind === 'structure_revision'
      && (!STRUCTURE_MUTATIONS.some(action => action === operation!.action) || progress.data.targetId !== state.budget.taskRoot.novelId)) runtimeError('RUNTIME_PROGRESS_REQUIRED', '结构进展必须属于本作品的实际结构操作。')
    const effect = await tx.agentExecutionOutbox.findUnique({ where: { eventKey: `effect:${progressOperationId}` } })
    if (!effect || effect.taskRootId !== lease.taskRootId || effect.operationId !== progressOperationId || effect.type !== 'effect.committed'
      || runtimeJson(effect.payload).hash !== runtimeJson({ operationId: progressOperationId, resultHash: receipt.resultHash }).hash) runtimeError('RUNTIME_RECEIPT_INVALID', '进展事件与效果回执不一致。')
    if (expected > 0) {
      const previous = await tx.agentExecutionOutbox.findUnique({ where: { eventKey: `checkpoint:${lease.taskRootId}:${expected}` } })
      if (!previous || effect.sequence <= previous.sequence) runtimeError('RUNTIME_PROGRESS_REQUIRED', '不能重复使用上一检查点之前的进展。')
    }
    if (await tx.agentRuntimeCheckpoint.findUnique({ where: { progressOperationId } })) runtimeError('RUNTIME_PROGRESS_REQUIRED', '同一进展只能推进一次检查点。')
    const checkpoint = await tx.agentRuntimeCheckpoint.create({ data: { taskRootId: lease.taskRootId, checkpointIndex: index,
      originRunId: lease.runId, progressOperationId, requestHash: request.hash, snapshot: snapshot.value, snapshotHash: snapshot.hash } })
    const updated = await tx.agentTaskBudget.updateMany({ where: { taskRootId: lease.taskRootId, checkpointCount: expected },
      data: { checkpointCount: index, compactionCount: { increment: 1 }, tokenLimit: Math.min(state.policy.tokenCeiling, state.policy.initialTokens + index * state.policy.budgetSlice) } })
    if (updated.count !== 1) runtimeError('RUNTIME_CHECKPOINT_CONFLICT', '检查点并发冲突。')
    await tx.agentExecutionOutbox.create({ data: { id: randomUUID(), taskRootId: lease.taskRootId, runId: lease.runId,
      eventKey, type: 'checkpoint.committed', payload: { checkpointIndex: index, snapshotHash: snapshot.hash, progressOperationId } } })
    return checkpoint
  }
}
