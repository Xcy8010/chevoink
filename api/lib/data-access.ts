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
  CreateNovelRequest,
  CreatePostRequest,
  Message,
  Novel,
  NovelCard,
  NovelDetailPayload,
  Pagination,
  Post,
  PostDetailPayload,
  ReaderPayload,
  SendMessageRequest,
  StudioPayload,
  TopicSummary,
  UpdateChapterRequest,
  UpdateNovelRequest,
  User,
  UserMePayload,
  UserSummary,
  Visibility,
} from '../../shared/contracts/index.js'
import { createUnsetPasswordHash, hashPassword, hasConfiguredPassword, verifyPassword } from './password.js'
import { paginate } from './http.js'
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

function toNovel(record: any, viewerUserId?: string | null): Novel {
  return {
    id: record.id,
    title: record.title,
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

function toComment(record: any): Comment {
  return {
    id: record.id,
    targetType: record.targetType,
    targetId: record.targetId,
    parentId: record.parentId ?? null,
    rootId: record.rootId ?? null,
    content: record.content,
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
  }))
  const counterpart = members.find((member: any) => member.id !== viewerUserId) ?? members[0] ?? null

  return {
    id: record.id,
    type: record.type,
    title: record.title ?? null,
    avatarUrl: record.avatarUrl ?? null,
    unreadCount: record.unreadCount ?? 0,
    lastMessagePreview: record.lastMessagePreview ?? null,
    lastMessageAt: toIso(record.lastMessageAt),
    members,
    counterpart,
    presence: 'offline',
    createdAt: toIso(record.createdAt) ?? nowIso(),
    updatedAt: toIso(record.updatedAt) ?? nowIso(),
  }
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
  const items = await prisma.topic.findMany({
    orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
    take: 12,
  })

  return {
    items: items.map(toTopic),
  }
}

export async function getHomePayloadData() {
  const [continueReading, recommendedNovels, latestUpdatedNovels, hotTopics, hotPosts] = await prisma.$transaction([
    prisma.novel.findMany({
      include: novelInclude,
      where: { visibility: 'public' },
      orderBy: [{ updatedAt: 'desc' }],
      take: 1,
    }),
    prisma.novel.findMany({
      include: novelInclude,
      where: { visibility: 'public' },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 6,
    }),
    prisma.novel.findMany({
      include: novelInclude,
      where: { visibility: 'public' },
      orderBy: [{ updatedAt: 'desc' }],
      take: 6,
    }),
    prisma.topic.findMany({
      orderBy: [{ postCount: 'desc' }, { name: 'asc' }],
      take: 8,
    }),
    prisma.post.findMany({
      include: postInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 8,
    }),
  ])

  return {
    continueReading: continueReading.map((record) => toNovelCard(record)),
    recommendedNovels: recommendedNovels.map((record) => toNovelCard(record)),
    latestUpdatedNovels: latestUpdatedNovels.map((record) => toNovelCard(record)),
    hotTopics: hotTopics.map(toTopic),
    hotPosts: hotPosts.map(toPost),
  }
}

export async function listNovelsData(page: number, pageSize: number) {
  const [items, total] = await prisma.$transaction([
    prisma.novel.findMany({
      include: novelInclude,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.novel.count(),
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
  const slugCount = await prisma.novel.count({
    where: {
      slug: {
        startsWith: baseSlug,
      },
    },
  })
  const slug = slugCount > 0 ? `${baseSlug}-${slugCount + 1}` : baseSlug

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

  const updated = await prisma.novel.update({
    where: { id: novelId },
    data: {
      title: input.title === undefined ? undefined : ensureNonEmptyText(input.title, 'title'),
      displayTitle: input.displayTitle === undefined ? undefined : input.displayTitle?.trim() || null,
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

export async function getNovelDetailData(novelId: string): Promise<NovelDetailPayload | null> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: novelInclude,
  })

  if (!novel) {
    return null
  }

  const [chapterRecords, commentRecords, relatedRecords] = await prisma.$transaction([
    prisma.chapter.findMany({
      where: { novelId },
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
    prisma.novel.findMany({
      where: {
        id: { not: novelId },
        visibility: 'public',
      },
      include: novelInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 4,
    }),
  ])

  return {
    novel: toNovel(novel),
    chapters: chapterRecords.map(toChapterListItem),
    topComments: commentRecords.map(toComment),
    relatedNovels: relatedRecords.map((record) => toNovelCard(record)),
  }
}

export async function getStudioPayloadData(userId: string, novelId: string): Promise<StudioPayload | null> {
  const novel = await ensureNovelOwner(userId, novelId)
  const [chapters, coverAssets] = await prisma.$transaction([
    prisma.chapter.findMany({
      where: { novelId },
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.coverAsset.findMany({
      where: { novelId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const draftChapter = chapters.find((chapter) => chapter.status === 'draft') ?? null

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
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  if (!novel || !currentChapter || currentChapter.novelId !== novelId) {
    return null
  }

  const visibleChapters = chapterRecords.filter((chapter) => chapter.status !== 'draft')
  const currentIndex = visibleChapters.findIndex((chapter) => chapter.id === currentChapter.id)

  return {
    novel: {
      id: novel.id,
      title: novel.title,
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

  const count = await prisma.chapter.count({
    where: { novelId },
  })

  const chapter = await prisma.$transaction(async (tx) => {
    const created = await tx.chapter.create({
      data: {
        novelId,
        authorId: userId,
        title: ensureNonEmptyText(input.title, 'title'),
        summary: input.summary?.trim() || null,
        content: input.content,
        orderIndex: count + 1,
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

export async function listCommentsData(
  targetType: CommentTargetType,
  targetId: string,
  page: number,
  pageSize: number,
) {
  const [items, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where: {
        targetType,
        targetId,
      },
      include: commentInclude,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.comment.count({
      where: {
        targetType,
        targetId,
      },
    }),
  ])

  return {
    items: items.map(toComment),
    pagination: buildPagination(page, pageSize, total),
  }
}

export async function createCommentData(userId: string, input: CreateCommentRequest): Promise<Comment> {
  await ensureUserExists(userId)
  const targetIds = buildCommentTargetIds(input.targetType, input.targetId)
  ensureNonEmptyText(input.content, 'content')

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
        parentId: input.parentId ?? null,
        rootId: input.parentId ?? null,
        content: input.content,
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

export async function listPostsData(page: number, pageSize: number, topicId?: string) {
  const where = topicId ? { topicId } : undefined
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

  return {
    items: items.map(toPost),
    pagination: buildPagination(page, pageSize, total),
  }
}

export async function getPostDetailData(postId: string): Promise<PostDetailPayload | null> {
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

  return {
    post: toPost(post),
    comments: commentRecords.map(toComment),
    relatedPosts: relatedPosts.map(toPost),
  }
}

export async function createPostData(userId: string, input: CreatePostRequest): Promise<Post> {
  await ensureUserExists(userId)
  ensureNonEmptyText(input.content, 'content')

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        userId,
        topicId: input.topicId ?? null,
        relatedNovelId: input.relatedNovelId ?? null,
        content: input.content,
        excerpt: excerptContent(input.content),
        imageUrls: input.imageUrls ?? [],
        auditStatus: 'pending',
      },
      include: postInclude,
    })

    if (input.topicId) {
      await tx.topic.update({
        where: { id: input.topicId },
        data: {
          postCount: {
            increment: 1,
          },
        },
      })
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
    user: toUser(user),
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

export async function getUserByIdData(userId: string): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  return user ? toUser(user) : null
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

  return {
    items: items.map((item) => toConversation(item, userId)),
    pagination: buildPagination(page, pageSize, total),
  }
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

  return {
    conversation: toConversation(conversation, userId),
    ...paginate(items.map(toMessage), page, pageSize),
    pagination: buildPagination(page, pageSize, total),
  }
}

export async function sendMessageData(userId: string, conversationId: string, input: SendMessageRequest): Promise<Message | null> {
  await ensureConversationMember(userId, conversationId)
  ensureNonEmptyText(input.content, 'content')

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId,
        senderId: userId,
        type: input.type,
        content: input.content,
        relatedId: input.relatedId ?? null,
      },
    })

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessagePreview: input.content,
        lastMessageAt: created.createdAt,
      },
    })

    return created
  })

  return toMessage(message)
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

  const created = await prisma.$transaction(
    input.imageUrls.slice(0, input.count).map((imageUrl) =>
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

export function toPrismaVisibility(visibility: Visibility | PrismaVisibility | undefined): PrismaVisibility {
  return (visibility ?? 'public') as PrismaVisibility
}
