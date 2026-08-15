/**
 * 搜索域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import type { Prisma } from '@prisma/client'
import type { HotSearchPayload, SearchResultPayload, SearchSuggestItem, SearchSuggestPayload } from '../../../shared/contracts/index.js'
import { ALL_NOVEL_TAGS } from '../../../shared/contracts/novel-tags.js'
import { prisma } from '../prisma.js'
import { excerptContent, novelInclude, postInclude, toNovelCard, toPost, toUserSummary } from './internal.js'
import { publicChapterWhere } from './chapter.js'



/** 公开可搜索的作品过滤条件：与首页榜单候选池口径一致；
 * 额外要求至少有一个公开章节，避免发布后又全部设为仅自己可见的空壳作品对外展示 */
export const searchableNovelWhere = {
  visibility: 'public',
  status: { in: ['published', 'completed', 'archived'] },
  chapters: { some: publicChapterWhere },
} satisfies Prisma.NovelWhereInput



function buildNovelKeywordWhere(keyword: string): Prisma.NovelWhereInput {
  // 标签支持部分匹配：搜“言情”也能命中打了“古代言情”“现代言情”标签的作品
  const matchedTags = ALL_NOVEL_TAGS.filter((tag) => tag.includes(keyword))

  return {
    ...searchableNovelWhere,
    OR: [
      { title: { contains: keyword, mode: 'insensitive' } },
      { displayTitle: { contains: keyword, mode: 'insensitive' } },
      { tagNames: { has: keyword } },
      ...(matchedTags.length > 0 ? [{ tagNames: { hasSome: matchedTags } }] : []),
      // 搜作者名也能带出他的作品
      { author: { nickname: { contains: keyword, mode: 'insensitive' } } },
    ],
  }
}



/** 帖子关键词条件：正文命中或发帖人昵称命中（搜用户名也能带出他的讨论） */
function buildPostKeywordWhere(keyword: string): Prisma.PostWhereInput {
  return {
    OR: [
      { content: { contains: keyword, mode: 'insensitive' } },
      { author: { nickname: { contains: keyword, mode: 'insensitive' } } },
    ],
  }
}



function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}



/** 用户昵称模糊检索：先用「整词包含 + 单字包含」宽口径召回候选，
 * 再用子序列正则打分排序，让搜“叙远”也能匹配到“叙尘远”这类不连续命中的昵称；
 * 不再要求必须有公开作品，普通用户也能被搜到 */
async function searchUsersByNickname(keyword: string, take: number) {
  const chars = [...new Set(keyword.split('').filter((char) => char.trim()))].slice(0, 8)
  if (chars.length === 0) {
    return []
  }

  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { nickname: { contains: keyword, mode: 'insensitive' } },
        ...chars.map((char) => ({ nickname: { contains: char, mode: 'insensitive' as const } })),
      ],
    },
    orderBy: [{ followerCount: 'desc' }, { novelCount: 'desc' }],
    take: 80,
  })

  const lowerKeyword = keyword.toLowerCase()
  const subsequencePattern = new RegExp(chars.map((char) => escapeRegExp(char)).join('.*'), 'i')

  return candidates
    .map((user) => {
      const nickname = user.nickname.toLowerCase()
      const hitCount = chars.filter((char) => nickname.includes(char.toLowerCase())).length
      // 整词包含 > 子序列命中 > 多数字符命中，其余候选丢弃避免单字误命中满屏噪声
      const score = nickname.includes(lowerKeyword)
        ? 3
        : subsequencePattern.test(user.nickname)
          ? 2
          : hitCount >= Math.max(2, Math.ceil(chars.length / 2))
            ? 1
            : 0
      return { user, score, hitCount }
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.hitCount - a.hitCount || b.user.followerCount - a.user.followerCount,
    )
    .slice(0, take)
    .map((entry) => entry.user)
}



/** 搜索联想：轻量返回书名 / 作者 / 帖子的前几条候选 */
export async function searchSuggestData(keyword: string): Promise<SearchSuggestPayload> {
  const normalized = keyword.trim()
  if (!normalized) {
    return { items: [] }
  }

  const [novels, authors, posts] = await Promise.all([
    prisma.novel.findMany({
      where: buildNovelKeywordWhere(normalized),
      include: novelInclude,
      orderBy: [{ viewCount: 'desc' }, { lastPublishedAt: 'desc' }],
      take: 5,
    }),
    searchUsersByNickname(normalized, 3),
    prisma.post.findMany({
      where: buildPostKeywordWhere(normalized),
      include: postInclude,
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: 3,
    }),
  ])

  const items: SearchSuggestItem[] = [
    ...novels.map((novel) => ({
      type: 'novel' as const,
      id: novel.id,
      text: novel.displayTitle ?? novel.title,
      subText: novel.author?.nickname ?? null,
      imageUrl: novel.coverAsset?.imageUrl ?? null,
    })),
    ...authors.map((user) => ({
      type: 'author' as const,
      id: user.id,
      text: user.nickname,
      subText: user.isAuthor ? '作者' : '用户',
      imageUrl: user.avatarUrl ?? null,
    })),
    ...posts.map((post) => ({
      type: 'post' as const,
      id: post.id,
      text: excerptContent(post.content),
      subText: post.author?.nickname ? `${post.author.nickname} 的讨论` : '讨论',
      imageUrl: null,
    })),
  ]

  return { items }
}



/** 全局搜索：书名 / 作者 / 讨论分组返回 */
export async function searchAllData(keyword: string): Promise<SearchResultPayload> {
  const normalized = keyword.trim()
  if (!normalized) {
    return { novels: [], authors: [], posts: [] }
  }

  const [novels, authors, posts] = await Promise.all([
    prisma.novel.findMany({
      where: buildNovelKeywordWhere(normalized),
      include: novelInclude,
      orderBy: [{ viewCount: 'desc' }, { lastPublishedAt: 'desc' }],
      take: 20,
    }),
    searchUsersByNickname(normalized, 8),
    prisma.post.findMany({
      where: buildPostKeywordWhere(normalized),
      include: postInclude,
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
  ])

  return {
    novels: novels.map((novel) => toNovelCard(novel)),
    authors: authors.map(toUserSummary),
    posts: posts.map(toPost),
  }
}



/** 热搜词：取阅读/收藏热度最高的作品名 */
export async function getHotSearchKeywordsData(): Promise<HotSearchPayload> {
  const novels = await prisma.novel.findMany({
    where: searchableNovelWhere,
    select: { title: true, displayTitle: true },
    orderBy: [{ viewCount: 'desc' }, { favoriteCount: 'desc' }, { lastPublishedAt: 'desc' }],
    take: 8,
  })

  const keywords = [...new Set(novels.map((novel) => (novel.displayTitle ?? novel.title).trim()).filter(Boolean))]

  return { keywords }
}
