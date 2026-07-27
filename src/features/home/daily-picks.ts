import { getCoverUrl } from '@/features/discover/api'
import type { NovelCard } from '../../../shared/contracts/index.js'

import { hashSeed, lengthScore, updateRecencyScore } from './weekly-picks'

/**
 * 每日精选（精选好书数据源）：
 * - 按热度信号打分：阅读人数、评论、点赞收藏、章节更新活跃度、篇幅
 * - 以 UTC+8 的自然日（每天 00:00 重置）作为随机种子，同一天内所有人看到固定的一批
 * - 固定选 4 本，优先挑有封面的作品保证书封视觉质量
 */

const DAY_MS = 24 * 60 * 60 * 1000
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000

/** 当前所处的 UTC+8 自然日编号，跨天自动变化即实现"每日重置" */
export function getDayKey(now = new Date()): string {
  const dayIndex = Math.floor((now.getTime() + UTC8_OFFSET_MS) / DAY_MS)
  return `day-${dayIndex}`
}

function dailyScore(novel: NovelCard, dayKey: string, now: number): number {
  const views = novel.viewCount ?? 0
  const comments = novel.commentCount ?? 0
  const likes = novel.likeCount ?? 0
  const favorites = novel.favoriteCount ?? 0

  // 阅读人数、评论为主项，章节更新活跃度与篇幅为辅助项
  const base =
    Math.log1p(views) * 12 +
    Math.log1p(comments) * 10 +
    Math.log1p(likes) * 7 +
    Math.log1p(favorites) * 8 +
    updateRecencyScore(novel, now) +
    lengthScore(novel)

  // 每日扰动：让排名接近的作品在不同天之间轮换露出，同一天内保持固定
  const jitter = (hashSeed(`${dayKey}:${novel.id}`) % 1000) / 1000
  return base + jitter * 10
}

/** 从候选池挑出今日精选，最多 limit 本；封面作品优先，数量不足时用无封面作品补齐 */
export function buildDailyPicks(pool: NovelCard[], limit = 4): NovelCard[] {
  if (pool.length === 0) return []

  const dayKey = getDayKey()
  const now = Date.now()
  const ranked = [...pool].sort(
    (left, right) => dailyScore(right, dayKey, now) - dailyScore(left, dayKey, now),
  )

  const withCover = ranked.filter((novel) => getCoverUrl(novel.coverUrl))
  const withoutCover = ranked.filter((novel) => !getCoverUrl(novel.coverUrl))
  return [...withCover, ...withoutCover].slice(0, limit)
}
