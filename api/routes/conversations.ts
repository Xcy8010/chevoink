import { Router, type Request, type Response } from 'express'

import type { CreateConversationRequest, SendMessageRequest } from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import {
  createDirectConversationData,
  listConversationsData,
  listMessagesData,
  markConversationReadData,
  sendMessageData,
} from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = parsePositiveInt(req.query.pageSize, 20)

  try {
    const userId = requireSessionUserId(req)
    const payload = await listConversationsData(userId, page, pageSize)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<CreateConversationRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.targetUserId?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请指定要私信的用户。'))
      return
    }

    const conversation = await createDirectConversationData(userId, body.targetUserId.trim())

    if (!conversation) {
      res.status(404).json(buildError(requestId, 'USER_NOT_FOUND', '未找到该用户。'))
      return
    }

    res.status(201).json(buildSuccess(requestId, { conversation }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = parsePositiveInt(req.query.pageSize, 50)

  try {
    const userId = requireSessionUserId(req)
    const payload = await listMessagesData(userId, req.params.conversationId, page, pageSize)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'CONVERSATION_NOT_FOUND', '未找到会话。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<SendMessageRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.content?.trim() || !body.type) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '消息内容不能为空。'))
      return
    }

    const message = await sendMessageData(userId, req.params.conversationId, {
      type: body.type,
      content: body.content.trim(),
      relatedId: body.relatedId,
    })

    if (!message) {
      res.status(404).json(buildError(requestId, 'CONVERSATION_NOT_FOUND', '未找到会话。'))
      return
    }

    res.status(201).json(buildSuccess(requestId, { message }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/:conversationId/read', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await markConversationReadData(userId, req.params.conversationId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
