/**
 * 用户反馈 / 建议域数据访问
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type {
  AdminFeedbackCounts,
  AdminFeedbackDetail,
  AdminFeedbackListPayload,
  AdminFeedbackRow,
  FeedbackKind,
  FeedbackStatus,
} from '../../../shared/contracts/index.js'
import { prisma } from '../prisma.js'
import { buildPagination, excerptContent, toIso } from './internal.js'

const feedbackRowSelect = {
  id: true,
  kind: true,
  status: true,
  content: true,
  contact: true,
  imageUrls: true,
  source: true,
  createdAt: true,
  handledAt: true,
  user: { select: { id: true, nickname: true, avatarUrl: true } },
} satisfies Prisma.FeedbackSelect

type FeedbackRowRecord = Prisma.FeedbackGetPayload<{ select: typeof feedbackRowSelect }>

function toAdminFeedbackRow(record: FeedbackRowRecord): AdminFeedbackRow {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    excerpt: excerptContent(record.content),
    imageCount: record.imageUrls.length,
    contact: record.contact,
    source: record.source,
    createdAt: record.createdAt.toISOString(),
    handledAt: toIso(record.handledAt),
    user: {
      id: record.user.id,
      nickname: record.user.nickname,
      avatarUrl: record.user.avatarUrl,
    },
  }
}

/** 创建反馈/建议：图片必须是服务端落盘后的 URL */
export async function createFeedbackData(
  userId: string,
  input: {
    kind: FeedbackKind
    content: string
    contact?: string | null
    imageUrls: string[]
    source?: string | null
    pageUrl?: string | null
    clientInfo?: Record<string, unknown>
  },
): Promise<{ id: string; kind: FeedbackKind; createdAt: string }> {
  const record = await prisma.feedback.create({
    data: {
      id: randomUUID(),
      userId,
      kind: input.kind,
      content: input.content,
      contact: input.contact?.trim() ? input.contact.trim() : null,
      imageUrls: input.imageUrls,
      source: input.source?.trim() ? input.source.trim() : null,
      pageUrl: input.pageUrl?.trim() ? input.pageUrl.trim().slice(0, 500) : null,
      clientInfo: (input.clientInfo ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true, kind: true, createdAt: true },
  })

  return { id: record.id, kind: record.kind, createdAt: record.createdAt.toISOString() }
}

/** 后台列表：按状态分页签，可按类别与关键词过滤；counts 供页签徽标使用 */
export async function listAdminFeedbacksData(input: {
  status?: FeedbackStatus
  kind?: FeedbackKind
  search?: string
  page: number
  pageSize: number
}): Promise<AdminFeedbackListPayload> {
  const where: Prisma.FeedbackWhereInput = {}

  if (input.status) {
    where.status = input.status
  }
  if (input.kind) {
    where.kind = input.kind
  }
  if (input.search?.trim()) {
    const keyword = input.search.trim()
    where.OR = [
      { content: { contains: keyword, mode: 'insensitive' } },
      { contact: { contains: keyword, mode: 'insensitive' } },
      { user: { nickname: { contains: keyword, mode: 'insensitive' } } },
    ]
  }

  const [total, records, pending, accepted, ignored] = await Promise.all([
    prisma.feedback.count({ where }),
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: feedbackRowSelect,
    }),
    prisma.feedback.count({ where: { status: 'pending' } }),
    prisma.feedback.count({ where: { status: 'accepted' } }),
    prisma.feedback.count({ where: { status: 'ignored' } }),
  ])

  const counts: AdminFeedbackCounts = { pending, accepted, ignored }

  return {
    items: records.map(toAdminFeedbackRow),
    pagination: buildPagination(input.page, input.pageSize, total),
    counts,
  }
}

export async function getAdminFeedbackDetailData(feedbackId: string): Promise<AdminFeedbackDetail | null> {
  const record = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: {
      ...feedbackRowSelect,
      pageUrl: true,
      clientInfo: true,
      handledByAdminId: true,
      updatedAt: true,
    },
  })
  if (!record) {
    return null
  }

  const handler = record.handledByAdminId
    ? await prisma.user.findUnique({ where: { id: record.handledByAdminId }, select: { nickname: true } })
    : null

  return {
    ...toAdminFeedbackRow(record),
    content: record.content,
    imageUrls: record.imageUrls,
    pageUrl: record.pageUrl,
    clientInfo:
      record.clientInfo && typeof record.clientInfo === 'object' && !Array.isArray(record.clientInfo)
        ? (record.clientInfo as Record<string, unknown>)
        : {},
    handledByNickname: handler?.nickname ?? null,
    updatedAt: record.updatedAt.toISOString(),
  }
}

/** 标记已采纳 / 已忽略，或撤销回待处理（撤销时清空处理人与处理时间） */
export async function setFeedbackStatusData(
  feedbackId: string,
  status: FeedbackStatus,
  adminId: string,
): Promise<{ kind: FeedbackKind; previousStatus: FeedbackStatus } | null> {
  const record = await prisma.feedback.findUnique({ where: { id: feedbackId }, select: { kind: true, status: true } })
  if (!record) {
    return null
  }

  await prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      status,
      handledByAdminId: status === 'pending' ? null : adminId,
      handledAt: status === 'pending' ? null : new Date(),
    },
  })

  return { kind: record.kind, previousStatus: record.status }
}
