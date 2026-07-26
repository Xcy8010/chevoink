import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  asArray,
  getHomePayload,
  getNovelDetailPayload,
} from '@/features/discover/api'
import { getAllReadingProgress, type ReadingProgressEntry } from '@/features/home/reading-progress'
import { readContinueCards, writeContinueCards } from '@/features/home/continue-cache'
import { buildWeeklyPicks } from '@/features/home/weekly-picks'
import { PRIMARY_CATEGORIES } from '@/lib/novel-tags'
import type { NovelCard, Post, TopicSummary } from '../../../shared/contracts/index.js'

export type HomeData = {
  bannerNovels: NovelCard[]
  continueReading: NovelCard[]
  featuredNovels: NovelCard[]
  rankingHot: NovelCard[]
  rankingNew: NovelCard[]
  rankingFinished: NovelCard[]
  latestUpdated: NovelCard[]
  hotPosts: Post[]
  hotTopics: TopicSummary[]
  categories: string[]
  progressMap: Record<string, ReadingProgressEntry>
}

const FALLBACK_CATEGORIES = PRIMARY_CATEGORIES

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

/** 社区热议：只推两周内有动静的帖子，按互动热度加新鲜度排序；两周内无帖时回退到最新帖 */
function rankHotPosts(posts: Post[]): Post[] {
  const now = Date.now()
  const recent = posts.filter((post) => {
    const activeAt = new Date(post.updatedAt ?? post.createdAt).getTime()
    return now - activeAt <= TWO_WEEKS_MS
  })
  const pool = recent.length > 0 ? recent : posts

  const score = (post: Post) => {
    const activeAt = new Date(post.updatedAt ?? post.createdAt).getTime()
    const freshDays = Math.max(0, (now - activeAt) / (24 * 60 * 60 * 1000))
    // 评论权重最高（代表讨论度），其次点赞收藏，再叠加时间衰减
    return post.commentCount * 4 + post.likeCount * 3 + post.favoriteCount * 3 + Math.max(0, 14 - freshDays)
  }

  return [...pool].sort((left, right) => score(right) - score(left))
}

function dedupeNovels(novels: NovelCard[]): NovelCard[] {
  return novels.filter((novel, index, list) => list.findIndex((item) => item.id === novel.id) === index)
}

/** 首页共享数据层：三个布局共用，不随设备切换重复请求 */
export function useHomeData() {
  const query = useQuery({
    queryKey: ['home'],
    queryFn: getHomePayload,
  })

  // 继续阅读：以本地阅读进度为准，按最近阅读时间倒序取前 5 本（服务端 continueReading 只是占位数据）
  const progressMap = useMemo(() => getAllReadingProgress(), [])
  const recentNovelIds = useMemo(
    () =>
      Object.values(progressMap)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 5)
        .map((entry) => entry.novelId),
    [progressMap],
  )
  const continueQuery = useQuery({
    queryKey: ['home-continue-reading', recentNovelIds],
    enabled: recentNovelIds.length > 0,
    // 先用上次缓存的卡片立即渲染，避免刷新后继续阅读区域延迟一秒才出现
    placeholderData: () => {
      const cached = readContinueCards().filter((card) => recentNovelIds.includes(card.id))
      if (cached.length === 0) return undefined
      return cached.sort((left, right) => recentNovelIds.indexOf(left.id) - recentNovelIds.indexOf(right.id))
    },
    queryFn: async () => {
      // 逐本拉取详情拿到完整卡片（进度里的书不一定在首页榜单池内），已下架/无权限的静默跳过
      const results = await Promise.allSettled(recentNovelIds.map((id) => getNovelDetailPayload(id)))
      const cards = results
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof getNovelDetailPayload>>> => result.status === 'fulfilled')
        .map((result) => result.value.novel as NovelCard)
      writeContinueCards(cards)
      return cards
    },
  })

  const data = useMemo<HomeData | null>(() => {
    if (!query.data) return null

    const notDraft = (novel: NovelCard) => novel.status !== 'draft'
    const continueReading = asArray(continueQuery.data).filter(notDraft)
    const recommended = asArray(query.data.recommendedNovels).filter(notDraft)
    const latest = asArray(query.data.latestUpdatedNovels).filter(notDraft)
    const serverHot = asArray(query.data.rankingHot as NovelCard[] | undefined).filter(notDraft)
    const serverNew = asArray(query.data.rankingNew as NovelCard[] | undefined).filter(notDraft)
    const serverFinished = asArray(query.data.rankingFinished as NovelCard[] | undefined).filter(notDraft)
    const hotPosts = rankHotPosts(asArray(query.data.hotPosts))
    const hotTopics = asArray(query.data.hotTopics)

    const all = dedupeNovels([...recommended, ...serverHot, ...serverNew, ...latest, ...continueReading])

    // Banner：每周力荐算法选出固定 5 本（UTC+8 自然周重置），候选范围覆盖全部榜单
    const bannerNovels = buildWeeklyPicks(dedupeNovels([...recommended, ...latest, ...all]), 5)

    // 精选推荐：服务端热度推荐去掉 Banner 已展示的
    const bannerIds = new Set(bannerNovels.map((novel) => novel.id))
    const featuredNovels = dedupeNovels([...recommended, ...latest]).filter((novel) => !bannerIds.has(novel.id))

    // 榜单：优先用服务端加权榜单，缺失时回退到客户端排序
    const rankingHot = serverHot.length > 0 ? serverHot.slice(0, 10) : dedupeNovels([...recommended, ...all]).slice(0, 10)
    const rankingNew = serverNew.length > 0
      ? serverNew.slice(0, 10)
      : [...all]
          .sort((left, right) => new Date(right.lastPublishedAt ?? right.updatedAt).getTime() - new Date(left.lastPublishedAt ?? left.updatedAt).getTime())
          .slice(0, 10)
    const finished = all.filter((novel) => novel.status === 'archived')
    const rankingFinished = serverFinished.length > 0
      ? serverFinished.slice(0, 10)
      : (finished.length > 0 ? finished : [...all].sort((left, right) => right.wordCount - left.wordCount)).slice(0, 10)

    // 分类频道：统一标签体系全量覆盖，与作品设置可选标签保持一致
    const categories = FALLBACK_CATEGORIES

    return {
      bannerNovels: bannerNovels.length > 0 ? bannerNovels : all.slice(0, 3),
      continueReading,
      featuredNovels,
      rankingHot,
      rankingNew,
      rankingFinished,
      latestUpdated: latest.slice(0, 8),
      hotPosts,
      hotTopics,
      categories,
      progressMap,
    }
  }, [query.data, continueQuery.data, progressMap])

  return { ...query, data }
}
