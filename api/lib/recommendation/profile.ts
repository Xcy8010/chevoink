/**
 * 用户兴趣画像（推荐算法优化方案 Phase 1）：
 * 汇总服务端强信号（阅读进度/收藏/关注作者）与推荐行为事件，
 * 按方案 §4.1 interest(user, tag) = Σ behaviorWeight × exp(-ageDays/30) 做时间衰减；
 * 负反馈（dismiss/abandon）对作品本身与标签产生长期抑制权重。
 * 所有作品标签/作者一次批量查询，避免逐条 N+1（方案 §11.4）。
 */
import { DAY_MS } from '../../../shared/recommend/scoring.js'
import { prisma } from '../prisma.js'

export type UserProfile = {
  /** tag -> 累计兴趣权重（可为负，负值表示抑制） */
  tagWeights: Map<string, number>
  /** authorId -> 累计作者亲和权重 */
  authorWeights: Map<string, number>
  /** 已读作品（召回时过滤，避免重复推已读） */
  readNovelIds: Set<string>
  /** 明确不感兴趣/弃读作品（召回时过滤并抑制相似标签） */
  dismissedNovelIds: Set<string>
  /** 是否有可用正信号（决定个性化还是冷启动降级） */
  hasSignals: boolean
}

/** 行为事件回看窗口：90 天（更久的事件靠衰减自然归零） */
const PROFILE_EVENT_LOOKBACK_DAYS = 90

function decay(ageDays: number): number {
  return Math.exp(-ageDays / 30)
}

export async function buildUserProfile(userId: string): Promise<UserProfile> {
  const now = Date.now()
  const lookback = new Date(now - PROFILE_EVENT_LOOKBACK_DAYS * DAY_MS)

  const [progressRows, favoriteRows, followRows, eventRows] = await prisma.$transaction([
    prisma.readingProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { novelId: true, scrollPercent: true, chapterOrder: true, totalChapters: true, updatedAt: true },
    }),
    prisma.novelFavorite.findMany({
      where: { userId },
      select: { novelId: true, createdAt: true },
    }),
    prisma.userFollow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
    prisma.recommendationEvent.findMany({
      where: { userId, createdAt: { gte: lookback } },
      select: { eventType: true, novelId: true, progressPercent: true, createdAt: true },
    }),
  ])

  // 涉及作品批量取标签/作者
  const novelIds = [
    ...new Set([
      ...progressRows.map((row) => row.novelId),
      ...favoriteRows.map((row) => row.novelId),
      ...eventRows.map((row) => row.novelId),
    ]),
  ]
  const novelRows =
    novelIds.length > 0
      ? await prisma.novel.findMany({
          where: { id: { in: novelIds } },
          select: { id: true, tagNames: true, authorId: true },
        })
      : []
  const novelById = new Map(novelRows.map((novel) => [novel.id, novel]))

  const tagWeights = new Map<string, number>()
  const authorWeights = new Map<string, number>()
  const readNovelIds = new Set<string>()
  const dismissedNovelIds = new Set<string>()

  const addTagWeights = (tags: string[], weight: number) => {
    for (const tag of tags) {
      tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight)
    }
  }

  // 阅读进度：进度 ≥ 80% 记 +4（接近完读），否则 +1（有效开始阅读），均带时间衰减
  for (const row of progressRows) {
    readNovelIds.add(row.novelId)
    const novel = novelById.get(row.novelId)
    if (!novel) continue
    const progress =
      row.totalChapters > 0
        ? Math.max(row.scrollPercent, (row.chapterOrder / row.totalChapters) * 100)
        : row.scrollPercent
    const weight = progress >= 80 ? 4 : 1
    addTagWeights(novel.tagNames, weight * decay(Math.max(0, (now - row.updatedAt.getTime()) / DAY_MS)))
  }

  // 收藏 +5（强意愿行为），顺带给作者 +2 亲和
  for (const row of favoriteRows) {
    const novel = novelById.get(row.novelId)
    if (!novel) continue
    addTagWeights(novel.tagNames, 5 * decay(Math.max(0, (now - row.createdAt.getTime()) / DAY_MS)))
    authorWeights.set(novel.authorId, (authorWeights.get(novel.authorId) ?? 0) + 2)
  }

  // 关注作者 +4（长期偏好）
  for (const row of followRows) {
    authorWeights.set(row.followingId, (authorWeights.get(row.followingId) ?? 0) + 4)
  }

  // 行为事件：完读+6 / 进度+4|+2 / 开始阅读+1 / 点击+0.3 / 收藏+5；不感兴趣/弃读 -5 并抑制
  for (const row of eventRows) {
    const novel = novelById.get(row.novelId)
    const ageDays = Math.max(0, (now - row.createdAt.getTime()) / DAY_MS)

    if (row.eventType === 'dismiss' || row.eventType === 'abandon') {
      dismissedNovelIds.add(row.novelId)
      if (novel) addTagWeights(novel.tagNames, -5 * decay(ageDays))
      continue
    }

    let weight = 0
    if (row.eventType === 'finish') weight = 6
    else if (row.eventType === 'progress')
      weight = (row.progressPercent ?? 0) >= 80 ? 4 : (row.progressPercent ?? 0) >= 20 ? 2 : 1
    else if (row.eventType === 'start-read') weight = 1
    else if (row.eventType === 'click') weight = 0.3
    else if (row.eventType === 'favorite') weight = 5
    if (weight === 0 || !novel) continue
    addTagWeights(novel.tagNames, weight * decay(ageDays))
  }

  const hasSignals =
    [...tagWeights.values()].some((weight) => weight > 0) || [...authorWeights.values()].some((weight) => weight > 0)

  return { tagWeights, authorWeights, readNovelIds, dismissedNovelIds, hasSignals }
}
