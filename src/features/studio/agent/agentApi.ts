import { buildApiUrl } from '@/app/api-base'
import { buildAuthHeader } from '@/lib/auth-token'
import type {
  AgentSession,
  AgentUIMessage,
  ApiResponse,
  ContextState,
  ResolveAgentApprovalRequest,
  ResolveAgentQuestionRequest,
  StartAgentLoopRunRequest,
  StartAgentLoopRunResponse,
  UploadAgentAttachmentRequest,
  UploadAgentAttachmentResponse,
} from '../../../../shared/contracts/index.js'

/** Agent Loop 新链路 API 客户端（与旧 api.ts 并行，迁移完成后旧链路下线） */

/** 带 HTTP 状态码与业务错误码的请求错误：供调用方区分「会话已不存在」等可自愈场景 */
export class AgentApiError extends Error {
  status: number
  code: string | null

  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'AgentApiError'
    this.status = status
    this.code = code
  }
}

async function requestData<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeader(),
      ...(options?.headers ?? {}),
    },
  })

  const rawText = await response.text()
  let result: ApiResponse<T> | null = null

  if (rawText) {
    try {
      result = JSON.parse(rawText) as ApiResponse<T>
    } catch {
      result = null
    }
  }

  if (!response.ok || !result || !result.success) {
    const message =
      result && typeof result === 'object' && 'error' in result
        ? result.error.message
        : response.status >= 500
          ? '服务暂时不可用，请稍后再试。'
          : '请求失败，请稍后再试。'
    const code = result && typeof result === 'object' && 'error' in result ? result.error.code : null
    throw new AgentApiError(message, response.status, code)
  }

  return result.data
}

export function startAgentLoopRun(input: StartAgentLoopRunRequest): Promise<StartAgentLoopRunResponse> {
  return requestData<StartAgentLoopRunResponse>('/api/agent/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** 上传单个对话附件（选件即传，run 请求只携带返回的元数据） */
export function uploadAgentAttachment(
  input: UploadAgentAttachmentRequest,
): Promise<UploadAgentAttachmentResponse> {
  return requestData<UploadAgentAttachmentResponse>('/api/agent/attachments', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function stopAgentLoopRun(runId: string): Promise<{ stopped: boolean }> {
  return requestData<{ stopped: boolean }>(`/api/agent/runs/${runId}/stop`, { method: 'POST' })
}

export function continueAgentLoopRun(runId: string): Promise<StartAgentLoopRunResponse> {
  return requestData<StartAgentLoopRunResponse>(`/api/agent/runs/${runId}/continue`, { method: 'POST' })
}

export function resolveAgentApproval(
  runId: string,
  input: ResolveAgentApprovalRequest,
): Promise<{ resolved: boolean }> {
  return requestData<{ resolved: boolean }>(`/api/agent/runs/${runId}/approvals`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function resolveAgentQuestion(
  runId: string,
  input: ResolveAgentQuestionRequest,
): Promise<{ resolved: boolean }> {
  return requestData<{ resolved: boolean }>(`/api/agent/runs/${runId}/questions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** 会话消息 + activeRunId（服务端仍在进行的 run，刷新后据此续接直播） */
export function fetchAgentSessionMessages(
  sessionId: string,
): Promise<{ messages: AgentUIMessage[]; activeRunId: string | null }> {
  return requestData<{ messages: AgentUIMessage[]; activeRunId: string | null }>(
    `/api/agent/sessions/${sessionId}/messages`,
  )
}

/** 历史任务对话列表（后端已过滤空且未命名的会话） */
export function fetchAgentSessions(novelId: string): Promise<{ items: AgentSession[] }> {
  return requestData<{ items: AgentSession[] }>(
    `/api/agent/sessions?novelId=${encodeURIComponent(novelId)}`,
  )
}

export function fetchAgentContextState(sessionId: string): Promise<ContextState> {
  return requestData<ContextState>(`/api/agent/sessions/${sessionId}/context-state`)
}

export function compactAgentContext(sessionId: string): Promise<{ checkpoint: ContextState['checkpoint']; state: ContextState }> {
  return requestData<{ checkpoint: ContextState['checkpoint']; state: ContextState }>(
    `/api/agent/sessions/${sessionId}/compact`,
    { method: 'POST' },
  )
}

export type MemoryReviewItem = {
  id: string
  title: string
  content: string
  status: string
  reviewStatus: string
  confidence: number
  evidence: Array<{ id: string; sourceType: string; sourceId: string; revision: number | null }>
}

export function fetchMemoryReviewInbox(novelId: string): Promise<{ items: MemoryReviewItem[] }> {
  return requestData<{ items: MemoryReviewItem[] }>(`/api/agent/novels/${novelId}/memory-review`)
}

export function resolveMemoryReviewItem(memoryId: string, accepted: boolean): Promise<{ memory: MemoryReviewItem }> {
  return requestData<{ memory: MemoryReviewItem }>(`/api/agent/memory/${memoryId}/review`, {
    method: 'POST', body: JSON.stringify({ accepted }),
  })
}

export function renameAgentSession(sessionId: string, title: string): Promise<{ session: AgentSession }> {
  return requestData<{ session: AgentSession }>(`/api/agent/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export function deleteAgentSession(sessionId: string): Promise<{ sessionId: string; deleted: true }> {
  return requestData<{ sessionId: string; deleted: true }>(`/api/agent/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

/** 删除某轮对话（按消息所属 run 整轮删除，不恢复已写入内容） */
export function deleteAgentSessionMessage(
  sessionId: string,
  messageId: string,
): Promise<{ deleted: true; runId: string }> {
  return requestData<{ deleted: true; runId: string }>(
    `/api/agent/sessions/${sessionId}/messages/${messageId}`,
    { method: 'DELETE' },
  )
}

/** 回退到某轮对话之前：逆序恢复写操作快照并删除该轮及之后的对话 */
export function rollbackAgentSessionMessage(
  sessionId: string,
  messageId: string,
): Promise<{ rolledBack: true; removedRunCount: number }> {
  return requestData<{ rolledBack: true; removedRunCount: number }>(
    `/api/agent/sessions/${sessionId}/messages/${messageId}/rollback`,
    { method: 'POST' },
  )
}

export function buildAgentStreamUrl(runId: string, sinceSeq?: number): string {
  const suffix = sinceSeq && sinceSeq > 0 ? `?since=${sinceSeq}` : ''
  return buildApiUrl(`/api/agent/runs/${runId}/stream${suffix}`)
}
