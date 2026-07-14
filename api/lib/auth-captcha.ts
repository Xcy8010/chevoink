import { randomUUID } from 'node:crypto'
import svgCaptcha from 'svg-captcha'

import { DataAccessError } from './prisma.js'

type CaptchaChallenge = {
  answer: string
  imageBase64: string
  expiresAt: number
}

const CAPTCHA_TTL_MS = 5 * 60 * 1000
const captchaStore = new Map<string, CaptchaChallenge>()

function buildImageBase64(svgSource: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svgSource).toString('base64')}`
}

function buildGraphicChallenge() {
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0oO1iIlL',
    noise: 3,
    color: true,
    background: '#f8fafc',
    width: 140,
    height: 52,
    fontSize: 42,
  })

  return {
    answer: captcha.text.trim().toLowerCase(),
    imageBase64: buildImageBase64(captcha.data),
  }
}

export function createAuthCaptchaChallenge() {
  const id = randomUUID()
  const challenge = buildGraphicChallenge()

  captchaStore.set(id, {
    answer: challenge.answer,
    imageBase64: challenge.imageBase64,
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  })

  return {
    captchaId: id,
    imageBase64: challenge.imageBase64,
    expiresInSeconds: Math.floor(CAPTCHA_TTL_MS / 1000),
  }
}

export function verifyAuthCaptchaChallenge(captchaId: string, answer: string) {
  const record = captchaStore.get(captchaId)
  captchaStore.delete(captchaId)

  if (!record || record.expiresAt <= Date.now()) {
    throw new DataAccessError(400, 'AUTH_CAPTCHA_EXPIRED', '人机验证已过期，请重新获取。')
  }

  if (record.answer !== answer.trim().toLowerCase()) {
    throw new DataAccessError(400, 'AUTH_CAPTCHA_INVALID', '人机验证答案不正确，请重试。')
  }
}
