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

/** 子 Agent 定义（模板）：主 run 通过 subagent_run 工具像调工具一样内嵌调用，不再新开任务窗口 */
export interface AgentSubtaskView {
  id: string
  novelId: string
  parentSessionId: string | null
  childSessionId: string | null
  childRunId: string | null
  name: string
  role: AgentSubtaskRole
  triggerCondition: string
  callableBy: 'main_and_subagents'
  prompt: string
  tokenBudget: number
  status: string
  /** 停用的定义不出现在主 Agent 的可调用目录里（历史取消的旧数据迁移为 false） */
  enabled: boolean
  /** 内嵌调用统计 */
  runCount: number
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentSubtaskLogEntry {
  id: string
  time: string
  title: string
  detail: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface AgentSubtaskLogsView {
  subtaskId: string
  name: string
  status: string
  entries: AgentSubtaskLogEntry[]
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
