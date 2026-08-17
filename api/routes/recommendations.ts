import { Router, type Request, type Response } from 'express'

import type { RecommendationEventInput, ReportRecommendationEventsRequest } from '../../shared/contracts/recommendation.js'
import { getSessionUserId } from '../lib/auth-session.js'
import { ingestRecommendationEvents } from '../lib/recommendation/events.js'
import { buildForYouPayload } from '../lib/recommendation/for-you.js'
import { buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

/** 个性化「为你推荐」：服务端统一排序（方案 §11.1），返回 sessionId/algorithmVersion 供曝光归因 */
router.get('/for-you', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const excludeParam = typeof req.query.exclude === 'string' ? req.query.exclude : ''
    const excludeIds = excludeParam.split(',').filter((id) => id.length > 0).slice(0, 20)
    const payload = await buildForYouPayload(getSessionUserId(req), excludeIds)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

/** 推荐行为事件批量上报：eventId 幂等；写入失败不阻塞主流程（方案 §6.2） */
router.post('/events', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const body = (req.body ?? {}) as Partial<ReportRecommendationEventsRequest>
    const events = Array.isArray(body.events) ? (body.events as RecommendationEventInput[]) : []
    const accepted = await ingestRecommendationEvents(getSessionUserId(req), events)
    res.status(200).json(buildSuccess(requestId, { accepted }))
  } catch {
    // 事件链路故障静默降级：返回 accepted 0，绝不影响阅读主流程
    res.status(200).json(buildSuccess(requestId, { accepted: 0 }))
  }
})

export default router
