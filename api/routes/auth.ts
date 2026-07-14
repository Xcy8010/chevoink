import { Router, type Request, type Response } from 'express'

import type {
  GetAuthCaptchaResponse,
  LoginRequest,
  RegisterRequest,
  SendSmsCodeRequest,
  SmsAccountStatus,
  SmsLoginRequest,
  SmsRegisterRequest,
} from '../../shared/contracts/index.js'
import { createAuthCaptchaChallenge, verifyAuthCaptchaChallenge } from '../lib/auth-captcha.js'
import { clearSession, createSession } from '../lib/auth-session.js'
import { getUserByPhoneData, loginUserData, registerUserData } from '../lib/data-access.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'
import { normalizePhoneNumber } from '../lib/phone.js'
import { sendAuthSmsCode, verifyAuthSmsCode } from '../lib/sms-service.js'

const router = Router()

router.get('/captcha', (_req: Request, res: Response): void => {
  const requestId = createRequestId()
  const challenge = createAuthCaptchaChallenge()

  res.status(200).json(buildSuccess<GetAuthCaptchaResponse['data']>(requestId, challenge))
})

router.post('/sms/send-code', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<SendSmsCodeRequest>

  try {
    if (!body.phone?.trim() || !body.purpose || !body.captchaId?.trim() || !body.captchaAnswer?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请先完成人机验证，再获取验证码。'))
      return
    }

    const phone = normalizePhoneNumber(body.phone)
    verifyAuthCaptchaChallenge(body.captchaId.trim(), body.captchaAnswer.trim())
    const existingUser = await getUserByPhoneData(phone)
    const accountStatus: SmsAccountStatus = existingUser ? 'existing' : 'new'
    const resolvedPurpose =
      body.purpose === 'auth' ? (existingUser ? 'login' : 'register') : body.purpose

    if (resolvedPurpose === 'login' && !existingUser) {
      res.status(404).json(buildError(requestId, 'AUTH_ACCOUNT_NOT_FOUND', '该手机号尚未注册。'))
      return
    }

    const payload = await sendAuthSmsCode({
      phone,
      purpose: resolvedPurpose,
    })

    res.status(200).json(
      buildSuccess(requestId, {
        ...payload,
        accountStatus,
        normalizedPhone: phone,
      }),
    )
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<RegisterRequest>

  try {
    if ((!body.email || !body.email.trim()) && (!body.phone || !body.phone.trim())) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请至少填写邮箱或手机号。'))
      return
    }

    if (!body.nickname?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完整填写注册信息。'))
      return
    }

    const user = await registerUserData({
      email: body.email?.trim() || undefined,
      phone: body.phone?.trim() || undefined,
      nickname: body.nickname.trim(),
      password: body.password?.trim() || undefined,
    })

    const tokens = createSession(user.id, res)
    res.status(201).json(buildSuccess(requestId, { user, tokens }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/sms/register', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<SmsRegisterRequest>

  try {
    if (!body.phone?.trim() || !body.code?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入手机号和验证码。'))
      return
    }

    const { phone } = await verifyAuthSmsCode({
      phone: body.phone,
      purpose: 'register',
      code: body.code,
    })

    const user = await registerUserData({
      phone,
      password: body.password?.trim() || undefined,
    })

    const tokens = createSession(user.id, res)
    res.status(201).json(buildSuccess(requestId, { user, tokens }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<LoginRequest>

  try {
    if (!body.phone?.trim() || !body.password?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入手机号和密码。'))
      return
    }

    const user = await loginUserData(body.phone.trim(), body.password)
    if (!user) {
      res.status(401).json(buildError(requestId, 'AUTH_INVALID_CREDENTIALS', '手机号或密码不正确。'))
      return
    }

    const tokens = createSession(user.id, res)
    res.status(200).json(buildSuccess(requestId, { user, tokens }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/sms/login', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<SmsLoginRequest>

  try {
    if (!body.phone?.trim() || !body.code?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请输入手机号和验证码。'))
      return
    }

    const { phone } = await verifyAuthSmsCode({
      phone: body.phone,
      purpose: 'login',
      code: body.code,
    })

    const user = await getUserByPhoneData(phone)
    if (!user) {
      res.status(404).json(buildError(requestId, 'AUTH_ACCOUNT_NOT_FOUND', '该手机号尚未注册。'))
      return
    }

    const tokens = createSession(user.id, res)
    res.status(200).json(buildSuccess(requestId, { user, tokens }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  clearSession(res)
  res.status(200).json(buildSuccess(requestId, { ok: true }))
})

export default router
