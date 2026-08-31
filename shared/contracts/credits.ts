export type CreditModelTier = 'speed' | 'standard' | 'performance' | 'ultimate' | 'custom'

/** OpenAI-compatible providers expose different subsets; the server validates per model. */
export type ModelReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type CreditModelOption = {
  tier: Exclude<CreditModelTier, 'custom'>
  label: string
  multiplier: number
  available: boolean
  selectedByDefault: boolean
  reasoningEfforts: ModelReasoningEffort[]
  defaultReasoningEffort: ModelReasoningEffort
  visionEnabled: boolean
}

export type CreditAccountSummary = {
  plan: 'public_beta'
  planLabel: '公测版'
  dailyAllowance: number
  dailyUsed: number
  dailyRemaining: number
  bonusRemaining: number
  totalRemaining: number
  usedPercent: number
  periodStartedAt: string
  resetsAt: string
  resetTimeZone: 'UTC+8'
  globallyPaused: boolean
  suspended: boolean
  models: CreditModelOption[]
}

export type CreditLedgerItem = {
  id: string
  delta: number
  kind: string
  sourceType: string
  referenceId: string | null
  modelTier: CreditModelTier | null
  multiplier: number
  requestTokens: number | null
  responseTokens: number | null
  createdAt: string
}

export type CreditUsagePayload = {
  account: CreditAccountSummary
  ledger: CreditLedgerItem[]
}

export type ReferralPayload = {
  code: string
  inviteUrl: string
  inviterReward: 300
  inviteeReward: 120
  successfulInvites: number
  totalEarned: number
}

export type CustomModelView = {
  id: string
  provider: string
  displayName: string
  modelName: string
  baseUrl: string | null
  apiKeyConfigured: boolean
  enabled: boolean
  reasoningEfforts: ModelReasoningEffort[]
  defaultReasoningEffort: ModelReasoningEffort
  visionEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type CustomModelsPayload = { models: CustomModelView[] }

export type SaveCustomModelRequest = {
  provider: string
  displayName: string
  modelName: string
  baseUrl: string
  apiKey?: string
  enabled?: boolean
  reasoningEfforts?: ModelReasoningEffort[]
  defaultReasoningEffort?: ModelReasoningEffort
  visionEnabled?: boolean
}
