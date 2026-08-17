import { getCoverUrl } from '@/features/discover/api'
import type { NovelCard } from '../../../shared/contracts/index.js'
import { dailyScore, getDayKey, RECOMMEND_ALGORITHM_VERSIONS } from '../../../shared/recommend/scoring.js'

/**
 * 每日精选（精选好书数据源）：
 * - 评分纯函数统一来自 shared/recommend/scoring（与服务端同源，方案 Phase 0）
 * - 以 UTC+8 的自然日（每天 00:00 重置）作为随机种子，同一天内所有人看到固定的一批
 * - 固定选 4 本，优先挑有封面的作品保证书封视觉质量
 */

export { getDayKey }

export const DAILY_PICKS_ALGORITHM_VERSION = RECOMMEND_ALGORITHM_VERSIONS.dailyPicks

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
