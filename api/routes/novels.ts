import { Router, type Request, type Response } from 'express'

import type {
  CreateChapterRequest,
  CreateNovelRequest,
  UpdateChapterRequest,
  UpdateNovelRequest,
} from '../../shared/contracts/index.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import {
  createChapterData,
  createNovelData,
  deleteNovelData,
  deleteChapterData,
  getChapterData,
  getNovelDetailData,
  getReaderPayloadData,
  getStudioPayloadData,
  listNovelsData,
  updateChapterData,
  updateNovelData,
} from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = parsePositiveInt(req.query.pageSize, 12)

  try {
    const payload = await listNovelsData(page, pageSize)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<CreateNovelRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.title?.trim() || !body.summary?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完整填写作品标题和简介。'))
      return
    }

    const novel = await createNovelData(userId, {
      title: body.title.trim(),
      displayTitle: body.displayTitle,
      summary: body.summary.trim(),
      categoryId: body.categoryId,
      tags: body.tags ?? [],
      visibility: body.visibility,
      status: body.status,
    })

    res.status(201).json(buildSuccess(requestId, { novel }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:novelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await getNovelDetailData(req.params.novelId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/:novelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<UpdateNovelRequest>

  try {
    const userId = requireSessionUserId(req)
    const novel = await updateNovelData(userId, req.params.novelId, body)

    if (!novel) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { novel }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/:novelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const deleted = await deleteNovelData(userId, req.params.novelId)

    if (!deleted) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { deleted: true as const, novelId: req.params.novelId }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:novelId/studio', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await getStudioPayloadData(userId, req.params.novelId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:novelId/reader/:chapterId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await getReaderPayloadData(req.params.novelId, req.params.chapterId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'CHAPTER_NOT_FOUND', '未找到章节内容。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/:novelId/chapters', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<CreateChapterRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.title?.trim() || body.content === undefined || !body.status) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完整填写章节信息。'))
      return
    }

    const chapter = await createChapterData(
      userId,
      req.params.novelId,
      {
        title: body.title.trim(),
        summary: body.summary,
        content: body.content,
        status: body.status,
        visibility: body.visibility,
      },
      body.visibility ?? 'private',
    )

    if (!chapter) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(201).json(buildSuccess(requestId, { chapter }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:novelId/chapters/:chapterId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const chapter = await getChapterData(userId, req.params.novelId, req.params.chapterId)

    if (!chapter) {
      res.status(404).json(buildError(requestId, 'CHAPTER_NOT_FOUND', '未找到章节。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { chapter }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/:novelId/chapters/:chapterId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<UpdateChapterRequest>

  try {
    const userId = requireSessionUserId(req)
    const chapter = await updateChapterData(userId, req.params.novelId, req.params.chapterId, body)

    if (!chapter) {
      res.status(404).json(buildError(requestId, 'CHAPTER_NOT_FOUND', '未找到章节。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { chapter }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/:novelId/chapters/:chapterId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const deleted = await deleteChapterData(userId, req.params.novelId, req.params.chapterId)

    if (!deleted) {
      res.status(404).json(buildError(requestId, 'CHAPTER_NOT_FOUND', '未找到章节。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { deleted: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
