import type { NovelCard } from '../../../shared/contracts/index.js'

import { getAllReadingProgress } from '@/features/home/reading-progress'

import { getSafeTags } from './api'
import { hotScore } from './ranking'

/**
 * 发现页推荐算法：
 * 1. 取本地最近阅读的 5 本书，按最近程度赋权（越新权重越高）
 * 2. 把这些书的标签累加成用户口味画像（tag -> 权重）
 * 3. 候选池按标签命中加权打分，同分再按热度排序
 * 4. 没有阅读记录（或标签无法匹配）时退化为随机挑选
 */

/** 最近阅读取样数量与对应权重（索引越小越新） */
const RECENT_SAMPLE_WEIGHTS = [3, 2.5, 2, 1.5, 1]

export type RecommendResult = {
  novels: NovelCard[]
  /** 是否命中了用户口味（用于展示推荐依据文案） */
  personalized: boolean
}

/** Fisher-Yates 洗牌，返回新数组不改原数组 */
function shuffle<T>(list: T[]): T[] {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** 从本地阅读进度构建用户口味画像：tag -> 累计权重 */
function buildTasteProfile(pool: NovelCard[]): { tagWeights: Map<string, number>; readIds: Set<string> } {
  const tagWeights = new Map<string, number>()
  const readIds = new Set<string>()

  const entries = Object.values(getAllReadingProgress()).sort((left, right) => right.updatedAt - left.updatedAt)

  entries.forEach((entry) => readIds.add(entry.novelId))

  entries.slice(0, RECENT_SAMPLE_WEIGHTS.length).forEach((entry, index) => {
    const novel = pool.find((item) => item.id === entry.novelId)
    if (!novel) return
    const weight = RECENT_SAMPLE_WEIGHTS[index]
    getSafeTags(novel.tags).forEach((tag) => {
      tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight)
    })
  })

  return { tagWeights, readIds }
}

/**
 * 生成推荐作品：优先推荐口味相符且没读过的书，数量不足时依次用随机候选、已读书目补齐。
 * @param pool 候选作品池（已过滤草稿）
 * @param limit 推荐数量
 * @param excludeIds 需要排除的作品（如页面主推位已展示的书，避免重复露出）
 */
export function buildRecommendedNovels(pool: NovelCard[], limit = 4, excludeIds: string[] = []): RecommendResult {
  if (pool.length === 0) return { novels: [], personalized: false }

  const excluded = new Set(excludeIds)
  const { tagWeights, readIds } = buildTasteProfile(pool)

  // 优先候选：没读过也没在页面其它位置露出的书
  const candidates = pool.filter((novel) => !excluded.has(novel.id) && !readIds.has(novel.id))

  const scoreOf = (novel: NovelCard) =>
    getSafeTags(novel.tags).reduce((sum, tag) => sum + (tagWeights.get(tag) ?? 0), 0)

  const picked: NovelCard[] = []
  let personalized = false

  if (tagWeights.size > 0) {
    const scored = candidates
      .map((novel) => ({ novel, score: scoreOf(novel) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || hotScore(right.novel) - hotScore(left.novel))

    personalized = scored.length > 0
    picked.push(...scored.slice(0, limit).map((item) => item.novel))
  }

  // 口味命中不足时，用剩余候选随机补齐
  if (picked.length < limit) {
    const pickedIds = new Set(picked.map((novel) => novel.id))
    const rest = shuffle(candidates.filter((novel) => !pickedIds.has(novel.id)))
    picked.push(...rest.slice(0, limit - picked.length))
  }

  // 候选池太小（书都读过/被排除）时，从剩余全量作品按热度补齐
  if (picked.length < limit) {
    const pickedIds = new Set(picked.map((novel) => novel.id))
    const fallback = pool
      .filter((novel) => !pickedIds.has(novel.id))
      .sort((left, right) => hotScore(right) - hotScore(left))
    picked.push(...fallback.slice(0, limit - picked.length))
  }

  return { novels: picked.slice(0, limit), personalized }
}
