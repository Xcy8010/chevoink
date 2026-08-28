export type AgentEvalSuiteStatus = 'draft' | 'active' | 'completed'
export type AgentEvalCandidateOrigin = 'agent2' | 'agent3' | 'human'
export type AgentEvalSourceClass = 'synthetic' | 'public_domain' | 'licensed' | 'user_opt_in'
export type AgentEvalGuessedOrigin = AgentEvalCandidateOrigin | 'unsure'

export const AGENT_EVAL_DIMENSIONS = [
  'continue_reading',
  'plot_progress',
  'character_agency_voice',
  'emotion_credibility',
  'style_consistency',
  'description_function',
  'mechanical_texture',
  'chapter_bridge',
  'overall_preference',
] as const

export type AgentEvalDimension = (typeof AGENT_EVAL_DIMENSIONS)[number]

export const AGENT_EVAL_MECHANICAL_REASONS = [
  'style_drift',
  'orphaned_sophistication',
  'plot_progress',
  'description_load',
  'emotion_grounding',
  'explanation_echo',
  'sentence_homology',
  'image_repetition',
  'character_voice',
  'causal_gap',
  'chapter_bridge',
  'reader_pull',
] as const

export type AgentEvalMechanicalReason = (typeof AGENT_EVAL_MECHANICAL_REASONS)[number]
export type AgentEvalRating = 1 | 2 | 3 | 4 | 5

export type AdminAgentEvalSuiteRow = {
  id: string
  name: string
  datasetVersion: string
  rubricVersion: string
  status: AgentEvalSuiteStatus
  sampleCount: number
  reviewCount: number
  completedSampleCount: number
  createdAt: string
  updatedAt: string
}

export type AdminAgentEvalCandidateInput = {
  origin: AgentEvalCandidateOrigin
  content: string
  metadata?: Record<string, unknown>
}

export type AdminCreateAgentEvalSampleRequest = {
  code: string
  title: string
  genre: string
  task: string
  style: string
  evaluationBrief: string
  sourceClass: AgentEvalSourceClass
  sourceReference: string
  consentReceiptId?: string
  candidates: AdminAgentEvalCandidateInput[]
}

export type AgentBlindReviewCandidate = {
  label: string
  content: string
}

export type AgentBlindReviewAssignment = {
  sampleId: string
  suiteId: string
  suiteName: string
  sampleCode: string
  title: string
  genre: string
  task: string
  style: string
  evaluationBrief: string
  progress: { reviewed: number; total: number }
  candidates: AgentBlindReviewCandidate[]
}

export type AgentBlindReviewSubmission = {
  candidateRatings: Record<string, Record<AgentEvalDimension, AgentEvalRating>>
  guessedOrigins: Record<string, AgentEvalGuessedOrigin>
  mechanicalReasons: Record<string, AgentEvalMechanicalReason[]>
  preferredLabel: string
  notes?: string
}

export type AgentEvalVariantResult = {
  origin: AgentEvalCandidateOrigin
  sampleCount: number
  reviewCount: number
  averageRatings: Partial<Record<AgentEvalDimension, number>>
  mechanicalMarkRate: number
  preferenceRate: number
}

export type AdminAgentEvalResults = {
  suite: AdminAgentEvalSuiteRow
  reviewerCount: number
  variants: AgentEvalVariantResult[]
}
