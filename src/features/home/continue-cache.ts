/** 继续阅读卡片的本地缓存：刷新页面后先用缓存立即渲染，网络请求完成后再静默更新 */

import type { NovelCard } from '../../../shared/contracts/index.js'

const STORAGE_KEY = 'chevoink-continue-cards'

export function readContinueCards(): NovelCard[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as NovelCard[]
    return Array.isArray(parsed) ? parsed.filter((card) => card && typeof card.id === 'string') : []
  } catch {
    return []
  }
}

export function writeContinueCards(cards: NovelCard[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards))
  } catch {
    // localStorage 不可用时静默失败
  }
}
