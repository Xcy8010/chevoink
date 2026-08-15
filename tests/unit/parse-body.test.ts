import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { parseBody } from '../../api/lib/parse-body.js'

const schema = z.object({
  phone: z.string().min(1),
  count: z.number().int().min(1),
  note: z.string().optional(),
})

describe('parseBody', () => {
  it('合法请求体通过并返回类型化数据', () => {
    const data = parseBody(schema, { phone: '13800138000', count: 2 }, '参数不正确。')
    expect(data).toEqual({ phone: '13800138000', count: 2 })
  })

  it('缺字段时抛 400 VALIDATION_ERROR 并保留原提示文案', () => {
    try {
      parseBody(schema, { count: 2 }, '请输入手机号和密码。')
      expect.unreachable('应当抛出异常')
    } catch (error) {
      expect((error as { status: number }).status).toBe(400)
      expect((error as { code: string }).code).toBe('VALIDATION_ERROR')
      expect((error as Error).message).toBe('请输入手机号和密码。')
    }
  })

  it('类型不符（count 传字符串）同样拒绝', () => {
    expect(() => parseBody(schema, { phone: 'a', count: '2' }, '参数不正确。')).toThrowError()
  })

  it('body 为 undefined/null 按空对象处理', () => {
    expect(() => parseBody(schema, undefined, '参数不正确。')).toThrowError(/参数不正确/)
    expect(() => parseBody(schema, null, '参数不正确。')).toThrowError(/参数不正确/)
  })

  it('可选字段缺省不影响通过', () => {
    const data = parseBody(schema, { phone: 'a', count: 1 }, '参数不正确。')
    expect(data.note).toBeUndefined()
  })
})
