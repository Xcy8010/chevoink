import { Router, type Request, type Response } from 'express'

import type {
  SaveReadingProgressRequest,
  UpdateMyAvatarRequest,
  UpdateMyCoverRequest,
  UpdateMyPasswordRequest,
  UpdateMyProfileRequest,
  UpdatePrivacyRequest,
} from '../../shared/contracts/index.js'
import { removeManagedAvatar, storeAvatarDataUrl } from '../lib/avatar-storage.js'
import { getSessionUserId, requireSessionUserId } from '../lib/auth-session.js'
import { removeManagedProfileCover, storeProfileCoverDataUrl } from '../lib/profile-cover-storage.js'
import {
  getInteractionBadgesData,
  getMePayloadData,
  getUserByIdData,
  getUserCredentialData,
  listInteractionsData,
  listFavoriteNovelsData,
  listReadingProgressData,
  listUserFollowersData,
  listUserFollowingData,
  listUserLikedPostsData,
  listUserBookmarkedPostsData,
  listUserRepliesData,
  listReceivedLikesData,
  markInteractionSeenData,
  removeReadingProgressData,
  saveReadingProgressData,
  setUserFollowData,
  updateMyAvatarData,
  updateMyPasswordData,
  updateMyPrivacyData,
  updateMyProfileCoverData,
  updateMyProfileData,
} from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { hasConfiguredPassword, verifyPassword } from '../lib/password.js'
import { sendRouteError } from '../lib/route-error.js'
import { sendAuthSmsCode, verifyAuthSmsCode } from '../lib/sms-service.js'

const router = Router()

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await getMePayloadData(userId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/me/profile', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<UpdateMyProfileRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.nickname?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入昵称。'))
      return
    }

    const user = await updateMyProfileData(userId, {
      nickname: body.nickname,
      bio: body.bio,
    })
    res.status(200).json(buildSuccess(requestId, { user }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/me/avatar', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<UpdateMyAvatarRequest>

  try {
    const userId = requireSessionUserId(req)

    if (typeof body.avatarDataUrl !== 'string' && body.avatarDataUrl !== null) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请上传头像图片。'))
      return
    }

    const nextAvatarUrl = body.avatarDataUrl ? await storeAvatarDataUrl(body.avatarDataUrl) : null
    let previousAvatarUrl: string | null = null

    try {
      const payload = await updateMyAvatarData(userId, nextAvatarUrl)
      previousAvatarUrl = payload.previousAvatarUrl

      if (nextAvatarUrl !== previousAvatarUrl) {
        await removeManagedAvatar(previousAvatarUrl)
      }

      res.status(200).json(buildSuccess(requestId, { user: payload.user }))
    } catch (error) {
      if (nextAvatarUrl && nextAvatarUrl !== previousAvatarUrl) {
        await removeManagedAvatar(nextAvatarUrl)
      }

      throw error
    }
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/me/cover', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<UpdateMyCoverRequest>

  try {
    const userId = requireSessionUserId(req)

    if (typeof body.coverDataUrl !== 'string' && body.coverDataUrl !== null) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请上传封面图片。'))
      return
    }

    const nextProfileCoverUrl = body.coverDataUrl ? await storeProfileCoverDataUrl(body.coverDataUrl) : null
    let previousProfileCoverUrl: string | null = null

    try {
      const payload = await updateMyProfileCoverData(userId, nextProfileCoverUrl)
      previousProfileCoverUrl = payload.previousProfileCoverUrl

      if (nextProfileCoverUrl !== previousProfileCoverUrl) {
        await removeManagedProfileCover(previousProfileCoverUrl)
      }

      res.status(200).json(buildSuccess(requestId, { user: payload.user }))
    } catch (error) {
      if (nextProfileCoverUrl && nextProfileCoverUrl !== previousProfileCoverUrl) {
        await removeManagedProfileCover(nextProfileCoverUrl)
      }

      throw error
    }
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/me/password/sms-code', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const credential = await getUserCredentialData(userId)

    if (!credential.phone) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '当前账号未绑定手机号，无法通过验证码重置密码。'))
      return
    }

    const payload = await sendAuthSmsCode({
      phone: credential.phone,
      purpose: 'reset_password',
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/me/password', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<UpdateMyPasswordRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.password?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入登录密码。'))
      return
    }

    if (body.password.trim().length < 6) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '登录密码至少需要 6 位。'))
      return
    }

    const credential = await getUserCredentialData(userId)

    // 已设置过密码的账号，修改前需验证旧密码或手机验证码二选一
    if (hasConfiguredPassword(credential.passwordHash)) {
      if (body.code?.trim()) {
        if (!credential.phone) {
          res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '当前账号未绑定手机号，无法通过验证码重置密码。'))
          return
        }

        await verifyAuthSmsCode({
          phone: credential.phone,
          purpose: 'reset_password',
          code: body.code.trim(),
        })
      } else if (body.oldPassword?.trim()) {
        if (!credential.passwordHash || !verifyPassword(body.oldPassword.trim(), credential.passwordHash)) {
          res.status(400).json(buildError(requestId, 'AUTH_INVALID_CREDENTIALS', '当前密码不正确。'))
          return
        }
      } else {
        res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入当前密码或手机验证码。'))
        return
      }
    }

    const user = await updateMyPasswordData(userId, body.password)
    res.status(200).json(buildSuccess(requestId, { user }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

async function handleUserFollow(req: Request, res: Response, following: boolean): Promise<void> {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await setUserFollowData(userId, req.params.userId, following)

    if (!payload) {
      res.status(404).json(buildError(requestId, 'USER_NOT_FOUND', '未找到用户。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
}

router.post('/:userId/follow', (req, res) => handleUserFollow(req, res, true))
router.delete('/:userId/follow', (req, res) => handleUserFollow(req, res, false))

router.get('/me/received-likes', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await listReceivedLikesData(userId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/me/favorite-novels', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const items = await listFavoriteNovelsData(userId)
    res.status(200).json(buildSuccess(requestId, { items }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 云端书架 + 阅读进度：多设备同步的书架列表与阅读位置
router.get('/me/reading-progress', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const items = await listReadingProgressData(userId)
    res.status(200).json(buildSuccess(requestId, { items }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/me/reading-progress', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<SaveReadingProgressRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.novelId?.trim() || !body.novelTitle?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '缺少作品信息。'))
      return
    }

    const item = await saveReadingProgressData(userId, body as SaveReadingProgressRequest)
    if (!item) {
      res.status(404).json(buildError(requestId, 'NOVEL_NOT_FOUND', '未找到作品。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { item }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/me/reading-progress/:novelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const removed = await removeReadingProgressData(userId, req.params.novelId)
    res.status(200).json(buildSuccess(requestId, { removed }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/me/interactions', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await listInteractionsData(userId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/me/interaction-badges', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await getInteractionBadgesData(userId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/me/interaction-badges/seen', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const target = (req.body ?? {}).target

  try {
    const userId = requireSessionUserId(req)

    if (target !== 'interactions' && target !== 'followers') {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '无效的已读标记目标。'))
      return
    }

    const payload = await markInteractionSeenData(userId, target)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/me/privacy', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as UpdatePrivacyRequest

  try {
    const userId = requireSessionUserId(req)
    const payload = await updateMyPrivacyData(userId, {
      followers: body.followers,
      following: body.following,
      likes: body.likes,
      favorites: body.favorites,
      replies: body.replies,
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:userId/followers', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const viewerUserId = getSessionUserId(req)
    const targetUserId = req.params.userId === 'me' ? viewerUserId : req.params.userId

    if (!targetUserId) {
      res.status(401).json(buildError(requestId, 'AUTH_REQUIRED', '请先登录后再继续。'))
      return
    }

    const payload = await listUserFollowersData(targetUserId, viewerUserId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:userId/following', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const viewerUserId = getSessionUserId(req)
    const targetUserId = req.params.userId === 'me' ? viewerUserId : req.params.userId

    if (!targetUserId) {
      res.status(401).json(buildError(requestId, 'AUTH_REQUIRED', '请先登录后再继续。'))
      return
    }

    const payload = await listUserFollowingData(targetUserId, viewerUserId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:userId/liked-posts', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const viewerUserId = getSessionUserId(req)
    const targetUserId = req.params.userId === 'me' ? viewerUserId : req.params.userId

    if (!targetUserId) {
      res.status(401).json(buildError(requestId, 'AUTH_REQUIRED', '请先登录后再继续。'))
      return
    }

    const payload = await listUserLikedPostsData(targetUserId, viewerUserId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:userId/bookmarked-posts', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const viewerUserId = getSessionUserId(req)
    const targetUserId = req.params.userId === 'me' ? viewerUserId : req.params.userId

    if (!targetUserId) {
      res.status(401).json(buildError(requestId, 'AUTH_REQUIRED', '请先登录后再继续。'))
      return
    }

    const payload = await listUserBookmarkedPostsData(targetUserId, viewerUserId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:userId/replies', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const viewerUserId = getSessionUserId(req)
    const targetUserId = req.params.userId === 'me' ? viewerUserId : req.params.userId

    if (!targetUserId) {
      res.status(401).json(buildError(requestId, 'AUTH_REQUIRED', '请先登录后再继续。'))
      return
    }

    const payload = await listUserRepliesData(targetUserId, viewerUserId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/:userId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const viewerUserId = getSessionUserId(req)
    if (!viewerUserId && req.params.userId === 'me') {
      res.status(401).json(buildError(requestId, 'AUTH_REQUIRED', '请先登录后再继续。'))
      return
    }

    const user = await getUserByIdData(req.params.userId, viewerUserId)
    if (!user) {
      res.status(404).json(buildError(requestId, 'USER_NOT_FOUND', '未找到用户。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { user }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
