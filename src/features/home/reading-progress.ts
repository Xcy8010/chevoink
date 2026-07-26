/** 基于 localStorage 的本地阅读进度跟踪 */

export type ReadingProgressEntry = {
  novelId: string
  novelTitle: string
  chapterId: string
  chapterTitle: string
  chapterOrder: number
  totalChapters: number
  updatedAt: number
}

const STORAGE_KEY = 'chevoink-reading-progress'

function readStore(): Record<string, ReadingProgressEntry> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ReadingProgressEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, ReadingProgressEntry>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function getReadingProgress(novelId: string): ReadingProgressEntry | null {
  if (typeof window === 'undefined') return null
  return readStore()[novelId] ?? null
}

export function getAllReadingProgress(): Record<string, ReadingProgressEntry> {
  if (typeof window === 'undefined') return {}
  return readStore()
}

export function saveReadingProgress(entry: Omit<ReadingProgressEntry, 'updatedAt'>) {
  if (typeof window === 'undefined') return
  const store = readStore()
  store[entry.novelId] = { ...entry, updatedAt: Date.now() }
  writeStore(store)
}

/** 计算百分比进度（0-100 整数） */
export function getProgressPercent(entry: ReadingProgressEntry): number {
  if (entry.totalChapters <= 0) return 0
  return Math.min(100, Math.max(1, Math.round(((entry.chapterOrder + 1) / entry.totalChapters) * 100)))
}
