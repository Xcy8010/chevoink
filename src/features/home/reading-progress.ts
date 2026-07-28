/** 基于 localStorage 的本地阅读进度跟踪 */

export type ReadingProgressEntry = {
  novelId: string
  novelTitle: string
  chapterId: string
  chapterTitle: string
  chapterOrder: number
  totalChapters: number
  /** 章内滚动进度 0-1，用于重新进入时定位到上次读到的位置 */
  scrollPercent?: number
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

export function saveReadingProgress(entry: Omit<ReadingProgressEntry, 'updatedAt' | 'scrollPercent'>) {
  if (typeof window === 'undefined') return
  const store = readStore()
  const previous = store[entry.novelId]
  store[entry.novelId] = {
    ...entry,
    // 同章重写时保留章内滚动进度，切换新章节则从头开始
    scrollPercent: previous?.chapterId === entry.chapterId ? previous.scrollPercent : 0,
    updatedAt: Date.now(),
  }
  writeStore(store)
}

/** 只更新章内滚动进度（滚动防抖写回），章节不匹配时忽略 */
export function updateReadingScrollPercent(novelId: string, chapterId: string, scrollPercent: number) {
  if (typeof window === 'undefined') return
  const store = readStore()
  const entry = store[novelId]
  if (!entry || entry.chapterId !== chapterId) return
  entry.scrollPercent = Math.min(1, Math.max(0, scrollPercent))
  entry.updatedAt = Date.now()
  writeStore(store)
}

/** 计算百分比进度（0-100 整数） */
export function getProgressPercent(entry: ReadingProgressEntry): number {
  if (entry.totalChapters <= 0) return 0
  return Math.min(100, Math.max(1, Math.round(((entry.chapterOrder + 1) / entry.totalChapters) * 100)))
}

/** 水合注入：直接写入一条进度记录（服务端数据回填本地缓存，不改动 updatedAt） */
export function upsertReadingProgressRaw(entry: ReadingProgressEntry) {
  if (typeof window === 'undefined') return
  const store = readStore()
  store[entry.novelId] = entry
  writeStore(store)
}

/** 水合注入：删除一条本地进度（服务端已移出书架时同步清理） */
export function removeReadingProgressRaw(novelId: string) {
  if (typeof window === 'undefined') return
  const store = readStore()
  if (!(novelId in store)) return
  delete store[novelId]
  writeStore(store)
}
