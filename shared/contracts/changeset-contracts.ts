import { z } from 'zod'

/** Agent 2.0 跨文档修改契约：预览、审批、原子应用和整体回滚共用同一身份。 */
export const changeSetTargetTypeSchema = z.enum(['chapter', 'volume', 'entity', 'memory', 'plan'])

export const changeSetPatchSchema = z.object({
  id: z.string().min(1),
  targetType: changeSetTargetTypeSchema,
  targetId: z.string().min(1),
  field: z.string().min(1),
  beforeHash: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  anchor: z.string().min(1).optional(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  reason: z.string().min(1),
  selected: z.boolean().default(true),
  appliedRevision: z.number().int().positive().nullable().optional(),
})

export const changeSetValidationSchema = z.object({
  code: z.string().min(1),
  status: z.enum(['pending', 'passed', 'warning', 'failed']),
  message: z.string().min(1),
  targetIds: z.array(z.string().min(1)).default([]),
})

export const changeSetSchema = z.object({
  id: z.string().min(1),
  novelId: z.string().min(1),
  taskSpecId: z.string().min(1),
  status: z.enum(['draft', 'approved', 'applying', 'applied', 'conflicted', 'failed', 'rolled_back']),
  baseRevision: z.number().int().nonnegative(),
  patches: z.array(changeSetPatchSchema),
  validations: z.array(changeSetValidationSchema).default([]),
  snapshotId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const bulkReplacePreviewRequestSchema = z.object({
  query: z.string().min(1).max(256),
  replacement: z.string().max(256),
  fields: z.array(z.enum(['title', 'summary', 'content'])).min(1).default(['content']),
  caseSensitive: z.boolean().default(true),
  preserveQuotedText: z.boolean().default(false),
  excludeChapterIds: z.array(z.string().min(1)).default([]),
  taskSpecId: z.string().min(1).optional(),
  reason: z.string().min(1).max(500).default('全书批量替换'),
})

export const applyChangeSetRequestSchema = z.object({
  selectedPatchIds: z.array(z.string().min(1)).optional(),
})

export const rollbackChangeSetRequestSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
})

export type ChangeSetTargetType = z.infer<typeof changeSetTargetTypeSchema>
export type ChangeSetPatch = z.infer<typeof changeSetPatchSchema>
export type ChangeSetValidation = z.infer<typeof changeSetValidationSchema>
export type ChangeSet = z.infer<typeof changeSetSchema>
export type BulkReplacePreviewRequest = z.infer<typeof bulkReplacePreviewRequestSchema>
export type ApplyChangeSetRequest = z.infer<typeof applyChangeSetRequestSchema>
export type RollbackChangeSetRequest = z.infer<typeof rollbackChangeSetRequestSchema>
