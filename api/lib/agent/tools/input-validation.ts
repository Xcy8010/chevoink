import type { AgentTool } from './types.js'
import { z } from 'zod'
import { coerceToolArgumentEnvelope } from './argument-coercion.js'

/** Shared by live dispatch and durable pre-execution rejection. Pure only. */
export function normalizeToolInput(tool: Pick<AgentTool, 'coerceArgs'> & Partial<Pick<AgentTool, 'parameters'>>, raw: unknown): unknown {
  const envelope = coerceToolArgumentEnvelope(raw)
  const normalized = tool.coerceArgs ? tool.coerceArgs(envelope) : envelope
  if (!(tool.parameters instanceof z.ZodObject) || !normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return normalized
  const result = { ...normalized } as Record<string, unknown>
  for (const [key, value] of Object.entries(result)) {
    // Only optional identifiers: never erase required IDs, empty replacement
    // text, or whitespace that the user actually wants to write/search.
    const field = tool.parameters.shape[key]
    if (/Id$/.test(key) && typeof value === 'string' && !value.trim() && field?.safeParse(undefined).success) delete result[key]
  }
  return result
}

export function validateToolInput(tool: Pick<AgentTool, 'parameters'>, normalized: unknown) {
  return tool.parameters.safeParse(normalized)
}
