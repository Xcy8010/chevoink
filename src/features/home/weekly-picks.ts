import { getCoverUrl } from '@/features/discover/api'
import type { NovelCard } from '../../../shared/contracts/index.js'
import { getWeekKey, weeklyScore, RECOMMEND_ALGORITHM_VERSIONS } from '../../../shared/recommend/scoring.js'

/**
 * 每周力荐（Banner 数据源）：
 * - 评分纯函数统一来自 shared/recommend/scoring（与服务端同源，方案 Phase 0）
 * - 以 UTC+8 的自然周（周一 00:00 重置）作为随机种子，同一周内所有人看到固定的一批
 * - 最多 5 本，优先挑有封面的作品保证 Banner 视觉质量
 */

export { getWeekKey }

export const WEEKLY_PICKS_ALGORITHM_VERSION = RECOMMEND_ALGORITHM_VERSIONS.weeklyPicks

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
