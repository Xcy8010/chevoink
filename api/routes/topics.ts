import { Router, type Request, type Response } from 'express'

import { listRecommendedTopicsData, listTopicsData, resolveTopicData } from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await listTopicsData()
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    const message = error instanceof Error ? error.message : '话题列表暂时不可用'
    res.status(500).json(buildError(requestId, 'TOPICS_LIST_FAILED', message))
  }
})

// 推荐话题：必须注册在 /:topicKey 之前，避免被动态路由吞掉
router.get('/recommended', async (_req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await listRecommendedTopicsData()
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 话题详情：按 slug/name/id 依次解析
router.get('/:topicKey', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const topic = await resolveTopicData(req.params.topicKey)
    if (!topic) {
      res.status(404).json(buildError(requestId, 'TOPIC_NOT_FOUND', '未找到话题。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { topic }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
