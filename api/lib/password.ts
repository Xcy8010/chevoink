import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const PASSWORD_PREFIX = 'scrypt'
const LEGACY_PREFIX = 'local'
const UNSET_PREFIX = 'unset'

function toBuffer(value: string): Buffer {
  return Buffer.from(value, 'hex')
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${PASSWORD_PREFIX}:${salt}:${hash}`
}

export function createUnsetPasswordHash(): string {
  return `${UNSET_PREFIX}:${randomBytes(16).toString('hex')}`
}

export function hasConfiguredPassword(passwordHash: string | null | undefined): boolean {
  if (!passwordHash) {
    return false
  }

  return !passwordHash.startsWith(`${UNSET_PREFIX}:`)
}

/** 存量明文哈希（local: 前缀）：登录验证通过后应立即升级为 scrypt 重写入库 */
export function isLegacyPasswordHash(passwordHash: string | null | undefined): boolean {
  return typeof passwordHash === 'string' && passwordHash.startsWith(`${LEGACY_PREFIX}:`)
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  if (passwordHash.startsWith(`${UNSET_PREFIX}:`)) {
    return false
  }

  if (passwordHash.startsWith(`${LEGACY_PREFIX}:`)) {
    return passwordHash === `${LEGACY_PREFIX}:${password}`
  }

  if (!passwordHash.startsWith(`${PASSWORD_PREFIX}:`)) {
    return false
  }

  const [, salt, expectedHash] = passwordHash.split(':')
  if (!salt || !expectedHash) {
    return false
  }

  const calculatedHash = scryptSync(password, salt, 64).toString('hex')
  return timingSafeEqual(toBuffer(expectedHash), toBuffer(calculatedHash))
}
