import { getCoverUrl } from '@/features/discover/api'
import type { NovelCard } from '../../../shared/contracts/index.js'

/**
 * 每周力荐（Banner 数据源）：
 * - 按热度信号打分：阅读人数、评论、点赞收藏、更新活跃度、篇幅
 * - 以 UTC+8 的自然周（周一 00:00 重置）作为随机种子，同一周内所有人看到固定的一批
 * - 最多 5 本，优先挑有封面的作品保证 Banner 视觉质量
 */

const DAY_MS = 24 * 60 * 60 * 1000
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000

/** 当前所处的 UTC+8 自然周编号（周一为一周起点），跨周自动变化即实现"每周重置" */
export function getWeekKey(now = new Date()): string {
  const shifted = now.getTime() + UTC8_OFFSET_MS
  const days = Math.floor(shifted / DAY_MS)
  // 1970-01-01 是周四，+3 让周一对齐到周期起点
  const weekIndex = Math.floor((days + 3) / 7)
  return `week-${weekIndex}`
}

/** 确定性字符串哈希（FNV-1a），用于给“作品 × 周期”生成稳定的轮换扰动 */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 更新活跃度：越近更新得分越高，两周外快速衰减 */
export function updateRecencyScore(novel: NovelCard, now: number): number {
  const lastPublished = novel.lastPublishedAt ?? novel.updatedAt
  const elapsedDays = Math.max(0, (now - new Date(lastPublished).getTime()) / DAY_MS)
  if (elapsedDays <= 1) return 40
  if (elapsedDays <= 3) return 32
  if (elapsedDays <= 7) return 24
  if (elapsedDays <= 14) return 14
  return Math.max(0, 8 - elapsedDays / 10)
}

/** 篇幅得分：有一定体量的作品更值得力推，10 万字后收益封顶 */
export function lengthScore(novel: NovelCard): number {
  const words = Math.max(0, novel.wordCount)
  const chapters = Math.max(0, novel.chapterCount)
  return Math.min(20, words / 5000) * 0.7 + Math.min(10, chapters) * 0.3
}

function weeklyScore(novel: NovelCard, weekKey: string, now: number): number {
  const views = novel.viewCount ?? 0
  const comments = novel.commentCount ?? 0
  const likes = novel.likeCount ?? 0
  const favorites = novel.favoriteCount ?? 0

  // 热度主项 + 更新/篇幅辅助项
  const base =
    Math.log1p(views) * 12 +
    Math.log1p(comments) * 10 +
    Math.log1p(likes) * 7 +
    Math.log1p(favorites) * 8 +
    updateRecencyScore(novel, now) +
    lengthScore(novel)

  // 每周扰动：让排名接近的作品在不同周之间轮换露出，同一周内保持固定
  const jitter = (hashSeed(`${weekKey}:${novel.id}`) % 1000) / 1000
  return base + jitter * 12
}

/** 从候选池挑出本周力荐，最多 limit 本；封面作品优先，数量不足时用无封面作品补齐 */
export function buildWeeklyPicks(pool: NovelCard[], limit = 5): NovelCard[] {
  if (pool.length === 0) return []

  const weekKey = getWeekKey()
  const now = Date.now()
  const ranked = [...pool].sort(
    (left, right) => weeklyScore(right, weekKey, now) - weeklyScore(left, weekKey, now),
  )

  const withCover = ranked.filter((novel) => getCoverUrl(novel.coverUrl))
  const withoutCover = ranked.filter((novel) => !getCoverUrl(novel.coverUrl))
  return [...withCover, ...withoutCover].slice(0, limit)
}
