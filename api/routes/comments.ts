import { Router, type Request, type Response } from 'express'

import type { UpdateCommentRequest } from '../../shared/contracts/index.js'
import { createCommentSchema } from '../../shared/contracts/index.js'
import { getSessionUserId, requireSessionUserId } from '../lib/auth-session.js'
import {
  createCommentData,
  deleteCommentData,
  listCommentsData,
  setCommentLikeData,
  updateCommentData,
} from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { parseBody } from '../lib/parse-body.js'
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
    const payload = await listCommentsData(targetType, targetId, page, pageSize, getSessionUserId(req))
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(createCommentSchema, req.body, '请完整填写评论内容。')

    const comment = await createCommentData(userId, {
      targetType: body.targetType,
      targetId: body.targetId.trim(),
      content: body.content.trim(),
      parentId: body.parentId,
      // 作品根评论的评星此前被路由层丢弃，导致已评星仍报「请先打分」
      rating: body.rating,
      // 章节段评：透传段落序号，校验在 data-access 层
      paragraphIndex: body.paragraphIndex,
    })

    res.status(201).json(buildSuccess(requestId, { comment }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

async function handleCommentLike(req: Request, res: Response, liked: boolean): Promise<void> {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await setCommentLikeData(userId, req.params.commentId, liked)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'COMMENT_NOT_FOUND', '未找到评论。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
}

router.post('/:commentId/like', (req, res) => handleCommentLike(req, res, true))
router.delete('/:commentId/like', (req, res) => handleCommentLike(req, res, false))

router.patch('/:commentId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<UpdateCommentRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.content?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请填写评论内容。'))
      return
    }

    const comment = await updateCommentData(userId, req.params.commentId, {
      content: body.content.trim(),
      rating: body.rating,
    })

    if (!comment) {
      res.status(404).json(buildError(requestId, 'COMMENT_NOT_FOUND', '未找到评论。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { comment }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/:commentId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await deleteCommentData(userId, req.params.commentId)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'COMMENT_NOT_FOUND', '未找到评论。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
