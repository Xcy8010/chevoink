export type AgentToolPolicyLevel = 'allow' | 'ask' | 'deny'
export type AgentSandboxMode = 'read_only' | 'workspace' | 'full_access'
export type AgentSubtaskRole = 'research' | 'continuity' | 'quality' | 'lore'

export interface AgentSessionToolPolicy {
  network: AgentToolPolicyLevel
  contentWrite: AgentToolPolicyLevel
  bulkWrite: AgentToolPolicyLevel
  publish: AgentToolPolicyLevel
  destructive: AgentToolPolicyLevel
}

export const DEFAULT_AGENT_SESSION_TOOL_POLICY: AgentSessionToolPolicy = {
  network: 'ask',
  contentWrite: 'allow',
  bulkWrite: 'ask',
  publish: 'ask',
  destructive: 'ask',
}

export interface StoryBranchView {
  id: string
  novelId: string
  chapterId: string
  sourceRunId: string | null
  name: string
  baseRevision: number
  headContent: string
  status: string
  mergedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StoryBranchDiffView {
  branchId: string
  chapterId: string
  chapterTitle: string
  baseRevision: number
  currentRevision: number
  conflicted: boolean
  before: string
  after: string
  addedLines: number
  removedLines: number
}

export interface AgentSubtaskView {
  id: string
  novelId: string
  parentSessionId: string
  childSessionId: string
  childRunId: string | null
  role: AgentSubtaskRole
  prompt: string
  tokenBudget: number
  status: string
  traceUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentScheduleView {
  id: string
  novelId: string
  sessionId: string
  name: string
  prompt: string
  cadenceMinutes: number
  nextRunAt: string
  lastRunId: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface AgentEvalRunMetric {
  runId: string
  modelTier: string
  reasoningEffort: string
  status: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  durationMs: number | null
  outputSummary: string | null
}

export interface AgentEvalComparisonView {
  id: string
  novelId: string
  name: string
  runIds: string[]
  metrics: AgentEvalRunMetric[]
  createdAt: string
}
