export type AgentSkillSource = 'builtin' | 'user' | 'agent' | 'third_party'
export type AgentSkillStatus = 'draft' | 'testing' | 'active' | 'deprecated' | 'quarantined'

export type AgentSkillVersionSummary = {
  version: string
  status: AgentSkillStatus
  contentHash: string
  createdAt: string
}

export type AgentSkillListItem = {
  id: string
  name: string
  description: string
  source: AgentSkillSource
  license: string
  status: AgentSkillStatus
  defaultVersion: string
  activeVersion: string
  enabled: boolean
  phases: string[]
  triggerLabels: string[]
  negativeTriggerLabels: string[]
  tokenBudget: number
  priority: number
  lastUsedAt: string | null
  usageCount: number
  versions: AgentSkillVersionSummary[]
}

export type AgentSkillRunSummary = {
  runId: string
  phase: string
  selected: Array<{ id: string; name: string; version: string }>
  reasonCodes: string[]
  confidence: number
  estimatedTokens: number
  createdAt: string
}

export type NovelSkillsPayload = {
  items: AgentSkillListItem[]
  recentRuns: AgentSkillRunSummary[]
  enabledCount: number
  totalCount: number
}

export type UpdateNovelSkillRequest = {
  enabled?: boolean
  lockedVersion?: string | null
}
