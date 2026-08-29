import { z } from 'zod'
import { storyCompilerModeSchema } from './story-compiler-contracts.js'

/** Agent 2.0 任务契约：把自然语言请求冻结为可验证、可恢复的运行时输入。 */
export const taskIntentSchema = z.enum([
  'write',
  'revise',
  'global_transform',
  'plan',
  'review',
  'structure',
])

export const taskScopeSchema = z.object({
  novelId: z.string().min(1),
  volumeIds: z.array(z.string().min(1)).optional(),
  chapterIds: z.array(z.string().min(1)).optional(),
  selection: z
    .object({
      chapterId: z.string().min(1),
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    })
    .refine((selection) => selection.end >= selection.start, {
      message: 'selection.end 必须大于等于 selection.start',
    })
    .optional(),
})

export const constraintRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['safety', 'author_directive', 'story_fact', 'task']),
  text: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  revision: z.number().int().positive().optional(),
})

export const preferenceRefSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  weight: z.number().min(0).max(1).default(0.5),
  sourceId: z.string().min(1).optional(),
})

export const outputContractSchema = z.object({
  kind: z.enum(['text', 'artifact', 'changeset', 'validation_report']),
  description: z.string().min(1),
  required: z.boolean().default(true),
})

export const postconditionSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['error', 'warning']).default('error'),
})

export const taskSpecSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1).optional(),
  intent: taskIntentSchema,
  scope: taskScopeSchema,
  goals: z.array(z.string().min(1)).min(1),
  hardConstraints: z.array(constraintRefSchema).default([]),
  softPreferences: z.array(preferenceRefSchema).default([]),
  expectedOutputs: z.array(outputContractSchema).min(1),
  postconditions: z.array(postconditionSchema).default([]),
  ambiguity: z.enum(['none', 'safe_to_assume', 'must_ask']),
  creativeFreedom: z.enum(['stable', 'balanced', 'bold']).default('balanced'),
  qualityMode: storyCompilerModeSchema.default('balanced'),
  createdAt: z.string().datetime(),
})

export type TaskIntent = z.infer<typeof taskIntentSchema>
export type TaskScope = z.infer<typeof taskScopeSchema>
export type ConstraintRef = z.infer<typeof constraintRefSchema>
export type PreferenceRef = z.infer<typeof preferenceRefSchema>
export type OutputContract = z.infer<typeof outputContractSchema>
export type Postcondition = z.infer<typeof postconditionSchema>
export type TaskSpec = z.infer<typeof taskSpecSchema>
