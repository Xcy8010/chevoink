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
  adminLoginByPhoneData,
  bindAdminPhoneData,
  findAdminByPhoneData,
  getAdminConversationMessagesData,
  getAdminDashboardData,
  getAdminNovelDetailData,
  getAdminChapterContentData,
  getAdminPostDetailData,
  getAdminUserBySessionData,
  getAdminUserDetailData,
  isPhoneTakenByOtherData,
  listAdminAuditLogsData,
  listAdminCommentsData,
  listAdminConversationsData,
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
import { normalizePhoneNumber } from '../lib/phone.js'
import { sendRouteError } from '../lib/route-error.js'
import { sendAuthSmsCode, verifyAuthSmsCode } from '../lib/sms-service.js'

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
    phone?: string
    password?: string
    code?: string
    captchaId?: string
    captchaAnswer?: string
  }

  try {
    const hasEmail = Boolean(body.email?.trim())
    const hasPhone = Boolean(body.phone?.trim())
    const hasPassword = Boolean(body.password)
    const hasCode = Boolean(body.code?.trim())

    // 三种模式：邮箱+密码 / 手机号+密码 / 手机号+短信验证码
    if (hasEmail === hasPhone) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请使用邮箱或手机号其中一种方式登录。'))
      return
    }
    if (hasEmail && !hasPassword) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入密码。'))
      return
    }
    if (hasPhone && !hasPassword && !hasCode) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入密码或短信验证码。'))
      return
    }
    if (hasPassword && (!body.captchaId?.trim() || !body.captchaAnswer?.trim())) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完成人机验证。'))
      return
    }

    const identifier = hasEmail ? body.email!.trim().toLowerCase() : normalizePhoneNumber(body.phone!)
    const rateLimitKey = `${getRequestIp(req) ?? 'unknown'}:${identifier}`
    assertAdminLoginAllowed(rateLimitKey)

    // 密码模式登录前校验人机验证；验证码模式的人机验证在发码环节完成
    if (hasPassword) {
      verifyAuthCaptchaChallenge(body.captchaId!.trim(), body.captchaAnswer!.trim())
    }

    let result: { userId: string; nickname: string } | null = null
    if (hasEmail) {
      result = await adminLoginByEmailData(identifier, body.password!)
    } else if (hasPassword) {
      result = await adminLoginByPhoneData(identifier, body.password)
    } else {
      await verifyAuthSmsCode({ phone: identifier, purpose: 'admin_login', code: body.code!.trim() })
      result = await adminLoginByPhoneData(identifier)
    }

    if (!result) {
      recordAdminLoginFailure(rateLimitKey)
      res.status(401).json(buildError(requestId, 'ADMIN_AUTH_FAILED', '账号或凭证不正确，仅管理员可登录。'))
      return
    }

    clearAdminLoginFailures(rateLimitKey)
    const tokens = createSession(result.userId, res)
    await recordAdminAuditLog({
      adminId: result.userId,
      action: 'admin.login',
      targetType: 'user',
      targetId: result.userId,
      detail: { channel: hasEmail ? 'email' : hasPassword ? 'phone_password' : 'phone_code' },
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

/** 管理后台手机号登录发码：必须先过人机验证，且手机号已绑定有效管理员 */
router.post('/auth/sms/send-code', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as { phone?: string; captchaId?: string; captchaAnswer?: string }

  try {
    if (!body.phone?.trim() || !body.captchaId?.trim() || !body.captchaAnswer?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入手机号并完成人机验证。'))
      return
    }

    const phone = normalizePhoneNumber(body.phone)
    const rateLimitKey = `${getRequestIp(req) ?? 'unknown'}:${phone}`
    assertAdminLoginAllowed(rateLimitKey)
    verifyAuthCaptchaChallenge(body.captchaId.trim(), body.captchaAnswer.trim())

    const admin = await findAdminByPhoneData(phone)
    if (!admin) {
      recordAdminLoginFailure(rateLimitKey)
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '该手机号未绑定管理员账号，无法使用手机号登录。'))
      return
    }

    const sent = await sendAuthSmsCode({ phone, purpose: 'admin_login' })
    res.status(200).json(buildSuccess(requestId, sent))
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

/** 管理员绑定手机号发码：人机验证 + 手机号未被占用 */
router.post('/me/sms/send-code', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as { phone?: string; captchaId?: string; captchaAnswer?: string }

  try {
    const admin = await requireAdmin(req)
    if (!body.phone?.trim() || !body.captchaId?.trim() || !body.captchaAnswer?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入手机号并完成人机验证。'))
      return
    }

    const phone = normalizePhoneNumber(body.phone)
    verifyAuthCaptchaChallenge(body.captchaId.trim(), body.captchaAnswer.trim())

    // 占用检查在绑定环节兜底；此处仅校验未被任意账号占用，避免浪费短信
    const taken = await isPhoneTakenByOtherData(phone, admin.id)
    if (taken) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '该手机号已被其他账号绑定。'))
      return
    }

    const sent = await sendAuthSmsCode({ phone, purpose: 'admin_bind' })
    res.status(200).json(buildSuccess(requestId, sent))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

/** 管理员绑定手机号：校验短信码后写入 */
router.post('/me/bind-phone', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as { phone?: string; code?: string }

  try {
    const admin = await requireAdmin(req)
    if (!body.phone?.trim() || !body.code?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入手机号和短信验证码。'))
      return
    }

    const phone = normalizePhoneNumber(body.phone)
    await verifyAuthSmsCode({ phone, purpose: 'admin_bind', code: body.code.trim() })

    const result = await bindAdminPhoneData(admin.id, phone)
    if (!result.ok) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '该手机号已被其他账号绑定。'))
      return
    }

    res.status(200).json(buildSuccess(requestId, { ok: true, phone }))
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
    if (!admin.isSuperAdmin) {
      res.status(403).json(buildError(requestId, 'SUPER_REQUIRED', '仅超级管理可以设置用户身份。'))
      return
    }
    if (req.params.userId === admin.id) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '不能修改当前登录管理员自己的角色。'))
      return
    }

    const role = body.role
    if (role !== 'user' && role !== 'admin') {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '不支持的角色，仅可设置用户或管理。'))
      return
    }

    const result = await setUserRoleData(req.params.userId, role)
    if (result === null) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '用户不存在。'))
      return
    }
    if ('blocked' in result) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '超级管理身份唯一，不可修改。'))
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

router.get('/novels/:novelId/chapters/:chapterId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await getAdminChapterContentData(req.params.novelId, req.params.chapterId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '章节不存在。'))
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

router.get('/posts/:postId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await getAdminPostDetailData(req.params.postId)
    if (!payload) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '帖子不存在。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/comments', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await listAdminCommentsData({
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
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

router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await listAdminConversationsData({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: parsePositiveInt(req.query.page, 1),
      pageSize: parsePositiveInt(req.query.pageSize, 20),
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/conversations/:conversationId/messages', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    await requireAdmin(req)
    const payload = await getAdminConversationMessagesData(req.params.conversationId)
    if (payload === null) {
      res.status(404).json(buildError(requestId, 'NOT_FOUND', '会话不存在。'))
      return
    }
    res.status(200).json(buildSuccess(requestId, { messages: payload }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

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
