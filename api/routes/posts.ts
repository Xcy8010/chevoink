import { Router, type Request, type Response } from 'express'

import type { CreatePostRequest } from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { createPostData, getPostDetailData, listPostsData } from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = parsePositiveInt(req.query.pageSize, 10)
  const topicId = typeof req.query.topicId === 'string' ? req.query.topicId : undefined

  try {
    const payload = await listPostsData(page, pageSize, topicId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:postId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await getPostDetailData(req.params.postId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'POST_NOT_FOUND', '未找到动态。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<CreatePostRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.content?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入动态内容。'))
      return
    }

    const post = await createPostData(userId, {
      content: body.content.trim(),
      topicId: body.topicId,
      imageUrls: body.imageUrls ?? [],
      relatedNovelId: body.relatedNovelId,
    })

    res.status(201).json(buildSuccess(requestId, { post }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
