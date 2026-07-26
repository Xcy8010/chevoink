import { Router, type Request, type Response } from 'express'

import type {
  ChapterAssistRequest,
  GenerateCoverImageRequest,
  GenerateCoverPromptRequest,
  GenerateOutlineRequest,
} from '../../shared/contracts/index.js'
import { FIXED_NOVEL_COVER_SIZE } from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import {
  chapterAssistData,
  generateCoverImageData,
  generateCoverPromptData,
  generateOutlineData,
  getAiConfigPayload,
} from '../lib/ai-service.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/config', async (_req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await getAiConfigPayload()
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/outline', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<GenerateOutlineRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.theme?.trim() || !body.genre?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供主题和题材。'))
      return
    }

    const payload = await generateOutlineData(userId, {
      theme: body.theme.trim(),
      genre: body.genre.trim(),
      tone: body.tone,
      targetLength: body.targetLength,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/chapter-assist', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ChapterAssistRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.mode || !body.content?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供任务模式和正文内容。'))
      return
    }

    const payload = await chapterAssistData(userId, {
      mode: body.mode,
      content: body.content,
      novelId: body.novelId,
      chapterId: body.chapterId,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/cover-prompt', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<GenerateCoverPromptRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelTitle?.trim() || !body.summary?.trim() || !body.genre?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品标题、简介和题材。'))
      return
    }

    const payload = await generateCoverPromptData(userId, {
      novelTitle: body.novelTitle.trim(),
      summary: body.summary.trim(),
      genre: body.genre.trim(),
      protagonist: body.protagonist,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/cover-image', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<GenerateCoverImageRequest & { novelId?: string | null; negativePrompt?: string | null }>

  try {
    const userId = requireSessionUserId(req)
    if (!body.prompt?.trim() || !body.count) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供提示词和生成张数。'))
      return
    }

    const payload = await generateCoverImageData(userId, {
      prompt: body.prompt.trim(),
      size: FIXED_NOVEL_COVER_SIZE,
      count: body.count,
      novelId: body.novelId ?? null,
      negativePrompt: body.negativePrompt ?? null,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
