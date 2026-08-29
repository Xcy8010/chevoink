export type AgentSkillSource = 'builtin' | 'user' | 'agent' | 'third_party'
export type AgentSkillStatus = 'draft' | 'testing' | 'active' | 'deprecated' | 'quarantined'
export type AgentSkillPhase = 'research' | 'plan' | 'scene' | 'draft' | 'critique' | 'revision' | 'commit'

export type AgentSkillAuditSummary = {
  id: string
  version: string
  status: 'passed' | 'failed'
  findings: string[]
  createdAt: string
}

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
  canEdit: boolean
  latestAudit: AgentSkillAuditSummary | null
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

export type AgentSkillDraftInput = {
  name: string
  description: string
  intents: Array<'plan' | 'write' | 'revise' | 'review' | 'structure' | 'global_transform'>
  modes: Array<'plan' | 'build' | 'review'>
  phases: AgentSkillPhase[]
  triggerPhrases: string[]
  negativeTriggerPhrases: string[]
  instructions: Partial<Record<AgentSkillPhase, string>>
  tokenBudget?: number
  priority?: number
}

export type CreateNovelSkillRequest = AgentSkillDraftInput & {
  source?: 'user' | 'agent'
}

export type ImportThirdPartySkillRequest = AgentSkillDraftInput & {
  license: 'MIT' | 'Apache-2.0' | 'BSD-2-Clause' | 'BSD-3-Clause' | 'CC0-1.0' | 'Unlicense'
  attribution: string
  sourcePackage: string
}

export type CreateNovelSkillVersionRequest = AgentSkillDraftInput & {
  version: string
}

export type TestNovelSkillRequest = {
  version?: string
  prompt: string
  intent: 'plan' | 'write' | 'revise' | 'review' | 'structure' | 'global_transform'
  mode: 'plan' | 'build' | 'review'
  phase: AgentSkillPhase
  expectMatch: boolean
}

export type AgentSkillTestResult = {
  skillId: string
  version: string
  matched: boolean
  expected: boolean
  passed: boolean
  score: number
  reasonCodes: string[]
  blockedByNegativeTrigger: boolean
  estimatedTokens: number
}

export type AgentSkillEvalSummary = AgentSkillTestResult & {
  id: string
  createdAt: string
}

export type AgentSkillDetail = {
  item: AgentSkillListItem
  version: string
  manifest: Record<string, unknown>
  instructions: Partial<Record<AgentSkillPhase, string>>
  audits: AgentSkillAuditSummary[]
  recentEvals: AgentSkillEvalSummary[]
}

export type SkillShareInviteStatusValue = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked'

export type SkillShareInviteView = {
  id: string
  direction: 'sent' | 'received'
  status: SkillShareInviteStatusValue
  skillId: string
  skillName: string
  version: string
  message: string
  counterpart: { id: string; nickname: string }
  sourceNovel: { id: string; title: string }
  expiresAt: string
  createdAt: string
}

export type SkillSharePayload = {
  sent: SkillShareInviteView[]
  received: SkillShareInviteView[]
}
