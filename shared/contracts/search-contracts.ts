import { z } from 'zod'

export const projectSearchModeSchema = z.enum(['exact', 'regex', 'fuzzy'])
export const projectSearchFieldSchema = z.enum(['title', 'summary', 'content'])

export const projectSearchRequestSchema = z.object({
  query: z.string().min(1).max(256),
  mode: projectSearchModeSchema.default('exact'),
  fields: z.array(projectSearchFieldSchema).min(1).default(['title', 'summary', 'content']),
  caseSensitive: z.boolean().default(true),
  volumeIds: z.array(z.string().min(1)).optional(),
  chapterIds: z.array(z.string().min(1)).optional(),
  limit: z.number().int().positive().max(1000).default(200),
})

export const projectSearchMatchSchema = z.object({
  chapterId: z.string().min(1),
  chapterTitle: z.string(),
  volumeId: z.string().min(1),
  volumeTitle: z.string(),
  field: projectSearchFieldSchema,
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
  contextBefore: z.string(),
  match: z.string(),
  contextAfter: z.string(),
  revision: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
})

export const projectSearchResultSchema = z.object({
  query: z.string(),
  mode: projectSearchModeSchema,
  total: z.number().int().nonnegative(),
  truncated: z.boolean(),
  indexState: z.enum(['fresh', 'stale', 'needs_rebuild', 'no_index']),
  matches: z.array(projectSearchMatchSchema),
})

export type ProjectSearchMode = z.infer<typeof projectSearchModeSchema>
export type ProjectSearchField = z.infer<typeof projectSearchFieldSchema>
export type ProjectSearchRequest = z.infer<typeof projectSearchRequestSchema>
export type ProjectSearchMatch = z.infer<typeof projectSearchMatchSchema>
export type ProjectSearchResult = z.infer<typeof projectSearchResultSchema>
