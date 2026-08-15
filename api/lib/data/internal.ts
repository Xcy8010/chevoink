/**
 * 跨域共享的数据转换与校验助手
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import type { Prisma } from '@prisma/client'
import type { Chapter, ChapterListItem, Comment, CommentTargetType, Conversation, CoverAsset, Message, MessageCard, Novel, NovelCard, Pagination, Post, TopicSummary, User, UserSummary } from '../../../shared/contracts/index.js'
import { hasConfiguredPassword } from '../password.js'
import { DataAccessError, prisma } from '../prisma.js'



export const novelInclude = {
  author: true,
  coverAsset: true,
} satisfies Prisma.NovelInclude



export const postInclude = {
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



export const commentInclude = {
  author: true,
} satisfies Prisma.CommentInclude



export const conversationInclude = {
  members: {
    include: {
      user: true,
    },
  },
} satisfies Prisma.ConversationInclude



export function nowIso(): string {
  return new Date().toISOString()
}



// 在线判定：最近 5 分钟内有过带登录态请求（app 层中间件刷新 lastActiveAt）即视为在线
const ONLINE_WINDOW_MS = 5 * 60 * 1000



export function isUserOnline(lastActiveAt: Date | string | null | undefined): boolean {
  if (!lastActiveAt) {
    return false
  }
  return Date.now() - new Date(lastActiveAt).getTime() <= ONLINE_WINDOW_MS
}



export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? value : value.toISOString()
}



export function buildPagination(page: number, pageSize: number, total: number): Pagination {
  return {
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  }
}



export function excerptContent(content: string): string {
  const normalized = content.trim()

  if (normalized.length <= 120) {
    return normalized
  }

  return `${normalized.slice(0, 117)}...`
}



export function buildSlug(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || `novel-${Date.now()}`
}



export function toUserSummary(user: any): UserSummary {
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



export function toUser(user: any): User {
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
export const PLACEHOLDER_NOVEL_TITLES = new Set(['未命名作品', '我的第一部作品'])



export function resolveEffectiveNovelTitle(title: string, displayTitle?: string | null): string {
  const display = displayTitle?.trim()
  if (display && PLACEHOLDER_NOVEL_TITLES.has(title.trim())) {
    return display
  }
  return title
}



export function toNovel(record: any, viewerUserId?: string | null): Novel {
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



export function toNovelCard(record: any, viewerUserId?: string | null): NovelCard {
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



export function toChapter(record: any): Chapter {
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



export function toChapterListItem(record: any): ChapterListItem {
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
export const chapterListItemSelect = {
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



export function toComment(record: any): Comment {
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



export function toTopic(record: any): TopicSummary {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    postCount: record.postCount ?? 0,
  }
}



export function toPost(record: any): Post {
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



export function toConversation(record: any, viewerUserId: string): Conversation {
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
export async function attachDirectFollowRelations(conversations: Conversation[], viewerUserId: string): Promise<Conversation[]> {
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



export function toMessage(record: any): Message {
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
export async function attachMessageCards(messages: Message[]): Promise<Message[]> {
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



export function toCoverAsset(record: any): CoverAsset {
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



export function ensureNonEmptyText(value: string, field: string): string {
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



export async function buildAutoNickname(input: { phone?: string; email?: string }): Promise<string> {
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



export async function ensureUserExists(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new DataAccessError(401, 'AUTH_INVALID_SESSION', '登录状态已失效，请重新登录。')
  }

  return user
}



export async function ensureNovelOwner(userId: string, novelId: string) {
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



export async function ensureConversationMember(userId: string, conversationId: string) {
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



export async function recalculateNovelStats(tx: Prisma.TransactionClient, novelId: string) {
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



export function buildCommentTargetIds(targetType: CommentTargetType, targetId: string): {
  novelId: string | null
  chapterId: string | null
  postId: string | null
} {
  if (targetType === 'novel') {
    return { novelId: targetId, chapterId: null, postId: null }
  }

  if (targetType === 'chapter') {
    return { novelId: null, chapterId: targetId, postId: null }
  }

  return { novelId: null, chapterId: null, postId: targetId }
}



export function clampPercent(value: number | undefined | null): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}
