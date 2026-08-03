import type { NovelCard } from '../../../shared/contracts/index.js'

/**
 * 榜单算法（与服务端 getHomePayloadData 同源）：
 * - hotScore：互动加权（阅读1/点赞3/评论4/收藏5）+ 内容规模基础分，除以时间衰减
 * - totalScore：累计口碑，不做时间衰减（完结榜）
 */

export const hotScore = (novel: NovelCard) => {
  const engagement =
    (novel.viewCount ?? 0) + (novel.likeCount ?? 0) * 3 + (novel.commentCount ?? 0) * 4 + (novel.favoriteCount ?? 0) * 5
  const substance = Math.min(novel.chapterCount, 50) * 2 + Math.min(novel.wordCount / 10000, 30)
  const ageDays = Math.max(0, (Date.now() - new Date(novel.lastPublishedAt ?? novel.updatedAt).getTime()) / 86_400_000)
  return (engagement + substance) / Math.pow(ageDays + 2, 1.4)
}

export const totalScore = (novel: NovelCard) =>
  (novel.viewCount ?? 0) + (novel.likeCount ?? 0) * 3 + (novel.commentCount ?? 0) * 4 + (novel.favoriteCount ?? 0) * 5 + novel.wordCount / 10000

export type RankingBoardId = 'hot' | 'popular' | 'new' | 'update' | 'long' | 'finished'

export type RankingBoardDef = {
  id: RankingBoardId
  label: string
  description: string
}

/** 完整榜单页的榜单目录（顺序即导航顺序） */
export const RANKING_BOARDS: RankingBoardDef[] = [
  { id: 'hot', label: '热读榜', description: '互动热度加时间衰减，最近读者最上头的作品。' },
  { id: 'popular', label: '人气榜', description: '累计阅读与收藏最高的作品。' },
  { id: 'new', label: '新书榜', description: '最新发布上架的作品，先人一步开坑。' },
  { id: 'update', label: '更新榜', description: '最近仍在稳定推进的作品，追更不断粮。' },
  { id: 'long', label: '长篇榜', description: '篇幅规模领先，适合长线追读的内容。' },
  { id: 'finished', label: '完结榜', description: '已完结的口碑之作，可以一口气读完。' },
]

/** 分类榜频道（与首页分类导航的主流频道对齐），按作品标签匹配 */
export const CATEGORY_RANKING_TAGS = ['玄幻', '都市', '仙侠', '奇幻', '科幻', '悬疑', '历史', '游戏', '古代言情', '现代言情']

/** 分类榜：筛出带该标签的作品，按热度排序取 top N */
export function buildCategoryBoardNovels(tag: string, novels: NovelCard[], limit = 20): NovelCard[] {
  return novels
    .filter((novel) => Array.isArray(novel.tags) && novel.tags.includes(tag))
    .sort((left, right) => hotScore(right) - hotScore(left))
    .slice(0, limit)
}

/** 按榜单 id 对作品池排序取 top N */
export function buildBoardNovels(id: RankingBoardId, novels: NovelCard[], limit = 20): NovelCard[] {
  const pool = [...novels]
  switch (id) {
    case 'hot':
      return pool.sort((left, right) => hotScore(right) - hotScore(left)).slice(0, limit)
    case 'popular':
      return pool
        .sort(
          (left, right) =>
            (right.viewCount ?? 0) + (right.favoriteCount ?? 0) * 5 - ((left.viewCount ?? 0) + (left.favoriteCount ?? 0) * 5),
        )
        .slice(0, limit)
    case 'new':
      return pool
        .sort(
          (left, right) =>
            new Date(right.publishedAt ?? right.updatedAt).getTime() - new Date(left.publishedAt ?? left.updatedAt).getTime(),
        )
        .slice(0, limit)
    case 'update':
      return pool
        .sort(
          (left, right) =>
            new Date(right.lastPublishedAt ?? right.updatedAt).getTime() -
            new Date(left.lastPublishedAt ?? left.updatedAt).getTime(),
        )
        .slice(0, limit)
    case 'long':
      return pool.sort((left, right) => right.wordCount - left.wordCount).slice(0, limit)
    case 'finished':
      return pool
        .filter((novel) => novel.status === 'completed')
        .sort((left, right) => totalScore(right) - totalScore(left))
        .slice(0, limit)
  }
}
