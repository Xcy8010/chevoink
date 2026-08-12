import type { Pagination } from './models.js'

/* ========================================================================== */
/* 后台管理系统契约（方案 18）—— /api/admin/* 命名空间                            */
/* ========================================================================== */

export type AdminBriefUser = {
  id: string
  nickname: string
  avatarUrl: string | null
}

export type AdminUserRow = {
  id: string
  nickname: string
  avatarUrl: string | null
  phone: string | null
  email: string | null
  role: 'user' | 'author' | 'admin'
  bannedAt: string | null
  createdAt: string
  lastActiveAt: string | null
  isOnline: boolean
  novelCount: number
  postCount: number
  followerCount: number
}

export type AdminUserDetailPayload = {
  user: AdminUserRow & { bio: string | null }
  stats: { novels: number; posts: number; comments: number; favorites: number }
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
  status: 'draft' | 'published' | 'completed' | 'archived'
  visibility: 'public' | 'followers' | 'private'
  categoryName: string | null
  wordCount: number
  chapterCount: number
  commentCount: number
  favoriteCount: number
  publishedAt: string | null
  updatedAt: string
  author: AdminBriefUser
}

export type AdminNovelDetailPayload = {
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
}

export type AdminPostRow = {
  id: string
  excerpt: string
  imageCount: number
  likeCount: number
  commentCount: number
  createdAt: string
  topicTitle: string | null
  author: AdminBriefUser
}

export type AdminCommentRow = {
  id: string
  content: string
  targetType: 'novel' | 'chapter' | 'post'
  /** 段评所属正文段落序号（仅章节评论）；非空即段落评论 */
  paragraphIndex: number | null
  targetTitle: string | null
  likeCount: number
  replyCount: number
  createdAt: string
  author: AdminBriefUser
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
    author: AdminBriefUser
  }
  comments: Array<{
    id: string
    content: string
    likeCount: number
    replyCount: number
    createdAt: string
    author: AdminBriefUser
    replies: Array<{
      id: string
      content: string
      createdAt: string
      author: AdminBriefUser
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
  members: AdminBriefUser[]
}

export type AdminMessageRow = {
  id: string
  content: string
  type: string
  createdAt: string
  sender: AdminBriefUser
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

export type AdminListPayload<T> = {
  items: T[]
  pagination: Pagination
}

export type AdminMePayload = {
  id: string
  nickname: string
  email: string | null
  phone: string | null
  role: string
  /** 超级管理（唯一）：仅超级管理可设置用户身份 */
  isSuperAdmin: boolean
}

/** 管理后台登录：邮箱+密码 / 手机号+密码 / 手机号+短信验证码（后两者 captcha 仅在发码环节校验） */
export type AdminLoginRequest = {
  email?: string
  phone?: string
  password?: string
  code?: string
  captchaId?: string
  captchaAnswer?: string
}

export type AdminCaptchaPayload = {
  captchaId: string
  imageBase64: string
  expiresInSeconds: number
}
