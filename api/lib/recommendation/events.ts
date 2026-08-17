/**
 * 推荐行为事件入库（推荐算法优化方案 Phase 1）：
 * - 客户端批量上报，服务端按 eventId 幂等去重（唯一跳过）；
 * - 校验事件类型/展示位合法性与作品可见性，非法事件静默过滤（方案 §6.2）；
 * - 停留时长设上限，避免后台挂起造成虚假数据；
 * - 写入失败不阻塞主流程，由路由层兜底返回 accepted 0。
 */
import type { RecommendationEventInput } from '../../../shared/contracts/recommendation.js'
import { prisma } from '../prisma.js'
import { searchableNovelWhere } from '../data/search.js'

const MAX_BATCH_SIZE = 50
/** 单事件停留时长上限 30 分钟（方案 §6.2 防刷） */
const MAX_DWELL_MS = 30 * 60 * 1000

const VALID_EVENT_TYPES = new Set([
  'impression',
  'click',
  'start-read',
  'progress',
  'favorite',
  'finish',
  'abandon',
  'dismiss',
])

const VALID_SURFACES = new Set(['home', 'discover', 'for-you', 'related', 'ranking'])

export async function ingestRecommendationEvents(
  userId: string | null,
  events: RecommendationEventInput[],
): Promise<number> {
  if (!Array.isArray(events) || events.length === 0) return 0

  const cleaned = events
    .filter(
      (event) =>
        event &&
        typeof event.eventId === 'string' &&
        event.eventId.length > 0 &&
        typeof event.novelId === 'string' &&
        event.novelId.length > 0 &&
        VALID_EVENT_TYPES.has(event.eventType) &&
        VALID_SURFACES.has(event.surface),
    )
    .slice(0, MAX_BATCH_SIZE)
  if (cleaned.length === 0) return 0

  // 只统计公开可见作品的事件，私有/未发布作品的事件静默丢弃
  const novelIds = [...new Set(cleaned.map((event) => event.novelId))]
  const visibleNovels = await prisma.novel.findMany({
    where: { AND: [searchableNovelWhere, { id: { in: novelIds } }] },
    select: { id: true },
  })
  const visibleIds = new Set(visibleNovels.map((novel) => novel.id))
  const valid = cleaned.filter((event) => visibleIds.has(event.novelId))
  if (valid.length === 0) return 0

  // 幂等：先查库中已存在的 eventId，只插入差集；createMany 再兜底 skipDuplicates
  const existing = await prisma.recommendationEvent.findMany({
    where: { eventId: { in: valid.map((event) => event.eventId) } },
    select: { eventId: true },
  })
  const existingIds = new Set(existing.map((row) => row.eventId))
  const fresh = valid.filter((event) => !existingIds.has(event.eventId))
  if (fresh.length === 0) return 0

  const result = await prisma.recommendationEvent.createMany({
    data: fresh.map((event) => ({
      eventId: event.eventId,
      userId,
      novelId: event.novelId,
      surface: event.surface,
      position: typeof event.position === 'number' ? Math.max(0, Math.floor(event.position)) : null,
      eventType: event.eventType,
      dwellMs:
        typeof event.dwellMs === 'number'
          ? Math.min(Math.max(0, Math.floor(event.dwellMs)), MAX_DWELL_MS)
          : null,
      progressPercent:
        typeof event.progressPercent === 'number'
          ? Math.min(Math.max(0, event.progressPercent), 100)
          : null,
      sessionId: event.sessionId ?? null,
      algorithmVersion: event.algorithmVersion ?? null,
    })),
    skipDuplicates: true,
  })
  return result.count
}
