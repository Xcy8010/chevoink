import type { AdminBriefUser } from './admin.js'
import type { Pagination } from './models.js'

/* ========================================================================== */
/* 用户反馈 / 建议契约 —— /api/feedback（提交）与 /api/admin/feedback（处理）        */
/* ========================================================================== */

/** 反馈类别：问题反馈 / 功能建议 */
export type FeedbackKind = 'bug' | 'suggestion'

/** 处理状态：待处理 / 已采纳 / 已忽略（后两者可撤销回 pending） */
export type FeedbackStatus = 'pending' | 'accepted' | 'ignored'

/** 附图张数上限 */
export const MAX_FEEDBACK_IMAGE_COUNT = 5

/** 单张原图上限 20MB（前端压缩后再上传，后端按压缩产物二次校验） */
export const MAX_FEEDBACK_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024

/** 反馈弹窗底部的 QQ 交流群 */
export const FEEDBACK_QQ_GROUP_NUMBER = '158443235'
export const FEEDBACK_QQ_GROUP_URL = 'https://qm.qq.com/q/iDRstX9GH8'

/** POST /api/feedback 请求体（图片只走 imageDataUrls，服务端落盘后才写库） */
export type CreateFeedbackRequest = {
  kind: FeedbackKind
  content: string
  contact?: string
  imageDataUrls?: string[]
  source?: string
  pageUrl?: string
  clientInfo?: Record<string, unknown>
}

export type CreateFeedbackResponsePayload = {
  id: string
  kind: FeedbackKind
  createdAt: string
}

export type AdminFeedbackRow = {
  id: string
  kind: FeedbackKind
  status: FeedbackStatus
  excerpt: string
  imageCount: number
  contact: string | null
  source: string | null
  createdAt: string
  handledAt: string | null
  user: AdminBriefUser
}

export type AdminFeedbackDetail = AdminFeedbackRow & {
  content: string
  imageUrls: string[]
  pageUrl: string | null
  clientInfo: Record<string, unknown>
  handledByNickname: string | null
  updatedAt: string
}

export type AdminFeedbackDetailPayload = {
  feedback: AdminFeedbackDetail
}

/** 三个分页页签的条数，用于导航徽标 */
export type AdminFeedbackCounts = {
  pending: number
  accepted: number
  ignored: number
}

export type AdminFeedbackListPayload = {
  items: AdminFeedbackRow[]
  pagination: Pagination
  counts: AdminFeedbackCounts
}
