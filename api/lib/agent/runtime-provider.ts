import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { ChatCompletionResult } from '../ai-service.js'
import { runtimeError, runtimeJson } from './runtime-common.js'
import { withRunLease, type RunLeaseToken } from './runtime-lease.js'
import { markProviderDispatched, prepareProviderAttempt, recordProviderResult, recordProviderUsage, type ProviderUsageObservation } from './runtime-operations.js'
import { preparePricedProviderOperation, settleProviderOperation, type DurableTokenPrice } from './runtime-settlement.js'
import { durableChatResultSchema } from './runtime-common.js'
import { prepareModelCursorOperation, type ModelExecutionCursor } from './runtime-model-cursor.js'
import { reduceExecutionReceipt } from './runtime-reducer.js'
import { prepareAuxiliaryModelOperation, type AuxiliaryModelStep } from './runtime-auxiliary-model.js'

export type DurableChatExecution = { lease: RunLeaseToken; operationKey: string; attemptKey: string; parentOperationId?: string; cursor?: ModelExecutionCursor;
  auxiliaryStep?: AuxiliaryModelStep;
  /** Server-frozen admission price, never sourced from model output. */
  price?: DurableTokenPrice }
const resultSchema = durableChatResultSchema

/** Exact serialized body/route, excluding credentials. A replay never requests the provider again. */
export async function beginDurableChat(input: {
  execution: DurableChatExecution; userId: string; agentRunId?: string | null; action: string;
  provider: string; model: string; request: Prisma.InputJsonValue; price: DurableTokenPrice;
  admit: () => Promise<void>
}) {
  const execution = { ...input.execution, lease: { ...input.execution.lease }, ...(input.execution.cursor ? { cursor: { ...input.execution.cursor } } : {}) }
  if (input.userId !== execution.lease.userId || (input.agentRunId && input.agentRunId !== execution.lease.runId)) {
    runtimeError('RUNTIME_SCOPE_MISMATCH', '模型调用与执行租约主体不一致。')
  }
  const request = runtimeJson(input.request).value
  const operationInput = {
    key: execution.operationKey, action: input.action, request, price: input.price, parentOperationId: execution.parentOperationId,
  }
  if (Boolean(execution.parentOperationId) !== Boolean(execution.auxiliaryStep) || execution.auxiliaryStep && (execution.cursor || execution.attemptKey !== '1')) return runtimeError('RUNTIME_EFFECT_NOT_AUTHORIZED', '独立模型步骤必须使用唯一尝试，不能伪装主模型或绕过未知结果重试。')
  const prepared = execution.cursor ? await prepareModelCursorOperation(execution.lease, execution.cursor, operationInput) : undefined
  const operation = prepared?.operation ?? (execution.parentOperationId && execution.auxiliaryStep
    ? await prepareAuxiliaryModelOperation(execution.lease, { ...operationInput, parentOperationId: execution.parentOperationId, step: execution.auxiliaryStep })
    : await preparePricedProviderOperation(execution.lease, operationInput))
  const attempt = await prepareProviderAttempt(execution.lease, { operationId: operation.id, attemptKey: execution.attemptKey, provider: input.provider, model: input.model, request })
  const pending = prepared?.pending
  const identity = { userId: input.userId, attemptId: attempt.id, requestHash: attempt.requestHash }
  const withSettlement = async (result: ChatCompletionResult): Promise<ChatCompletionResult> => {
    const billing = await settleProviderOperation(identity)
    if (pending) await reduceExecutionReceipt(execution.lease, { expectedRevision: pending.revision, expectedHash: pending.snapshotHash, operationId: operation.id })
    return { ...result, billing }
  }
  let replay: ChatCompletionResult | undefined
  if (attempt.status === 'succeeded') {
    const parsed = z.object({ outcome: z.literal('succeeded'), result: resultSchema }).strict().safeParse(attempt.result)
    if (!parsed.success || !attempt.resultHash || runtimeJson(attempt.result).hash !== attempt.resultHash) {
      return runtimeError('RUNTIME_RECEIPT_INVALID', '已完成模型回执不能安全恢复。')
    }
    if (execution.auxiliaryStep) await withRunLease(execution.lease, async tx => {
      const event = await tx.agentExecutionOutbox.findUnique({ where: { eventKey: `result:${attempt.id}:${attempt.resultHash}` } })
      if (!event || event.taskRootId !== execution.lease.taskRootId || event.operationId !== operation.id || event.type !== 'provider.result.recorded'
        || runtimeJson(event.payload).hash !== runtimeJson({ attemptId: attempt.id, status: 'succeeded', resultHash: attempt.resultHash }).hash) return runtimeError('RUNTIME_RECEIPT_INVALID', '独立模型结果缺少匹配的持久事件。')
    })
    replay = await withSettlement(parsed.data.result)
  } else {
    if (attempt.status !== 'prepared') runtimeError('RUNTIME_RECONCILIATION_REQUIRED', '原模型请求已派发但结果未确认，不能自动重新请求。')
    await input.admit()
    if (!(await markProviderDispatched(execution.lease, attempt.id)).dispatchGranted) {
      runtimeError('RUNTIME_RECONCILIATION_REQUIRED', '派发权已使用，不能重复请求供应商。')
    }
  }
  let revision = 0
  let previousUsageHash: string | undefined
  return {
    replay,
    async observe(usage: ProviderUsageObservation) {
      const hash = runtimeJson(usage).hash
      if (hash === previousUsageHash) return
      await recordProviderUsage({ ...identity, revision: revision + 1, usage })
      revision += 1
      previousUsageHash = hash
    },
    async finish(result: ChatCompletionResult): Promise<ChatCompletionResult> {
      const parsed = resultSchema.parse(result)
      await recordProviderResult({ ...identity, outcome: 'succeeded', result: runtimeJson(parsed).value })
      return withSettlement(parsed)
    },
    async interrupted(reason: 'transport_error' | 'stream_error' | 'aborted', partial?: { content: string; reasoning: string }) {
      await recordProviderResult({ ...identity, outcome: 'unknown', result: { reason, ...(partial ?? {}) } })
    },
    async rejected(httpStatus: number) {
      await recordProviderResult({ ...identity, outcome: 'failed', result: { httpStatus } })
    },
  }
}
