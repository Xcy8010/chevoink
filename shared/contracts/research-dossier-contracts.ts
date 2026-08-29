import { z } from 'zod'

export const researchTriggerReasonSchema = z.enum([
  'new_book',
  'new_genre',
  'new_arc',
  'factual_risk',
  'author_request',
  'quality_stagnation',
])

export const researchDossierBuildSchema = z.object({
  triggerReason: researchTriggerReasonSchema,
  triggerSignals: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  topic: z.string().trim().min(2).max(240),
  genre: z.string().trim().min(1).max(96),
  targetAudience: z.string().trim().min(1).max(500),
  targetPlatform: z.string().trim().max(160).default(''),
  queries: z.array(z.string().trim().min(2).max(180)).min(1).max(3),
  forceRefresh: z.boolean().default(false).describe('只有作者明确要求刷新过期/方向已变的研究时才可为 true'),
})

export const researchFactCardSchema = z.object({
  claim: z.string().trim().min(1).max(500),
  confidence: z.enum(['low', 'medium', 'high']),
  sourceIndexes: z.array(z.number().int().min(1)).max(6),
  storyUse: z.string().trim().min(1).max(500),
})

export const researchSynthesisSchema = z.object({
  readerPromise: z.string().trim().min(1).max(1200),
  abandonmentRisks: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  marketPatterns: z.array(z.string().trim().min(1).max(500)).max(10),
  differentiation: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  factCards: z.array(researchFactCardSchema).max(16),
  languageRisks: z.array(z.string().trim().min(1).max(500)).max(10),
  recommendations: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  rejectedIdeas: z.array(z.string().trim().min(1).max(500)).max(10),
})

export const firstThreeDirectionSchema = z.object({
  id: z.string().trim().min(1).max(48),
  title: z.string().trim().min(1).max(160),
  readerPromise: z.string().trim().min(1).max(500),
  conflictEngine: z.string().trim().min(1).max(800),
  differentiation: z.string().trim().min(1).max(500),
  risk: z.string().trim().min(1).max(500),
})

export const firstThreeChapterBlueprintSchema = z.object({
  orderIndex: z.number().int().min(1).max(3),
  title: z.string().trim().min(1).max(160),
  chapterJob: z.string().trim().min(1).max(500),
  concreteEvent: z.string().trim().min(1).max(800),
  protagonistChoice: z.string().trim().min(1).max(800),
  cost: z.string().trim().min(1).max(500),
  newInformation: z.string().trim().min(1).max(500),
  exitHook: z.string().trim().min(1).max(500),
  qualityRisks: z.array(z.string().trim().min(1).max(300)).max(6),
})

export const firstThreePrototypeBuildSchema = z.object({
  dossierId: z.string().min(1).optional(),
  genreRisks: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  directions: z.array(firstThreeDirectionSchema).min(2).max(3),
  selectedDirectionId: z.string().trim().min(1).max(48).optional(),
  volumeSpine: z.array(z.string().trim().min(1).max(500)).min(3).max(12),
  chapterBlueprints: z.array(firstThreeChapterBlueprintSchema).length(3),
})

export const agentDataControlPatchSchema = z.object({
  qualityTelemetryEnabled: z.boolean().optional(),
  productAnalyticsEnabled: z.boolean().optional(),
  privateStyleEnabled: z.boolean().optional(),
  publicCorpusOptIn: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), '至少更新一项数据设置。')

export const createSkillShareInviteSchema = z.object({
  recipientAccount: z.string().trim().min(2).max(255),
  version: z.string().trim().min(1).max(32).optional(),
  message: z.string().trim().max(500).default(''),
})

export const acceptSkillShareInviteSchema = z.object({
  destinationNovelId: z.string().min(1),
})

export type ResearchTriggerReason = z.infer<typeof researchTriggerReasonSchema>
export type ResearchDossierBuild = z.infer<typeof researchDossierBuildSchema>
export type ResearchSynthesis = z.infer<typeof researchSynthesisSchema>
export type FirstThreePrototypeBuild = z.infer<typeof firstThreePrototypeBuildSchema>
export type AgentDataControlPatch = z.infer<typeof agentDataControlPatchSchema>

export type ResearchSourceView = {
  index: number
  title: string
  url: string
  source: string
  snippet: string
  retrievedAt: string
  rightsType: 'web_summary_only'
}

export type ResearchDossierView = {
  id: string
  version: number
  status: 'draft' | 'ready' | 'stale' | 'failed'
  triggerReason: ResearchTriggerReason
  topic: string
  genre: string
  targetAudience: string
  targetPlatform: string
  readerPromise: string
  abandonmentRisks: string[]
  marketPatterns: string[]
  differentiation: string[]
  factCards: Array<z.infer<typeof researchFactCardSchema>>
  languageRisks: string[]
  recommendations: string[]
  rejectedIdeas: string[]
  sources: ResearchSourceView[]
  searchCount: number
  reusedCount: number
  expiresAt: string
  createdAt: string
  updatedAt: string
  reused?: boolean
}

export type FirstThreePrototypeView = {
  id: string
  version: number
  status: 'planning' | 'ready' | 'writing' | 'quality_review' | 'completed' | 'abandoned'
  dossierId: string | null
  genreRisks: string[]
  directions: Array<z.infer<typeof firstThreeDirectionSchema>>
  selectedDirection: z.infer<typeof firstThreeDirectionSchema> | null
  volumeSpine: string[]
  chapterBlueprints: Array<z.infer<typeof firstThreeChapterBlueprintSchema>>
  completedChapters: number
  passedChapters: number
  createdAt: string
  updatedAt: string
}

export type AgentDataControlView = {
  qualityTelemetryEnabled: boolean
  productAnalyticsEnabled: boolean
  privateStyleEnabled: boolean
  publicCorpusOptIn: boolean
  updatedAt: string | null
}

export type ResearchWorkbenchPayload = {
  dossier: ResearchDossierView | null
  prototype: FirstThreePrototypeView | null
  dataControl: AgentDataControlView
  policy: {
    cacheHours: number
    ttlDays: number
    maxQueriesPerBuild: number
    ordinaryChapterResearch: false
  }
}

export type AdminAgent3OperationsMetrics = {
  windowDays: 30
  research: {
    builds: number
    reuses: number
    reuseRate: number
    averageSearchesPerBuild: number
    averageInputTokensPerBuild: number
    averageBuildDurationMs: number
    queryBudgetViolations: number
  }
  prototypes: { total: number; completed: number; completionRate: number }
  experiments: { active: number; completed: number; withdrawn: number }
  privacy: { configuredNovels: number; analyticsOptOut: number; publicCorpusOptIn: number }
  sharing: { pending: number; accepted: number; expiredOrDeclined: number }
}
