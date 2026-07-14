import type {
  ApiResponse,
  CommentTargetType,
  Conversation,
  CreateCommentRequest,
  CreatePostRequest,
  CreatePostResponse,
  GetMeResponse,
  GetPostDetailResponse,
  ListCommentsResponse,
  ListConversationsResponse,
  ListMessagesResponse,
  ListNovelsResponse,
  ListPostsResponse,
  SendMessageRequest,
  SendMessageResponse,
  User,
} from '../../../shared/contracts/index.js'
import { buildApiUrl } from '@/app/api-base'

type RequestDataOptions = RequestInit & {
  timeoutMs?: number
}

function normalizeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return '请求超时，请稍后再试。'
    }

    return error.message || '请求失败，请稍后再试。'
  }

  return '请求失败，请稍后再试。'
}

async function requestData<T>(path: string, options?: RequestDataOptions): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs ?? 30000
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(buildApiUrl(path), {
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
      ...options,
      signal: controller.signal,
    })

    const rawText = await response.text()
    const result = rawText ? (JSON.parse(rawText) as ApiResponse<T>) : null

    if (!response.ok) {
      const message =
        result && typeof result === 'object' && 'error' in result
          ? result.error.message
          : rawText || '请求失败，请稍后再试。'
      throw new Error(message)
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
    window.clearTimeout(timeoutId)
  }
}

export function getMe() {
  return requestData<GetMeResponse['data']>('/api/users/me')
}

export async function getUser(userId: string): Promise<User> {
  const data = await requestData<{ user: User }>(`/api/users/${userId}`)
  return data.user
}

export function listNovels(pageSize = 20) {
  return requestData<ListNovelsResponse['data']>(`/api/novels?page=1&pageSize=${pageSize}`)
}

export function listPosts(pageSize = 20) {
  return requestData<ListPostsResponse['data']>(`/api/posts?page=1&pageSize=${pageSize}`)
}

export function createPost(payload: CreatePostRequest) {
  return requestData<CreatePostResponse['data']>('/api/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getPostDetail(postId: string) {
  return requestData<GetPostDetailResponse['data']>(`/api/posts/${postId}`)
}

export function listComments(targetType: CommentTargetType, targetId: string, pageSize = 50) {
  const search = new URLSearchParams({
    targetType,
    targetId,
    page: '1',
    pageSize: `${pageSize}`,
  })

  return requestData<ListCommentsResponse['data']>(`/api/comments?${search.toString()}`)
}

export function createComment(payload: CreateCommentRequest) {
  return requestData<{ comment: ListCommentsResponse['data']['items'][number] }>('/api/comments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listConversations(pageSize = 20) {
  return requestData<ListConversationsResponse['data']>(`/api/conversations?page=1&pageSize=${pageSize}`)
}

export function listMessages(conversationId: string, pageSize = 50) {
  return requestData<ListMessagesResponse['data']>(
    `/api/conversations/${conversationId}/messages?page=1&pageSize=${pageSize}`,
  )
}

export async function sendMessage(
  conversationId: string,
  payload: SendMessageRequest,
): Promise<SendMessageResponse['data']['message']> {
  const data = await requestData<SendMessageResponse['data']>(
    `/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )

  return data.message
}

export function getDirectConversationByUserId(
  conversations: Conversation[],
  userId: string | null | undefined,
) {
  if (!userId) {
    return null
  }

  return (
    conversations.find(
      (conversation) =>
        conversation.type === 'direct' &&
        conversation.members.some((member) => member.id === userId),
    ) ?? null
  )
}
