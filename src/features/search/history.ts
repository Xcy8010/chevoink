const STORAGE_KEY = 'chevoink:search-history'
const MAX_HISTORY = 10

function readAll(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
  } catch {
    return []
  }
}

function writeAll(items: string[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
  } catch {
    // localStorage 不可用时静默降级
  }
}

export function getSearchHistory(): string[] {
  return readAll()
}

/** 新增一条历史：去重置顶，最多保留 10 条 */
export function addSearchHistory(keyword: string): string[] {
  const normalized = keyword.trim()
  if (!normalized) return readAll()

  const next = [normalized, ...readAll().filter((item) => item !== normalized)].slice(0, MAX_HISTORY)
  writeAll(next)
  return next
}

export function removeSearchHistory(keyword: string): string[] {
  const next = readAll().filter((item) => item !== keyword)
  writeAll(next)
  return next
}

export function clearSearchHistory(): string[] {
  writeAll([])
  return []
}
