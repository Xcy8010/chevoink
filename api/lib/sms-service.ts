import { createHash, randomInt, randomUUID } from 'node:crypto'

import { sms } from 'tencentcloud-sdk-nodejs-sms'

import { env } from '../config/env.js'
import { prisma, DataAccessError } from './prisma.js'
import { normalizePhoneNumber } from './phone.js'

type SmsAuthPurpose = 'login' | 'register' | 'reset_password' | 'admin_login' | 'admin_bind'

const SmsClient = sms.v20210111.Client

function ensureSmsConfigured() {
  if (env.smsProviderMode !== 'provider') {
    throw new DataAccessError(503, 'SMS_PROVIDER_UNAVAILABLE', '短信服务尚未配置完成。')
  }
}

function hashVerificationCode(phone: string, purpose: SmsAuthPurpose, code: string): string {
  return createHash('sha256')
    .update(`${env.authSessionSecret}:${phone}:${purpose}:${code}`)
    .digest('hex')
}

function buildCode(): string {
  const max = 10 ** Math.max(4, env.smsCodeLength)
  const min = 10 ** Math.max(3, env.smsCodeLength - 1)

  return String(randomInt(min, max))
}

function buildSmsClient() {
  ensureSmsConfigured()

  return new SmsClient({
    credential: {
      secretId: env.smsTencentSecretId,
      secretKey: env.smsTencentSecretKey,
    },
    region: env.smsTencentRegion,
    profile: {
      httpProfile: {
        reqMethod: 'POST',
        reqTimeout: 10,
        endpoint: 'sms.tencentcloudapi.com',
      },
    },
  })
}

function verificationSceneText(purpose: SmsAuthPurpose): string {
  if (purpose === 'reset_password') {
    return '重置密码'
  }
  if (purpose === 'admin_bind') {
    return '绑定手机号'
  }

  return purpose === 'register' ? '注册' : '登录'
}

async function ensureSmsSendAllowed(phone: string, purpose: SmsAuthPurpose) {
  const now = new Date()
  const cooldownWindow = new Date(now.getTime() - env.smsCodeCooldownSeconds * 1000)
  const hourlyWindow = new Date(now.getTime() - 60 * 60 * 1000)

  const [cooldownCount, hourlyCount] = await prisma.$transaction([
    prisma.smsVerificationCode.count({
      where: {
        phone,
        purpose,
        createdAt: {
          gte: cooldownWindow,
        },
      },
    }),
    prisma.smsVerificationCode.count({
      where: {
        phone,
        purpose,
        createdAt: {
          gte: hourlyWindow,
        },
      },
    }),
  ])

  if (cooldownCount > 0) {
    throw new DataAccessError(
      429,
      'SMS_CODE_COOLDOWN',
      `发送过于频繁，请 ${env.smsCodeCooldownSeconds} 秒后再试。`,
    )
  }

  if (hourlyCount >= env.smsCodeHourlyLimit) {
    throw new DataAccessError(429, 'SMS_CODE_HOURLY_LIMIT', '该手机号获取验证码过于频繁，请稍后再试。')
  }
}

export async function sendAuthSmsCode(input: { phone: string; purpose: SmsAuthPurpose }) {
  ensureSmsConfigured()

  if (!env.authSessionSecret) {
    throw new DataAccessError(500, 'AUTH_SESSION_SECRET_MISSING', '服务端认证密钥未配置。')
  }

  const phone = normalizePhoneNumber(input.phone)
  const purpose = input.purpose
  await ensureSmsSendAllowed(phone, purpose)

  const code = buildCode()
  const expiresAt = new Date(Date.now() + env.smsCodeExpiresInSeconds * 1000)
  const templateParams = [code, String(Math.max(1, Math.floor(env.smsCodeExpiresInSeconds / 60)))]
  const sessionContext = JSON.stringify({
    requestId: randomUUID(),
    purpose,
  })

  const client = buildSmsClient()
  const response = await client.SendSms({
    SmsSdkAppId: env.smsTencentSdkAppId,
    SignName: env.smsTencentSignName,
    TemplateId: env.smsTencentTemplateIdAuth,
    TemplateParamSet: templateParams,
    PhoneNumberSet: [phone],
    SessionContext: sessionContext,
  })

  const status = response.SendStatusSet?.[0]
  if (!status || status.Code !== 'Ok') {
    throw new DataAccessError(
      502,
      'SMS_SEND_FAILED',
      status?.Message || `${verificationSceneText(purpose)}验证码发送失败，请稍后再试。`,
    )
  }

  const user = await prisma.user.findFirst({
    where: {
      phone,
    },
    select: {
      id: true,
    },
  })

  await prisma.smsVerificationCode.create({
    data: {
      phone,
      purpose,
      userId: user?.id ?? null,
      codeHash: hashVerificationCode(phone, purpose, code),
      expiresAt,
      provider: 'tencentcloud',
      meta: {
        serialNo: status.SerialNo ?? null,
        sessionContext,
      },
    },
  })

  return {
    ok: true,
    expireInSeconds: env.smsCodeExpiresInSeconds,
    cooldownSeconds: env.smsCodeCooldownSeconds,
    provider: 'tencentcloud' as const,
  }
}

export async function verifyAuthSmsCode(input: { phone: string; purpose: SmsAuthPurpose; code: string }) {
  if (!env.authSessionSecret) {
    throw new DataAccessError(500, 'AUTH_SESSION_SECRET_MISSING', '服务端认证密钥未配置。')
  }

  const phone = normalizePhoneNumber(input.phone)
  const purpose = input.purpose
  const code = input.code.trim()

  if (!/^\d{4,8}$/.test(code)) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '验证码格式不正确。')
  }

  const record = await prisma.smsVerificationCode.findFirst({
    where: {
      phone,
      purpose,
      consumedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  if (!record) {
    throw new DataAccessError(400, 'SMS_CODE_INVALID', '验证码已失效或不存在，请重新获取。')
  }

  if (record.attempts >= 5) {
    throw new DataAccessError(429, 'SMS_CODE_ATTEMPTS_EXCEEDED', '验证码尝试次数过多，请重新获取。')
  }

  const codeHash = hashVerificationCode(phone, purpose, code)
  if (codeHash !== record.codeHash) {
    await prisma.smsVerificationCode.update({
      where: { id: record.id },
      data: {
        attempts: {
          increment: 1,
        },
      },
    })
    throw new DataAccessError(400, 'SMS_CODE_INVALID', '验证码错误。')
  }

  await prisma.smsVerificationCode.updateMany({
    where: {
      phone,
      purpose,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  })

  return {
    phone,
  }
}
