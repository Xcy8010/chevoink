import { z } from 'zod'

export const corpusSourceClassSchema = z.enum([
  'internal',
  'public_domain',
  'permissive',
  'licensed',
  'author_private',
  'platform_opt_in',
])
export type CorpusSourceClassValue = z.infer<typeof corpusSourceClassSchema>

export const corpusRightsStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'revoked'])
export type CorpusRightsStatusValue = z.infer<typeof corpusRightsStatusSchema>

export const corpusScopeSchema = z.enum(['platform', 'user', 'novel'])
export type CorpusScopeValue = z.infer<typeof corpusScopeSchema>

export const craftSearchQuerySchema = z.object({
  genre: z.string().trim().min(1).max(64),
  subgenre: z.string().trim().max(64).optional(),
  sceneType: z.string().trim().min(1).max(96),
  relationshipStage: z.string().trim().max(96).optional(),
  pointOfView: z.string().trim().max(48).optional(),
  narrativeDistance: z.string().trim().max(48).optional(),
  pace: z.string().trim().max(48).optional(),
  readerPromise: z.string().trim().max(500).optional(),
  defectTargets: z.array(z.string().trim().min(1).max(64)).max(6).default([]),
  limit: z.number().int().min(1).max(5).default(4),
})
export type CraftSearchQuery = z.infer<typeof craftSearchQuerySchema>

export const styleStatsSchema = z.object({
  sampleChars: z.number().int().nonnegative(),
  sampleCount: z.number().int().positive(),
  dialogueRatio: z.number().min(0).max(1),
  medianSentenceChars: z.number().nonnegative(),
  sentenceLengthStdDev: z.number().nonnegative(),
  medianParagraphChars: z.number().nonnegative(),
  punctuationDensity: z.number().min(0).max(1),
  questionRatio: z.number().min(0).max(1),
  exclamationRatio: z.number().min(0).max(1),
  firstPersonRatio: z.number().min(0).max(1),
  imageryDensity: z.number().min(0).max(1),
  functionWordFingerprint: z.record(z.string(), z.number().min(0).max(1)),
})
export type StyleStats = z.infer<typeof styleStatsSchema>

export const STYLE_SAMPLE_UPLOAD_MAX_BYTES = 512 * 1024
export const STYLE_SAMPLE_UPLOAD_MAX_CHARS = 120_000

export const styleSampleUploadSchema = z.object({
  name: z.string().trim().min(1).max(255).refine((name) => /\.(?:txt|md|markdown)$/i.test(name), '仅支持 TXT、MD 或 Markdown 文件'),
  size: z.number().int().positive().max(STYLE_SAMPLE_UPLOAD_MAX_BYTES),
  content: z.string().trim().min(200).max(STYLE_SAMPLE_UPLOAD_MAX_CHARS),
}).superRefine((file, refinement) => {
  if (new TextEncoder().encode(file.content).byteLength > STYLE_SAMPLE_UPLOAD_MAX_BYTES) {
    refinement.addIssue({ code: 'custom', path: ['content'], message: '上传文件不能超过 512 KB' })
  }
})

export const styleSampleRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  chapterIds: z.array(z.string().min(1)).max(12).default([]),
  uploadedFile: styleSampleUploadSchema.optional(),
  consent: z.literal(true),
}).superRefine((value, refinement) => {
  if (value.chapterIds.length === 0 && !value.uploadedFile) {
    refinement.addIssue({ code: 'custom', path: ['chapterIds'], message: '请至少选择一个章节或上传一个样章文件' })
  }
})
export type StyleSampleRequest = z.infer<typeof styleSampleRequestSchema>

export const corpusSourceCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sourceClass: corpusSourceClassSchema.exclude(['author_private']),
  rightsHolder: z.string().trim().min(1).max(240),
  sourceUrl: z.string().url().max(1_000).optional(),
  license: z.string().trim().min(1).max(120),
  commercialUse: z.boolean(),
  redistribution: z.boolean(),
  modification: z.boolean(),
  rawStorageAllowed: z.boolean(),
  indexAllowed: z.boolean(),
  expiresAt: z.string().datetime().optional(),
  evidence: z.string().trim().min(1).max(2_000),
})
export type CorpusSourceCreate = z.infer<typeof corpusSourceCreateSchema>

export const corpusDocumentImportSchema = z.object({
  title: z.string().trim().min(1).max(240),
  authorName: z.string().trim().max(160).optional(),
  content: z.string().trim().min(200).max(300_000),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
})
export type CorpusDocumentImport = z.infer<typeof corpusDocumentImportSchema>

export const corpusSourceVerifySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  auditNote: z.string().trim().min(1).max(2_000),
})

export type CraftTechniqueCardView = {
  id: string
  title: string
  genre: string
  sceneType: string
  readerEffect: string
  techniques: string[]
  avoid: string[]
  styleStats: Record<string, unknown>
  rights: { sourceClass: CorpusSourceClassValue; reversibleQuote: false }
  score: number
  reasons: string[]
}

export type LeakageCheckView = {
  id: string
  decision: 'passed' | 'blocked'
  ngramOverlap: number
  longestCommonSubstring: number
  semanticSimilarity: number
  action: string
}

export type AuthorStyleProfileView = {
  id: string
  sourceId: string
  name: string
  stats: StyleStats
  sampleCount: number
  sampleChars: number
  contentHash: string
  updatedAt: string
}

export type AdminCorpusSourceRow = {
  id: string
  name: string
  sourceClass: CorpusSourceClassValue
  rightsHolder: string
  sourceUrl: string | null
  license: string
  rightsEvidence: string
  commercialUse: boolean
  redistribution: boolean
  modification: boolean
  rawStorageAllowed: boolean
  indexAllowed: boolean
  rightsStatus: CorpusRightsStatusValue
  expiresAt: string | null
  auditedAt: string | null
  auditNote: string | null
  createdAt: string
  updatedAt: string
  _count: { documents: number; techniqueCards: number; styleProfiles: number }
}

export type AdminCorpusDocumentImportResult = {
  documentId: string
  passageCount: number
  styleProfileId: string
  contentHash: string
}
