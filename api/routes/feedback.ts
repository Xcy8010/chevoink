import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { MAX_FEEDBACK_IMAGE_COUNT } from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { createFeedbackData } from '../lib/data-access.js'
import { storeFeedbackImageDataUrls } from '../lib/feedback-image-storage.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { parseBody } from '../lib/parse-body.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

const createFeedbackSchema = z.object({
  kind: z.enum(['bug', 'suggestion']),
  content: z.string().refine((value) => value.trim().length > 0),
  contact: z.string().max(160).optional(),
  imageDataUrls: z.array(z.string()).optional(),
  source: z.string().max(64).optional(),
  pageUrl: z.string().max(500).optional(),
  clientInfo: z.record(z.string(), z.unknown()).optional(),
})

/** 提交问题反馈 / 功能建议（含界面截图，图片一律服务端落盘后才写库） */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(createFeedbackSchema, req.body, '请填写反馈内容。')

    const imageDataUrls = body.imageDataUrls ?? []
    if (imageDataUrls.length > MAX_FEEDBACK_IMAGE_COUNT) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', `反馈附图最多上传 ${MAX_FEEDBACK_IMAGE_COUNT} 张。`))
      return
    }

    const imageUrls = imageDataUrls.length ? await storeFeedbackImageDataUrls(imageDataUrls) : []

    const payload = await createFeedbackData(userId, {
      kind: body.kind,
      content: body.content.trim().slice(0, 4000),
      contact: body.contact,
      imageUrls,
      source: body.source,
      pageUrl: body.pageUrl,
      clientInfo: body.clientInfo,
    })

    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
