import { Router, type Request, type Response } from 'express'

import { listTopicsData } from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'

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

export default router
