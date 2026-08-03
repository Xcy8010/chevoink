/**
 * 阅读器章节离线缓存（番茄式断网体验）：
 * 成功读到的章节正文写入 localStorage（LRU 限量），断网/请求失败时回落缓存继续阅读。
 * 书架与阅读进度本就存在本地，配合本模块实现「断网也能读已读过的书」。
 */

import type { ReaderPayload } from '../../../shared/contracts/index.js'

const STORE_KEY = 'chevoink-reader-cache'
/** 缓存总预算（字符数，UTF-16 约 ×2 字节）：约 2.5MB，够存几十章正文 */
const MAX_CHARS = 1_250_000

type CacheEntry = {
  novelId: string
  chapterId: string
  /** 最近阅读时间（LRU 淘汰依据） */
  readAt: number
  payload: ReaderPayload
}

type CacheStore = {
  entries: CacheEntry[]
}

function readStore(): CacheStore {
  if (typeof window === 'undefined') return { entries: [] }
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return { entries: [] }
    const parsed = JSON.parse(raw) as CacheStore
    if (!Array.isArray(parsed.entries)) return { entries: [] }
    return parsed
  } catch {
    return { entries: [] }
  }
}

function writeStore(store: CacheStore) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // 存储满/隐私模式：离线缓存是可丢弃的优化，静默放弃
  }
}

const payloadChars = (payload: ReaderPayload) => payload.currentChapter.content?.length ?? 0

/** 写入/更新一条章节缓存（自动限量淘汰最久未读的） */
export function cacheReaderPayload(novelId: string, chapterId: string, payload: ReaderPayload) {
  if (typeof window === 'undefined') return

  const store = readStore()
  const entries = store.entries.filter((entry) => entry.chapterId !== chapterId)
  entries.push({ novelId, chapterId, readAt: Date.now(), payload })

  let total = entries.reduce((sum, entry) => sum + payloadChars(entry.payload), 0)
  // 按最近阅读时间升序淘汰最旧的，直到回到预算内
  const sorted = [...entries].sort((a, b) => a.readAt - b.readAt)
  while (total > MAX_CHARS && sorted.length > 1) {
    const oldest = sorted.shift()
    if (!oldest) break
    const index = entries.indexOf(oldest)
    if (index >= 0) entries.splice(index, 1)
    total -= payloadChars(oldest.payload)
  }

  writeStore({ entries })
}

/** 读取一条章节缓存（命中即刷新 LRU 时间），未命中返回 null */
export function getCachedReaderPayload(novelId: string, chapterId: string): ReaderPayload | null {
  if (typeof window === 'undefined') return null

  const store = readStore()
  const entry = store.entries.find((item) => item.novelId === novelId && item.chapterId === chapterId)
  if (!entry) return null

  entry.readAt = Date.now()
  writeStore(store)
  return entry.payload
}
