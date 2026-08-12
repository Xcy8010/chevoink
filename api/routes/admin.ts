import { Router, type Request, type Response } from 'express'

import { createAuthCaptchaChallenge, verifyAuthCaptchaChallenge } from '../lib/auth-captcha.js'
import {
  assertAdminLoginAllowed,
  clearAdminLoginFailures,
  getRequestIp,
  recordAdminLoginFailure,
  requireAdmin,
} from '../lib/admin-auth.js'
import { clearSession, createSession } from '../lib/auth-session.js'
import {
  adminChangeMyPasswordData,
  adminDeleteChapterData,
  adminDeleteCommentData,
  adminDeleteNovelData,
  adminDeletePostData,
  adminLoginByEmailData,
  getAdminDashboardData,
  getAdminNovelDetailData,
  getAdminUserBySessionData,
  getAdminUserDetailData,
  listAdminAuditLogsData,
  listAdminCommentsData,
  listAdminNovelsData,
  listAdminPostsData,
  listAdminUsersData,
  recordAdminAuditLog,
  resetUserPasswordData,
  restoreNovelData,
  setUserBannedData,
  setUserRoleData,
  takeDownNovelData,
} from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId, parsePositiveInt } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

/** 强密码校验：至少 12 位，含大小写、数字与符号 */
function validateStrongPassword(password: string): string | null {
  if (password.length < 12) {
    return '密码至少 12 位。'
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return '密码需同时包含大写字母、小写字母与数字。'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return '密码需包含至少一个特殊符号。'
  }
  return null
}

/* ---------------- 认证 ---------------- */

router.get('/captcha', (_req: Request, res: Response): void => {
  const requestId = createRequestId()
  const challenge = createAuthCaptchaChallenge()
  res.status(200).json(buildSuccess(requestId, challenge))
})

router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as {
    email?: string
    password?: string
    captchaId?: string
    captchaAnswer?: string
  }

  try {
    if (!body.email?.trim() || !body.password || !body.captchaId?.trim() || !body.captchaAnswer?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入邮箱、密码并完成人机验证。'))
      return
    }

    const email = body.email.trim().toLowerCase()
    const rateLimitKey = `${getRequestIp(req) ?? 'unknown'}:${email}`
    assertAdminLoginAllowed(rateLimitKey)
    verifyAuthCaptchaChallenge(body.captchaId.trim(), body.captchaAnswer.trim())

    const result = await adminLoginByEmailData(email, body.password)
    if (!result) {
      recordAdminLoginFailure(rateLimitKey)
      res.status(401).json(buildError(requestId, 'ADMIN_AUTH_FAILED', '邮箱或密码不正确。'))
      return
    }

    clearAdminLoginFailures(rateLimitKey)
    const tokens = createSession(result.userId, res)
    await recordAdminAuditLog({
      adminId: result.userId,
      action: 'admin.login',
      targetType: 'user',
      targetId: result.userId,
      ip: getRequestIp(req),
    })
    res.status(200).json(
      buildSuccess(requestId, {
        admin: { id: result.userId, nickname: result.nickname },
        tokens,
      }),
    )
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    const payload = await getAdminUserBySessionData(admin.id)
    if (!payload) {
      res.status(401).json(buildError(requestId, 'AUTH_REQUIRED', '请先登录管理后台。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  clearSession(res)
  res.status(200).json(buildSuccess(requestId, { ok: true }))
})

router.post('/me/change-password', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as { oldPassword?: string; newPassword?: string }

  try {
    const admin = await requireAdmin(req)
    if (!body.oldPassword || !body.newPassword) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入旧密码和新密码。'))
      return
    }

    const strengthError = validateStrongPassword(body.newPassword)
    if (strengthError) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', strengthError))
      return
    }

    const changed = await adminChangeMyPasswordData(admin.id, body.oldPassword, body.newPassword)
    if (!changed) {
      res.status(401).json(buildError(requestId, 'ADMIN_AUTH_FAILED', '旧密码不正确。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'admin.change_own_password',
      targetType: 'user',
      targetId: admin.id,
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

/* ---------------- 仪表盘 ---------------- */

router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await getAdminDashboardData()
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

/* ---------------- 用户管理 ---------------- */

router.get('/users', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await listAdminUsersData({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      role: typeof req.query.role === 'string' ? req.query.role : undefined,
      banned:
        req.query.banned === 'true' ? true : req.query.banned === 'false' ? false : undefined,
      page: parsePositiveInt(req.query.page, 1),
      pageSize: parsePositiveInt(req.query.pageSize, 20),
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/users/:userId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await getAdminUserDetailData(req.params.userId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '用户不存在。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/users/:userId/ban', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    if (req.params.userId === admin.id) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '不能封禁当前登录的管理员账号。'))
      return
    }

    const result = await setUserBannedData(req.params.userId, true)
    if (!result) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '用户不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'user.ban',
      targetType: 'user',
      targetId: req.params.userId,
      detail: { nickname: result.nickname },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/users/:userId/unban', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    const result = await setUserBannedData(req.params.userId, false)
    if (!result) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '用户不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'user.unban',
      targetType: 'user',
      targetId: req.params.userId,
      detail: { nickname: result.nickname },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/users/:userId/role', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as { role?: string }

  try {
    const admin = await requireAdmin(req)
    if (req.params.userId === admin.id) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '不能修改当前登录管理员自己的角色。'))
      return
    }

    const role = body.role
    if (role !== 'user' && role !== 'author' && role !== 'admin') {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '不支持的角色。'))
      return
    }

    const result = await setUserRoleData(req.params.userId, role)
    if (!result) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '用户不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'user.set_role',
      targetType: 'user',
      targetId: req.params.userId,
      detail: { nickname: result.nickname, role: result.role },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/users/:userId/reset-password', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    if (req.params.userId === admin.id) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请通过「修改密码」修改自己的密码。'))
      return
    }

    const tempPassword = await resetUserPasswordData(req.params.userId)
    if (!tempPassword) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '用户不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'user.reset_password',
      targetType: 'user',
      targetId: req.params.userId,
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { tempPassword }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

/* ---------------- 作品管理 ---------------- */

router.get('/novels', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await listAdminNovelsData({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      page: parsePositiveInt(req.query.page, 1),
      pageSize: parsePositiveInt(req.query.pageSize, 20),
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await getAdminNovelDetailData(req.params.novelId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '作品不存在。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/take-down', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    const result = await takeDownNovelData(req.params.novelId)
    if (!result) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '作品不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'novel.take_down',
      targetType: 'novel',
      targetId: req.params.novelId,
      detail: { title: result.title, previousVisibility: result.previousVisibility },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/restore', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    const result = await restoreNovelData(req.params.novelId)
    if (!result) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '作品不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'novel.restore',
      targetType: 'novel',
      targetId: req.params.novelId,
      detail: { title: result.title },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/novels/:novelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as { confirmTitle?: string }

  try {
    const admin = await requireAdmin(req)
    const detail = await getAdminNovelDetailData(req.params.novelId)
    if (!detail) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '作品不存在。'))
      return
    }

    const expectedTitle = detail.novel.displayTitle ?? detail.novel.title
    if (!body.confirmTitle || body.confirmTitle.trim() !== expectedTitle) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入正确的作品名以确认删除。'))
      return
    }

    await adminDeleteNovelData(req.params.novelId)
    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'novel.delete',
      targetType: 'novel',
      targetId: req.params.novelId,
      detail: { title: expectedTitle, authorId: detail.novel.author.id },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/chapters/:chapterId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    const result = await adminDeleteChapterData(req.params.chapterId)
    if (!result) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '章节不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'chapter.delete',
      targetType: 'chapter',
      targetId: req.params.chapterId,
      detail: { title: result.title, novelId: result.novelId },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

/* ---------------- 帖子与评论管理 ---------------- */

router.get('/posts', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await listAdminPostsData({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      pageSize: parsePositiveInt(req.query.pageSize, 20),
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/posts/:postId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    const deleted = await adminDeletePostData(req.params.postId)
    if (deleted === null) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '帖子不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'post.delete',
      targetType: 'post',
      targetId: req.params.postId,
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/comments', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await listAdminCommentsData({
      targetType: typeof req.query.targetType === 'string' ? req.query.targetType : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      pageSize: parsePositiveInt(req.query.pageSize, 20),
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/comments/:commentId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const admin = await requireAdmin(req)
    const deleted = await adminDeleteCommentData(req.params.commentId)
    if (deleted === null) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '评论不存在。'))
      return
    }

    await recordAdminAuditLog({
      adminId: admin.id,
      action: 'comment.delete',
      targetType: 'comment',
      targetId: req.params.commentId,
      detail: { deletedCount: deleted.deletedCount },
      ip: getRequestIp(req),
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

/* ---------------- 审计日志 ---------------- */

router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await listAdminAuditLogsData({
      action: typeof req.query.action === 'string' ? req.query.action : undefined,
      targetType: typeof req.query.targetType === 'string' ? req.query.targetType : undefined,
      page: parsePositiveInt(req.query.page, 1),
      pageSize: parsePositiveInt(req.query.pageSize, 20),
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
