import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'

import { env } from '../config/env.js'
import { DataAccessError } from './prisma.js'

const SESSION_COOKIE_NAME = 'chevoink_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

function getSessionSecret(): string {
  if (!env.authSessionSecret) {
    throw new DataAccessError(500, 'AUTH_SESSION_SECRET_MISSING', '服务端登录配置缺失。')
  }

  return env.authSessionSecret
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {}
  }

  return cookieHeader
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, item) => {
      const separatorIndex = item.indexOf('=')
      if (separatorIndex <= 0) {
        return result
      }

      const name = item.slice(0, separatorIndex)
      const value = item.slice(separatorIndex + 1)
      result[name] = decodeURIComponent(value)
      return result
    }, {})
}

function serializeSessionCookie(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]

  if (env.authCookieDomain) {
    parts.push(`Domain=${env.authCookieDomain}`)
  }

  if (env.authCookieSecure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function buildSessionTokens(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = `${userId}.${expiresAt}`
  const signature = signPayload(payload)
  const token = `${payload}.${signature}`

  return {
    accessToken: token,
    refreshToken: token,
    expiresInSeconds: SESSION_TTL_SECONDS,
  }
}

export function createSession(userId: string, res: Response) {
  const tokens = buildSessionTokens(userId)
  res.append('Set-Cookie', serializeSessionCookie(tokens.accessToken, tokens.expiresInSeconds))
  return tokens
}

export function clearSession(res: Response) {
  res.append('Set-Cookie', serializeSessionCookie('', 0))
}

export function getSessionUserId(req: Request): string | null {
  const fromCookie = verifySessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME])
  if (fromCookie) {
    return fromCookie
  }

  // 安卓 WebView 的 CookieManager 懒刷盘，登录后立刻杀进程会丢会话 cookie；
  // 登录响应里的令牌与 cookie 同值，这里接受 Bearer 头作为备选方式恢复会话
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return verifySessionToken(authHeader.slice('Bearer '.length).trim())
  }

  return null
}

function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) {
    return null
  }

  const [userId, expiresAtRaw, signature] = token.split('.')
  if (!userId || !expiresAtRaw || !signature) {
    return null
  }

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return null
  }

  const expectedSignature = signPayload(`${userId}.${expiresAtRaw}`)
  if (!safeEqual(signature, expectedSignature)) {
    return null
  }

  return userId
}

export function requireSessionUserId(req: Request): string {
  const userId = getSessionUserId(req)

  if (!userId) {
    throw new DataAccessError(401, 'AUTH_REQUIRED', '请先登录后再继续。')
  }

  return userId
}
