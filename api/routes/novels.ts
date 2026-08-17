import { Router, type Request, type Response } from 'express'

import {
  FIXED_NOVEL_COVER_HEIGHT,
  FIXED_NOVEL_COVER_WIDTH,
  createChapterSchema,
  createNovelSchema,
  publishNovelSchema,
  updateChapterSchema,
  updateNovelSchema,
  uploadNovelCoverSchema,
} from '../../shared/contracts/index.js'
import { getSessionUserId, requireSessionUserId } from '../lib/auth-session.js'
import {
  createChapterData,
  createUploadedCoverAssetData,
  createNovelData,
  deleteNovelData,
  deleteChapterData,
  getChapterData,
  getNovelDetailData,
  getReaderPayloadData,
  getStudioPayloadData,
  listNovelCardsByIdsData,
  listNovelsData,
  publishNovelData,
  setNovelFavoriteData,
  updateChapterData,
  updateNovelData,
} from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { storeNovelCoverDataUrl } from '../lib/novel-cover-storage.js'
import { parseBody } from '../lib/parse-body.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

async function handleNovelDetailRequest(req: Request, res: Response, novelId: string): Promise<void> {
  const requestId = createRequestId()

  try {
    const payload = await getNovelDetailData(novelId, getSessionUserId(req))
    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = parsePositiveInt(req.query.pageSize, 12)
  const authorId = typeof req.query.authorId === 'string' && req.query.authorId.trim() ? req.query.authorId.trim() : undefined
  const publishedOnly = req.query.status === 'published'
  const tag = typeof req.query.tag === 'string' && req.query.tag.trim() ? req.query.tag.trim() : undefined

  try {
    const payload = await listNovelsData(page, pageSize, { authorId, publishedOnly, tag })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(createNovelSchema, req.body, '请完整填写作品标题和简介。')

    const novel = await createNovelData(userId, {
      title: body.title.trim(),
      displayTitle: body.displayTitle,
      summary: body.summary.trim(),
      categoryId: body.categoryId,
      tags: body.tags,
      visibility: body.visibility,
      status: body.status,
    })

    res.status(201).json(buildSuccess(requestId, { novel }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:novelId/detail', async (req: Request, res: Response): Promise<void> => {
  await handleNovelDetailRequest(req, res, req.params.novelId)
})

// 批量轻量卡片（首页继续阅读，方案 20 §2.5）：必须先于 /:novelId 注册，避免被动态段吞掉
router.get('/cards', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const idsParam = typeof req.query.ids === 'string' ? req.query.ids : ''
  const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean)

  try {
    const items = await listNovelCardsByIdsData(ids, getSessionUserId(req))
    res.status(200).json(buildSuccess(requestId, { items }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:novelId', async (req: Request, res: Response): Promise<void> => {
  await handleNovelDetailRequest(req, res, req.params.novelId)
})

router.patch('/:novelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    // 原零校验透传：schema 仅做错型拦截与字段白名单 strip，空值校验仍在 data 层
    const body = parseBody(updateNovelSchema, req.body, '作品信息格式不正确。')
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

router.patch('/:novelId/cover', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(uploadNovelCoverSchema, req.body, '请提供作品封面图片。')

    const imageUrl = await storeNovelCoverDataUrl(body.coverDataUrl.trim())
    const asset = await createUploadedCoverAssetData({
      userId,
      novelId: req.params.novelId,
      imageUrl,
      width: FIXED_NOVEL_COVER_WIDTH,
      height: FIXED_NOVEL_COVER_HEIGHT,
    })
    const novel = await updateNovelData(userId, req.params.novelId, { coverAssetId: asset.id })

    if (!novel) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { novel, asset }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

async function handleNovelFavorite(req: Request, res: Response, favorited: boolean): Promise<void> {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await setNovelFavoriteData(userId, req.params.novelId, favorited)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
}

router.post('/:novelId/favorite', (req, res) => handleNovelFavorite(req, res, true))
router.delete('/:novelId/favorite', (req, res) => handleNovelFavorite(req, res, false))

router.post('/:novelId/publish', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(publishNovelSchema, req.body, '发布参数不正确。')
    const visibility = body.visibility ?? 'public'

    const payload = await publishNovelData(userId, req.params.novelId, body.chapterIds, visibility)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
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
    const payload = await getReaderPayloadData(req.params.novelId, req.params.chapterId, getSessionUserId(req))
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

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(createChapterSchema, req.body, '请完整填写章节信息。')

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
      body.visibility ?? 'public',
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

  try {
    const userId = requireSessionUserId(req)
    // 原零校验透传：schema 仅做错型拦截与字段白名单 strip，空值校验仍在 data 层
    const body = parseBody(updateChapterSchema, req.body, '章节信息格式不正确。')
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
