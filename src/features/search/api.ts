import type {
  ApiResponse,
  HotSearchPayload,
  SearchResultPayload,
  SearchSuggestPayload,
} from '../../../shared/contracts/index.js'
import { buildApiUrl } from '@/app/api-base'

async function requestData<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })

  const rawText = await response.text()
  const result = rawText ? (JSON.parse(rawText) as ApiResponse<T>) : null

  if (!response.ok || !result || !result.success) {
    const message =
      result && typeof result === 'object' && 'error' in result
        ? result.error.message
        : '搜索请求失败，请稍后再试。'
    throw new Error(message)
  }

  return result.data
}

export function searchAll(keyword: string): Promise<SearchResultPayload> {
  return requestData<SearchResultPayload>(`/api/search?q=${encodeURIComponent(keyword)}`)
}

export function searchSuggest(keyword: string): Promise<SearchSuggestPayload> {
  return requestData<SearchSuggestPayload>(`/api/search/suggest?q=${encodeURIComponent(keyword)}`)
}

export function getHotSearchKeywords(): Promise<HotSearchPayload> {
  return requestData<HotSearchPayload>('/api/search/hot')
}
