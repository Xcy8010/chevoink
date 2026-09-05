import type { StartAgentLoopRunRequest } from './index.js'

export type AgentQueuedRequestView = {
  id: string
  sessionId: string
  prompt: string
  attachmentCount: number
  status: string
  revision: number
  error: string | null
}
export type AgentQueueSnapshot = {
  items: AgentQueuedRequestView[]
  latestRunId: string | null
}
export type AgentQueueAction = 'edit' | 'delete' | 'steer' | 'new' | 'fork'
export type EnqueueAgentRequest = { id: string; input: StartAgentLoopRunRequest }
