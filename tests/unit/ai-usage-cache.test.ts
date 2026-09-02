import { describe, expect, it } from 'vitest'

import { extractCacheTokens } from '../../api/lib/ai-service.js'

describe('供应商 usage 缓存命中双格式解析', () => {
  it('DeepSeek 顶层 hit/miss 字段优先，原样透传', () => {
    expect(
      extractCacheTokens({
        prompt_tokens: 1500,
        prompt_cache_hit_tokens: 1000,
        prompt_cache_miss_tokens: 500,
      }),
    ).toEqual({ hit: 1000, miss: 500 })
  })

  it('OpenAI 兼容网关用 prompt_tokens_details.cached_tokens，miss 取 prompt_tokens - hit', () => {
    expect(
      extractCacheTokens({
        prompt_tokens: 2000,
        prompt_tokens_details: { cached_tokens: 800 },
      }),
    ).toEqual({ hit: 800, miss: 1200 })
  })

  it('两种格式均未返回时保持 0/0（现状行为，不报错）', () => {
    expect(extractCacheTokens({ prompt_tokens: 1500 })).toEqual({ hit: 0, miss: 0 })
    expect(extractCacheTokens({})).toEqual({ hit: 0, miss: 0 })
  })

  it('命中为 0（显式或 cached_tokens=0）时不推断 miss', () => {
    expect(extractCacheTokens({ prompt_tokens: 1500, prompt_cache_hit_tokens: 0 })).toEqual({ hit: 0, miss: 0 })
    expect(extractCacheTokens({ prompt_tokens: 1500, prompt_tokens_details: { cached_tokens: 0 } })).toEqual({ hit: 0, miss: 0 })
  })

  it('DeepSeek 缺 miss 字段但 hit > 0 时用 prompt_tokens 推断', () => {
    expect(
      extractCacheTokens({
        prompt_tokens: 1500,
        prompt_cache_hit_tokens: 1000,
      }),
    ).toEqual({ hit: 1000, miss: 500 })
  })

  it('非数值类型的命中字段按缺失处理', () => {
    expect(
      extractCacheTokens({
        prompt_tokens: 1500,
        prompt_cache_hit_tokens: '1000' as unknown as number,
        prompt_tokens_details: { cached_tokens: '800' },
      }),
    ).toEqual({ hit: 0, miss: 0 })
  })
})
