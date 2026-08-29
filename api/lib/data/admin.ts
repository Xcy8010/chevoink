/**
 * 管理后台域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type {
  AdminAgentSessionMessagesPayload,
  AdminBriefUser,
  AdminCreationRecordsPayload,
  AdminUserFavoriteNovelRow,
  AdminUserFollowRow,
  Pagination,
} from '../../../shared/contracts/index.js'
import { hashPassword, isLegacyPasswordHash, verifyPassword } from '../password.js'
import { evictUserBanCache } from '../auth-session.js'
import { prisma } from '../prisma.js'
import { buildPagination, excerptContent, isUserOnline, toIso } from './internal.js'



/* ========================================================================== */
/* 后台管理数据层（方案 18）                                                    */
/* 所有写操作必须在路由层配套 recordAdminAuditLog 审计记录                          */
/* ========================================================================== */

export type AdminUserRow = {
  id: string
  nickname: string
  avatarUrl: string | null
  phone: string | null
  email: string | null
  role: string
  bannedAt: string | null
  createdAt: string
  lastActiveAt: string | null
  isOnline: boolean
  novelCount: number
  postCount: number
  followerCount: number
}



export type AdminDashboardPayload = {
  totals: {
    users: number
    publishedNovels: number
    posts: number
    comments: number
  }
  trend: Array<{ date: string; users: number; novels: number; posts: number; comments: number }>
  recentLogs: Array<{
    id: string
    action: string
    targetType: string | null
    targetId: string | null
    adminNickname: string | null
    createdAt: string
  }>
}



export type AdminNovelRow = {
  id: string
  title: string
  displayTitle: string | null
  status: string
  visibility: string
  categoryName: string | null
  wordCount: number
  chapterCount: number
  commentCount: number
  favoriteCount: number
  publishedAt: string | null
  updatedAt: string
  author: { id: string; nickname: string; avatarUrl: string | null }
}



export type AdminPostRow = {
  id: string
  excerpt: string
  imageCount: number
  likeCount: number
  commentCount: number
  createdAt: string
  topicTitle: string | null
  author: { id: string; nickname: string; avatarUrl: string | null }
}



export type AdminCommentRow = {
  id: string
  content: string
  targetType: string
  paragraphIndex: number | null
  targetTitle: string | null
  likeCount: number
  replyCount: number
  createdAt: string
  author: { id: string; nickname: string; avatarUrl: string | null }
  targetHref: string | null
}



export type AdminPostDetailPayload = {
  post: {
    id: string
    content: string
    imageUrls: string[]
    likeCount: number
    commentCount: number
    createdAt: string
    topicTitle: string | null
    author: { id: string; nickname: string; avatarUrl: string | null }
  }
  comments: Array<{
    id: string
    content: string
    likeCount: number
    replyCount: number
    createdAt: string
    author: { id: string; nickname: string; avatarUrl: string | null }
    replies: Array<{
      id: string
      content: string
      createdAt: string
      author: { id: string; nickname: string; avatarUrl: string | null }
    }>
  }>
}



export type AdminConversationRow = {
  id: string
  type: string
  title: string | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
  messageCount: number
  members: Array<{ id: string; nickname: string; avatarUrl: string | null }>
}



export type AdminMessageRow = {
  id: string
  content: string
  type: string
  createdAt: string
  sender: { id: string; nickname: string; avatarUrl: string | null }
}



export type AdminAuditLogRow = {
  id: string
  adminId: string
  adminNickname: string | null
  action: string
  targetType: string | null
  targetId: string | null
  detail: Record<string, unknown>
  ip: string | null
  createdAt: string
}



export async function recordAdminAuditLog(input: {
  adminId: string
  action: string
  targetType?: string | null
  targetId?: string | null
  detail?: Record<string, unknown>
  ip?: string | null
}): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      id: randomUUID(),
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      detail: (input.detail ?? {}) as Prisma.InputJsonValue,
      ip: input.ip ?? null,
    },
  })
}



/** 管理后台登录：邮箱 + 密码，仅放行 admin 角色且未封禁的账号 */
export async function adminLoginByEmailData(
  email: string,
  password: string,
): Promise<{ userId: string; nickname: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  })

  if (!user || user.role !== 'admin' || user.bannedAt !== null) {
    return null
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return null
  }

  // 存量明文哈希验证通过后升级为 scrypt
  if (isLegacyPasswordHash(user.passwordHash)) {
    void prisma.user
      .update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } })
      .catch(() => {})
  }

  return { userId: user.id, nickname: user.nickname }
}



/** 手机号登录管理后台：可选校验密码（验证码模式由路由层先校验短信码） */
export async function adminLoginByPhoneData(
  phone: string,
  password?: string,
): Promise<{ userId: string; nickname: string } | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
  })

  if (!user || user.role !== 'admin' || user.bannedAt !== null) {
    return null
  }
  if (password !== undefined && !verifyPassword(password, user.passwordHash)) {
    return null
  }

  // 存量明文哈希验证通过后升级为 scrypt
  if (password !== undefined && isLegacyPasswordHash(user.passwordHash)) {
    void prisma.user
      .update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } })
      .catch(() => {})
  }

  return { userId: user.id, nickname: user.nickname }
}



/** 查询手机号是否绑定有效管理员（用于发码前置校验，避免给非管理员手机号发短信） */
export async function findAdminByPhoneData(phone: string): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, role: true, bannedAt: true },
  })

  if (!user || user.role !== 'admin' || user.bannedAt !== null) {
    return null
  }
  return { id: user.id }
}



/** 手机号是否已被其他账号绑定（绑定发码前置校验，避免浪费短信） */
export async function isPhoneTakenByOtherData(phone: string, excludeUserId: string): Promise<boolean> {
  const occupied = await prisma.user.findFirst({
    where: { phone, id: { not: excludeUserId } },
    select: { id: true },
  })
  return occupied !== null
}



/** 管理员绑定手机号：手机号未被其他账号占用时写入 */
export async function bindAdminPhoneData(
  adminId: string,
  phone: string,
): Promise<{ ok: boolean; reason?: 'taken' }> {
  const occupied = await prisma.user.findFirst({
    where: { phone, id: { not: adminId } },
    select: { id: true },
  })
  if (occupied) {
    return { ok: false, reason: 'taken' }
  }

  await prisma.user.update({ where: { id: adminId }, data: { phone } })
  return { ok: true }
}



export async function getAdminUserBySessionData(userId: string): Promise<{
  id: string
  nickname: string
  email: string | null
  phone: string | null
  role: string
  isSuperAdmin: boolean
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true, email: true, phone: true, role: true, bannedAt: true, isSuperAdmin: true },
  })

  if (!user || user.role !== 'admin' || user.bannedAt !== null) {
    return null
  }

  return {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin,
  }
}



/** 管理员改自己的密码：先校验旧密码 */
export async function adminChangeMyPasswordData(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return false
  }
  if (!verifyPassword(oldPassword, user.passwordHash)) {
    return false
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashPassword(newPassword),
      // 改密吊销全部旧会话令牌；调用方（路由层）会为当前设备静默重签
      tokenVersion: { increment: 1 },
    },
  })
  evictUserBanCache(userId)
  return true
}



/** 重置某用户密码：生成一次性临时密码返回给管理员，线下交付 */
export async function resetUserPasswordData(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) {
    return null
  }

  const tempPassword = `Cv-${randomBytes(9).toString('base64url')}`
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashPassword(tempPassword),
      // 管理员重置密码后原会话全部吊销，用户凭临时密码重新登录
      tokenVersion: { increment: 1 },
    },
  })
  evictUserBanCache(userId)
  return tempPassword
}



export async function setUserBannedData(
  userId: string,
  banned: boolean,
): Promise<{ nickname: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true } })
  if (!user) {
    return null
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      bannedAt: banned ? new Date() : null,
      // 封禁即吊销全部会话令牌；解封也 +1，避免解封后旧会话自动复活
      tokenVersion: { increment: 1 },
    },
  })
  evictUserBanCache(userId)
  return { nickname: user.nickname }
}



export async function setUserRoleData(
  userId: string,
  role: 'user' | 'admin',
): Promise<{ nickname: string; role: string } | null | { blocked: 'super' }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true, isSuperAdmin: true },
  })
  if (!user) {
    return null
  }
  // 超级管理身份唯一且不可被他人改动
  if (user.isSuperAdmin) {
    return { blocked: 'super' }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } })
  return { nickname: user.nickname, role }
}



export async function listAdminUsersData(input: {
  search?: string
  role?: string
  banned?: boolean
  page: number
  pageSize: number
}): Promise<{ items: AdminUserRow[]; pagination: Pagination }> {
  const where: Prisma.UserWhereInput = {}

  if (input.search?.trim()) {
    const keyword = input.search.trim()
    where.OR = [
      { nickname: { contains: keyword, mode: 'insensitive' } },
      { phone: { contains: keyword } },
      { email: { contains: keyword, mode: 'insensitive' } },
    ]
  }
  if (input.role) {
    where.role = input.role as Prisma.UserWhereInput['role']
  }
  if (input.banned === true) {
    where.bannedAt = { not: null }
  } else if (input.banned === false) {
    where.bannedAt = null
  }

  const [total, records] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        phone: true,
        email: true,
        role: true,
        bannedAt: true,
        createdAt: true,
        lastActiveAt: true,
        novelCount: true,
        postCount: true,
        followerCount: true,
      },
    }),
  ])

  const items: AdminUserRow[] = records.map((record) => ({
    id: record.id,
    nickname: record.nickname,
    avatarUrl: record.avatarUrl,
    phone: record.phone,
    email: record.email,
    role: record.role,
    bannedAt: toIso(record.bannedAt),
    createdAt: record.createdAt.toISOString(),
    lastActiveAt: toIso(record.lastActiveAt),
    isOnline: isUserOnline(record.lastActiveAt),
    novelCount: record.novelCount,
    postCount: record.postCount,
    followerCount: record.followerCount,
  }))

  return { items, pagination: buildPagination(input.page, input.pageSize, total) }
}



export async function getAdminUserDetailData(userId: string): Promise<{
  user: AdminUserRow & { bio: string | null }
  stats: { novels: number; posts: number; comments: number; favorites: number }
} | null> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      phone: true,
      email: true,
      bio: true,
      role: true,
      bannedAt: true,
      createdAt: true,
      lastActiveAt: true,
      novelCount: true,
      postCount: true,
      followerCount: true,
    },
  })
  if (!record) {
    return null
  }

  const [novels, posts, comments, favorites] = await Promise.all([
    prisma.novel.count({ where: { authorId: userId } }),
    prisma.post.count({ where: { userId } }),
    prisma.comment.count({ where: { userId } }),
    prisma.novelFavorite.count({ where: { userId } }),
  ])

  return {
    user: {
      id: record.id,
      nickname: record.nickname,
      avatarUrl: record.avatarUrl,
      phone: record.phone,
      email: record.email,
      role: record.role,
      bannedAt: toIso(record.bannedAt),
      createdAt: record.createdAt.toISOString(),
      lastActiveAt: toIso(record.lastActiveAt),
      isOnline: isUserOnline(record.lastActiveAt),
      novelCount: record.novelCount,
      postCount: record.postCount,
      followerCount: record.followerCount,
      bio: record.bio,
    },
    stats: { novels, posts, comments, favorites },
  }
}



/** 管理端：查看某用户的粉丝列表（管理端不受隐私级别管控，忽略粉丝可见性） */
export async function listAdminUserFollowersData(
  userId: string,
): Promise<{ user: AdminBriefUser; items: AdminUserFollowRow[]; total: number } | null> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true, avatarUrl: true },
  })
  if (!target) {
    return null
  }

  const records = await prisma.userFollow.findMany({
    where: { followingId: userId },
    include: { follower: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const items: AdminUserFollowRow[] = records.map((record) => ({
    id: record.follower.id,
    nickname: record.follower.nickname,
    avatarUrl: record.follower.avatarUrl,
    followerCount: record.follower.followerCount,
    isOnline: isUserOnline(record.follower.lastActiveAt),
    followedAt: toIso(record.createdAt) ?? new Date().toISOString(),
  }))

  return {
    user: { id: target.id, nickname: target.nickname, avatarUrl: target.avatarUrl },
    items,
    total: items.length,
  }
}



/** 管理端：查看某用户收藏的作品列表 */
export async function listAdminUserFavoriteNovelsData(
  userId: string,
): Promise<{ user: AdminBriefUser; items: AdminUserFavoriteNovelRow[]; total: number } | null> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true, avatarUrl: true },
  })
  if (!target) {
    return null
  }

  const records = await prisma.novelFavorite.findMany({
    where: { userId },
    include: {
      novel: {
        include: {
          author: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const items: AdminUserFavoriteNovelRow[] = records.map((record) => ({
    id: record.novel.id,
    title: record.novel.title,
    displayTitle: record.novel.displayTitle,
    status: record.novel.status,
    wordCount: record.novel.wordCount,
    chapterCount: record.novel.chapterCount,
    favoriteCount: record.novel.favoriteCount,
    favoritedAt: toIso(record.createdAt) ?? new Date().toISOString(),
    author: {
      id: record.novel.author.id,
      nickname: record.novel.author.nickname,
      avatarUrl: record.novel.author.avatarUrl,
    },
  }))

  return {
    user: { id: target.id, nickname: target.nickname, avatarUrl: target.avatarUrl },
    items,
    total: items.length,
  }
}



/** 管理端：某用户的创作记录（按作品分组，作品下挂 Agent 会话列表，不含具体消息） */
export async function getAdminCreationRecordsData(userId: string): Promise<AdminCreationRecordsPayload | null> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true, avatarUrl: true },
  })
  if (!target) {
    return null
  }

  const novels = await prisma.novel.findMany({
    where: { authorId: userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      agentSessions: {
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { runs: true } } },
      },
    },
  })

  return {
    user: { id: target.id, nickname: target.nickname, avatarUrl: target.avatarUrl },
    novels: novels.map((novel) => ({
      novelId: novel.id,
      title: novel.title,
      displayTitle: novel.displayTitle,
      status: novel.status,
      chapterCount: novel.chapterCount,
      wordCount: novel.wordCount,
      updatedAt: novel.updatedAt.toISOString(),
      sessions: novel.agentSessions.map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        runCount: session._count.runs,
        lastRunAt: toIso(session.lastRunAt),
        createdAt: session.createdAt.toISOString(),
      })),
    })),
  }
}



/** 管理端：查看单个 Agent 会话的完整聊天记录（run + 消息） */
export async function getAdminAgentSessionMessagesData(
  sessionId: string,
): Promise<AdminAgentSessionMessagesPayload | null> {
  const record = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      novel: { select: { id: true, title: true, displayTitle: true } },
      runs: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          mode: true,
          action: true,
          status: true,
          inputSummary: true,
          outputSummary: true,
          errorMessage: true,
          createdAt: true,
          finishedAt: true,
          messages: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, runId: true, role: true, parts: true, createdAt: true },
          },
        },
      },
    },
  })
  if (!record) {
    return null
  }

  return {
    session: {
      id: record.id,
      title: record.title,
      novelTitle: record.novel.title,
      displayTitle: record.novel.displayTitle,
      createdAt: record.createdAt.toISOString(),
    },
    runs: record.runs.map((run) => ({
      id: run.id,
      mode: run.mode,
      action: run.action,
      status: run.status,
      inputSummary: run.inputSummary,
      outputSummary: run.outputSummary,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt.toISOString(),
      finishedAt: toIso(run.finishedAt),
      messages: run.messages.map((message) => ({
        id: message.id,
        runId: message.runId,
        role: (message.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        parts: message.parts as unknown[],
        createdAt: message.createdAt.toISOString(),
      })),
    })),
  }
}



function buildRecentDays(dates: Date[]): Map<string, number> {
  const counter = new Map<string, number>()
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10)
    counter.set(key, (counter.get(key) ?? 0) + 1)
  }
  return counter
}



export async function getAdminDashboardData(): Promise<AdminDashboardPayload> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [userTotal, novelTotal, postTotal, commentTotal, recentUsers, recentNovels, recentPosts, recentComments, recentLogs] =
    await Promise.all([
      prisma.user.count(),
      prisma.novel.count({ where: { status: { in: ['published', 'completed'] } } }),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.novel.findMany({
        where: { status: { in: ['published', 'completed'] }, lastPublishedAt: { gte: since } },
        select: { lastPublishedAt: true },
      }),
      prisma.post.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.comment.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    ])

  const userCounter = buildRecentDays(recentUsers.map((item) => item.createdAt))
  const novelCounter = buildRecentDays(
    recentNovels.map((item) => item.lastPublishedAt).filter((item): item is Date => item !== null),
  )
  const postCounter = buildRecentDays(recentPosts.map((item) => item.createdAt))
  const commentCounter = buildRecentDays(recentComments.map((item) => item.createdAt))

  const trend: AdminDashboardPayload['trend'] = []
  for (let day = 6; day >= 0; day -= 1) {
    const key = new Date(Date.now() - day * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    trend.push({
      date: key,
      users: userCounter.get(key) ?? 0,
      novels: novelCounter.get(key) ?? 0,
      posts: postCounter.get(key) ?? 0,
      comments: commentCounter.get(key) ?? 0,
    })
  }

  const adminIds = [...new Set(recentLogs.map((log) => log.adminId))]
  const admins = adminIds.length
    ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, nickname: true } })
    : []
  const adminNames = new Map(admins.map((admin) => [admin.id, admin.nickname]))

  return {
    totals: { users: userTotal, publishedNovels: novelTotal, posts: postTotal, comments: commentTotal },
    trend,
    recentLogs: recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      adminNickname: adminNames.get(log.adminId) ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
  }
}



export async function listAdminNovelsData(input: {
  search?: string
  status?: string
  page: number
  pageSize: number
}): Promise<{ items: AdminNovelRow[]; pagination: Pagination }> {
  const where: Prisma.NovelWhereInput = {}

  if (input.status) {
    where.status = input.status as Prisma.NovelWhereInput['status']
  }
  if (input.search?.trim()) {
    const keyword = input.search.trim()
    where.OR = [
      { title: { contains: keyword, mode: 'insensitive' } },
      { displayTitle: { contains: keyword, mode: 'insensitive' } },
      { author: { nickname: { contains: keyword, mode: 'insensitive' } } },
    ]
  }

  const [total, records] = await Promise.all([
    prisma.novel.count({ where }),
    prisma.novel.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: { author: { select: { id: true, nickname: true, avatarUrl: true } } },
    }),
  ])

  const items: AdminNovelRow[] = records.map((record) => ({
    id: record.id,
    title: record.title,
    displayTitle: record.displayTitle,
    status: record.status,
    visibility: record.visibility,
    categoryName: record.categoryName,
    wordCount: record.wordCount,
    chapterCount: record.chapterCount,
    commentCount: record.commentCount,
    favoriteCount: record.favoriteCount,
    publishedAt: toIso(record.publishedAt),
    updatedAt: record.updatedAt.toISOString(),
    author: { id: record.author.id, nickname: record.author.nickname, avatarUrl: record.author.avatarUrl },
  }))

  return { items, pagination: buildPagination(input.page, input.pageSize, total) }
}



export async function getAdminNovelDetailData(novelId: string): Promise<{
  novel: AdminNovelRow & { summary: string; author: AdminUserRow; coverUrl: string | null }
  chapters: Array<{
    id: string
    title: string
    orderIndex: number
    status: string
    wordCount: number
    publishedAt: string | null
    updatedAt: string
  }>
} | null> {
  const record = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      author: true,
      coverAsset: { select: { imageUrl: true } },
      chapters: { orderBy: { orderIndex: 'asc' } },
    },
  })
  if (!record) {
    return null
  }

  return {
    novel: {
      id: record.id,
      title: record.title,
      displayTitle: record.displayTitle,
      status: record.status,
      visibility: record.visibility,
      categoryName: record.categoryName,
      wordCount: record.wordCount,
      chapterCount: record.chapterCount,
      commentCount: record.commentCount,
      favoriteCount: record.favoriteCount,
      publishedAt: toIso(record.publishedAt),
      updatedAt: record.updatedAt.toISOString(),
      summary: record.summary,
      coverUrl: record.coverAsset?.imageUrl ?? null,
      author: {
        id: record.author.id,
        nickname: record.author.nickname,
        avatarUrl: record.author.avatarUrl,
        phone: record.author.phone,
        email: record.author.email,
        role: record.author.role,
        bannedAt: toIso(record.author.bannedAt),
        createdAt: record.author.createdAt.toISOString(),
        lastActiveAt: toIso(record.author.lastActiveAt),
        isOnline: isUserOnline(record.author.lastActiveAt),
        novelCount: record.author.novelCount,
        postCount: record.author.postCount,
        followerCount: record.author.followerCount,
      },
    },
    chapters: record.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      orderIndex: chapter.orderIndex,
      status: chapter.status,
      wordCount: chapter.wordCount,
      publishedAt: toIso(chapter.publishedAt),
      updatedAt: chapter.updatedAt.toISOString(),
    })),
  }
}



/** 管理端内部预览：取作品任意章节正文（含草稿/已下架），仅管理后台预览页使用 */
export async function getAdminChapterContentData(
  novelId: string,
  chapterId: string,
): Promise<{
  id: string
  title: string
  orderIndex: number
  status: string
  wordCount: number
  content: string
  publishedAt: string | null
  updatedAt: string
} | null> {
  const record = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId },
  })
  if (!record) {
    return null
  }

  return {
    id: record.id,
    title: record.title,
    orderIndex: record.orderIndex,
    status: record.status,
    wordCount: record.wordCount,
    content: record.content,
    publishedAt: toIso(record.publishedAt),
    updatedAt: record.updatedAt.toISOString(),
  }
}



export async function listAdminPostsData(input: {
  search?: string
  page: number
  pageSize: number
}): Promise<{ items: AdminPostRow[]; pagination: Pagination }> {
  const where: Prisma.PostWhereInput = {}

  if (input.search?.trim()) {
    const keyword = input.search.trim()
    where.OR = [
      { content: { contains: keyword, mode: 'insensitive' } },
      { author: { nickname: { contains: keyword, mode: 'insensitive' } } },
    ]
  }

  const [total, records] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        topic: { select: { name: true } },
      },
    }),
  ])

  const items: AdminPostRow[] = records.map((record) => ({
    id: record.id,
    excerpt: excerptContent(record.content),
    imageCount: record.imageUrls.length,
    likeCount: record.likeCount,
    commentCount: record.commentCount,
    createdAt: record.createdAt.toISOString(),
    topicTitle: record.topic?.name ?? null,
    author: { id: record.author.id, nickname: record.author.nickname, avatarUrl: record.author.avatarUrl },
  }))

  return { items, pagination: buildPagination(input.page, input.pageSize, total) }
}



export async function listAdminCommentsData(input: {
  /** 评论分类：novel=作品评论（含章节评论/段落评论），post=帖子评论 */
  category?: string
  search?: string
  page: number
  pageSize: number
}): Promise<{ items: AdminCommentRow[]; pagination: Pagination }> {
  const where: Prisma.CommentWhereInput = {}

  if (input.category === 'novel') {
    where.targetType = { in: ['novel', 'chapter'] }
  } else if (input.category === 'post') {
    where.targetType = 'post'
  }
  if (input.search?.trim()) {
    const keyword = input.search.trim()
    where.OR = [
      { content: { contains: keyword, mode: 'insensitive' } },
      { author: { nickname: { contains: keyword, mode: 'insensitive' } } },
    ]
  }

  const [total, records] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        novel: { select: { id: true, title: true, displayTitle: true } },
        chapter: { select: { id: true, title: true, novelId: true, novel: { select: { id: true, title: true } } } },
        post: { select: { id: true, content: true } },
      },
    }),
  ])

  const items: AdminCommentRow[] = records.map((record) => {
    let targetTitle: string | null = null
    let targetHref: string | null = null

    if (record.targetType === 'novel' && record.novel) {
      targetTitle = record.novel.displayTitle ?? record.novel.title
      targetHref = `/novel/${record.novel.id}`
    } else if (record.targetType === 'chapter' && record.chapter) {
      targetTitle = `《${record.chapter.novel.title}》${record.chapter.title}`
      targetHref = `/novel/${record.chapter.novelId}/read/${record.chapter.id}`
    } else if (record.targetType === 'post' && record.post) {
      targetTitle = excerptContent(record.post.content)
      targetHref = `/post/${record.post.id}`
    }

    return {
      id: record.id,
      content: excerptContent(record.content),
      targetType: record.targetType,
      paragraphIndex: record.paragraphIndex ?? null,
      targetTitle,
      likeCount: record.likeCount,
      replyCount: record.replyCount,
      createdAt: record.createdAt.toISOString(),
      author: { id: record.author.id, nickname: record.author.nickname, avatarUrl: record.author.avatarUrl },
      targetHref,
    }
  })

  return { items, pagination: buildPagination(input.page, input.pageSize, total) }
}



export async function getAdminPostDetailData(postId: string): Promise<AdminPostDetailPayload | null> {
  const record = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, nickname: true, avatarUrl: true } },
      topic: { select: { name: true } },
      comments: {
        where: { parentId: null },
        orderBy: { createdAt: 'asc' },
        include: {
          author: { select: { id: true, nickname: true, avatarUrl: true } },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, nickname: true, avatarUrl: true } } },
          },
        },
      },
    },
  })
  if (!record) {
    return null
  }

  return {
    post: {
      id: record.id,
      content: record.content,
      imageUrls: record.imageUrls,
      likeCount: record.likeCount,
      commentCount: record.commentCount,
      createdAt: record.createdAt.toISOString(),
      topicTitle: record.topic?.name ?? null,
      author: record.author,
    },
    comments: record.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author,
      replies: comment.replies.map((reply) => ({
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt.toISOString(),
        author: reply.author,
      })),
    })),
  }
}



export async function listAdminConversationsData(input: {
  search?: string
  page: number
  pageSize: number
}): Promise<{ items: AdminConversationRow[]; pagination: Pagination }> {
  const where: Prisma.ConversationWhereInput = {}

  if (input.search?.trim()) {
    const keyword = input.search.trim()
    where.members = { some: { user: { nickname: { contains: keyword, mode: 'insensitive' } } } }
  }

  const [total, records] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        members: { include: { user: { select: { id: true, nickname: true, avatarUrl: true } } } },
        _count: { select: { messages: true } },
      },
    }),
  ])

  const items: AdminConversationRow[] = records.map((record) => ({
    id: record.id,
    type: record.type,
    title: record.title,
    lastMessagePreview: record.lastMessagePreview,
    lastMessageAt: toIso(record.lastMessageAt),
    messageCount: record._count.messages,
    members: record.members.map((member) => member.user),
  }))

  return { items, pagination: buildPagination(input.page, input.pageSize, total) }
}



export async function getAdminConversationMessagesData(conversationId: string): Promise<AdminMessageRow[] | null> {
  const exists = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true } })
  if (!exists) {
    return null
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 2000,
    include: { sender: { select: { id: true, nickname: true, avatarUrl: true } } },
  })

  return messages.map((message) => ({
    id: message.id,
    content: message.content,
    type: message.type,
    createdAt: message.createdAt.toISOString(),
    sender: message.sender,
  }))
}



export async function listAdminAuditLogsData(input: {
  action?: string
  targetType?: string
  page: number
  pageSize: number
}): Promise<{ items: AdminAuditLogRow[]; pagination: Pagination }> {
  const where: Prisma.AdminAuditLogWhereInput = {}

  if (input.action?.trim()) {
    where.action = input.action.trim()
  }
  if (input.targetType?.trim()) {
    where.targetType = input.targetType.trim()
  }

  const [total, records] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ])

  const adminIds = [...new Set(records.map((record) => record.adminId))]
  const admins = adminIds.length
    ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, nickname: true } })
    : []
  const adminNames = new Map(admins.map((admin) => [admin.id, admin.nickname]))

  const items: AdminAuditLogRow[] = records.map((record) => ({
    id: record.id,
    adminId: record.adminId,
    adminNickname: adminNames.get(record.adminId) ?? null,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    detail: (record.detail ?? {}) as Record<string, unknown>,
    ip: record.ip,
    createdAt: record.createdAt.toISOString(),
  }))

  return { items, pagination: buildPagination(input.page, input.pageSize, total) }
}
