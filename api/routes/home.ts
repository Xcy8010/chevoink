import { Router, type Request, type Response } from 'express'

import { getHomePayloadData } from '../lib/data-access.js'
import { buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await getHomePayloadData()
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
