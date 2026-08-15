import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import type { SendMessageRequest } from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import {
  createDirectConversationData,
  listConversationsData,
  listMessagesData,
  markConversationReadData,
  sendMessageData,
} from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { parseBody } from '../lib/parse-body.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

/** 非空文本：对齐路由原 `!body.x?.trim()` 判定（空串与纯空白均拒绝，值原样透传） */
const nonEmptyText = z.string().refine((value) => value.trim().length > 0)

const createConversationSchema = z.object({
  targetUserId: nonEmptyText,
})

const sendMessageSchema = z.object({
  type: z.string().min(1),
  content: nonEmptyText,
  relatedId: z.string().optional(),
})

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

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(createConversationSchema, req.body, '请指定要私信的用户。')

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

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(sendMessageSchema, req.body, '消息内容不能为空。')

    const message = await sendMessageData(userId, req.params.conversationId, {
      type: body.type as SendMessageRequest['type'],
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
