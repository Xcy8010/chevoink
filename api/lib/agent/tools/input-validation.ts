import type { AgentTool } from './types.js'
import { coerceToolArgumentEnvelope } from './argument-coercion.js'

/** Shared by live dispatch and durable pre-execution rejection. Pure only. */
export function normalizeToolInput(tool: Pick<AgentTool, 'coerceArgs'>, raw: unknown): unknown {
  const envelope = coerceToolArgumentEnvelope(raw)
  return tool.coerceArgs ? tool.coerceArgs(envelope) : envelope
}

export function validateToolInput(tool: Pick<AgentTool, 'parameters'>, normalized: unknown) {
  return tool.parameters.safeParse(normalized)
}
