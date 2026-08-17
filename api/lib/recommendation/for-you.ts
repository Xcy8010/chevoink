/**
 * 服务端个性化「为你推荐」（推荐算法优化方案 Phase 1）：
 * 候选召回 → 加权精排 → 多样性重排 → 理由生成。
 * - 召回源：标签兴趣 / 作者亲和 / 全局质量 / 新鲜度 / 探索（共读矩阵按方案排期留 Phase 2）；
 * - 精排：personalScore = 0.45×interest + 0.15×author + 0.20×quality + 0.10×fresh + 0.10×explore（方案 §4.1）；
 * - 重排：同作者最多 2 本、同主标签连续不超过 2 本（方案 §7.2）；
 * - 冷启动（无画像）降级为全局质量 + 新鲜度（方案 §8.1）；
 * - 过滤：已读、明确不感兴趣、调用方排除位（方案 §5.2）。
 */
import { randomUUID } from 'node:crypto'

import type { Prisma } from '@prisma/client'
import type { ForYouItem, ForYouPayload, ForYouSource } from '../../../shared/contracts/recommendation.js'
import {
  hotScore,
  RECOMMEND_ALGORITHM_VERSIONS,
  updateRecencyScore,
} from '../../../shared/recommend/scoring.js'
import { novelInclude, toNovelCard } from '../data/internal.js'
import { searchableNovelWhere } from '../data/search.js'
import { prisma } from '../prisma.js'
import { buildUserProfile, type UserProfile } from './profile.js'

const FOR_YOU_LIMIT = 8
/** 重排约束：同作者最多展示 2 本（方案 §7.2） */
const MAX_PER_AUTHOR = 2
/** 重排约束：同主标签连续不超过 2 本 */
const MAX_CONSECUTIVE_SAME_TAG = 2

type CandidateRecord = Prisma.NovelGetPayload<{ include: typeof novelInclude }>

type ScoredCandidate = {
  record: CandidateRecord
  score: number
  sources: ForYouSource[]
  reasonTag: string | null
  authorAffinity: number
  qualityNorm: number
  freshNorm: number
  interestNorm: number
}

/** 各分量按候选集最大值归一到 [0,1]，避免量纲差异让某一分量独大 */
function normalize(values: number[]): number[] {
  const max = Math.max(...values, 1e-9)
  return values.map((value) => value / max)
}

function scoreCandidates(
  candidates: CandidateRecord[],
  profile: UserProfile | null,
  now: number,
): ScoredCandidate[] {
  const personalized = Boolean(profile?.hasSignals)

  const rawInterest = candidates.map((record) =>
    profile
      ? record.tagNames.reduce((sum, tag) => sum + Math.max(0, profile.tagWeights.get(tag) ?? 0), 0)
      : 0,
  )
  const rawAuthor = candidates.map((record) =>
    profile ? Math.max(0, profile.authorWeights.get(record.authorId) ?? 0) : 0,
  )
  const rawQuality = candidates.map((record) => hotScore(record, now))
  const rawFresh = candidates.map((record) => updateRecencyScore(record, now))
  // 探索分：画像存在且候选与用户兴趣标签无交集时给探索奖励；冷启动时不探索（先给热门优质）
  const rawExplore = candidates.map((record) => {
    if (!profile?.hasSignals) return 0
    const overlaps = record.tagNames.some((tag) => (profile.tagWeights.get(tag) ?? 0) > 0)
    return overlaps ? 0 : 1
  })

  const interestN = normalize(rawInterest)
  const authorN = normalize(rawAuthor)
  const qualityN = normalize(rawQuality)
  const freshN = normalize(rawFresh)
  const exploreN = normalize(rawExplore)

  return candidates.map((record, index) => {
    const score = personalized
      ? 0.45 * interestN[index] +
        0.15 * authorN[index] +
        0.2 * qualityN[index] +
        0.1 * freshN[index] +
        0.1 * exploreN[index]
      : // 冷启动：全局质量为主 + 新鲜度辅助（方案 §8.1 降级顺序）
        0.8 * qualityN[index] + 0.2 * freshN[index]

    const sources: ForYouSource[] = []
    if (interestN[index] > 0) sources.push('tag-interest')
    if (authorN[index] > 0) sources.push('author-affinity')
    if (qualityN[index] >= 0.5) sources.push('quality')
    if (freshN[index] >= 0.5) sources.push('fresh')
    if (exploreN[index] > 0) sources.push('explore')
    if (sources.length === 0) sources.push('quality')

    // 理由锚点：候选标签中用户兴趣权重最高的那个（必须来自真实特征，方案 §11.3）
    let reasonTag: string | null = null
    if (profile?.hasSignals) {
      let best = 0
      for (const tag of record.tagNames) {
        const weight = profile.tagWeights.get(tag) ?? 0
        if (weight > best) {
          best = weight
          reasonTag = tag
        }
      }
    }

    return {
      record,
      score,
      sources,
      reasonTag,
      authorAffinity: rawAuthor[index],
      qualityNorm: qualityN[index],
      freshNorm: freshN[index],
      interestNorm: interestN[index],
    }
  })
}

/** 多样性重排：同作者 ≤ 2、同主标签连续 ≤ 2（方案 §7.2） */
function rerankForDiversity(scored: ScoredCandidate[], limit: number): ScoredCandidate[] {
  const authorCount = new Map<string, number>()
  const picked: ScoredCandidate[] = []

  for (const candidate of scored) {
    if (picked.length >= limit) break
    const authorId = candidate.record.authorId
    if ((authorCount.get(authorId) ?? 0) >= MAX_PER_AUTHOR) continue

    const mainTag = candidate.record.tagNames[0] ?? ''
    const tail = picked.slice(-MAX_CONSECUTIVE_SAME_TAG)
    if (
      tail.length === MAX_CONSECUTIVE_SAME_TAG &&
      tail.every((item) => (item.record.tagNames[0] ?? '') === mainTag)
    ) {
      continue
    }

    authorCount.set(authorId, (authorCount.get(authorId) ?? 0) + 1)
    picked.push(candidate)
  }

  // 约束过紧导致数量不足时，放宽约束按分数补齐
  if (picked.length < limit) {
    const pickedIds = new Set(picked.map((item) => item.record.id))
    for (const candidate of scored) {
      if (picked.length >= limit) break
      if (!pickedIds.has(candidate.record.id)) picked.push(candidate)
    }
  }

  return picked
}

/** 推荐理由：只使用真实特征生成（方案 §11.3） */
function buildReason(candidate: ScoredCandidate, personalized: boolean): string {
  if (personalized) {
    if (candidate.reasonTag) return `因为你喜欢「${candidate.reasonTag}」`
    if (candidate.authorAffinity > 0) return '你关注的作者或收藏过的作者新作'
  }
  if (candidate.freshNorm >= 0.5) return '近期更新活跃的作品'
  if (candidate.qualityNorm >= 0.5) return '读者热度较高的作品'
  return '为你探索不同题材'
}

export async function buildForYouPayload(
  userId: string | null,
  excludeIds: string[] = [],
): Promise<ForYouPayload> {
  const now = Date.now()
  const profile = userId ? await buildUserProfile(userId) : null

  // 候选池：近期更新 ∪ 历史热门双通道去重（与首页候选池同语义）
  const [recentPool, popularPool] = await prisma.$transaction([
    prisma.novel.findMany({
      include: novelInclude,
      where: searchableNovelWhere,
      orderBy: [{ lastPublishedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 150,
    }),
    prisma.novel.findMany({
      include: novelInclude,
      where: searchableNovelWhere,
      orderBy: [{ viewCount: 'desc' }, { favoriteCount: 'desc' }],
      take: 150,
    }),
  ])
  const poolById = new Map<string, CandidateRecord>()
  for (const record of [...popularPool, ...recentPool]) {
    if (!poolById.has(record.id)) poolById.set(record.id, record)
  }

  // 过滤：已读 / 不感兴趣 / 调用方排除位（方案 §5.2）
  const excluded = new Set([
    ...excludeIds,
    ...(profile?.readNovelIds ?? []),
    ...(profile?.dismissedNovelIds ?? []),
  ])
  const candidates = [...poolById.values()].filter((record) => !excluded.has(record.id))

  const scored = scoreCandidates(candidates, profile, now).sort(
    (left, right) => right.score - left.score,
  )
  const picked = rerankForDiversity(scored, FOR_YOU_LIMIT)
  const personalized = Boolean(profile?.hasSignals)

  const items: ForYouItem[] = picked.map((candidate) => ({
    novel: toNovelCard(candidate.record),
    reason: buildReason(candidate, personalized),
    sources: candidate.sources,
    score: Number(candidate.score.toFixed(4)),
  }))

  return {
    sessionId: randomUUID(),
    algorithmVersion: RECOMMEND_ALGORITHM_VERSIONS.forYou,
    personalized,
    items,
  }
}
