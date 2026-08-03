import { Router, type Request, type Response } from 'express'

import type { CreatePostRequest } from '../../shared/contracts/index.js'
import { getSessionUserId, requireSessionUserId } from '../lib/auth-session.js'
import { createPostData, deletePostData, getPostDetailData, listPostsData, setPostBookmarkData, setPostLikeData } from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { MAX_POST_IMAGE_COUNT, storePostImageDataUrls } from '../lib/post-image-storage.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = parsePositiveInt(req.query.pageSize, 10)
  const topicId = typeof req.query.topicId === 'string' ? req.query.topicId : undefined
  const authorId = typeof req.query.authorId === 'string' ? req.query.authorId : undefined
  const sort = req.query.sort === 'recommended' ? ('recommended' as const) : ('latest' as const)
  const snapshotAt = typeof req.query.snapshotAt === 'string' ? req.query.snapshotAt : undefined

  try {
    const payload = await listPostsData(page, pageSize, topicId, getSessionUserId(req), authorId, sort, snapshotAt)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:postId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const payload = await getPostDetailData(req.params.postId, getSessionUserId(req))
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

    const imageDataUrls = Array.isArray(body.imageDataUrls)
      ? body.imageDataUrls.filter((item): item is string => typeof item === 'string')
      : []

    if (imageDataUrls.length > MAX_POST_IMAGE_COUNT) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', `讨论配图最多上传 ${MAX_POST_IMAGE_COUNT} 张。`))
      return
    }

    // 配图只信任服务端落盘结果，不直接写入客户端传来的 imageUrls
    const imageUrls = imageDataUrls.length ? await storePostImageDataUrls(imageDataUrls) : []

    const post = await createPostData(userId, {
      content: body.content.trim(),
      topicId: body.topicId,
      imageUrls,
      relatedNovelId: body.relatedNovelId,
      sharedUserId: body.sharedUserId,
    })

    res.status(201).json(buildSuccess(requestId, { post }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

async function handlePostLike(req: Request, res: Response, liked: boolean): Promise<void> {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await setPostLikeData(userId, req.params.postId, liked)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'POST_NOT_FOUND', '未找到动态。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
}

async function handlePostBookmark(req: Request, res: Response, bookmarked: boolean): Promise<void> {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await setPostBookmarkData(userId, req.params.postId, bookmarked)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'POST_NOT_FOUND', '未找到动态。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
}

router.delete('/:postId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const deleted = await deletePostData(userId, req.params.postId)

    if (!deleted) {
      res.status(404).json(buildError(requestId, 'POST_NOT_FOUND', '未找到动态。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { deleted: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/:postId/like', (req, res) => handlePostLike(req, res, true))
router.delete('/:postId/like', (req, res) => handlePostLike(req, res, false))
router.post('/:postId/bookmark', (req, res) => handlePostBookmark(req, res, true))
router.delete('/:postId/bookmark', (req, res) => handlePostBookmark(req, res, false))

export default router
