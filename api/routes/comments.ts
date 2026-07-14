import { Router, type Request, type Response } from 'express'

import type { CreateCommentRequest } from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { createCommentData, listCommentsData } from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const targetType = req.query.targetType
  const targetId = req.query.targetId
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = parsePositiveInt(req.query.pageSize, 10)

  if (
    (targetType !== 'novel' && targetType !== 'chapter' && targetType !== 'post') ||
    typeof targetId !== 'string' ||
    !targetId.trim()
  ) {
    res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '评论目标参数不正确。'))
    return
  }

  try {
    const payload = await listCommentsData(targetType, targetId, page, pageSize)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<CreateCommentRequest>

  try {
    const userId = requireSessionUserId(req)
    if (
      (body.targetType !== 'novel' && body.targetType !== 'chapter' && body.targetType !== 'post') ||
      !body.targetId?.trim() ||
      !body.content?.trim()
    ) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完整填写评论内容。'))
      return
    }

    const comment = await createCommentData(userId, {
      targetType: body.targetType,
      targetId: body.targetId.trim(),
      content: body.content.trim(),
      parentId: body.parentId,
    })

    res.status(201).json(buildSuccess(requestId, { comment }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
