import { Router, type Request, type Response } from 'express'

import {
  getHotSearchKeywordsData,
  searchAllData,
  searchSuggestData,
} from '../lib/data-access.js'
import { buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

function parseKeyword(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 60) : ''
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const keyword = parseKeyword(req.query.q)

  try {
    const payload = await searchAllData(keyword)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/suggest', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const keyword = parseKeyword(req.query.q)

  try {
    const payload = await searchSuggestData(keyword)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/hot', async (_req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await getHotSearchKeywordsData()
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
