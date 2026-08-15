import { describe, expect, it } from 'vitest'

import {
  createUnsetPasswordHash,
  hasConfiguredPassword,
  hashPassword,
  isLegacyPasswordHash,
  verifyPassword,
} from '../../api/lib/password.js'

describe('password hash', () => {
  it('hashPassword → verifyPassword 正往返', () => {
    const hash = hashPassword('S3cure-pass!中文')
    expect(hash.startsWith('scrypt:')).toBe(true)
    expect(verifyPassword('S3cure-pass!中文', hash)).toBe(true)
  })

  it('错误密码验证失败', () => {
    const hash = hashPassword('right-password')
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('相同密码两次哈希盐不同（哈希不可复用）', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('unset 哈希：不可验证、不计为已配置', () => {
    const unset = createUnsetPasswordHash()
    expect(verifyPassword('anything', unset)).toBe(false)
    expect(hasConfiguredPassword(unset)).toBe(false)
    expect(hasConfiguredPassword(null)).toBe(false)
    expect(hasConfiguredPassword(hashPassword('x'))).toBe(true)
  })

  it('legacy 明文哈希：可验证且被识别为待升级', () => {
    const legacy = 'local:plain-password'
    expect(verifyPassword('plain-password', legacy)).toBe(true)
    expect(verifyPassword('other', legacy)).toBe(false)
    expect(isLegacyPasswordHash(legacy)).toBe(true)
    expect(isLegacyPasswordHash(hashPassword('x'))).toBe(false)
    expect(isLegacyPasswordHash(null)).toBe(false)
  })

  it('未知前缀哈希一律拒绝', () => {
    expect(verifyPassword('x', 'unknown:whatever')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
  })
})
