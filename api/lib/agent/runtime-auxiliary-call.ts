import { z } from 'zod'
import { env } from '../../config/env.js'
import { chatWithTools, type ChatCompletionResult } from '../ai-service.js'
import { getModelTierRuntime } from '../credits.js'
import { runtimeError, runtimeJson, type RuntimeTx } from './runtime-common.js'
import { withRunLease, type RunLeaseToken } from './runtime-lease.js'
import { beginDurableChat } from './runtime-provider.js'
import type { AuxiliaryModelStep } from './runtime-auxiliary-model.js'
import type { DurableTokenPrice } from './runtime-settlement.js'
import { estimateChatMessagesTokens, resolveDurableInputLimit } from './context-budget.js'

export const auxiliaryRouteSchema = z.object({ provider: z.string(), model: z.string(), baseUrl: z.string(), maxOutputTokens: z.number().int().positive() }).strict()

/** Replay original paid results without resolving today's credentials. Only new
 * dispatch checks current business state and the frozen provider route. */
export async function callDurableAuxiliary(input: {
  lease: RunLeaseToken; parentOperationId: string; step: AuxiliaryModelStep;
  route: z.infer<typeof auxiliaryRouteSchema>; price: DurableTokenPrice;
  system: string; content: string; temperature: number; signal: AbortSignal;
  assertCurrent: (tx: RuntimeTx) => Promise<void>;
}): Promise<ChatCompletionResult> {
  input = { ...input, lease: { ...input.lease }, route: { ...input.route }, price: structuredClone(input.price) }
  const lease = { ...input.lease }, { step, system, content, temperature } = input
  input.signal.throwIfAborted()
  const key = `aux:${input.parentOperationId}:${step}`
  const existing = await withRunLease(lease, async tx => {
    const op = await tx.agentOperation.findUnique({ where: { taskRootId_operationKey: { taskRootId: lease.taskRootId, operationKey: key } } })
    if (!op) return null
    if (runtimeJson(op.inputSnapshot).hash !== op.inputHash) return runtimeError('RUNTIME_RECEIPT_INVALID', '独立模型原请求损坏。')
    return op
  })
  if (!input.route || !input.price) return runtimeError('RUNTIME_RECEIPT_INVALID', '独立模型路由或价目缺失。')
  const execution = { lease, operationKey: key, parentOperationId: input.parentOperationId, auxiliaryStep: step, attemptKey: '1', price: input.price }
  if (existing && existing.status !== 'prepared') {
    const saved = z.object({ input: z.object({ request: z.record(z.string(), z.unknown()) }) }).parse(existing.inputSnapshot)
    const replay = await beginDurableChat({ execution, userId: lease.userId, agentRunId: lease.runId, action: step, provider: input.route.provider, model: input.route.model,
      request: runtimeJson(saved.input.request).value, price: input.price, admit: async () => runtimeError('RUNTIME_RECONCILIATION_REQUIRED', '原请求不得再次派发。') })
    if (!replay.replay) return runtimeError('RUNTIME_RECONCILIATION_REQUIRED', '原请求尚无完整结果。')
    return replay.replay
  }
  await withRunLease(lease, input.assertCurrent)
  const runtime = await getModelTierRuntime('speed', lease.userId, null, 'low')
  if (runtime.tier !== 'speed' || runtime.provider !== input.route.provider || (runtime.modelName ?? env.aiTextModel) !== input.route.model
    || (runtime.baseUrl ?? env.aiTextBaseUrl) !== input.route.baseUrl) return runtimeError('RUNTIME_IDENTITY_CONFLICT', '原独立复核路由已变化，不能发送给另一模型。')
  const inputLimit = resolveDurableInputLimit(runtime.contextWindowTokens ?? env.agentContextWindowTokens, input.route.maxOutputTokens)
  if (!inputLimit || estimateChatMessagesTokens([{ role: 'system', content: system }, { role: 'user', content }]) > inputLimit) {
    return runtimeError('RUNTIME_CONTEXT_LIMIT', '独立复核输入超过模型窗口，未派发请求；不能截掉正文后声称完成全文检查。')
  }
  return chatWithTools({ messages: [{ role: 'system', content: system }, { role: 'user', content }], tools: [], provider: input.route.provider, model: input.route.model,
    providerBaseUrl: input.route.baseUrl, providerApiKey: runtime.apiKey, reasoningEffort: 'low', temperature, maxOutputTokens: input.route.maxOutputTokens, signal: input.signal,
    durableExecution: execution, usageLog: { userId: lease.userId, agentRunId: lease.runId, action: step, modelTier: 'speed', multiplierBps: input.price.multiplierBps } })
}
