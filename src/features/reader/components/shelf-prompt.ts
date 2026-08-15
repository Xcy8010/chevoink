import { isInShelf } from '@/features/home/local-shelf'

/**
 * 退出挽留弹窗（方案 20 §2.4）的会话级判定：
 * 手机端阅读器退出时，若作品还没在书架里，就地问一句要不要加入书架。
 * 已在书架、或本次会话已问过的作品不再打扰。
 */

const PROMPTED_KEY = 'chevoink-reader-shelf-prompted'

function readPrompted(): string[] {
  try {
    const raw = window.sessionStorage.getItem(PROMPTED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** 是否需要弹挽留：未在书架 且 本次会话没问过 */
export function shouldPromptShelf(novelId: string): boolean {
  if (typeof window === 'undefined' || !novelId) return false
  if (isInShelf(novelId)) return false
  return !readPrompted().includes(novelId)
}

/** 记录已问过（每书每会话只问一次，避免反复进出被打扰） */
export function markShelfPrompted(novelId: string) {
  if (typeof window === 'undefined' || !novelId) return
  try {
    const prompted = readPrompted()
    if (prompted.includes(novelId)) return
    prompted.push(novelId)
    window.sessionStorage.setItem(PROMPTED_KEY, JSON.stringify(prompted.slice(-60)))
  } catch {
    // sessionStorage 不可用时静默失败
  }
}
