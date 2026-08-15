/**
 * 首页聚合域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import type { NovelCard } from '../../../shared/contracts/index.js'
import { prisma } from '../prisma.js'
import { novelInclude, postInclude, toNovelCard, toPost, toTopic } from './internal.js'
import { attachPostViewerFlags, computePostRecommendScore, getViewerPostFlags } from './post.js'
import { searchableNovelWhere } from './search.js'



async function buildHomePayload() {
  const [novelPool, hotTopics, hotPostRecords] = await prisma.$transaction([
    // 候选池：只取公开且已发布/已完结、且至少有一个公开章节的作品，榜单在内存中加权计算
    prisma.novel.findMany({
      include: novelInclude,
      where: searchableNovelWhere,
      orderBy: [{ lastPublishedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 120,
    }),
    prisma.topic.findMany({
      orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
      take: 8,
    }),
    prisma.post.findMany({
      include: postInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    }),
  ])

  const cards = novelPool.map((record) => toNovelCard(record))
  const now = Date.now()

  // 热度分：互动加权（阅读1/点赞3/评论4/收藏5）+ 内容规模基础分，除以时间衰减（参考主流阅读平台的 gravity 榜单）
  const hotScore = (novel: (typeof cards)[number]) => {
    const engagement =
      (novel.viewCount ?? 0) + (novel.likeCount ?? 0) * 3 + (novel.commentCount ?? 0) * 4 + (novel.favoriteCount ?? 0) * 5
    const substance = Math.min(novel.chapterCount, 50) * 2 + Math.min(novel.wordCount / 10000, 30)
    const lastActive = new Date(novel.lastPublishedAt ?? novel.updatedAt).getTime()
    const ageDays = Math.max(0, (now - lastActive) / 86_400_000)
    return (engagement + substance) / Math.pow(ageDays + 2, 1.4)
  }

  // 完结榜看累计口碑，不做时间衰减
  const totalScore = (novel: (typeof cards)[number]) =>
    (novel.viewCount ?? 0) + (novel.likeCount ?? 0) * 3 + (novel.commentCount ?? 0) * 4 + (novel.favoriteCount ?? 0) * 5 + novel.wordCount / 10000

  const rankingHot = [...cards].sort((left, right) => hotScore(right) - hotScore(left)).slice(0, 10)
  const rankingNew = [...cards]
    .sort(
      (left, right) =>
        new Date(right.publishedAt ?? right.updatedAt).getTime() - new Date(left.publishedAt ?? left.updatedAt).getTime(),
    )
    .slice(0, 10)
  const finished = cards.filter((novel) => novel.status === 'completed')
  const rankingFinished = finished.sort((left, right) => totalScore(right) - totalScore(left)).slice(0, 10)

  const latestUpdated = [...cards]
    .sort(
      (left, right) =>
        new Date(right.lastPublishedAt ?? right.updatedAt).getTime() - new Date(left.lastPublishedAt ?? left.updatedAt).getTime(),
    )
    .slice(0, 8)

  // 热门讨论：与社区推荐流同一套打分，服务端即唯一排序来源（方案 18 §2.3）
  const hotPosts = hotPostRecords
    .map((record) => ({ record, score: computePostRecommendScore(record, now) }))
    .sort((a, b) => b.score - a.score || b.record.createdAt.getTime() - a.record.createdAt.getTime())
    .slice(0, 8)
    .map((entry) => toPost(entry.record))

  return {
    continueReading: latestUpdated.slice(0, 1),
    recommendedNovels: rankingHot.slice(0, 8),
    latestUpdatedNovels: latestUpdated,
    rankingHot,
    rankingNew,
    rankingFinished,
    hotTopics: hotTopics.map(toTopic),
    hotPosts,
  }
}



/** 首页榜单 60s 内存缓存：只缓存与 viewer 无关的基础 payload，viewer flags 每请求另行附加 */
const HOME_PAYLOAD_CACHE_TTL_MS = 60_000


let homePayloadCache: { payload: Awaited<ReturnType<typeof buildHomePayload>>; expiresAt: number } | null = null



export async function getHomePayloadData(viewerUserId?: string | null) {
  const nowMs = Date.now()
  if (!homePayloadCache || homePayloadCache.expiresAt <= nowMs) {
    homePayloadCache = { payload: await buildHomePayload(), expiresAt: nowMs + HOME_PAYLOAD_CACHE_TTL_MS }
  }

  const payload = homePayloadCache.payload
  const flags = await getViewerPostFlags(
    viewerUserId,
    payload.hotPosts.map((post) => post.id),
  )

  return {
    ...payload,
    hotPosts: payload.hotPosts.map((post) => attachPostViewerFlags(post, flags)),
  }
}



/**
 * 批量拉取作品卡片（首页继续阅读等轻量场景，方案 20 §2.5）：
 * 一次查询代替逐本拉完整详情；可见性口径与详情页一致（公开作品或 viewer 自己的作品），
 * 已下架/无权限的静默过滤，返回顺序与传入 id 顺序一致。
 */
export async function listNovelCardsByIdsData(
  novelIds: string[],
  viewerUserId?: string | null,
): Promise<NovelCard[]> {
  const ids = [...new Set(novelIds.filter(Boolean))].slice(0, 20)
  if (ids.length === 0) {
    return []
  }

  const records = await prisma.novel.findMany({
    where: {
      id: { in: ids },
      OR: [searchableNovelWhere, ...(viewerUserId ? [{ authorId: viewerUserId }] : [])],
    },
    include: novelInclude,
  })

  const cardById = new Map(records.map((record) => [record.id, toNovelCard(record, viewerUserId)]))
  return ids
    .map((id) => cardById.get(id))
    .filter((card): card is NovelCard => Boolean(card))
}
