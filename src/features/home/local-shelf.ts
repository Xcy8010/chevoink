/** 基于 localStorage 的本地书架（服务端书架能力未开放前的本地实现） */

export type LocalShelfEntry = {
  novelId: string
  title: string
  coverUrl: string | null
  addedAt: number
}

const STORAGE_KEY = 'chevoink-shelf'

function readStore(): LocalShelfEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LocalShelfEntry[]
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.novelId === 'string') : []
  } catch {
    return []
  }
}

function writeStore(entries: LocalShelfEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function getLocalShelf(): LocalShelfEntry[] {
  if (typeof window === 'undefined') return []
  return readStore().sort((left, right) => right.addedAt - left.addedAt)
}

export function isInShelf(novelId: string): boolean {
  if (typeof window === 'undefined') return false
  return readStore().some((entry) => entry.novelId === novelId)
}

export function addToShelf(entry: Omit<LocalShelfEntry, 'addedAt'>) {
  if (typeof window === 'undefined') return
  const entries = readStore().filter((item) => item.novelId !== entry.novelId)
  entries.unshift({ ...entry, addedAt: Date.now() })
  writeStore(entries)
}

export function removeFromShelf(novelId: string) {
  if (typeof window === 'undefined') return
  writeStore(readStore().filter((entry) => entry.novelId !== novelId))
}

/** 回填书架条目封面（收藏时还没封面、之后作品补了封面的场景） */
export function updateShelfCover(novelId: string, coverUrl: string) {
  if (typeof window === 'undefined') return
  const entries = readStore()
  const target = entries.find((entry) => entry.novelId === novelId)
  if (!target || target.coverUrl === coverUrl) return
  target.coverUrl = coverUrl
  writeStore(entries)
}

/** 切换书架状态，返回切换后是否在书架中 */
export function toggleShelf(entry: Omit<LocalShelfEntry, 'addedAt'>): boolean {
  if (isInShelf(entry.novelId)) {
    removeFromShelf(entry.novelId)
    return false
  }

  addToShelf(entry)
  return true
}

/** 水合注入：按指定 addedAt 直接写入一条书架记录（服务端数据回填本地缓存） */
export function upsertShelfRaw(entry: LocalShelfEntry) {
  if (typeof window === 'undefined') return
  const entries = readStore().filter((item) => item.novelId !== entry.novelId)
  entries.unshift(entry)
  writeStore(entries)
}
