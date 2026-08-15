import { buildApiUrl } from '@/app/api-base'
import { buildAuthHeader } from '@/lib/auth-token'
import type {
  AgentActionResultPayload,
  ApiResponse,
  Chapter,
  CreateChapterRequest,
  CreateNovelRequest,
  CreateNovelResponse,
  CreateAgentSessionResponse,
  DeleteAgentSessionResponse,
  DeleteNovelResponse,
  DeleteChapterResponse,
  GenerateCoverImageRequest,
  GenerateCoverImageResponse,
  GenerateCoverPromptRequest,
  GenerateCoverPromptResponse,
  GetChapterResponse,
  ListAgentSessionHistoryResponse,
  ListAgentSessionsResponse,
  Novel,
  PublishNovelRequest,
  PublishNovelResponse,
  StudioPayload,
  UploadNovelCoverRequest,
  UploadNovelCoverResponse,
  UpdateChapterRequest,
  UpdateAgentSessionRequest,
  UpdateAgentSessionResponse,
  UpdateNovelRequest,
} from '../../../shared/contracts/index.js'

type RequestDataOptions = RequestInit & {
  timeoutMs?: number
}

export type AgentSessionHistoryItem = AgentActionResultPayload

function normalizeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return '请求超时，请稍后再试。'
    }

    return error.message || '请求失败，请稍后再试。'
  }

  return '请求失败，请稍后再试。'
}

function normalizeResponseError(status: number, message?: string): string {
  if (status === 401 || status === 403) {
    return '登录状态已失效，请重新登录后再试。'
  }

  if (status >= 500) {
    return '服务暂时不可用，请稍后再试。'
  }

  return message || '请求失败，请稍后再试。'
}

async function requestData<T>(path: string, options?: RequestDataOptions): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs ?? 30000
  const timeoutId =
    timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeader(),
        ...(options?.headers ?? {}),
      },
      ...(timeoutMs > 0 ? { signal: controller.signal } : {}),
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

    if (!response.ok) {
      const message =
        result && typeof result === 'object' && 'error' in result
          ? result.error.message
          : rawText || undefined
      throw new Error(normalizeResponseError(response.status, message))
    }

    if (!result || !result.success) {
      const message =
        result && typeof result === 'object' && 'error' in result
          ? result.error.message
          : '服务返回异常，请稍后再试。'
      throw new Error(message)
    }

    return result.data
  } catch (error) {
    throw new Error(normalizeFetchError(error))
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  }
}

export async function listWritingAgentSessions(novelId: string): Promise<ListAgentSessionsResponse['data']['items']> {
  const data = await requestData<ListAgentSessionsResponse['data']>(
    `/api/agent/sessions?novelId=${encodeURIComponent(novelId)}`,
  )
  return data.items
}

export async function createWritingAgentSession(
  novelId: string,
  title?: string,
): Promise<CreateAgentSessionResponse['data']['session']> {
  const data = await requestData<CreateAgentSessionResponse['data']>('/api/agent/sessions', {
    method: 'POST',
    body: JSON.stringify({
      novelId,
      title,
    }),
  })

  return data.session
}

export async function updateWritingAgentSession(
  sessionId: string,
  payload: UpdateAgentSessionRequest,
): Promise<UpdateAgentSessionResponse['data']['session']> {
  const data = await requestData<UpdateAgentSessionResponse['data']>(`/api/agent/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

  return data.session
}

export async function deleteWritingAgentSession(
  sessionId: string,
): Promise<DeleteAgentSessionResponse['data']> {
  return requestData<DeleteAgentSessionResponse['data']>(`/api/agent/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

export async function getWritingAgentSessionHistory(
  sessionId: string,
): Promise<ListAgentSessionHistoryResponse['data']['items']> {
  const data = await requestData<ListAgentSessionHistoryResponse['data']>(
    `/api/agent/sessions/${sessionId}/history`,
  )
  return data.items
}

export type NovelPlanFileItem = {
  id: string
  runId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

/** 计划文件夹：作品维度拉取已存入云端的创作计划（跨会话聚合） */
export async function listNovelPlanFiles(novelId: string): Promise<NovelPlanFileItem[]> {
  const data = await requestData<{ items: NovelPlanFileItem[] }>(
    `/api/agent/plans?novelId=${encodeURIComponent(novelId)}`,
  )
  return data.items
}

/** 计划文件夹：手工新建一份空白计划 */
export async function createNovelPlanFile(
  novelId: string,
  title?: string,
): Promise<NovelPlanFileItem> {
  const data = await requestData<{ item: NovelPlanFileItem }>('/api/agent/plans', {
    method: 'POST',
    body: JSON.stringify({ novelId, ...(title ? { title } : {}) }),
  })
  return data.item
}

/** 计划文件夹：同步改名/改正文，saved=false 从云端文件夹移除 */
export async function updateNovelPlanFile(
  artifactId: string,
  patch: { title?: string; content?: string; saved?: boolean },
): Promise<NovelPlanFileItem> {
  const data = await requestData<{ item: NovelPlanFileItem }>(`/api/agent/plans/${artifactId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return data.item
}

export function getStudioPayload(novelId: string): Promise<StudioPayload> {
  return requestData<StudioPayload>(`/api/novels/${novelId}/studio`)
}

/** 发布作品：同时批量发布选中章节并设置可见范围 */
export async function publishNovelWorkspace(
  novelId: string,
  payload: PublishNovelRequest,
): Promise<PublishNovelResponse['data']> {
  return requestData<PublishNovelResponse['data']>(`/api/novels/${novelId}/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createNovelWorkspace(payload: CreateNovelRequest): Promise<Novel> {
  const data = await requestData<CreateNovelResponse['data']>('/api/novels', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return data.novel
}

export async function getChapterContent(novelId: string, chapterId: string): Promise<Chapter> {
  const data = await requestData<GetChapterResponse['data']>(
    `/api/novels/${novelId}/chapters/${chapterId}`,
  )

  return data.chapter
}

export async function updateNovelMeta(
  novelId: string,
  payload: UpdateNovelRequest,
): Promise<Novel> {
  const data = await requestData<{ novel: Novel }>(`/api/novels/${novelId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

  return data.novel
}

export async function uploadNovelCover(
  novelId: string,
  payload: UploadNovelCoverRequest,
): Promise<UploadNovelCoverResponse['data']> {
  return requestData<UploadNovelCoverResponse['data']>(`/api/novels/${novelId}/cover`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteNovelWorkspace(novelId: string): Promise<void> {
  await requestData<DeleteNovelResponse['data']>(`/api/novels/${novelId}`, {
    method: 'DELETE',
  })
}

export async function createChapterDraft(
  novelId: string,
  payload: CreateChapterRequest,
): Promise<Chapter> {
  const data = await requestData<{ chapter: Chapter }>(`/api/novels/${novelId}/chapters`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return data.chapter
}

export async function updateChapterDraft(
  novelId: string,
  chapterId: string,
  payload: UpdateChapterRequest,
): Promise<Chapter> {
  const data = await requestData<{ chapter: Chapter }>(
    `/api/novels/${novelId}/chapters/${chapterId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )

  return data.chapter
}

export async function deleteChapterDraft(novelId: string, chapterId: string): Promise<void> {
  await requestData<DeleteChapterResponse['data']>(`/api/novels/${novelId}/chapters/${chapterId}`, {
    method: 'DELETE',
  })
}

export function generateCoverPrompt(
  request: GenerateCoverPromptRequest,
): Promise<GenerateCoverPromptResponse['data']> {
  return requestData<GenerateCoverPromptResponse['data']>('/api/ai/cover-prompt', {
    method: 'POST',
    body: JSON.stringify(request),
    timeoutMs: 60000,
  })
}

export function generateCoverImages(
  request: GenerateCoverImageRequest,
): Promise<GenerateCoverImageResponse['data']> {
  return requestData<GenerateCoverImageResponse['data']>('/api/ai/cover-image', {
    method: 'POST',
    body: JSON.stringify(request),
    timeoutMs: 0,
  })
}
