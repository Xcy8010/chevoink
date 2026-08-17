/**
 * 推荐系统数据协议（推荐算法优化方案 Phase 1）：
 * 行为事件上报、for-you 个性化推荐响应。
 * 接口必须返回 sessionId 与 algorithmVersion，否则无法正确计算曝光与实验结果（方案 §6.1）。
 */
import type { ApiSuccess } from './api.js'
import type { NovelCard } from './models.js'

/** 推荐展示位 */
export type RecommendationSurface = 'home' | 'discover' | 'for-you' | 'related' | 'ranking'

/** 推荐行为事件类型（正/负反馈齐全，方案 §6.1） */
export type RecommendationEventType =
  | 'impression'
  | 'click'
  | 'start-read'
  | 'progress'
  | 'favorite'
  | 'finish'
  | 'abandon'
  | 'dismiss'

/** 客户端上报的单个行为事件；eventId 由客户端生成，服务端按它幂等去重 */
export type RecommendationEventInput = {
  eventId: string
  novelId: string
  surface: RecommendationSurface
  position?: number
  eventType: RecommendationEventType
  /** 停留/阅读时长（毫秒），服务端设上限防刷 */
  dwellMs?: number
  /** 阅读进度百分比 0-100 */
  progressPercent?: number
  sessionId?: string
  algorithmVersion?: string
}

export type ReportRecommendationEventsRequest = {
  events: RecommendationEventInput[]
}

export type ReportRecommendationEventsResponse = ApiSuccess<{ accepted: number }>

/** for-you 候选来源（方案 §5.1：每个候选携带 source 便于解释与调试） */
export type ForYouSource = 'tag-interest' | 'author-affinity' | 'quality' | 'fresh' | 'explore'

export type ForYouItem = {
  novel: NovelCard
  /** 推荐理由：必须来自真实特征（方案 §11.3） */
  reason: string
  sources: ForYouSource[]
  score: number
}

export type ForYouPayload = {
  /** 推荐会话 ID：曝光/点击归因用 */
  sessionId: string
  algorithmVersion: string
  /** 是否命中用户兴趣画像（冷启动时为 false） */
  personalized: boolean
  items: ForYouItem[]
}

export type GetForYouResponse = ApiSuccess<ForYouPayload>
