import type {
  ApiResponse,
  Chapter,
  ChapterListItem,
  CommentTargetType,
  GetHomeResponse,
  GetNovelDetailResponse,
  GetReaderResponse,
  ListCommentsResponse,
  ListNovelsResponse,
  Novel,
  NovelCard,
  Post,
  TopicSummary,
  Comment,
} from '../../../shared/contracts/index.js'
import { buildApiUrl } from '@/app/api-base'

type RequestDataOptions = RequestInit & {
  timeoutMs?: number
}

type ListNovelOptions = {
  page?: number
  pageSize?: number
}

type ListCommentsOptions = {
  page?: number
  pageSize?: number
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

export function getHomePayload(): Promise<GetHomeResponse['data']> {
  return requestData<GetHomeResponse['data']>('/api/home')
}

export function listNovels(options?: ListNovelOptions): Promise<ListNovelsResponse['data']> {
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 12

  return requestData<ListNovelsResponse['data']>(`/api/novels?page=${page}&pageSize=${pageSize}`)
}

export function getNovelDetailPayload(novelId: string): Promise<GetNovelDetailResponse['data']> {
  return requestData<GetNovelDetailResponse['data']>(`/api/novels/${novelId}/detail`)
}

export function getReaderPayload(
  novelId: string,
  chapterId: string,
): Promise<GetReaderResponse['data']> {
  return requestData<GetReaderResponse['data']>(`/api/novels/${novelId}/chapters/${chapterId}`)
}

export function listCommentsByTarget(
  targetType: CommentTargetType,
  targetId: string,
  options?: ListCommentsOptions,
): Promise<ListCommentsResponse['data']> {
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 20

  return requestData<ListCommentsResponse['data']>(
    `/api/comments?targetType=${targetType}&targetId=${targetId}&page=${page}&pageSize=${pageSize}`,
  )
}

type ReadableChapterLike = Pick<ChapterListItem, 'status' | 'visibility' | 'publishedAt'> | Pick<Chapter, 'status' | 'visibility' | 'publishedAt'>

function isPublishedAtReachable(publishedAt: string | null | undefined): boolean {
  if (!publishedAt) {
    return true
  }

  const publishTime = new Date(publishedAt).getTime()

  return Number.isFinite(publishTime) && publishTime <= Date.now()
}

export function isPublicReadableChapter(chapter: ReadableChapterLike): boolean {
  return (
    chapter.status === 'published' &&
    chapter.visibility === 'public' &&
    isPublishedAtReachable(chapter.publishedAt ?? null)
  )
}

export function findFirstReadableChapterId(chapters: ChapterListItem[]): string | null {
  const readableChapter =
    [...chapters]
      .filter(isPublicReadableChapter)
      .sort((left, right) => left.orderIndex - right.orderIndex)[0] ?? null

  return readableChapter?.id ?? null
}

export function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export function getDisplayTitle(novel: Pick<NovelCard, 'title' | 'displayTitle'> | Pick<Novel, 'title' | 'displayTitle'>): string {
  return novel.displayTitle?.trim() || novel.title?.trim() || '未命名作品'
}

export function getNovelSummary(summary: string | null | undefined): string {
  const normalized = summary?.trim()

  return normalized && normalized.length > 0 ? normalized : '简介暂未完善，先从目录和正文里看看这本书。'
}

export function getAuthorName(author: { nickname?: string | null } | null | undefined): string {
  const normalized = author?.nickname?.trim()

  return normalized && normalized.length > 0 ? normalized : '匿名作者'
}

export function getSafeTags(tags: string[] | null | undefined): string[] {
  return asArray(tags).filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
}

export function getCoverUrl(coverUrl: string | null | undefined): string | null {
  const normalized = coverUrl?.trim()

  return normalized && normalized.length > 0 ? normalized : null
}

export function getTopicName(topic: TopicSummary | null | undefined): string {
  const normalized = topic?.name?.trim()

  return normalized && normalized.length > 0 ? normalized : '作品讨论'
}

export function getPostExcerpt(post: Pick<Post, 'content'>): string {
  const normalized = post.content?.trim()

  return normalized && normalized.length > 0 ? normalized : '这条讨论刚刚发出，点进详情页看看大家在聊什么。'
}

export function getCommentBody(comment: Pick<Comment, 'content'>): string {
  const normalized = comment.content?.trim()

  return normalized && normalized.length > 0 ? normalized : '这条评论暂时没有可显示的正文。'
}

export function splitReaderParagraphs(content: string | null | undefined): string[] {
  const normalized = content?.trim()

  return normalized ? normalized.split('\n\n').map((paragraph) => paragraph.trim()).filter(Boolean) : []
}
