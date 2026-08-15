import { describe, expect, it } from 'vitest'

import { maskPhoneNumber, normalizePhoneNumber } from '../../api/lib/phone.js'

describe('normalizePhoneNumber', () => {
  // 注意：11 位大陆号会被首个通用 E.164 正则（^\+?[1-9]\d{7,14}$）命中，返回 +13800138000
  // 而非 +8613800138000。这是存量线上行为（注册/登录两侧一致即自洽，存量手机号数据
  // 均按此格式落库），修复会撕裂老账号匹配，故此处锁定现状。
  it('11 位号码按通用 E.164 格式补 +（存量行为锁定）', () => {
    expect(normalizePhoneNumber('13800138000')).toBe('+13800138000')
    expect(normalizePhoneNumber('138-0013-8000')).toBe('+13800138000')
    expect(normalizePhoneNumber(' 13800138000 ')).toBe('+13800138000')
  })

  it('86 开头的 13 位号码按通用格式补 +', () => {
    expect(normalizePhoneNumber('8613800138000')).toBe('+8613800138000')
  })

  it('带 + 前缀的国际号码原样保留', () => {
    expect(normalizePhoneNumber('+12125550123')).toBe('+12125550123')
    expect(normalizePhoneNumber('+8613800138000')).toBe('+8613800138000')
  })

  it('非法输入抛 400 VALIDATION_ERROR', () => {
    expect(() => normalizePhoneNumber('')).toThrowError(/请输入手机号/)
    expect(() => normalizePhoneNumber('abc123')).toThrowError(/手机号格式不正确/)
    expect(() => normalizePhoneNumber('123')).toThrowError(/手机号格式不正确/)
  })
})

describe('maskPhoneNumber', () => {
  it('大陆号码中四位打码', () => {
    expect(maskPhoneNumber('+8613800138000')).toBe('138****8000')
  })

  it('过短号码原样返回', () => {
    expect(maskPhoneNumber('+86123')).toBe('+86123')
  })
})
