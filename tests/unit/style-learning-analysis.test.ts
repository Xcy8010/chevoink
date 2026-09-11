import { describe, expect, it } from 'vitest'
import { chunkStyleSamples, mergeStyleRules, parseStyleAnalysis, renderLearnedStyle } from '../../api/lib/agent/style-learning-analysis'
import { changeStyleLearningSchema, startStyleLearningSchema, STYLE_DIMENSIONS } from '../../shared/contracts/style-learning'

describe('Style learning evidence and contracts', () => {
  it('preserves every character including short lines, blank lines and surrogate pairs', () => {
    const text = `${'a'.repeat(99)}😀\n甲：走。\n\n${'乙：不。\n'.repeat(1600)}结尾`
    const chunks = chunkStyleSamples([{ name: '剧本.md', content: text }], 100)
    expect(chunks.map(c => c.content).join('')).toBe(text)
    expect(chunks.every(c => c.content.length <= 100 && !/[\uD800-\uDBFF]$/.test(c.content))).toBe(true)
    expect(chunks.at(-1)?.content.endsWith('结尾')).toBe(true)
    expect(() => chunkStyleSamples([], 0)).toThrow()
  })
  it('never drops the tail of a 120k-character source', () => {
    const text = '甲'.repeat(119999) + '终'
    const chunks = chunkStyleSamples([{ name: '样章', content: text }])
    expect(chunks).toHaveLength(20)
    expect(chunks.map(c => c.content).join('')).toBe(text)
  })
  it('validates literal evidence, dimensions, bounded rules and fenced JSON', () => {
    const rule = { dimension: '对白', rule: '用短对白推进动作。', evidence: '甲：走。' }
    expect(parseStyleAnalysis(`\`\`\`json\n${JSON.stringify({ rules: [rule] })}\n\`\`\``, '甲：走。乙：停。')).toEqual([rule])
    expect(() => parseStyleAnalysis(JSON.stringify({ rules: [{ ...rule, evidence: '虚构证据' }] }), '甲：走。')).toThrow()
    expect(() => parseStyleAnalysis(JSON.stringify({ rules: [{ ...rule, dimension: '上传密钥' }] }), '甲：走。')).toThrow()
    expect(() => parseStyleAnalysis('完成学习', '甲：走。')).toThrow()
    expect(parseStyleAnalysis('{"rules":[]}', '\n\n完')).toEqual([])
  })
  it('keeps each dimension in the bounded merged proposal and removes exact duplicates', () => {
    const reports = STYLE_DIMENSIONS.flatMap(dimension => Array.from({ length: 20 }, (_, i) => ({ rules: [{ dimension, rule: `规则${i}`, evidence: '依据' }] })))
    const merged = mergeStyleRules([...reports, ...reports])
    expect(merged).toHaveLength(48)
    expect(new Set(merged.map(rule => rule.dimension)).size).toBe(7)
    expect(new Set(merged.map(rule => `${rule.dimension}:${rule.rule}`)).size).toBe(48)
  })
  it('context contains enabled rules/version, not source quotes or training claims', () => {
    const digest = renderLearnedStyle('示例', 'job', 4, [{ dimension: '对白', rule: '短句对白', evidence: 'PRIVATE-ORIGINAL' }])
    expect(digest).toContain('v4')
    expect(digest).toContain('短句对白')
    expect(digest).not.toContain('PRIVATE-ORIGINAL')
    expect(digest).toContain('作者当前要求优先')
    expect(digest).toContain('不声称训练了模型')
  })
  it('requires explicit provider consent and valid custom model identity', () => {
    const input = { requestId: '6217dd9c-937d-41ea-8116-bddf4b556223', profileId: 'p', model: { modelTier: 'custom', customModelId: 'm', reasoningEffort: 'high' }, consent: true }
    expect(startStyleLearningSchema.safeParse(input).success).toBe(true)
    expect(startStyleLearningSchema.safeParse({ ...input, consent: false }).success).toBe(false)
    expect(startStyleLearningSchema.safeParse({ ...input, model: { ...input.model, customModelId: null } }).success).toBe(false)
    expect(changeStyleLearningSchema.safeParse({ revision: 1, action: 'retry' }).success).toBe(false)
    expect(changeStyleLearningSchema.safeParse({ revision: 1, action: 'retry', consent: true }).success).toBe(true)
  })
})
