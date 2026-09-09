import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { normalizeToolInput } from '../../api/lib/agent/tools/input-validation.js'

describe('shared optional identifier normalization', () => {
  const tool = { parameters: z.object({ compilationId: z.string().min(1).optional(), chapterId: z.string().min(1), replacement: z.string(), query: z.string() }) }
  it.each(['', '  ', '\n'])('omits empty optional IDs (%j) without changing content or required IDs', compilationId => {
    const raw = { compilationId, chapterId: '', replacement: '', query: ' ' }
    const normalized = normalizeToolInput(tool, { arguments: raw })
    expect(normalized).toEqual({ chapterId: '', replacement: '', query: ' ' })
    expect(tool.parameters.safeParse(normalized).success).toBe(false)
    expect(raw).toHaveProperty('compilationId', compilationId)
  })
  it('preserves nonempty IDs, including invalid whitespace for schema validation', () => {
    const raw = { compilationId: ' specific ', chapterId: 'c', replacement: '', query: ' ' }
    expect(normalizeToolInput(tool, raw)).toEqual(raw)
  })
  it('runs field aliases first without erasing unrelated empty values', () => {
    expect(normalizeToolInput({ ...tool, coerceArgs: () => ({ compilationId: '', chapterId: 'c', replacement: '' }) }, {}))
      .toEqual({ chapterId: 'c', replacement: '' })
  })
})
