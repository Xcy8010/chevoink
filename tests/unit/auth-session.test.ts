import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSessionTokens, verifySessionToken } from '../../api/lib/auth-session.js'
import { env } from '../../api/config/env.js'

const USER_ID = 'user_test_123'
const TOKEN_VERSION = 3

function signV1(userId: string, expiresAt: number): string {
  const signature = createHmac('sha256', env.authSessionSecret).update(`${userId}.${expiresAt}`).digest('hex')
  return `${userId}.${expiresAt}.${signature}`
}

afterEach(() => {
  vi.useRealTimers()
})

describe('v2 会话令牌', () => {
  it('签发 access/refresh 均可按各自 kind 验证通过', () => {
    const tokens = buildSessionTokens(USER_ID, TOKEN_VERSION)
    const access = verifySessionToken(tokens.accessToken, 'access')
    const refresh = verifySessionToken(tokens.refreshToken, 'refresh')
    expect(access).toEqual({ userId: USER_ID, tokenVersion: TOKEN_VERSION })
    expect(refresh).toEqual({ userId: USER_ID, tokenVersion: TOKEN_VERSION })
  })

  it('v2 令牌为 6 段格式（v2.userId.expiresAt.version.kind.sig）', () => {
    const tokens = buildSessionTokens(USER_ID, TOKEN_VERSION)
    expect(tokens.accessToken.split('.')).toHaveLength(6)
    expect(tokens.accessToken.split('.')[0]).toBe('v2')
    expect(tokens.accessToken.split('.')[4]).toBe('access')
    expect(tokens.refreshToken.split('.')[4]).toBe('refresh')
  })

  it('access 与 refresh 不得混用（kind 校验）', () => {
    const tokens = buildSessionTokens(USER_ID, TOKEN_VERSION)
    expect(verifySessionToken(tokens.refreshToken, 'access')).toBeNull()
    expect(verifySessionToken(tokens.accessToken, 'refresh')).toBeNull()
  })

  it('篡改任意段（含 tokenVersion 提权/降权）验签失败', () => {
    const tokens = buildSessionTokens(USER_ID, TOKEN_VERSION)
    const segments = tokens.accessToken.split('.')
    // tokenVersion 3 → 9（模拟旧版本令牌伪造更高版本）
    segments[3] = '9'
    expect(verifySessionToken(segments.join('.'), 'access')).toBeNull()

    const tamperedUser = tokens.accessToken.replace(USER_ID, 'user_other_999')
    expect(verifySessionToken(tamperedUser, 'access')).toBeNull()
  })

  it('access（24h）过期后失效，refresh（30d）仍有效', () => {
    const tokens = buildSessionTokens(USER_ID, TOKEN_VERSION)
    vi.setSystemTime(new Date(Date.now() + 25 * 3600 * 1000))
    expect(verifySessionToken(tokens.accessToken, 'access')).toBeNull()
    expect(verifySessionToken(tokens.refreshToken, 'refresh')).not.toBeNull()
  })

  it('垃圾输入一律拒绝', () => {
    expect(verifySessionToken('', 'access')).toBeNull()
    expect(verifySessionToken(undefined, 'access')).toBeNull()
    expect(verifySessionToken('v2.only.three', 'access')).toBeNull()
    expect(verifySessionToken('a.b.c.d.e.f.g', 'access')).toBeNull()
    expect(verifySessionToken('v2.u.123.0.access.deadbeef', 'access')).toBeNull()
    expect(verifySessionToken('v2.u.notanumber.0.access.x'.padEnd(40, '.'), 'access')).toBeNull()
  })
})

describe('v1 存量令牌双读兼容', () => {
  it('合法 v1 令牌按 access 语义读取，tokenVersion 为 null', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    const token = signV1(USER_ID, expiresAt)
    expect(verifySessionToken(token, 'access')).toEqual({ userId: USER_ID, tokenVersion: null })
    // v1 无 kind 段，refresh 语义同样放行（与闸口读取顺序兼容）
    expect(verifySessionToken(token, 'refresh')).toEqual({ userId: USER_ID, tokenVersion: null })
  })

  it('过期 v1 令牌拒绝', () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 1
    expect(verifySessionToken(signV1(USER_ID, expiresAt), 'access')).toBeNull()
  })

  it('签名不匹配的 v1 令牌拒绝', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    const token = signV1(USER_ID, expiresAt)
    expect(verifySessionToken(`${USER_ID}.${expiresAt}.deadbeef`, 'access')).toBeNull()
  })
})
