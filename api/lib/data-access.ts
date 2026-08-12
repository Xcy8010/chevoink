import { randomUUID } from 'node:crypto'

import type { Prisma, Visibility as PrismaVisibility } from '@prisma/client'

import type {
  Chapter,
  ChapterListItem,
  Comment,
  CommentTargetType,
  Conversation,
  CoverAsset,
  CreateChapterRequest,
  CreateCommentRequest,
  UpdateCommentRequest,
  CreateNovelRequest,
  CreatePostRequest,
  FollowUserItem,
  HotSearchPayload,
  InteractionBadges,
  InteractionItem,
  Message,
  MessageCard,
  Novel,
  NovelCard,
  NovelDetailPayload,
  Pagination,
  Post,
  PostDetailPayload,
  PrivacyLevel,
  PrivacySettings,
  ProfileVisibility,
  ReaderPayload,
  ReadingProgressItem,
  ReceivedLikeItem,
  SaveReadingProgressRequest,
  SearchResultPayload,
  SearchSuggestItem,
  SearchSuggestPayload,
  SendMessageRequest,
  StudioPayload,
  TopicSummary,
  UpdateChapterRequest,
  UpdateNovelRequest,
  User,
  UserMePayload,
  UserReplyItem,
  UserSummary,
  Visibility,
} from '../../shared/contracts/index.js'
import { ALL_NOVEL_TAGS, NOVEL_TAG_GROUPS } from '../../shared/contracts/novel-tags.js'
import { extractTopicNames } from '../../shared/contracts/topic-parse.js'
import { createUnsetPasswordHash, hashPassword, hasConfiguredPassword, verifyPassword } from './password.js'
import { paginate } from './http.js'
import { storeMessageImageDataUrl } from './message-image-storage.js'
import { storeNovelCoverDataUrl } from './novel-cover-storage.js'
import { normalizePhoneNumber } from './phone.js'
import { DataAccessError, prisma } from './prisma.js'

const novelInclude = {
  author: true,
  coverAsset: true,
} satisfies Prisma.NovelInclude

const postInclude = {
  author: true,
  topic: true,
  relatedNovel: {
    include: {
      coverAsset: true,
      author: true,
    },
  },
  sharedUser: true,
} satisfies Prisma.PostInclude

const commentInclude = {
  author: true,
} satisfies Prisma.CommentInclude

const conversationInclude = {
  members: {
    include: {
      user: true,
    },
  },
} satisfies Prisma.ConversationInclude

function nowIso(): string {
  return new Date().toISOString()
}

// 在线判定：最近 5 分钟内有过带登录态请求（app 层中间件刷新 lastActiveAt）即视为在线
const ONLINE_WINDOW_MS = 5 * 60 * 1000

function isUserOnline(lastActiveAt: Date | string | null | undefined): boolean {
  if (!lastActiveAt) {
    return false
  }
  return Date.now() - new Date(lastActiveAt).getTime() <= ONLINE_WINDOW_MS
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? value : value.toISOString()
}

function buildPagination(page: number, pageSize: number, total: number): Pagination {
  return {
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  }
}

function excerptContent(content: string): string {
  const normalized = content.trim()

  if (normalized.length <= 120) {
    return normalized
  }

  return `${normalized.slice(0, 117)}...`
}

function buildSlug(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || `novel-${Date.now()}`
}

function toUserSummary(user: any): UserSummary {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
    profileCoverUrl: user.profileCoverUrl ?? null,
    bio: user.bio ?? null,
    role: user.role,
    isAuthor: user.isAuthor,
  }
}

function toUser(user: any): User {
  return {
    ...toUserSummary(user),
    email: user.email ?? null,
    phone: user.phone ?? null,
    passwordConfigured: hasConfiguredPassword(user.passwordHash),
    followerCount: user.followerCount ?? 0,
    followingCount: user.followingCount ?? 0,
    novelCount: user.novelCount ?? 0,
    postCount: user.postCount ?? 0,
    unreadMessageCount: user.unreadMessageCount ?? 0,
    unreadNotificationCount: user.unreadNotificationCount ?? 0,
    createdAt: toIso(user.createdAt) ?? nowIso(),
    updatedAt: toIso(user.updatedAt) ?? nowIso(),
  }
}

function toAuthorSummary(user: any, viewerUserId?: string | null) {
  return {
    ...toUserSummary(user),
    followerCount: user.followerCount ?? 0,
    novelCount: user.novelCount ?? 0,
    isFollowed: Boolean(viewerUserId && viewerUserId !== user.id),
  }
}

// 历史自动保存回滚 bug 曾把 title 覆盖回占位默认值，而 displayTitle 里仍保留真实书名；
// 读取时统一归一化，避免作者页/卡片等直接读 title 的地方显示“未命名作品”
const PLACEHOLDER_NOVEL_TITLES = new Set(['未命名作品', '我的第一部作品'])

function resolveEffectiveNovelTitle(title: string, displayTitle?: string | null): string {
  const display = displayTitle?.trim()
  if (display && PLACEHOLDER_NOVEL_TITLES.has(title.trim())) {
    return display
  }
  return title
}

function toNovel(record: any, viewerUserId?: string | null): Novel {
  return {
    id: record.id,
    title: resolveEffectiveNovelTitle(record.title, record.displayTitle),
    displayTitle: record.displayTitle ?? null,
    slug: record.slug,
    summary: record.summary,
    categoryId: record.categoryId ?? null,
    categoryName: record.categoryName ?? null,
    tags: record.tagNames ?? [],
    status: record.status,
    visibility: record.visibility,
    coverUrl: record.coverAsset?.imageUrl ?? null,
    coverAssetId: record.coverAssetId ?? null,
    coverPrompt: record.coverPrompt ?? null,
    wordCount: record.wordCount ?? 0,
    chapterCount: record.chapterCount ?? 0,
    commentCount: record.commentCount ?? 0,
    favoriteCount: record.favoriteCount ?? 0,
    likeCount: record.likeCount ?? 0,
    viewCount: record.viewCount ?? 0,
    lastChapterTitle: record.lastChapterTitle ?? null,
    lastPublishedAt: toIso(record.lastPublishedAt),
    publishedAt: toIso(record.publishedAt),
    author: toAuthorSummary(record.author, viewerUserId),
    createdAt: toIso(record.createdAt) ?? nowIso(),
    updatedAt: toIso(record.updatedAt) ?? nowIso(),
  }
}

function toNovelCard(record: any, viewerUserId?: string | null): NovelCard {
  const novel = toNovel(record, viewerUserId)

  return {
    id: novel.id,
    title: novel.title,
    displayTitle: novel.displayTitle,
    slug: novel.slug,
    summary: novel.summary,
    tags: novel.tags,
    status: novel.status,
    coverUrl: novel.coverUrl,
    wordCount: novel.wordCount,
    chapterCount: novel.chapterCount,
    lastPublishedAt: novel.lastPublishedAt,
    publishedAt: novel.publishedAt,
    viewCount: novel.viewCount,
    likeCount: novel.likeCount,
    favoriteCount: novel.favoriteCount,
    commentCount: novel.commentCount,
    updatedAt: novel.updatedAt,
    author: {
      id: novel.author.id,
      nickname: novel.author.nickname,
      avatarUrl: novel.author.avatarUrl,
    },
  }
}

function toChapter(record: any): Chapter {
  return {
    id: record.id,
    novelId: record.novelId,
    authorId: record.authorId,
    title: record.title,
    summary: record.summary ?? null,
    content: record.content,
    orderIndex: record.orderIndex,
    wordCount: record.wordCount ?? 0,
    status: record.status,
    visibility: record.visibility,
    commentCount: record.commentCount ?? 0,
    publishedAt: toIso(record.publishedAt),
    createdAt: toIso(record.createdAt) ?? nowIso(),
    updatedAt: toIso(record.updatedAt) ?? nowIso(),
  }
}

function toChapterListItem(record: any): ChapterListItem {
  const chapter = toChapter(record)

  return {
    id: chapter.id,
    novelId: chapter.novelId,
    title: chapter.title,
    summary: chapter.summary,
    orderIndex: chapter.orderIndex,
    wordCount: chapter.wordCount,
    status: chapter.status,
    visibility: chapter.visibility,
    commentCount: chapter.commentCount,
    publishedAt: chapter.publishedAt,
  }
}

// 章节列表只需要元数据：排除 content，避免把整本书的正文从数据库拉出来拖慢接口
const chapterListItemSelect = {
  id: true,
  novelId: true,
  authorId: true,
  title: true,
  summary: true,
  orderIndex: true,
  wordCount: true,
  status: true,
  visibility: true,
  commentCount: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChapterSelect

function toComment(record: any): Comment {
  return {
    id: record.id,
    targetType: record.targetType,
    targetId: record.targetId,
    parentId: record.parentId ?? null,
    rootId: record.rootId ?? null,
    content: record.content,
    rating: record.rating ?? null,
    paragraphIndex: record.paragraphIndex ?? null,
    likeCount: record.likeCount ?? 0,
    replyCount: record.replyCount ?? 0,
    auditStatus: record.auditStatus,
    author: {
      id: record.author.id,
      nickname: record.author.nickname,
      avatarUrl: record.author.avatarUrl ?? null,
    },
    createdAt: toIso(record.createdAt) ?? nowIso(),
    updatedAt: toIso(record.updatedAt) ?? nowIso(),
  }
}

function toTopic(record: any): TopicSummary {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    postCount: record.postCount ?? 0,
  }
}

function toPost(record: any): Post {
  return {
    id: record.id,
    content: record.content,
    excerpt: record.excerpt,
    topic: record.topic ? toTopic(record.topic) : null,
    imageUrls: record.imageUrls ?? [],
    relatedNovel: record.relatedNovel
      ? {
          id: record.relatedNovel.id,
          title: record.relatedNovel.title,
          coverUrl: record.relatedNovel.coverAsset?.imageUrl ?? null,
        }
      : null,
    sharedUser: record.sharedUser
      ? {
          id: record.sharedUser.id,
          nickname: record.sharedUser.nickname,
          avatarUrl: record.sharedUser.avatarUrl ?? null,
          bio: record.sharedUser.bio ?? null,
        }
      : null,
    likeCount: record.likeCount ?? 0,
    commentCount: record.commentCount ?? 0,
    favoriteCount: record.favoriteCount ?? 0,
    auditStatus: record.auditStatus,
    author: {
      id: record.author.id,
      nickname: record.author.nickname,
      avatarUrl: record.author.avatarUrl ?? null,
    },
    createdAt: toIso(record.createdAt) ?? nowIso(),
    updatedAt: toIso(record.updatedAt) ?? nowIso(),
  }
}

function toConversation(record: any, viewerUserId: string): Conversation {
  const members = (record.members ?? []).map((member: any) => ({
    id: member.user.id,
    nickname: member.user.nickname,
    avatarUrl: member.user.avatarUrl ?? null,
    // 成员维度的会话已读时间：前端据此判断自己发的消息对方是否已读
    lastReadAt: toIso(member.lastReadAt),
  }))
  const counterpart = members.find((member: any) => member.id !== viewerUserId) ?? members[0] ?? null
  // 直聊会话的在线状态取自对方的最近活跃时间
  const counterpartUser =
    (record.members ?? []).find((member: any) => member.user.id !== viewerUserId)?.user ?? null

  return {
    id: record.id,
    type: record.type,
    // 直聊会话未设标题/头像时，回退到对方昵称与头像，保证双方视角各自正确
    title: record.title ?? (record.type === 'direct' ? counterpart?.nickname ?? null : null),
    avatarUrl: record.avatarUrl ?? (record.type === 'direct' ? counterpart?.avatarUrl ?? null : null),
    unreadCount: record.unreadCount ?? 0,
    lastMessagePreview: record.lastMessagePreview ?? null,
    lastMessageAt: toIso(record.lastMessageAt),
    members,
    counterpart,
    presence: record.type === 'direct' && isUserOnline(counterpartUser?.lastActiveAt) ? 'online' : 'offline',
    createdAt: toIso(record.createdAt) ?? nowIso(),
    updatedAt: toIso(record.updatedAt) ?? nowIso(),
  }
}

/** 给直聊会话回填与对方的关注关系标记；未互关的会话在前端归入「陌生消息」 */
async function attachDirectFollowRelations(conversations: Conversation[], viewerUserId: string): Promise<Conversation[]> {
  const counterpartIds = conversations
    .filter((item) => item.type === 'direct' && item.counterpart && item.counterpart.id !== viewerUserId)
    .map((item) => String(item.counterpart!.id))

  if (counterpartIds.length === 0) {
    return conversations
  }

  const [followingRecords, followerRecords] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: viewerUserId, followingId: { in: counterpartIds } },
      select: { followingId: true },
    }),
    prisma.userFollow.findMany({
      where: { followerId: { in: counterpartIds }, followingId: viewerUserId },
      select: { followerId: true },
    }),
  ])

  const followingIds = new Set(followingRecords.map((record) => record.followingId))
  const followerIds = new Set(followerRecords.map((record) => record.followerId))

  return conversations.map((item) => {
    if (item.type !== 'direct' || !item.counterpart || item.counterpart.id === viewerUserId) {
      return item
    }

    const viewerFollowsCounterpart = followingIds.has(String(item.counterpart.id))
    const counterpartFollowsViewer = followerIds.has(String(item.counterpart.id))

    return {
      ...item,
      viewerFollowsCounterpart,
      counterpartFollowsViewer,
      isMutualFollow: viewerFollowsCounterpart && counterpartFollowsViewer,
    }
  })
}

function toMessage(record: any): Message {
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    type: record.type,
    content: record.content,
    relatedId: record.relatedId ?? null,
    createdAt: toIso(record.createdAt) ?? nowIso(),
  }
}

/** 给卡片消息批量回填富数据（封面/标题/简介等）；源内容已删除时 card 保持 null，前端降级为文本气泡 */
async function attachMessageCards(messages: Message[]): Promise<Message[]> {
  const novelIds = new Set<string>()
  const postIds = new Set<string>()
  const authorIds = new Set<string>()
  const commentIds = new Set<string>()

  for (const message of messages) {
    if (!message.relatedId) continue
    if (message.type === 'novelCard') novelIds.add(message.relatedId)
    else if (message.type === 'postCard') postIds.add(message.relatedId)
    else if (message.type === 'authorCard') authorIds.add(message.relatedId)
    else if (message.type === 'commentCard') commentIds.add(message.relatedId)
  }

  if (novelIds.size === 0 && postIds.size === 0 && authorIds.size === 0 && commentIds.size === 0) {
    return messages
  }

  const [novels, posts, authors, comments] = await Promise.all([
    novelIds.size
      ? prisma.novel.findMany({
          where: { id: { in: [...novelIds] } },
          select: {
            id: true,
            title: true,
            displayTitle: true,
            summary: true,
            coverAsset: { select: { imageUrl: true } },
            author: { select: { nickname: true } },
          },
        })
      : Promise.resolve([]),
    postIds.size
      ? prisma.post.findMany({
          where: { id: { in: [...postIds] } },
          select: {
            id: true,
            excerpt: true,
            content: true,
            imageUrls: true,
            author: { select: { nickname: true, avatarUrl: true } },
          },
        })
      : Promise.resolve([]),
    authorIds.size
      ? prisma.user.findMany({
          where: { id: { in: [...authorIds] } },
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            bio: true,
            followerCount: true,
            novelCount: true,
          },
        })
      : Promise.resolve([]),
    commentIds.size
      ? prisma.comment.findMany({
          where: { id: { in: [...commentIds] } },
          select: {
            id: true,
            content: true,
            postId: true,
            novelId: true,
            author: { select: { nickname: true, avatarUrl: true } },
          },
        })
      : Promise.resolve([]),
  ])

  const cardByRelatedId = new Map<string, MessageCard>()
  for (const novel of novels) {
    cardByRelatedId.set(novel.id, {
      kind: 'novel',
      id: novel.id,
      title: resolveEffectiveNovelTitle(novel.title, novel.displayTitle),
      coverUrl: novel.coverAsset?.imageUrl ?? null,
      summary: novel.summary,
      authorName: novel.author.nickname,
    })
  }
  for (const post of posts) {
    cardByRelatedId.set(post.id, {
      kind: 'post',
      id: post.id,
      excerpt: post.excerpt || post.content.slice(0, 120),
      imageUrl: post.imageUrls[0] ?? null,
      authorName: post.author.nickname,
      authorAvatarUrl: post.author.avatarUrl ?? null,
    })
  }
  for (const author of authors) {
    cardByRelatedId.set(author.id, {
      kind: 'author',
      id: author.id,
      nickname: author.nickname,
      avatarUrl: author.avatarUrl ?? null,
      bio: author.bio ?? null,
      followerCount: author.followerCount ?? 0,
      novelCount: author.novelCount ?? 0,
    })
  }
  for (const comment of comments) {
    cardByRelatedId.set(comment.id, {
      kind: 'comment',
      id: comment.id,
      content: comment.content,
      authorName: comment.author.nickname,
      authorAvatarUrl: comment.author.avatarUrl ?? null,
      postId: comment.postId ?? null,
      novelId: comment.novelId ?? null,
    })
  }

  return messages.map((message) => {
    if (
      message.type !== 'novelCard' &&
      message.type !== 'postCard' &&
      message.type !== 'authorCard' &&
      message.type !== 'commentCard'
    ) {
      return message
    }
    return { ...message, card: (message.relatedId && cardByRelatedId.get(message.relatedId)) || null }
  })
}

function toCoverAsset(record: any): CoverAsset {
  return {
    id: record.id,
    novelId: record.novelId ?? null,
    ownerUserId: record.ownerUserId,
    sourceType: record.sourceType,
    imageUrl: record.imageUrl,
    prompt: record.prompt ?? null,
    negativePrompt: record.negativePrompt ?? null,
    modelName: record.modelName ?? null,
    width: record.width ?? null,
    height: record.height ?? null,
    createdAt: toIso(record.createdAt) ?? nowIso(),
  }
}

function ensureNonEmptyText(value: string, field: string): string {
  const normalized = value.trim()

  if (!normalized) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', `${field}不能为空。`)
  }

  return normalized
}

async function buildAvailableNickname(baseNickname: string): Promise<string> {
  const normalizedBase = ensureNonEmptyText(baseNickname, 'nickname')
  const duplicateCount = await prisma.user.count({
    where: {
      nickname: {
        startsWith: normalizedBase,
      },
    },
  })

  return duplicateCount === 0 ? normalizedBase : `${normalizedBase}${duplicateCount + 1}`
}

async function buildAutoNickname(input: { phone?: string; email?: string }): Promise<string> {
  const phoneDigits = input.phone?.replace(/\D/g, '') ?? ''
  const emailPrefix = input.email?.split('@')[0]?.trim() ?? ''

  if (phoneDigits.length >= 4) {
    return buildAvailableNickname(`书友${phoneDigits.slice(-4)}`)
  }

  if (emailPrefix) {
    return buildAvailableNickname(emailPrefix.slice(0, 12))
  }

  return buildAvailableNickname(`书友${Date.now().toString().slice(-6)}`)
}

async function ensureUserExists(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new DataAccessError(401, 'AUTH_INVALID_SESSION', '登录状态已失效，请重新登录。')
  }

  return user
}

async function ensureNovelOwner(userId: string, novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: novelInclude,
  })

  if (!novel) {
    throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '未找到对应作品。')
  }

  if (novel.authorId !== userId) {
    throw new DataAccessError(403, 'NOVEL_FORBIDDEN', '当前账号无权访问该作品。')
  }

  return novel
}

async function ensureConversationMember(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  })

  if (!conversation) {
    throw new DataAccessError(404, 'CONVERSATION_NOT_FOUND', '未找到会话。')
  }

  const isMember = conversation.members.some((member) => member.userId === userId)
  if (!isMember) {
    throw new DataAccessError(403, 'CONVERSATION_FORBIDDEN', '当前账号无权访问该会话。')
  }

  return conversation
}

async function recalculateNovelStats(tx: Prisma.TransactionClient, novelId: string) {
  const chapters = await tx.chapter.findMany({
    where: { novelId },
    orderBy: { orderIndex: 'asc' },
  })

  const latestChapter = chapters[chapters.length - 1] ?? null
  const latestPublished = [...chapters]
    .filter((chapter) => chapter.status === 'published' && chapter.publishedAt)
    .sort((left, right) => right.orderIndex - left.orderIndex)[0]

  const wordCount = chapters.reduce((total, chapter) => total + (chapter.wordCount ?? 0), 0)

  await tx.novel.update({
    where: { id: novelId },
    data: {
      chapterCount: chapters.length,
      wordCount,
      lastChapterTitle: latestChapter?.title ?? null,
      lastPublishedAt: latestPublished?.publishedAt ?? null,
    },
  })
}

function buildCommentTargetIds(targetType: CommentTargetType, targetId: string) {
  if (targetType === 'novel') {
    return { novelId: targetId, chapterId: null, postId: null }
  }

  if (targetType === 'chapter') {
    return { novelId: null, chapterId: targetId, postId: null }
  }

  return { novelId: null, chapterId: null, postId: targetId }
}

export async function listTopicsData(): Promise<{ items: TopicSummary[] }> {
  // postCount 以 PostTopic 关联表实时计数为准：Topic.postCount 是发帖时 increment 的冗余列，
  // 历史删帖/删话题不回写会漂移（话题栏「全部」与各频道数字对不上的根因）
  const items = await prisma.topic.findMany({
    include: { _count: { select: { postLinks: true } } },
    orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
    take: 12,
  })

  return {
    items: items.map((item) => toTopic({ ...item, postCount: item._count.postLinks })),
  }
}

/** 推荐话题（方案 18 §3.4）：trendScore = 近7天帖数*3 + log2(1+总帖数)，取前 3 个 */
export async function listRecommendedTopicsData(): Promise<{ items: TopicSummary[] }> {
  const since = new Date(Date.now() - 7 * 86_400_000)
  const [topics, recentLinks] = await Promise.all([
    prisma.topic.findMany({
      orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
      take: 50,
    }),
    prisma.postTopic.groupBy({
      by: ['topicId'],
      where: { createdAt: { gte: since } },
      _count: { topicId: true },
    }),
  ])

  const recentCountMap = new Map(recentLinks.map((entry) => [entry.topicId, entry._count.topicId]))
  const items = topics
    .map((topic) => ({
      topic,
      score: (recentCountMap.get(topic.id) ?? 0) * 3 + Math.log2(1 + topic.postCount),
    }))
    .sort((a, b) => b.score - a.score || b.topic.postCount - a.topic.postCount)
    .slice(0, 3)
    .map((entry) => toTopic(entry.topic))

  return { items }
}

/** 按 slug/name/id 依次解析话题：话题详情页入口 */
export async function resolveTopicData(key: string): Promise<TopicSummary | null> {
  const topic =
    (await prisma.topic.findUnique({ where: { slug: key } })) ??
    (await prisma.topic.findUnique({ where: { name: key } })) ??
    (await prisma.topic.findUnique({ where: { id: key } }))

  return topic ? toTopic(topic) : null
}

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

export async function listNovelsData(
  page: number,
  pageSize: number,
  options?: { authorId?: string; publishedOnly?: boolean; tag?: string },
) {
  const where: Prisma.NovelWhereInput = {}
  if (options?.authorId) {
    where.authorId = options.authorId
  }
  if (options?.publishedOnly) {
    where.visibility = 'public'
    where.status = { in: ['published', 'completed', 'archived'] }
    // 没有任何公开章节的作品不对外展示（例如发布后又全部改成仅自己可见）
    where.chapters = { some: publicChapterWhere }
  }
  if (options?.tag) {
    where.tagNames = { has: options.tag }
  }

  const [items, total] = await prisma.$transaction([
    prisma.novel.findMany({
      include: novelInclude,
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.novel.count({ where }),
  ])

  return {
    items: items.map((record) => toNovelCard(record)),
    pagination: buildPagination(page, pageSize, total),
  }
}

export async function getNovelByIdData(novelId: string): Promise<Novel | null> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: novelInclude,
  })

  return novel ? toNovel(novel) : null
}

export async function createNovelData(userId: string, input: CreateNovelRequest): Promise<Novel> {
  await ensureUserExists(userId)
  const baseSlug = buildSlug(input.title)
  // 靠 count 推算后缀会撞车：删过中间的作品后，count+1 可能正好是还存在的 slug（唯一约束报错）。
  // 这里把同前缀的已占用 slug 全拿回来，逐个试到第一个空位为止。
  const occupiedSlugs = new Set(
    (
      await prisma.novel.findMany({
        where: { slug: { startsWith: baseSlug } },
        select: { slug: true },
      })
    ).map((item) => item.slug),
  )
  let slug = baseSlug
  for (let suffix = 2; occupiedSlugs.has(slug); suffix += 1) {
    slug = `${baseSlug}-${suffix}`
  }

  const novel = await prisma.$transaction(async (tx) => {
    const created = await tx.novel.create({
      data: {
        title: ensureNonEmptyText(input.title, 'title'),
        displayTitle: input.displayTitle?.trim() || null,
        slug,
        summary: ensureNonEmptyText(input.summary, 'summary'),
        categoryId: input.categoryId ?? null,
        categoryName: null,
        tagNames: input.tags ?? [],
        visibility: input.visibility ?? 'public',
        status: input.status ?? 'draft',
        authorId: userId,
        publishedAt: input.status === 'published' ? new Date() : null,
      },
      include: novelInclude,
    })

    await tx.user.update({
      where: { id: userId },
      data: {
        novelCount: {
          increment: 1,
        },
      },
    })

    return created
  })

  return toNovel(novel, userId)
}

export async function updateNovelData(
  userId: string,
  novelId: string,
  input: UpdateNovelRequest,
): Promise<Novel | null> {
  await ensureNovelOwner(userId, novelId)

  const existing = await prisma.novel.findUnique({
    where: { id: novelId },
  })

  if (!existing) {
    return null
  }

  const nextTitle = input.title === undefined ? undefined : ensureNonEmptyText(input.title, 'title')
  const inputDisplayTitle = input.displayTitle === undefined ? undefined : input.displayTitle?.trim() || null
  // 各展示端统一优先读 displayTitle（它兼作 title 被占位名回滚时的备份），改书名时若调用方
  // 未显式给出新的展示名、或给出的仍是改名前的旧值，则让 displayTitle 跟随新书名，
  // 否则首页/切换器等会继续显示旧 displayTitle
  const nextDisplayTitle =
    nextTitle !== undefined && (inputDisplayTitle === undefined || inputDisplayTitle === (existing.displayTitle ?? null))
      ? nextTitle
      : inputDisplayTitle

  const updated = await prisma.novel.update({
    where: { id: novelId },
    data: {
      title: nextTitle,
      displayTitle: nextDisplayTitle,
      summary: input.summary === undefined ? undefined : ensureNonEmptyText(input.summary, 'summary'),
      categoryId: input.categoryId === undefined ? undefined : input.categoryId,
      tagNames: input.tags ?? undefined,
      visibility: input.visibility ?? undefined,
      status: input.status ?? undefined,
      coverAssetId: input.coverAssetId === undefined ? undefined : input.coverAssetId,
      coverPrompt: input.coverPrompt === undefined ? undefined : input.coverPrompt,
      publishedAt:
        input.status === 'published'
          ? existing.publishedAt ?? new Date()
          : input.status === 'draft'
            ? null
            : undefined,
    },
    include: novelInclude,
  })

  return toNovel(updated, userId)
}

export async function publishNovelData(
  userId: string,
  novelId: string,
  chapterIds: string[],
  visibility: Visibility = 'public',
): Promise<{ novel: Novel; publishedChapterIds: string[] } | null> {
  await ensureNovelOwner(userId, novelId)

  const existing = await prisma.novel.findUnique({
    where: { id: novelId },
  })

  if (!existing) {
    return null
  }

  const now = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    if (chapterIds.length > 0) {
      await tx.chapter.updateMany({
        where: { novelId, id: { in: chapterIds } },
        data: {
          status: 'published',
          visibility,
        },
      })
      // updateMany 无法按行做 publishedAt ?? now 兜底，单独补一次空值填充
      await tx.chapter.updateMany({
        where: { novelId, id: { in: chapterIds }, publishedAt: null },
        data: { publishedAt: now },
      })
    }

    // 发布前置校验：作品至少要有一个公开的已发布章节，否则 0 章节/全私密的作品会对外展示空壳
    const publicChapterCount = await tx.chapter.count({
      where: { novelId, ...publicChapterWhere },
    })
    if (publicChapterCount === 0) {
      throw new DataAccessError(
        400,
        'VALIDATION_ERROR',
        '发布失败：请至少选择一个章节并设为公开，读者才能看到这部作品。',
      )
    }

    const novel = await tx.novel.update({
      where: { id: novelId },
      data: {
        status: 'published',
        visibility: existing.visibility === 'private' ? 'public' : undefined,
        publishedAt: existing.publishedAt ?? now,
      },
      include: novelInclude,
    })

    await recalculateNovelStats(tx, novelId)
    return novel
  })

  return {
    novel: toNovel(updated, userId),
    publishedChapterIds: chapterIds,
  }
}

/** 标签 → 所属分组下标：用于「相似标签」（同组不同名）判定 */
const NOVEL_TAG_GROUP_INDEX = new Map<string, number>()
NOVEL_TAG_GROUPS.forEach((group, index) => {
  for (const tag of group.tags) {
    if (!NOVEL_TAG_GROUP_INDEX.has(tag)) {
      NOVEL_TAG_GROUP_INDEX.set(tag, index)
    }
  }
})

const RELATED_CANDIDATE_LIMIT = 200
const RELATED_NOVEL_COUNT = 4

type RelatedNovelSignals = {
  authorId: string
  categoryName: string | null
  tagNames: string[]
  likeCount: number
  commentCount: number
  favoriteCount: number
  viewCount: number
  chapterCount: number
  wordCount: number
  lastPublishedAt: Date | null
  updatedAt: Date
}

/** 与首页热度榜同口径的热度分：互动加权（阅读1/点赞3/评论4/收藏5）+ 内容规模，除以更新时间衰减 */
function computeNovelHotScore(novel: RelatedNovelSignals, nowMs: number): number {
  const engagement = novel.viewCount + novel.likeCount * 3 + novel.commentCount * 4 + novel.favoriteCount * 5
  const substance = Math.min(novel.chapterCount, 50) * 2 + Math.min(novel.wordCount / 10000, 30)
  const lastActive = (novel.lastPublishedAt ?? novel.updatedAt).getTime()
  const ageDays = Math.max(0, (nowMs - lastActive) / 86_400_000)
  return (engagement + substance) / Math.pow(ageDays + 2, 1.4)
}

/** 标签亲和分：同名标签 3 分/个、同分类 2 分、同组相似标签 1 分/个 */
function computeTagAffinity(source: RelatedNovelSignals, candidate: RelatedNovelSignals): number {
  const sourceTags = new Set(source.tagNames)
  const sourceGroups = new Set(
    source.tagNames
      .map((tag) => NOVEL_TAG_GROUP_INDEX.get(tag))
      .filter((index): index is number => index !== undefined),
  )

  let score = 0

  if (source.categoryName && candidate.categoryName && source.categoryName === candidate.categoryName) {
    score += 2
  }

  for (const tag of new Set(candidate.tagNames)) {
    if (sourceTags.has(tag)) {
      score += 3
      continue
    }

    const group = NOVEL_TAG_GROUP_INDEX.get(tag)
    if (group !== undefined && sourceGroups.has(group)) {
      score += 1
    }
  }

  return score
}

/** 相关推荐排序：标签相同/相似且热门 > 标签相同/相似 > 同作者 > 其它，各档内按热度降序 */
function rankRelatedNovels<T extends RelatedNovelSignals & { id: string }>(
  source: RelatedNovelSignals,
  candidates: T[],
): T[] {
  const nowMs = Date.now()

  const scored = candidates.map((candidate) => {
    const affinity = computeTagAffinity(source, candidate)
    const tier = affinity > 0 ? 0 : candidate.authorId === source.authorId ? 1 : 2
    return { candidate, affinity, tier, hot: computeNovelHotScore(candidate, nowMs) }
  })

  return scored
    .sort((left, right) => {
      if (left.tier !== right.tier) return left.tier - right.tier
      if (right.hot !== left.hot) return right.hot - left.hot
      return right.affinity - left.affinity
    })
    .slice(0, RELATED_NOVEL_COUNT)
    .map((item) => item.candidate)
}

export async function getNovelDetailData(
  novelId: string,
  viewerUserId?: string | null,
): Promise<NovelDetailPayload | null> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: novelInclude,
  })

  if (!novel) {
    return null
  }

  const isOwner = Boolean(viewerUserId && novel.authorId === viewerUserId)

  // 非作者只能看公开的已发布/已完结作品，与首页榜单候选池口径保持一致
  if (!isOwner && (novel.visibility !== 'public' || novel.status === 'draft')) {
    return null
  }

  const chapterWhere: Prisma.ChapterWhereInput = isOwner
    ? { novelId }
    : {
        novelId,
        status: 'published',
        visibility: 'public',
        OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
      }

  const [chapterRecords, commentRecords, relatedPoolRecords, authorNovelRecords, authorPublicNovelCount, ratingAggregate] = await prisma.$transaction([
    prisma.chapter.findMany({
      where: chapterWhere,
      select: chapterListItemSelect,
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.comment.findMany({
      where: {
        targetType: 'novel',
        targetId: novelId,
      },
      include: commentInclude,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // 相关推荐候选池：按更新时间取近期作品，内存中按标签亲和/热度/同作者分档排序
    prisma.novel.findMany({
      where: {
        id: { not: novelId },
        ...searchableNovelWhere,
      },
      include: novelInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: RELATED_CANDIDATE_LIMIT,
    }),
    // 同作者作品单独兜底取一份，避免候选池按更新时间截断后漏掉
    prisma.novel.findMany({
      where: {
        id: { not: novelId },
        authorId: novel.authorId,
        ...searchableNovelWhere,
      },
      include: novelInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 20,
    }),
    // 作者卡片的「X 部作品」只统计对外可见的作品，与作者主页口径一致
    prisma.novel.count({
      where: { authorId: novel.authorId, ...searchableNovelWhere },
    }),
    // 作品评分聚合：只统计带评星的作品根评论
    prisma.comment.aggregate({
      where: { targetType: 'novel', targetId: novelId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ])

  const viewerFavorite = viewerUserId
    ? await prisma.novelFavorite.findUnique({
        where: { novelId_userId: { novelId, userId: viewerUserId } },
        select: { id: true },
      })
    : null

  // 合并候选池与同作者兜底后去重，再按分档策略排序取前 4 本
  const relatedCandidates = new Map<string, (typeof relatedPoolRecords)[number]>()
  for (const record of [...relatedPoolRecords, ...authorNovelRecords]) {
    relatedCandidates.set(record.id, record)
  }
  const relatedRecords = rankRelatedNovels(novel, [...relatedCandidates.values()])

  const novelPayload = toNovel(novel, viewerUserId)
  novelPayload.author.novelCount = authorPublicNovelCount
  novelPayload.ratingCount = ratingAggregate._count.rating
  novelPayload.ratingAverage =
    ratingAggregate._avg.rating == null ? null : Math.round(ratingAggregate._avg.rating * 10) / 10
  novelPayload.favoritedByViewer = Boolean(viewerFavorite)

  return {
    novel: novelPayload,
    chapters: chapterRecords.map(toChapterListItem),
    topComments: commentRecords.map(toComment),
    relatedNovels: relatedRecords.map((record) => toNovelCard(record)),
  }
}

/** 封面图若是 base64 data URL，落盘转为静态文件路径；失败（超限/磁盘异常）时保留原值不阻断主流程 */
async function normalizeCoverImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl.startsWith('data:image/')) {
    return imageUrl
  }
  try {
    return await storeNovelCoverDataUrl(imageUrl)
  } catch {
    return imageUrl
  }
}

export async function getStudioPayloadData(userId: string, novelId: string): Promise<StudioPayload | null> {
  const novel = await ensureNovelOwner(userId, novelId)

  // 历史脏数据自愈：title 被回滚成占位默认值而 displayTitle 保留真实书名时，把真实书名写回 title
  const trimmedDisplayTitle = novel.displayTitle?.trim()
  if (trimmedDisplayTitle && PLACEHOLDER_NOVEL_TITLES.has(novel.title.trim())) {
    await prisma.novel.update({ where: { id: novelId }, data: { title: trimmedDisplayTitle } })
    novel.title = trimmedDisplayTitle
  }

  const [chapters, coverAssetRecords] = await prisma.$transaction([
    prisma.chapter.findMany({
      where: { novelId },
      select: chapterListItemSelect,
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.coverAsset.findMany({
      where: { novelId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    }),
  ])

  // 存量 base64 封面懒迁移：读到即落盘转静态文件路径，避免巨型 data URL 拖垮 studio 首屏 payload
  const coverAssets = await Promise.all(
    coverAssetRecords.map(async (asset) => {
      if (!asset.imageUrl.startsWith('data:image/')) {
        return asset
      }
      const nextUrl = await normalizeCoverImageUrl(asset.imageUrl)
      if (nextUrl === asset.imageUrl) {
        return asset
      }
      await prisma.coverAsset.update({ where: { id: asset.id }, data: { imageUrl: nextUrl } })
      return { ...asset, imageUrl: nextUrl }
    }),
  )

  // 草稿章需要完整正文，单独按 id 补查一次，避免列表查询携带全部章节正文
  const draftChapterMeta = chapters.find((chapter) => chapter.status === 'draft') ?? null
  const draftChapter = draftChapterMeta
    ? await prisma.chapter.findUnique({ where: { id: draftChapterMeta.id } })
    : null

  return {
    novel: toNovel(novel, userId),
    chapters: chapters.map(toChapterListItem),
    draftChapter: draftChapter ? toChapter(draftChapter) : null,
    coverAssets: coverAssets.map(toCoverAsset),
  }
}

export async function getReaderPayloadData(novelId: string, chapterId: string): Promise<ReaderPayload | null> {
  const [novel, currentChapter, chapterRecords] = await prisma.$transaction([
    prisma.novel.findUnique({
      where: { id: novelId },
      include: { coverAsset: true },
    }),
    prisma.chapter.findUnique({
      where: { id: chapterId },
    }),
    prisma.chapter.findMany({
      where: { novelId },
      select: chapterListItemSelect,
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  if (!novel || !currentChapter || currentChapter.novelId !== novelId) {
    return null
  }

  // 阅读正文计入作品阅读量，作为热度榜的核心互动信号
  if (currentChapter.status !== 'draft') {
    await prisma.novel.update({
      where: { id: novelId },
      data: { viewCount: { increment: 1 } },
    })
  }

  const visibleChapters = chapterRecords.filter((chapter) => chapter.status !== 'draft')
  const currentIndex = visibleChapters.findIndex((chapter) => chapter.id === currentChapter.id)

  return {
    novel: {
      id: novel.id,
      title: resolveEffectiveNovelTitle(novel.title, novel.displayTitle),
      displayTitle: novel.displayTitle ?? null,
      slug: novel.slug,
      coverUrl: novel.coverAsset?.imageUrl ?? null,
    },
    currentChapter: toChapter(currentChapter),
    chapterList: visibleChapters.map(toChapterListItem),
    previousChapterId: currentIndex > 0 ? visibleChapters[currentIndex - 1].id : null,
    nextChapterId:
      currentIndex >= 0 && currentIndex < visibleChapters.length - 1
        ? visibleChapters[currentIndex + 1].id
        : null,
  }
}

export async function createChapterData(
  userId: string,
  novelId: string,
  input: CreateChapterRequest,
  defaultVisibility: Visibility,
): Promise<Chapter | null> {
  await ensureNovelOwner(userId, novelId)

  // 用「最大编号+1」而不是「总数+1」：删过中间章节后总数会小于最大编号，
  // 总数+1 会撞 novelId+orderIndex 唯一约束导致建章直接报错
  const lastChapter = await prisma.chapter.findFirst({
    where: { novelId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  })

  const chapter = await prisma.$transaction(async (tx) => {
    const created = await tx.chapter.create({
      data: {
        novelId,
        authorId: userId,
        title: ensureNonEmptyText(input.title, 'title'),
        summary: input.summary?.trim() || null,
        content: input.content,
        orderIndex: (lastChapter?.orderIndex ?? 0) + 1,
        wordCount: input.content.length,
        status: input.status,
        visibility: input.visibility ?? defaultVisibility,
        publishedAt: input.status === 'published' ? new Date() : null,
      },
    })

    await recalculateNovelStats(tx, novelId)
    return created
  })

  return toChapter(chapter)
}

export async function getChapterData(userId: string, novelId: string, chapterId: string): Promise<Chapter | null> {
  await ensureNovelOwner(userId, novelId)

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
  })

  if (!chapter || chapter.novelId !== novelId) {
    return null
  }

  return toChapter(chapter)
}

export async function updateChapterData(
  userId: string,
  novelId: string,
  chapterId: string,
  input: UpdateChapterRequest,
): Promise<Chapter | null> {
  await ensureNovelOwner(userId, novelId)

  const existing = await prisma.chapter.findUnique({
    where: { id: chapterId },
  })

  if (!existing || existing.novelId !== novelId) {
    return null
  }

  const nextStatus = input.status ?? existing.status
  const nextContent = input.content ?? existing.content

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.chapter.update({
      where: { id: chapterId },
      data: {
        title: input.title === undefined ? undefined : ensureNonEmptyText(input.title, 'title'),
        summary: input.summary === undefined ? undefined : input.summary,
        content: input.content ?? undefined,
        status: input.status ?? undefined,
        visibility: input.visibility ?? undefined,
        wordCount: nextContent.length,
        publishedAt:
          nextStatus === 'published'
            ? existing.publishedAt ?? new Date()
            : nextStatus === 'draft'
              ? null
              : existing.publishedAt,
      },
    })

    await recalculateNovelStats(tx, novelId)
    return record
  })

  return toChapter(updated)
}

/** 删除章节后把剩余章节编号压缩为连续的 1..N，避免章节树出现「第1/第4/第5章」跳号。
 * 按 orderIndex 升序逐个更新：目标编号恒 ≤ 当前编号且此前已被腾空，不会撞 novelId+orderIndex 唯一约束 */
async function compactChapterOrder(tx: Prisma.TransactionClient, novelId: string) {
  const chapters = await tx.chapter.findMany({
    where: { novelId },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, orderIndex: true },
  })

  for (let index = 0; index < chapters.length; index += 1) {
    const expected = index + 1
    if (chapters[index].orderIndex !== expected) {
      await tx.chapter.update({
        where: { id: chapters[index].id },
        data: { orderIndex: expected },
      })
    }
  }
}

export async function deleteChapterData(userId: string, novelId: string, chapterId: string): Promise<boolean> {
  await ensureNovelOwner(userId, novelId)

  const existing = await prisma.chapter.findUnique({
    where: { id: chapterId },
  })

  if (!existing || existing.novelId !== novelId) {
    return false
  }

  await prisma.$transaction(async (tx) => {
    await tx.chapter.delete({
      where: { id: chapterId },
    })
    await compactChapterOrder(tx, novelId)
    await recalculateNovelStats(tx, novelId)
  })

  return true
}

export async function deleteNovelData(userId: string, novelId: string): Promise<boolean> {
  const existing = await ensureNovelOwner(userId, novelId)

  if (!existing) {
    return false
  }

  await prisma.$transaction(async (tx) => {
    const chapters = await tx.chapter.findMany({
      where: { novelId },
      select: { id: true },
    })
    const chapterIds = chapters.map((chapter) => chapter.id)

    const runs = await tx.agentRun.findMany({
      where: { novelId },
      select: { id: true },
    })
    const runIds = runs.map((run) => run.id)

    if (runIds.length > 0) {
      await tx.projectMemoryEntry.deleteMany({
        where: {
          OR: [{ novelId }, { runId: { in: runIds } }],
        },
      })

      await tx.agentArtifact.deleteMany({
        where: { runId: { in: runIds } },
      })
    } else {
      await tx.projectMemoryEntry.deleteMany({
        where: { novelId },
      })
    }

    await tx.agentRun.deleteMany({
      where: { novelId },
    })
    await tx.agentSession.deleteMany({
      where: { novelId },
    })

    await tx.aiUsageLog.deleteMany({
      where: chapterIds.length > 0 ? { OR: [{ novelId }, { chapterId: { in: chapterIds } }] } : { novelId },
    })

    await tx.comment.deleteMany({
      where: chapterIds.length > 0 ? { OR: [{ novelId }, { chapterId: { in: chapterIds } }] } : { novelId },
    })
    await tx.post.updateMany({
      where: { relatedNovelId: novelId },
      data: { relatedNovelId: null },
    })
    await tx.novel.update({
      where: { id: novelId },
      data: {
        coverAssetId: null,
      },
    })
    await tx.coverAsset.deleteMany({
      where: { novelId },
    })
    await tx.chapter.deleteMany({
      where: { novelId },
    })
    await tx.novel.delete({
      where: { id: novelId },
    })
    await tx.user.update({
      where: { id: userId },
      data: {
        novelCount: {
          decrement: 1,
        },
      },
    })
  })

  return true
}

/** 评论排序候选集上限：单目标评论百千级，内存线程化排序足够 */
const COMMENT_RANK_FETCH_LIMIT = 1000

/** 评论打分（方案 18 §2）：
 * - 帖子评论/章评/段评：热门优先 like*2 + reply + 新鲜加成
 * - 书评（novel）：优质优先 like*3 + reply*2 + 新鲜加成
 * 新鲜加成 = max(0, 48 - ageHours) / 48 * 2，保证新评论 48 小时内有冒头机会 */
function computeCommentRankScore(
  record: { likeCount: number; replyCount: number; createdAt: Date },
  targetType: CommentTargetType,
  nowMs: number,
): number {
  const ageHours = Math.max(0, (nowMs - record.createdAt.getTime()) / 3_600_000)
  const freshBonus = (Math.max(0, 48 - ageHours) / 48) * 2

  if (targetType === 'novel') {
    return record.likeCount * 3 + record.replyCount * 2 + freshBonus
  }

  return record.likeCount * 2 + record.replyCount + freshBonus
}

/** 线程扁平化排序：根评论按策略分降序，各自楼中楼回复按时间正序紧随其后，
 * 前端 buildThreads 按 parent 链归并时直接继承此顺序，无需前端改动 */
function rankCommentRecords<
  T extends { id: string; parentId: string | null; rootId: string | null; likeCount: number; replyCount: number; createdAt: Date },
>(records: T[], targetType: CommentTargetType): T[] {
  const nowMs = Date.now()
  const roots = records.filter((record) => !record.parentId)
  const replies = records.filter((record) => Boolean(record.parentId))

  roots.sort((a, b) => {
    const scoreDiff = computeCommentRankScore(b, targetType, nowMs) - computeCommentRankScore(a, targetType, nowMs)
    if (scoreDiff !== 0) {
      return scoreDiff
    }
    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime()
    if (timeDiff !== 0) {
      return timeDiff
    }
    return b.id.localeCompare(a.id)
  })

  const rootIds = new Set(roots.map((record) => record.id))
  const byRoot = new Map<string, T[]>()
  const orphans: T[] = []

  for (const reply of replies) {
    const key =
      reply.rootId && rootIds.has(reply.rootId)
        ? reply.rootId
        : reply.parentId && rootIds.has(reply.parentId)
          ? reply.parentId
          : null
    if (!key) {
      orphans.push(reply)
      continue
    }
    const bucket = byRoot.get(key)
    if (bucket) {
      bucket.push(reply)
    } else {
      byRoot.set(key, [reply])
    }
  }

  for (const bucket of byRoot.values()) {
    bucket.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }
  orphans.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const flattened: T[] = []
  for (const root of roots) {
    flattened.push(root, ...(byRoot.get(root.id) ?? []))
  }
  flattened.push(...orphans)
  return flattened
}

export async function listCommentsData(
  targetType: CommentTargetType,
  targetId: string,
  page: number,
  pageSize: number,
  viewerUserId?: string | null,
) {
  const where: Prisma.CommentWhereInput = { targetType, targetId }
  const [records, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where,
      include: commentInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: COMMENT_RANK_FETCH_LIMIT,
    }),
    prisma.comment.count({ where }),
  ])

  const ranked = rankCommentRecords(records, targetType)
  const start = (page - 1) * pageSize
  const items = ranked.slice(start, start + pageSize)

  const likedCommentIds = await getViewerLikedCommentIds(
    viewerUserId,
    items.map((item) => item.id),
  )

  return {
    items: items.map((item) => ({ ...toComment(item), likedByViewer: likedCommentIds.has(item.id) })),
    pagination: buildPagination(page, pageSize, total),
  }
}

export async function createCommentData(userId: string, input: CreateCommentRequest): Promise<Comment> {
  await ensureUserExists(userId)
  const targetIds = buildCommentTargetIds(input.targetType, input.targetId)
  ensureNonEmptyText(input.content, 'content')

  // 作品根评论必须携带 1-5 星评分；回复与其他目标不记评分
  const isNovelRootComment = input.targetType === 'novel' && !input.parentId
  if (isNovelRootComment && (!Number.isInteger(input.rating) || input.rating! < 1 || input.rating! > 5)) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '请先为作品打分（1-5 星）。')
  }
  const rating = isNovelRootComment ? input.rating! : null

  // 章节段评：仅章节根评论记录段落序号，非法值一律归为章评
  const paragraphIndex =
    input.targetType === 'chapter' &&
    !input.parentId &&
    Number.isInteger(input.paragraphIndex) &&
    (input.paragraphIndex as number) >= 0
      ? (input.paragraphIndex as number)
      : null

  // 作品根评论一人只能发一条，重复发表引导去编辑/删除
  if (isNovelRootComment) {
    const existing = await prisma.comment.findFirst({
      where: { targetType: 'novel', targetId: input.targetId, userId, parentId: null },
      select: { id: true },
    })
    if (existing) {
      throw new DataAccessError(409, 'COMMENT_EXISTS', '你已点评过这部作品，可以在自己的评论上编辑或删除后重新发表。')
    }
  }

  // 回复：校验父评论存在并从父评论派生 rootId（父为根评论时 rootId 为空，父即根）
  let replyRootId: string | null = null
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { id: true, rootId: true },
    })
    if (!parent) {
      throw new DataAccessError(404, 'COMMENT_NOT_FOUND', '回复的评论不存在。')
    }
    replyRootId = parent.rootId ?? parent.id
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
        parentId: input.parentId ?? null,
        rootId: replyRootId,
        content: input.content,
        rating,
        paragraphIndex,
        auditStatus: 'pending',
        ...targetIds,
      },
      include: commentInclude,
    })

    if (input.targetType === 'post') {
      await tx.post.update({
        where: { id: input.targetId },
        data: {
          commentCount: {
            increment: 1,
          },
        },
      })
    }

    if (input.targetType === 'chapter') {
      await tx.chapter.update({
        where: { id: input.targetId },
        data: {
          commentCount: {
            increment: 1,
          },
        },
      })
    }

    if (input.targetType === 'novel') {
      await tx.novel.update({
        where: { id: input.targetId },
        data: {
          commentCount: {
            increment: 1,
          },
        },
      })
    }

    if (input.parentId) {
      await tx.comment.updateMany({
        where: { id: input.parentId },
        data: {
          replyCount: {
            increment: 1,
          },
        },
      })
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        unreadNotificationCount: {
          increment: 1,
        },
      },
    })

    return created
  })

  return toComment(comment)
}

/** 编辑自己的评论；作品根评论可同步修改评星 */
export async function updateCommentData(
  userId: string,
  commentId: string,
  input: UpdateCommentRequest,
): Promise<Comment | null> {
  const existing = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!existing) {
    return null
  }
  if (existing.userId !== userId) {
    throw new DataAccessError(403, 'FORBIDDEN', '只能编辑自己的评论。')
  }
  ensureNonEmptyText(input.content, 'content')

  const isNovelRootComment = existing.targetType === 'novel' && !existing.parentId
  if (
    isNovelRootComment &&
    input.rating !== undefined &&
    (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
  ) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '请先为作品打分（1-5 星）。')
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: {
      content: input.content,
      ...(isNovelRootComment && input.rating !== undefined ? { rating: input.rating } : {}),
    },
    include: commentInclude,
  })

  return toComment(updated)
}

/** 删除自己的评论（连同它的回复与点赞），并回算目标与父评论计数 */
export async function deleteCommentData(
  userId: string,
  commentId: string,
): Promise<{ deletedCount: number } | null> {
  const existing = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!existing) {
    return null
  }
  if (existing.userId !== userId) {
    throw new DataAccessError(403, 'FORBIDDEN', '只能删除自己的评论。')
  }

  const deletedCount = await prisma.$transaction(async (tx) => {
    const descendants = await tx.comment.findMany({
      where: { OR: [{ parentId: commentId }, { rootId: commentId }] },
      select: { id: true },
    })
    const ids = [commentId, ...descendants.map((item) => item.id)]

    await tx.commentLike.deleteMany({ where: { commentId: { in: ids } } })
    await tx.comment.deleteMany({ where: { id: { in: ids } } })

    // 用剩余条数回算计数，避免 decrement 出现负数
    const remaining = await tx.comment.count({
      where: { targetType: existing.targetType, targetId: existing.targetId },
    })
    if (existing.targetType === 'post') {
      await tx.post.updateMany({ where: { id: existing.targetId }, data: { commentCount: remaining } })
    } else if (existing.targetType === 'chapter') {
      await tx.chapter.updateMany({ where: { id: existing.targetId }, data: { commentCount: remaining } })
    } else if (existing.targetType === 'novel') {
      await tx.novel.updateMany({ where: { id: existing.targetId }, data: { commentCount: remaining } })
    }

    if (existing.parentId) {
      const parentReplies = await tx.comment.count({ where: { parentId: existing.parentId } })
      await tx.comment.updateMany({
        where: { id: existing.parentId },
        data: { replyCount: parentReplies },
      })
    }

    return ids.length
  })

  return { deletedCount }
}

/** 查询 viewer 已点赞的评论 id 集合 */
async function getViewerLikedCommentIds(
  viewerUserId: string | null | undefined,
  commentIds: string[],
): Promise<Set<string>> {
  if (!viewerUserId || commentIds.length === 0) {
    return new Set()
  }

  const likes = await prisma.commentLike.findMany({
    where: { userId: viewerUserId, commentId: { in: commentIds } },
    select: { commentId: true },
  })

  return new Set(likes.map((item) => item.commentId))
}

/** 查询 viewer 对一批帖子的点赞/收藏状态 */
async function getViewerPostFlags(viewerUserId: string | null | undefined, postIds: string[]) {
  if (!viewerUserId || postIds.length === 0) {
    return { likedIds: new Set<string>(), bookmarkedIds: new Set<string>() }
  }

  const [likes, bookmarks] = await prisma.$transaction([
    prisma.postLike.findMany({
      where: { userId: viewerUserId, postId: { in: postIds } },
      select: { postId: true },
    }),
    prisma.postBookmark.findMany({
      where: { userId: viewerUserId, postId: { in: postIds } },
      select: { postId: true },
    }),
  ])

  return {
    likedIds: new Set(likes.map((item) => item.postId)),
    bookmarkedIds: new Set(bookmarks.map((item) => item.postId)),
  }
}

function attachPostViewerFlags(post: Post, flags: { likedIds: Set<string>; bookmarkedIds: Set<string> }): Post {
  return {
    ...post,
    likedByViewer: flags.likedIds.has(post.id),
    bookmarkedByViewer: flags.bookmarkedIds.has(post.id),
  }
}

export async function setPostLikeData(
  userId: string,
  postId: string,
  liked: boolean,
): Promise<{ liked: boolean; likeCount: number } | null> {
  await ensureUserExists(userId)
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) {
    return null
  }

  return prisma.$transaction(async (tx) => {
    if (liked) {
      const existing = await tx.postLike.findUnique({
        where: { postId_userId: { postId, userId } },
      })
      if (!existing) {
        await tx.postLike.create({ data: { postId, userId } })
        await tx.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } })
      }
    } else {
      const deleted = await tx.postLike.deleteMany({ where: { postId, userId } })
      if (deleted.count > 0) {
        await tx.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } })
      }
    }

    const updated = await tx.post.findUnique({ where: { id: postId }, select: { likeCount: true } })
    return { liked, likeCount: Math.max(0, updated?.likeCount ?? 0) }
  })
}

export async function setPostBookmarkData(
  userId: string,
  postId: string,
  bookmarked: boolean,
): Promise<{ bookmarked: boolean; favoriteCount: number } | null> {
  await ensureUserExists(userId)
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) {
    return null
  }

  return prisma.$transaction(async (tx) => {
    if (bookmarked) {
      const existing = await tx.postBookmark.findUnique({
        where: { postId_userId: { postId, userId } },
      })
      if (!existing) {
        await tx.postBookmark.create({ data: { postId, userId } })
        await tx.post.update({ where: { id: postId }, data: { favoriteCount: { increment: 1 } } })
      }
    } else {
      const deleted = await tx.postBookmark.deleteMany({ where: { postId, userId } })
      if (deleted.count > 0) {
        await tx.post.update({ where: { id: postId }, data: { favoriteCount: { decrement: 1 } } })
      }
    }

    const updated = await tx.post.findUnique({ where: { id: postId }, select: { favoriteCount: true } })
    return { bookmarked, favoriteCount: Math.max(0, updated?.favoriteCount ?? 0) }
  })
}

export async function setNovelFavoriteData(
  userId: string,
  novelId: string,
  favorited: boolean,
): Promise<{ favorited: boolean; favoriteCount: number } | null> {
  await ensureUserExists(userId)
  const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { id: true } })
  if (!novel) {
    return null
  }

  return prisma.$transaction(async (tx) => {
    if (favorited) {
      const existing = await tx.novelFavorite.findUnique({
        where: { novelId_userId: { novelId, userId } },
      })
      if (!existing) {
        await tx.novelFavorite.create({ data: { novelId, userId } })
        await tx.novel.update({ where: { id: novelId }, data: { favoriteCount: { increment: 1 } } })
      }
    } else {
      const deleted = await tx.novelFavorite.deleteMany({ where: { novelId, userId } })
      if (deleted.count > 0) {
        await tx.novel.update({ where: { id: novelId }, data: { favoriteCount: { decrement: 1 } } })
      }
    }

    const updated = await tx.novel.findUnique({ where: { id: novelId }, select: { favoriteCount: true } })
    return { favorited, favoriteCount: Math.max(0, updated?.favoriteCount ?? 0) }
  })
}

/** 我收藏的作品列表（按收藏时间倒序，只返回仍对外可见的作品） */
export async function listFavoriteNovelsData(userId: string): Promise<NovelCard[]> {
  const favorites = await prisma.novelFavorite.findMany({
    where: { userId, novel: { visibility: 'public' } },
    orderBy: { createdAt: 'desc' },
    include: { novel: { include: novelInclude } },
    take: 100,
  })

  return favorites.map((item) => toNovelCard(item.novel, userId))
}

// ---- 云端书架 + 阅读进度（多设备同步） ----

type ReadingProgressRow = {
  novelId: string
  novelTitle: string
  coverUrl: string | null
  chapterId: string | null
  chapterTitle: string | null
  chapterOrder: number
  totalChapters: number
  scrollPercent: number
  addedAt: Date
  updatedAt: Date
}

function clampPercent(value: number | undefined | null): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function toReadingProgressItem(row: ReadingProgressRow): ReadingProgressItem {
  return {
    novelId: row.novelId,
    novelTitle: row.novelTitle,
    coverUrl: row.coverUrl,
    chapterId: row.chapterId,
    chapterTitle: row.chapterTitle,
    chapterOrder: row.chapterOrder,
    totalChapters: row.totalChapters,
    scrollPercent: row.scrollPercent,
    addedAt: toIso(row.addedAt) ?? nowIso(),
    updatedAt: toIso(row.updatedAt) ?? nowIso(),
  }
}

/** 我的书架 + 阅读进度列表（按最近更新倒序） */
export async function listReadingProgressData(userId: string): Promise<ReadingProgressItem[]> {
  const rows = await prisma.readingProgress.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
  return rows.map(toReadingProgressItem)
}

/**
 * 保存书架/阅读进度（按 userId+novelId upsert）。
 * - scrollOnly：仅更新章内滚动位置，章节不匹配或无记录则忽略；
 * - shelfOnly：仅加入书架，已存在则保留原有进度不重置；
 * - 否则完整写入章节信息：同章重写保留章内进度，切换新章则从头（与本地语义一致）。
 * 作品不存在返回 null（路由据此回 404）。
 */
export async function saveReadingProgressData(
  userId: string,
  input: SaveReadingProgressRequest,
): Promise<ReadingProgressItem | null> {
  await ensureUserExists(userId)
  const novel = await prisma.novel.findUnique({ where: { id: input.novelId }, select: { id: true } })
  if (!novel) {
    return null
  }

  const existing = await prisma.readingProgress.findUnique({
    where: { userId_novelId: { userId, novelId: input.novelId } },
  })

  if (input.scrollOnly) {
    if (!existing || !input.chapterId || existing.chapterId !== input.chapterId) {
      return existing ? toReadingProgressItem(existing) : null
    }
    const updated = await prisma.readingProgress.update({
      where: { userId_novelId: { userId, novelId: input.novelId } },
      data: { scrollPercent: clampPercent(input.scrollPercent ?? existing.scrollPercent) },
    })
    return toReadingProgressItem(updated)
  }

  if (input.shelfOnly) {
    const saved = await prisma.readingProgress.upsert({
      where: { userId_novelId: { userId, novelId: input.novelId } },
      create: {
        userId,
        novelId: input.novelId,
        novelTitle: input.novelTitle,
        coverUrl: input.coverUrl ?? null,
      },
      update: {
        novelTitle: input.novelTitle,
        ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
      },
    })
    return toReadingProgressItem(saved)
  }

  const sameChapter = Boolean(existing && input.chapterId && existing.chapterId === input.chapterId)
  const nextScroll =
    input.scrollPercent !== undefined
      ? clampPercent(input.scrollPercent)
      : sameChapter
        ? existing?.scrollPercent ?? 0
        : 0

  const saved = await prisma.readingProgress.upsert({
    where: { userId_novelId: { userId, novelId: input.novelId } },
    create: {
      userId,
      novelId: input.novelId,
      novelTitle: input.novelTitle,
      coverUrl: input.coverUrl ?? null,
      chapterId: input.chapterId ?? null,
      chapterTitle: input.chapterTitle ?? null,
      chapterOrder: input.chapterOrder ?? 0,
      totalChapters: input.totalChapters ?? 0,
      scrollPercent: nextScroll,
    },
    update: {
      novelTitle: input.novelTitle,
      ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
      chapterId: input.chapterId ?? null,
      chapterTitle: input.chapterTitle ?? null,
      chapterOrder: input.chapterOrder ?? 0,
      totalChapters: input.totalChapters ?? 0,
      scrollPercent: nextScroll,
    },
  })
  return toReadingProgressItem(saved)
}

/** 从书架移除（删除该书的进度行） */
export async function removeReadingProgressData(userId: string, novelId: string): Promise<boolean> {
  const deleted = await prisma.readingProgress.deleteMany({ where: { userId, novelId } })
  return deleted.count > 0
}

// ── 阅读器段落划线（方案 20 §2.7） ────────────────────────────────────

/** 本章已划线的段落序号列表 */
export async function listParagraphUnderlinesData(userId: string, chapterId: string): Promise<number[]> {
  const rows = await prisma.paragraphUnderline.findMany({
    where: { userId, chapterId },
    select: { paragraphIndex: true },
    orderBy: { paragraphIndex: 'asc' },
  })
  return rows.map((row) => row.paragraphIndex)
}

/** 新增划线（幂等：已存在时直接返回成功） */
export async function saveParagraphUnderlineData(
  userId: string,
  input: { novelId: string; chapterId: string; paragraphIndex: number },
): Promise<boolean> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    select: { id: true, novelId: true },
  })
  if (!chapter || chapter.novelId !== input.novelId) {
    return false
  }

  await prisma.paragraphUnderline.upsert({
    where: {
      userId_chapterId_paragraphIndex: {
        userId,
        chapterId: input.chapterId,
        paragraphIndex: input.paragraphIndex,
      },
    },
    create: {
      userId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      paragraphIndex: input.paragraphIndex,
    },
    update: {},
  })
  return true
}

/** 取消划线（幂等） */
export async function removeParagraphUnderlineData(
  userId: string,
  chapterId: string,
  paragraphIndex: number,
): Promise<boolean> {
  const deleted = await prisma.paragraphUnderline.deleteMany({
    where: { userId, chapterId, paragraphIndex },
  })
  return deleted.count > 0
}

export async function setCommentLikeData(
  userId: string,
  commentId: string,
  liked: boolean,
): Promise<{ liked: boolean; likeCount: number } | null> {
  await ensureUserExists(userId)
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
  if (!comment) {
    return null
  }

  return prisma.$transaction(async (tx) => {
    if (liked) {
      const existing = await tx.commentLike.findUnique({
        where: { commentId_userId: { commentId, userId } },
      })
      if (!existing) {
        await tx.commentLike.create({ data: { commentId, userId } })
        await tx.comment.update({ where: { id: commentId }, data: { likeCount: { increment: 1 } } })
      }
    } else {
      const deleted = await tx.commentLike.deleteMany({ where: { commentId, userId } })
      if (deleted.count > 0) {
        await tx.comment.update({ where: { id: commentId }, data: { likeCount: { decrement: 1 } } })
      }
    }

    const updated = await tx.comment.findUnique({ where: { id: commentId }, select: { likeCount: true } })
    return { liked, likeCount: Math.max(0, updated?.likeCount ?? 0) }
  })
}

export type PostFeedSort = 'recommended' | 'latest'

/** 推荐流单轮候选集上限：千级帖子规模内存打分足够，避免全表扫描 */
const RECOMMEND_CANDIDATE_LIMIT = 500

/** 帖子推荐分（方案 18 §1.2）：对数压缩互动量 + 时间衰减；
 * age 以快照时间为基准，保证同一轮浏览翻页打分一致不跳位 */
function computePostRecommendScore(
  post: { likeCount: number; commentCount: number; favoriteCount: number; createdAt: Date },
  referenceMs: number,
): number {
  const ageHours = Math.max(0, (referenceMs - post.createdAt.getTime()) / 3_600_000)
  const engagement = post.likeCount * 3 + post.commentCount * 4 + post.favoriteCount * 5
  return Math.log2(1 + engagement) / Math.pow(ageHours + 2, 1.3)
}

export async function listPostsData(
  page: number,
  pageSize: number,
  topicId?: string,
  viewerUserId?: string | null,
  authorUserId?: string,
  sort: PostFeedSort = 'latest',
  snapshotAt?: string,
) {
  const where: Prisma.PostWhereInput = {
    // 话题过滤同时兼容旧单外键与新多对多关联（方案 18 §3）
    ...(topicId ? { OR: [{ topicId }, { topicLinks: { some: { topicId } } }] } : {}),
    ...(authorUserId ? { userId: authorUserId } : {}),
  }

  if (sort === 'recommended') {
    // 快照式游标：首页生成快照时间，翻页回传；快照后新帖不进本轮榜单，刷新重算
    const parsed = snapshotAt ? new Date(snapshotAt) : null
    const snapshot = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()

    const candidates = await prisma.post.findMany({
      where: { ...where, createdAt: { lte: snapshot } },
      include: postInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: RECOMMEND_CANDIDATE_LIMIT,
    })

    const referenceMs = snapshot.getTime()
    const ranked = candidates
      .map((item) => ({ item, score: computePostRecommendScore(item, referenceMs) }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        const timeDiff = b.item.createdAt.getTime() - a.item.createdAt.getTime()
        if (timeDiff !== 0) {
          return timeDiff
        }
        return b.item.id.localeCompare(a.item.id)
      })

    const start = (page - 1) * pageSize
    const pageItems = ranked.slice(start, start + pageSize).map((entry) => entry.item)

    const pageFlags = await getViewerPostFlags(
      viewerUserId,
      pageItems.map((item) => item.id),
    )

    return {
      items: pageItems.map((item) => attachPostViewerFlags(toPost(item), pageFlags)),
      pagination: buildPagination(page, pageSize, ranked.length),
      snapshotAt: snapshot.toISOString(),
    }
  }

  const [items, total] = await prisma.$transaction([
    prisma.post.findMany({
      where,
      include: postInclude,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.post.count({ where }),
  ])

  const flags = await getViewerPostFlags(
    viewerUserId,
    items.map((item) => item.id),
  )

  return {
    items: items.map((item) => attachPostViewerFlags(toPost(item), flags)),
    pagination: buildPagination(page, pageSize, total),
  }
}

/** 对读者可见的公开章节条件：已发布且公开 */
const publicChapterWhere = {
  status: 'published',
  visibility: 'public',
} satisfies Prisma.ChapterWhereInput

/** 公开可搜索的作品过滤条件：与首页榜单候选池口径一致；
 * 额外要求至少有一个公开章节，避免发布后又全部设为仅自己可见的空壳作品对外展示 */
const searchableNovelWhere = {
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

export async function getPostDetailData(postId: string, viewerUserId?: string | null): Promise<PostDetailPayload | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: postInclude,
  })

  if (!post) {
    return null
  }

  const [commentRecords, relatedPosts] = await prisma.$transaction([
    prisma.comment.findMany({
      where: {
        targetType: 'post',
        targetId: postId,
      },
      include: commentInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: COMMENT_RANK_FETCH_LIMIT,
    }),
    prisma.post.findMany({
      where: {
        id: { not: postId },
      },
      include: postInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 4,
    }),
  ])

  // 帖子详情评论与列表接口同一套排序策略（热门优先 + 楼中楼正序）
  const rankedComments = rankCommentRecords(commentRecords, 'post')

  const [flags, likedCommentIds] = await Promise.all([
    getViewerPostFlags(viewerUserId, [postId, ...relatedPosts.map((item) => item.id)]),
    getViewerLikedCommentIds(
      viewerUserId,
      rankedComments.map((item) => item.id),
    ),
  ])

  return {
    post: attachPostViewerFlags(toPost(post), flags),
    comments: rankedComments.map((item) => ({ ...toComment(item), likedByViewer: likedCommentIds.has(item.id) })),
    relatedPosts: relatedPosts.map((item) => attachPostViewerFlags(toPost(item), flags)),
  }
}

export async function createPostData(userId: string, input: CreatePostRequest): Promise<Post> {
  await ensureUserExists(userId)
  ensureNonEmptyText(input.content, 'content')

  // 分享作者卡片：先校验目标用户存在，避免外键报错变成 500
  if (input.sharedUserId) {
    const sharedUser = await prisma.user.findUnique({ where: { id: input.sharedUserId } })
    if (!sharedUser) {
      throw new DataAccessError(404, 'USER_NOT_FOUND', '未找到要分享的作者。')
    }
  }

  // 服务端解析 # 为准（方案 18 §3.2）：自动创建缺失话题，单帖上限 5 个
  const topicNames = extractTopicNames(input.content)

  const post = await prisma.$transaction(async (tx) => {
    const topicIds: string[] = []
    for (const name of topicNames) {
      const existing = await tx.topic.findUnique({ where: { name } })
      if (existing) {
        topicIds.push(existing.id)
        continue
      }
      // slug 碰撞时加时间后缀兼容，保证创建不因唯一约束失败
      const baseSlug = buildSlug(name)
      const slugTaken = await tx.topic.findUnique({ where: { slug: baseSlug } })
      const createdTopic = await tx.topic.create({
        data: { name, slug: slugTaken ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug },
      })
      topicIds.push(createdTopic.id)
    }

    // 旧客户端仍可能直传 topicId：正文无 # 时作为兑底话题
    if (topicIds.length === 0 && input.topicId) {
      const legacyTopic = await tx.topic.findUnique({ where: { id: input.topicId } })
      if (legacyTopic) {
        topicIds.push(legacyTopic.id)
      }
    }

    const created = await tx.post.create({
      data: {
        userId,
        // 主话题写回单外键，兼容话题频道栏等旧链路
        topicId: topicIds[0] ?? null,
        relatedNovelId: input.relatedNovelId ?? null,
        sharedUserId: input.sharedUserId ?? null,
        content: input.content,
        excerpt: excerptContent(input.content),
        imageUrls: input.imageUrls ?? [],
        auditStatus: 'pending',
      },
      include: postInclude,
    })

    if (topicIds.length > 0) {
      await tx.postTopic.createMany({
        data: topicIds.map((topicId) => ({ postId: created.id, topicId })),
        skipDuplicates: true,
      })
      // 计数按关联表实量回算（与 listTopicsData 的实时计数口径一致）
      for (const topicId of topicIds) {
        const linkedCount = await tx.postTopic.count({ where: { topicId } })
        await tx.topic.updateMany({ where: { id: topicId }, data: { postCount: linkedCount } })
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        postCount: {
          increment: 1,
        },
      },
    })

    return created
  })

  return toPost(post)
}

/** 删除自己的帖子：连同评论/点赞/收藏/话题关联一并清理，计数回算 */
export async function deletePostData(userId: string, postId: string): Promise<boolean | null> {
  const existing = await prisma.post.findUnique({
    where: { id: postId },
    include: { topicLinks: true },
  })
  if (!existing) {
    return null
  }
  if (existing.userId !== userId) {
    throw new DataAccessError(403, 'FORBIDDEN', '只能删除自己的动态。')
  }

  await prisma.$transaction(async (tx) => {
    const commentIds = (
      await tx.comment.findMany({
        where: { targetType: 'post', targetId: postId },
        select: { id: true },
      })
    ).map((item) => item.id)

    if (commentIds.length > 0) {
      await tx.commentLike.deleteMany({ where: { commentId: { in: commentIds } } })
      await tx.comment.deleteMany({ where: { id: { in: commentIds } } })
    }
    await tx.postLike.deleteMany({ where: { postId } })
    await tx.postBookmark.deleteMany({ where: { postId } })
    await tx.postTopic.deleteMany({ where: { postId } })
    await tx.post.delete({ where: { id: postId } })

    // 话题计数回算（含主话题与多话题关联），避免 decrement 出现负数
    const topicIds = new Set<string>()
    if (existing.topicId) {
      topicIds.add(existing.topicId)
    }
    for (const link of existing.topicLinks) {
      topicIds.add(link.topicId)
    }
    for (const topicId of topicIds) {
      const remaining = await tx.postTopic.count({ where: { topicId } })
      await tx.topic.updateMany({ where: { id: topicId }, data: { postCount: remaining } })
    }

    const remainingPosts = await tx.post.count({ where: { userId } })
    await tx.user.updateMany({ where: { id: userId }, data: { postCount: remainingPosts } })
  })

  return true
}

export async function getMePayloadData(userId: string): Promise<UserMePayload> {
  const user = await ensureUserExists(userId)

  const [draftChapters, recentPosts, recentComments, recentConversations, recentCoverAssets, authoredNovels] = await prisma.$transaction([
      prisma.chapter.findMany({
        where: {
          authorId: userId,
          status: 'draft',
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 6,
      }),
      prisma.post.findMany({
        where: { userId },
        include: postInclude,
        orderBy: [{ createdAt: 'desc' }],
        take: 3,
      }),
      prisma.comment.findMany({
        where: { userId },
        include: commentInclude,
        orderBy: [{ createdAt: 'desc' }],
        take: 3,
      }),
      prisma.conversation.findMany({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
        include: conversationInclude,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        take: 3,
      }),
      prisma.coverAsset.findMany({
        where: {
          ownerUserId: userId,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 1,
      }),
      prisma.novel.findMany({
        where: {
          authorId: userId,
        },
        include: novelInclude,
        orderBy: [{ updatedAt: 'desc' }],
      }),
    ])

  return {
    user: { ...toUser(user), privacy: toPrivacySettings(user) },
    shelf: [],
    drafts: draftChapters.map((chapter) => ({
      id: `draft-${chapter.id}`,
      novelId: chapter.novelId,
      chapterId: chapter.id,
      title: chapter.title,
      summary: chapter.summary ?? '等待继续创作',
      updatedAt: toIso(chapter.updatedAt) ?? nowIso(),
      statusLabel: chapter.status === 'draft' ? '草稿' : chapter.status,
    })),
    activities: [
      ...recentPosts.map((post) => ({
        id: `activity-post-${post.id}`,
        type: 'post',
        title: '发布了动态',
        content: excerptContent(post.content),
        createdAt: toIso(post.createdAt) ?? nowIso(),
      })),
      ...recentComments.map((comment) => ({
        id: `activity-comment-${comment.id}`,
        type: 'comment',
        title: '留下了评论',
        content: excerptContent(comment.content),
        createdAt: toIso(comment.createdAt) ?? nowIso(),
      })),
    ].slice(0, 6),
    notifications: recentComments.map((comment) => ({
      id: `notification-${comment.id}`,
      category: '互动',
      title: '最新评论',
      content: excerptContent(comment.content),
      createdAt: toIso(comment.createdAt) ?? nowIso(),
      read: true,
    })),
    unreadMessageCount: user.unreadMessageCount ?? 0,
    unreadNotificationCount: user.unreadNotificationCount ?? 0,
    recentConversations: recentConversations.map((conversation) => toConversation(conversation, userId)),
    recentCoverAsset: recentCoverAssets[0] ? toCoverAsset(recentCoverAssets[0]) : null,
    authoredNovels: authoredNovels.map((novel) => toNovel(novel, userId)),
    statCards: [
      {
        id: 'stat-novels',
        label: '作品',
        value: String(user.novelCount ?? 0),
      },
      {
        id: 'stat-posts',
        label: '动态',
        value: String(user.postCount ?? 0),
      },
      {
        id: 'stat-messages',
        label: '私信',
        value: String(user.unreadMessageCount ?? 0),
      },
    ],
  }
}

export async function getUserByIdData(userId: string, viewerUserId?: string | null): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    return null
  }

  const payload = toUser(user)

  // 作者主页展示的作品数只统计对外可见的作品，不含草稿/私密/无公开章节的作品
  payload.novelCount = await prisma.novel.count({
    where: { authorId: user.id, ...searchableNovelWhere },
  })

  // 登录态下查看他人主页时，补充“我是否已关注 TA”，驱动关注按钮状态
  if (viewerUserId && viewerUserId !== user.id) {
    const follow = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: viewerUserId, followingId: user.id } },
      select: { id: true },
    })
    payload.followedByViewer = Boolean(follow)
  }

  // 本人带上隐私设置；任意查看者都带上各隐私区块的可见性，驱动前端隐藏对应入口
  if (viewerUserId === user.id) {
    payload.privacy = toPrivacySettings(user)
  }
  payload.visibility = await resolveProfileVisibility(user, viewerUserId ?? null)

  return payload
}

export async function setUserFollowData(
  viewerUserId: string,
  targetUserId: string,
  following: boolean,
): Promise<{ following: boolean; followerCount: number } | null> {
  await ensureUserExists(viewerUserId)

  if (viewerUserId === targetUserId) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '不能关注自己。')
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } })
  if (!target) {
    return null
  }

  return prisma.$transaction(async (tx) => {
    if (following) {
      const existing = await tx.userFollow.findUnique({
        where: { followerId_followingId: { followerId: viewerUserId, followingId: targetUserId } },
      })
      if (!existing) {
        await tx.userFollow.create({ data: { followerId: viewerUserId, followingId: targetUserId } })
        await tx.user.update({ where: { id: targetUserId }, data: { followerCount: { increment: 1 } } })
        await tx.user.update({ where: { id: viewerUserId }, data: { followingCount: { increment: 1 } } })
      }
    } else {
      const deleted = await tx.userFollow.deleteMany({
        where: { followerId: viewerUserId, followingId: targetUserId },
      })
      if (deleted.count > 0) {
        await tx.user.update({ where: { id: targetUserId }, data: { followerCount: { decrement: 1 } } })
        await tx.user.update({ where: { id: viewerUserId }, data: { followingCount: { decrement: 1 } } })
      }
    }

    const updated = await tx.user.findUnique({ where: { id: targetUserId }, select: { followerCount: true } })
    return { following, followerCount: Math.max(0, updated?.followerCount ?? 0) }
  })
}

const PRIVACY_LEVELS: PrivacyLevel[] = ['public', 'private', 'mutual']

function toPrivacySettings(user: any): PrivacySettings {
  return {
    followers: (user.privacyFollowers ?? 'public') as PrivacyLevel,
    following: (user.privacyFollowing ?? 'public') as PrivacyLevel,
    likes: (user.privacyLikes ?? 'public') as PrivacyLevel,
    favorites: (user.privacyFavorites ?? 'public') as PrivacyLevel,
    replies: (user.privacyReplies ?? 'public') as PrivacyLevel,
  }
}

/** 互相关注判定：双向 follow 记录都存在 */
async function areMutualFollows(userId: string, viewerUserId: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: viewerUserId, followingId: userId } },
      select: { id: true },
    }),
    prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: viewerUserId } },
      select: { id: true },
    }),
  ])
  return Boolean(a && b)
}

function canViewByLevel(level: PrivacyLevel, isSelf: boolean, isMutual: boolean): boolean {
  if (isSelf || level === 'public') {
    return true
  }
  if (level === 'mutual') {
    return isMutual
  }
  return false
}

/** 计算目标用户各隐私区块对查看者的可见性；仅在确实需要时才查互关关系 */
async function resolveProfileVisibility(targetUser: any, viewerUserId: string | null): Promise<ProfileVisibility> {
  const isSelf = Boolean(viewerUserId && viewerUserId === targetUser.id)
  const settings = toPrivacySettings(targetUser)
  const levels = [settings.followers, settings.following, settings.likes, settings.favorites, settings.replies]
  const needMutual = !isSelf && Boolean(viewerUserId) && levels.includes('mutual')
  const isMutual = needMutual ? await areMutualFollows(targetUser.id, viewerUserId as string) : false

  return {
    followers: canViewByLevel(settings.followers, isSelf, isMutual),
    following: canViewByLevel(settings.following, isSelf, isMutual),
    likes: canViewByLevel(settings.likes, isSelf, isMutual),
    favorites: canViewByLevel(settings.favorites, isSelf, isMutual),
    replies: canViewByLevel(settings.replies, isSelf, isMutual),
  }
}

/** 把一批关注关系记录映射为列表条目，并标记“查看者是否已关注对方/对方是否关注查看者” */
async function toFollowUserItems(
  records: Array<{ createdAt: Date; user: any }>,
  viewerUserId: string | null,
): Promise<FollowUserItem[]> {
  const userIds = records.map((record) => record.user.id)
  const followedIds = new Set<string>()
  const followerIds = new Set<string>()

  if (viewerUserId && userIds.length > 0) {
    const [followingRows, followerRows] = await Promise.all([
      prisma.userFollow.findMany({
        where: { followerId: viewerUserId, followingId: { in: userIds } },
        select: { followingId: true },
      }),
      prisma.userFollow.findMany({
        where: { followerId: { in: userIds }, followingId: viewerUserId },
        select: { followerId: true },
      }),
    ])
    followingRows.forEach((row) => followedIds.add(row.followingId))
    followerRows.forEach((row) => followerIds.add(row.followerId))
  }

  return records.map((record) => ({
    ...toUserSummary(record.user),
    followerCount: record.user.followerCount ?? 0,
    followedByViewer: followedIds.has(record.user.id),
    followsViewer: followerIds.has(record.user.id),
    followedAt: toIso(record.createdAt) ?? nowIso(),
    presence: isUserOnline(record.user.lastActiveAt) ? ('online' as const) : ('offline' as const),
  }))
}

export async function listUserFollowersData(
  userId: string,
  viewerUserId: string | null,
): Promise<{ items: FollowUserItem[]; total: number; restricted?: boolean }> {
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) {
    return { items: [], total: 0 }
  }

  // 隐私拦截：目标用户把粉丝列表设为私密/仅互关时，无权查看者拿到 restricted 标记
  const visibility = await resolveProfileVisibility(target, viewerUserId)
  if (!visibility.followers) {
    return { items: [], total: 0, restricted: true }
  }

  const records = await prisma.userFollow.findMany({
    where: { followingId: userId },
    include: { follower: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const items = await toFollowUserItems(
    records.map((record) => ({ createdAt: record.createdAt, user: record.follower })),
    viewerUserId,
  )
  return { items, total: items.length }
}

export async function listUserFollowingData(
  userId: string,
  viewerUserId: string | null,
): Promise<{ items: FollowUserItem[]; total: number; restricted?: boolean }> {
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) {
    return { items: [], total: 0 }
  }

  const visibility = await resolveProfileVisibility(target, viewerUserId)
  if (!visibility.following) {
    return { items: [], total: 0, restricted: true }
  }

  const records = await prisma.userFollow.findMany({
    where: { followerId: userId },
    include: { following: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const items = await toFollowUserItems(
    records.map((record) => ({ createdAt: record.createdAt, user: record.following })),
    viewerUserId,
  )
  return { items, total: items.length }
}

/** 更新我的隐私设置：只改传入的维度，返回最新全量设置 */
export async function updateMyPrivacyData(
  userId: string,
  input: Partial<PrivacySettings>,
): Promise<PrivacySettings> {
  await ensureUserExists(userId)

  const fieldMap: Record<keyof PrivacySettings, string> = {
    followers: 'privacyFollowers',
    following: 'privacyFollowing',
    likes: 'privacyLikes',
    favorites: 'privacyFavorites',
    replies: 'privacyReplies',
  }

  const data: Record<string, PrivacyLevel> = {}
  for (const key of Object.keys(fieldMap) as Array<keyof PrivacySettings>) {
    const value = input[key]
    if (value === undefined) {
      continue
    }
    if (!PRIVACY_LEVELS.includes(value)) {
      throw new DataAccessError(400, 'VALIDATION_ERROR', '隐私级别不合法。')
    }
    data[fieldMap[key]] = value
  }

  if (Object.keys(data).length === 0) {
    const user = await ensureUserExists(userId)
    return toPrivacySettings(user)
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: data as any })
  return toPrivacySettings(updated)
}

/** 喜欢列表：用户赞过的帖子，受 favorites 隐私级别管控 */
export async function listUserLikedPostsData(
  userId: string,
  viewerUserId: string | null,
): Promise<{ items: Post[]; total: number; restricted?: boolean }> {
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) {
    throw new DataAccessError(404, 'USER_NOT_FOUND', '未找到用户。')
  }

  const visibility = await resolveProfileVisibility(target, viewerUserId)
  if (!visibility.favorites) {
    return { items: [], total: 0, restricted: true }
  }

  const records = await prisma.postLike.findMany({
    where: { userId },
    include: { post: { include: postInclude } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const flags = await getViewerPostFlags(viewerUserId, records.map((record) => record.post.id))
  const items = records.map((record) => attachPostViewerFlags(toPost(record.post), flags))
  return { items, total: items.length }
}

/** 收藏的帖子列表：个人收藏夹性质，仅本人可见 */
export async function listUserBookmarkedPostsData(
  userId: string,
  viewerUserId: string | null,
): Promise<{ items: Post[]; total: number; restricted?: boolean }> {
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) {
    throw new DataAccessError(404, 'USER_NOT_FOUND', '未找到用户。')
  }

  if (!viewerUserId || viewerUserId !== userId) {
    return { items: [], total: 0, restricted: true }
  }

  const records = await prisma.postBookmark.findMany({
    where: { userId },
    include: { post: { include: postInclude } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const flags = await getViewerPostFlags(viewerUserId, records.map((record) => record.post.id))
  const items = records.map((record) => attachPostViewerFlags(toPost(record.post), flags))
  return { items, total: items.length }
}

/** 已回复列表：用户发出的帖子/作品/章节评论，受 replies 隐私级别管控 */
export async function listUserRepliesData(
  userId: string,
  viewerUserId: string | null,
): Promise<{ items: UserReplyItem[]; total: number; restricted?: boolean }> {
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) {
    throw new DataAccessError(404, 'USER_NOT_FOUND', '未找到用户。')
  }

  const visibility = await resolveProfileVisibility(target, viewerUserId)
  if (!visibility.replies) {
    return { items: [], total: 0, restricted: true }
  }

  const records = await prisma.comment.findMany({
    where: { userId },
    include: {
      post: { select: { id: true, excerpt: true, content: true } },
      novel: { select: { id: true, title: true, displayTitle: true } },
      chapter: {
        select: {
          id: true,
          title: true,
          novelId: true,
          novel: { select: { id: true, title: true, displayTitle: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const likedCommentIds = await getViewerLikedCommentIds(viewerUserId, records.map((record) => record.id))

  const items: UserReplyItem[] = records.map((record) => {
    const novel = record.novel ?? record.chapter?.novel ?? null

    return {
      id: record.id,
      targetType: record.targetType as CommentTargetType,
      content: record.content,
      rating: record.rating ?? null,
      likeCount: record.likeCount ?? 0,
      likedByViewer: likedCommentIds.has(record.id),
      postId: record.postId ?? null,
      novelId: record.novelId ?? record.chapter?.novelId ?? null,
      novelTitle: novel ? resolveEffectiveNovelTitle(novel.title, novel.displayTitle) : null,
      chapterTitle: record.chapter?.title ?? null,
      targetExcerpt: record.post ? record.post.excerpt || excerptContent(record.post.content) : null,
      createdAt: toIso(record.createdAt) ?? nowIso(),
    }
  })

  return { items, total: items.length }
}

export async function listReceivedLikesData(userId: string): Promise<{ items: ReceivedLikeItem[]; total: number }> {
  await ensureUserExists(userId)

  // 别人给我的帖子/评论点的赞：各取最近 100 条后合并按时间降序
  const [postLikes, commentLikes] = await Promise.all([
    prisma.postLike.findMany({
      where: { post: { userId }, userId: { not: userId } },
      include: { user: true, post: { select: { id: true, excerpt: true, content: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.commentLike.findMany({
      where: { comment: { userId }, userId: { not: userId } },
      include: { user: true, comment: { select: { id: true, content: true, postId: true, novelId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  const items: ReceivedLikeItem[] = [
    ...postLikes.map((record) => ({
      id: `post-like-${record.id}`,
      user: toUserSummary(record.user),
      targetType: 'post' as const,
      excerpt: record.post.excerpt || excerptContent(record.post.content),
      postId: record.post.id,
      novelId: null,
      likedAt: toIso(record.createdAt) ?? nowIso(),
    })),
    ...commentLikes.map((record) => ({
      id: `comment-like-${record.id}`,
      user: toUserSummary(record.user),
      targetType: 'comment' as const,
      excerpt: excerptContent(record.comment.content),
      postId: record.comment.postId ?? null,
      novelId: record.comment.novelId ?? null,
      likedAt: toIso(record.createdAt) ?? nowIso(),
    })),
  ]
    .sort((a, b) => (a.likedAt < b.likedAt ? 1 : -1))
    .slice(0, 100)

  return { items, total: items.length }
}

export async function listInteractionsData(userId: string): Promise<{ items: InteractionItem[]; total: number }> {
  await ensureUserExists(userId)

  // 互动消息全部从现有表派生：赞/收藏/作品评论/章节评论/回复我的评论，各取最近 100 条合并按时间降序
  const [postLikes, commentLikes, favorites, commentRecords, replyRecords] = await Promise.all([
    prisma.postLike.findMany({
      where: { post: { userId }, userId: { not: userId } },
      include: { user: true, post: { select: { id: true, excerpt: true, content: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.commentLike.findMany({
      where: { comment: { userId }, userId: { not: userId } },
      include: { user: true, comment: { select: { id: true, content: true, postId: true, novelId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.novelFavorite.findMany({
      where: { novel: { authorId: userId }, userId: { not: userId } },
      include: { user: true, novel: { select: { id: true, title: true, displayTitle: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.comment.findMany({
      where: {
        userId: { not: userId },
        OR: [
          { targetType: 'novel', novel: { authorId: userId } },
          { targetType: 'chapter', chapter: { authorId: userId } },
        ],
      },
      include: {
        author: true,
        novel: { select: { id: true, title: true, displayTitle: true } },
        chapter: {
          select: {
            id: true,
            title: true,
            novelId: true,
            novel: { select: { id: true, title: true, displayTitle: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    // 回复我的评论：父评论作者是我、非我本人发出；
    // 排除目标内容作者是我的情况（这类已作为作品/章节评论出现在 feed 里，避免重复）
    prisma.comment.findMany({
      where: {
        userId: { not: userId },
        parentId: { not: null },
        parent: { userId },
        NOT: [
          { targetType: 'novel', novel: { authorId: userId } },
          { targetType: 'chapter', chapter: { authorId: userId } },
        ],
      },
      include: {
        author: true,
        novel: { select: { id: true, title: true, displayTitle: true } },
        chapter: {
          select: {
            id: true,
            title: true,
            novelId: true,
            novel: { select: { id: true, title: true, displayTitle: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  const items: InteractionItem[] = [
    ...postLikes.map((record) => ({
      id: `post-like-${record.id}`,
      user: toUserSummary(record.user),
      kind: 'postLike' as const,
      excerpt: record.post.excerpt || excerptContent(record.post.content),
      postId: record.post.id,
      novelId: null,
      happenedAt: toIso(record.createdAt) ?? nowIso(),
    })),
    ...commentLikes.map((record) => ({
      id: `comment-like-${record.id}`,
      user: toUserSummary(record.user),
      kind: 'commentLike' as const,
      excerpt: excerptContent(record.comment.content),
      postId: record.comment.postId ?? null,
      novelId: record.comment.novelId ?? null,
      happenedAt: toIso(record.createdAt) ?? nowIso(),
    })),
    ...favorites.map((record) => ({
      id: `novel-favorite-${record.id}`,
      user: toUserSummary(record.user),
      kind: 'novelFavorite' as const,
      excerpt: '',
      postId: null,
      novelId: record.novel.id,
      novelTitle: resolveEffectiveNovelTitle(record.novel.title, record.novel.displayTitle),
      happenedAt: toIso(record.createdAt) ?? nowIso(),
    })),
    ...commentRecords.map((record) => {
      const isChapterComment = record.targetType === 'chapter'
      const novelMeta = isChapterComment ? record.chapter?.novel : record.novel
      return {
        id: `comment-${record.id}`,
        user: toUserSummary(record.author),
        kind: (isChapterComment ? 'chapterComment' : 'novelComment') as InteractionItem['kind'],
        excerpt: excerptContent(record.content),
        rating: record.rating ?? null,
        postId: null,
        novelId: novelMeta?.id ?? record.novelId ?? record.chapter?.novelId ?? null,
        chapterId: isChapterComment ? record.chapter?.id ?? null : null,
        novelTitle: novelMeta ? resolveEffectiveNovelTitle(novelMeta.title, novelMeta.displayTitle) : null,
        chapterTitle: isChapterComment ? record.chapter?.title ?? null : null,
        happenedAt: toIso(record.createdAt) ?? nowIso(),
      }
    }),
    ...replyRecords.map((record) => {
      const isChapterReply = record.targetType === 'chapter'
      const novelMeta = isChapterReply ? record.chapter?.novel : record.novel
      return {
        id: `comment-reply-${record.id}`,
        user: toUserSummary(record.author),
        kind: 'commentReply' as const,
        excerpt: excerptContent(record.content),
        rating: null,
        postId: record.postId ?? null,
        novelId: novelMeta?.id ?? record.novelId ?? record.chapter?.novelId ?? null,
        chapterId: isChapterReply ? record.chapter?.id ?? null : null,
        novelTitle: novelMeta ? resolveEffectiveNovelTitle(novelMeta.title, novelMeta.displayTitle) : null,
        chapterTitle: isChapterReply ? record.chapter?.title ?? null : null,
        happenedAt: toIso(record.createdAt) ?? nowIso(),
      }
    }),
  ]
    .sort((a, b) => (a.happenedAt < b.happenedAt ? 1 : -1))
    .slice(0, 100)

  return { items, total: items.length }
}

export async function getInteractionBadgesData(userId: string): Promise<InteractionBadges> {
  const user = await ensureUserExists(userId)
  const interactionsSeenAt = user.interactionsSeenAt ?? null
  const followersSeenAt = user.followersSeenAt ?? null
  const interactionsAfter = interactionsSeenAt ? { createdAt: { gt: interactionsSeenAt } } : {}
  const followersAfter = followersSeenAt ? { createdAt: { gt: followersSeenAt } } : {}

  // 未读数 = 已读水位之后新产生的互动/新粉丝条数，与互动 feed 口径保持一致
  const [postLikeCount, commentLikeCount, favoriteCount, commentCount, replyCount, followerCount] =
    await prisma.$transaction([
      prisma.postLike.count({ where: { post: { userId }, userId: { not: userId }, ...interactionsAfter } }),
      prisma.commentLike.count({ where: { comment: { userId }, userId: { not: userId }, ...interactionsAfter } }),
      prisma.novelFavorite.count({ where: { novel: { authorId: userId }, userId: { not: userId }, ...interactionsAfter } }),
      prisma.comment.count({
        where: {
          userId: { not: userId },
          OR: [
            { targetType: 'novel', novel: { authorId: userId } },
            { targetType: 'chapter', chapter: { authorId: userId } },
          ],
          ...interactionsAfter,
        },
      }),
      prisma.comment.count({
        where: {
          userId: { not: userId },
          parentId: { not: null },
          parent: { userId },
          NOT: [
            { targetType: 'novel', novel: { authorId: userId } },
            { targetType: 'chapter', chapter: { authorId: userId } },
          ],
          ...interactionsAfter,
        },
      }),
      prisma.userFollow.count({ where: { followingId: userId, ...followersAfter } }),
    ])

  return {
    interactionsUnseen: postLikeCount + commentLikeCount + favoriteCount + commentCount + replyCount,
    interactionsSeenAt: toIso(interactionsSeenAt),
    followersUnseen: followerCount,
    followersSeenAt: toIso(followersSeenAt),
  }
}

export async function markInteractionSeenData(
  userId: string,
  target: 'interactions' | 'followers',
): Promise<InteractionBadges> {
  await ensureUserExists(userId)
  await prisma.user.update({
    where: { id: userId },
    data: target === 'interactions' ? { interactionsSeenAt: new Date() } : { followersSeenAt: new Date() },
  })
  return getInteractionBadgesData(userId)
}

export async function registerUserData(input: {
  email?: string
  phone?: string
  nickname?: string
  password?: string
}): Promise<User> {
  const email = input.email?.trim() || undefined
  const phone = input.phone ? normalizePhoneNumber(input.phone) : undefined
  const password = input.password?.trim() ? ensureNonEmptyText(input.password, 'password') : undefined
  const nickname = input.nickname?.trim()
    ? ensureNonEmptyText(input.nickname, 'nickname')
    : await buildAutoNickname({ phone, email })

  if (!email && !phone) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '请至少填写邮箱或手机号。')
  }

  const duplicated = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
        { nickname },
      ],
    },
  })

  if (duplicated) {
    throw new DataAccessError(409, 'AUTH_ACCOUNT_EXISTS', '该账号或昵称已被使用。')
  }

  const created = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: email ?? null,
      phone: phone ?? null,
      passwordHash: password ? hashPassword(password) : createUnsetPasswordHash(),
      nickname,
      avatarUrl: null,
      bio: null,
      role: 'user',
      isAuthor: false,
    },
  })

  return toUser(created)
}

export async function loginUserData(phone: string, password: string): Promise<User | null> {
  const normalizedPhone = normalizePhoneNumber(ensureNonEmptyText(phone, 'phone'))
  const normalizedPassword = ensureNonEmptyText(password, 'password')

  const user = await prisma.user.findFirst({
    where: {
      phone: normalizedPhone,
    },
  })

  if (!user) {
    return null
  }

  if (!verifyPassword(normalizedPassword, user.passwordHash)) {
    return null
  }

  return toUser(user)
}

export async function getUserByPhoneData(phone: string): Promise<User | null> {
  const user = await prisma.user.findFirst({
    where: {
      phone,
    },
  })

  return user ? toUser(user) : null
}

export async function getUserCredentialData(userId: string): Promise<{ phone: string | null; passwordHash: string | null }> {
  const user = await ensureUserExists(userId)
  return { phone: user.phone, passwordHash: user.passwordHash }
}

export async function updateMyPasswordData(userId: string, password: string): Promise<User> {
  await ensureUserExists(userId)
  const normalizedPassword = ensureNonEmptyText(password, 'password')

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashPassword(normalizedPassword),
    },
  })

  return toUser(updated)
}

export async function updateMyProfileData(
  userId: string,
  input: {
    nickname: string
    bio?: string
  },
): Promise<User> {
  await ensureUserExists(userId)
  const nickname = ensureNonEmptyText(input.nickname, 'nickname')
  const bio = input.bio?.trim() || null

  const duplicated = await prisma.user.findFirst({
    where: {
      nickname,
      id: {
        not: userId,
      },
    },
  })

  if (duplicated) {
    throw new DataAccessError(409, 'AUTH_ACCOUNT_EXISTS', '该昵称已被使用，请换一个。')
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      nickname,
      bio,
    },
  })

  return toUser(updated)
}

export async function updateMyAvatarData(userId: string, avatarUrl: string | null): Promise<{
  user: User
  previousAvatarUrl: string | null
}> {
  await ensureUserExists(userId)

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
    },
  })

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      avatarUrl,
    },
  })

  return {
    user: toUser(updated),
    previousAvatarUrl: currentUser?.avatarUrl ?? null,
  }
}

export async function updateMyProfileCoverData(userId: string, profileCoverUrl: string | null): Promise<{
  user: User
  previousProfileCoverUrl: string | null
}> {
  await ensureUserExists(userId)

  const currentUser = (await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profileCoverUrl: true,
    } as any,
  })) as { profileCoverUrl?: string | null } | null

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      profileCoverUrl,
    } as any,
  })

  return {
    user: toUser(updated),
    previousProfileCoverUrl: currentUser?.profileCoverUrl ?? null,
  }
}

/** 创建或复用与目标用户的双人直聊会话；目标用户不存在时返回 null */
export async function createDirectConversationData(
  viewerUserId: string,
  targetUserId: string,
): Promise<Conversation | null> {
  await ensureUserExists(viewerUserId)

  if (viewerUserId === targetUserId) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '不能给自己发私信。')
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } })
  if (!target) {
    return null
  }

  // 已存在的双人直聊直接复用，避免重复建会话
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'direct',
      AND: [
        { members: { some: { userId: viewerUserId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
    include: conversationInclude,
  })

  if (existing) {
    const [enriched] = await attachDirectFollowRelations([toConversation(existing, viewerUserId)], viewerUserId)
    return enriched
  }

  const created = await prisma.conversation.create({
    data: {
      type: 'direct',
      members: {
        create: [{ userId: viewerUserId }, { userId: targetUserId }],
      },
    },
    include: conversationInclude,
  })

  const [enriched] = await attachDirectFollowRelations([toConversation(created, viewerUserId)], viewerUserId)
  return enriched
}

export async function listConversationsData(userId: string, page: number, pageSize: number) {
  await ensureUserExists(userId)

  const [items, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: conversationInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conversation.count({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
    }),
  ])

  // 按成员 lastReadAt 计算真实未读数（他人发送且晚于上次已读）
  const unreadCounts = await Promise.all(
    items.map((item) => {
      const member = item.members.find((entry) => entry.userId === userId)
      return prisma.message.count({
        where: {
          conversationId: item.id,
          senderId: { not: userId },
          createdAt: { gt: member?.lastReadAt ?? new Date(0) },
        },
      })
    }),
  )

  return {
    items: await attachDirectFollowRelations(
      items.map((item, index) => ({ ...toConversation(item, userId), unreadCount: unreadCounts[index] })),
      userId,
    ),
    pagination: buildPagination(page, pageSize, total),
  }
}

export async function markConversationReadData(
  userId: string,
  conversationId: string,
): Promise<{ conversationId: string; lastReadAt: string }> {
  await ensureConversationMember(userId, conversationId)

  const now = new Date()
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: now },
  })

  return { conversationId, lastReadAt: now.toISOString() }
}

export async function listMessagesData(userId: string, conversationId: string, page: number, pageSize: number) {
  const conversation = await ensureConversationMember(userId, conversationId)

  const [items, total] = await prisma.$transaction([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.message.count({
      where: { conversationId },
    }),
  ])

  const [conversationPayload] = await attachDirectFollowRelations([toConversation(conversation, userId)], userId)

  return {
    conversation: conversationPayload,
    ...paginate(await attachMessageCards(items.map(toMessage)), page, pageSize),
    pagination: buildPagination(page, pageSize, total),
  }
}

export async function sendMessageData(userId: string, conversationId: string, input: SendMessageRequest): Promise<Message | null> {
  const conversation = await ensureConversationMember(userId, conversationId)
  ensureNonEmptyText(input.content, 'content')

  // 防骚扰：未互关的直聊属于陌生消息，单方最多发 3 条，互关后不限
  if (conversation.type === 'direct') {
    const counterpart = conversation.members.find((member) => member.userId !== userId)

    if (counterpart) {
      const followBondCount = await prisma.userFollow.count({
        where: {
          OR: [
            { followerId: userId, followingId: counterpart.userId },
            { followerId: counterpart.userId, followingId: userId },
          ],
        },
      })

      if (followBondCount < 2) {
        const sentCount = await prisma.message.count({
          where: { conversationId, senderId: userId },
        })

        if (sentCount >= 3) {
          throw new DataAccessError(
            403,
            'STRANGER_MESSAGE_LIMIT',
            '你们还没有互相关注，最多只能发送 3 条陌生消息，等对方回关后再继续聊吧。',
          )
        }
      }
    }
  }

  const message = await prisma.$transaction(async (tx) => {
    // 图片消息：前端传 base64 数据 URL，落盘后正文只存图片地址，避免数据库膨胀
    const content = input.type === 'image' ? await storeMessageImageDataUrl(input.content) : input.content
    const created = await tx.message.create({
      data: {
        conversationId,
        senderId: userId,
        type: input.type,
        content,
        relatedId: input.relatedId ?? null,
      },
    })

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        // 预览列为 VarChar(240)：图片用占位文案，长文本截断防溢出
        lastMessagePreview: input.type === 'image' ? '[图片]' : input.content.slice(0, 200),
        lastMessageAt: created.createdAt,
      },
    })

    return created
  })

  // 回填卡片富数据：发送方乐观替换 pending 消息时直接拿到可渲染的卡片
  const [withCard] = await attachMessageCards([toMessage(message)])
  return withCard
}

export async function createCoverAssetsData(input: {
  userId: string
  prompt: string
  count: number
  imageUrls: string[]
  modelName: string
  novelId?: string | null
  negativePrompt?: string | null
  width?: number | null
  height?: number | null
}): Promise<CoverAsset[]> {
  await ensureUserExists(input.userId)

  // AI 生成的封面先落盘转静态文件路径，避免 base64 大字段入库拖垮后续列表接口
  const normalizedImageUrls = await Promise.all(
    input.imageUrls.slice(0, input.count).map((imageUrl) => normalizeCoverImageUrl(imageUrl)),
  )

  const created = await prisma.$transaction(
    normalizedImageUrls.map((imageUrl) =>
      prisma.coverAsset.create({
        data: {
          id: randomUUID(),
          novelId: input.novelId ?? null,
          ownerUserId: input.userId,
          sourceType: 'ai_generated',
          imageUrl,
          prompt: input.prompt,
          negativePrompt: input.negativePrompt ?? null,
          modelName: input.modelName,
          width: input.width ?? null,
          height: input.height ?? null,
        },
      }),
    ),
  )

  return created.map(toCoverAsset)
}

export async function createUploadedCoverAssetData(input: {
  userId: string
  novelId: string
  imageUrl: string
  width?: number | null
  height?: number | null
}): Promise<CoverAsset> {
  await ensureNovelOwner(input.userId, input.novelId)

  const created = await prisma.coverAsset.create({
    data: {
      id: randomUUID(),
      novelId: input.novelId,
      ownerUserId: input.userId,
      sourceType: 'upload',
      imageUrl: input.imageUrl,
      prompt: null,
      negativePrompt: null,
      modelName: null,
      width: input.width ?? null,
      height: input.height ?? null,
    },
  })

  return toCoverAsset(created)
}

export function toPrismaVisibility(visibility: Visibility | PrismaVisibility | undefined): PrismaVisibility {
  return (visibility ?? 'public') as PrismaVisibility
}
