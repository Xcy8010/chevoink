import { z } from 'zod'

export const userDirectiveSchema = z.object({
  id: z.string().min(1),
  novelId: z.string().min(1),
  sessionId: z.string().min(1).nullable(),
  volumeId: z.string().min(1).nullable(),
  chapterId: z.string().min(1).nullable(),
  taskSpecId: z.string().min(1).nullable(),
  scope: z.enum(['global', 'volume', 'chapter', 'task']),
  kind: z.enum(['goal', 'must', 'must_not', 'preference', 'decision']),
  text: z.string().min(1),
  status: z.enum(['active', 'fulfilled', 'superseded', 'cancelled']),
  sourceMessageId: z.string().min(1),
  supersededBy: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const contextCheckpointSummarySchema = z.object({
  goals: z.array(z.string()),
  constraints: z.array(z.string()),
  decisions: z.array(z.string()),
  completed: z.array(z.string()),
  pending: z.array(z.string()),
  toolReceipts: z.array(z.object({ toolName: z.string(), summary: z.string(), artifactId: z.string().nullable() })),
  directiveIds: z.array(z.string()),
})

export const contextCheckpointSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1).nullable(),
  sourceMessageCount: z.number().int().positive(),
  sourceTokens: z.number().int().nonnegative(),
  summaryTokens: z.number().int().nonnegative(),
  model: z.string().min(1),
  version: z.number().int().positive(),
  sourceHash: z.string().length(64),
  summary: contextCheckpointSummarySchema,
  validation: z.object({
    hardConstraintRetention: z.number().min(0).max(1),
    missingDirectiveIds: z.array(z.string()),
    valid: z.boolean(),
  }),
  createdAt: z.string().datetime(),
})

export const contextStateSchema = z.object({
  estimatedTokens: z.number().int().nonnegative(),
  contextWindowTokens: z.number().int().positive(),
  usageRatio: z.number().min(0),
  warningThreshold: z.number().min(0).max(1),
  compactionThreshold: z.number().min(0).max(1),
  activeDirectiveCount: z.number().int().nonnegative(),
  checkpoint: contextCheckpointSchema.nullable(),
})

export type UserDirective = z.infer<typeof userDirectiveSchema>
export type ContextCheckpointSummary = z.infer<typeof contextCheckpointSummarySchema>
export type ContextCheckpoint = z.infer<typeof contextCheckpointSchema>
export type ContextState = z.infer<typeof contextStateSchema>
