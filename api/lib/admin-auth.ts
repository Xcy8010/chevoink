import type { Request } from 'express'

import { getSessionUserId } from './auth-session.js'
import { prisma, DataAccessError } from './prisma.js'

export type AdminIdentity = {
  id: string
  nickname: string
  email: string | null
  /** 超级管理：唯一，可设置用户身份 */
  isSuperAdmin: boolean
}

/**
 * 管理接口统一守卫：会话有效 + role=admin + 未封禁。
 * 所有 /api/admin 下的受保护接口必须经它取身份，不依赖前端任何判断。
 */
export async function requireAdmin(req: Request): Promise<AdminIdentity> {
  const userId = getSessionUserId(req)
  if (!userId) {
    throw new DataAccessError(401, 'AUTH_REQUIRED', '请先登录管理后台。')
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nickname: true, email: true, role: true, bannedAt: true, isSuperAdmin: true },
  })
  if (!user || user.bannedAt !== null) {
    throw new DataAccessError(401, 'AUTH_REQUIRED', '请先登录管理后台。')
  }
  if (user.role !== 'admin') {
    throw new DataAccessError(403, 'ADMIN_REQUIRED', '需要管理员权限。')
  }

  return { id: user.id, nickname: user.nickname, email: user.email, isSuperAdmin: user.isSuperAdmin }
}

/** 取请求来源 IP（nginx 已透传 X-Forwarded-For），用于登录限速与审计 */
export function getRequestIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()
  return first || req.socket.remoteAddress || null
}

/* ---------------- 管理登录限速：同 IP+邮箱 5 次失败锁 15 分钟 ---------------- */

const LOGIN_MAX_FAILURES = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000
const loginAttempts = new Map<string, { failures: number; lockedUntil: number }>()

export function assertAdminLoginAllowed(key: string): void {
  const record = loginAttempts.get(key)
  if (record && record.lockedUntil > Date.now()) {
    const minutes = Math.ceil((record.lockedUntil - Date.now()) / 60_000)
    throw new DataAccessError(429, 'ADMIN_LOGIN_LOCKED', `尝试次数过多，请 ${minutes} 分钟后再试。`)
  }
}

export function recordAdminLoginFailure(key: string): void {
  const record = loginAttempts.get(key) ?? { failures: 0, lockedUntil: 0 }
  record.failures += 1
  if (record.failures >= LOGIN_MAX_FAILURES) {
    record.lockedUntil = Date.now() + LOGIN_LOCK_MS
    record.failures = 0
  }
  loginAttempts.set(key, record)
}

export function clearAdminLoginFailures(key: string): void {
  loginAttempts.delete(key)
}
