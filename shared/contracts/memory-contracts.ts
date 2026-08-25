import { z } from 'zod'

/** 记忆证据必须能回到原文、对话或人工输入，避免模型推断升级成无来源事实。 */
export const memoryEvidenceSchema = z.object({
  id: z.string().min(1),
  memoryId: z.string().min(1),
  sourceType: z.enum(['chapter', 'volume', 'message', 'author_input', 'artifact']),
  sourceId: z.string().min(1),
  revision: z.number().int().positive().optional(),
  span: z
    .object({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
      quoteHash: z.string().min(1).optional(),
    })
    .refine((span) => span.end >= span.start, {
      message: 'span.end 必须大于等于 span.start',
    })
    .optional(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
})

export type MemoryEvidence = z.infer<typeof memoryEvidenceSchema>

export const storyMemoryStatusSchema = z.enum(['confirmed', 'inferred', 'conflicted', 'superseded', 'invalid'])
export const memoryReviewStatusSchema = z.enum(['none', 'pending', 'accepted', 'rejected'])

export const memorySearchHitSchema = z.object({
  id: z.string().min(1),
  memoryType: z.string().min(1),
  layer: z.enum(['L0', 'L1', 'L2', 'L3']),
  status: storyMemoryStatusSchema,
  title: z.string(),
  content: z.string(),
  score: z.number(),
  lexicalScore: z.number(),
  semanticScore: z.number(),
  graphScore: z.number(),
  evidence: z.array(memoryEvidenceSchema),
})

export type MemorySearchHit = z.infer<typeof memorySearchHitSchema>
