import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), charge: vi.fn(), access: vi.fn(), update: vi.fn(), updateMany: vi.fn(), runtime: vi.fn(), imageCharge: vi.fn(), owner: vi.fn() }))
vi.mock('../../api/lib/credits.js', () => ({ assertCreditAccess: mocks.access, consumeTokenCredits: mocks.charge, consumeCredits: mocks.imageCharge, getModelTierRuntime: mocks.runtime }))
vi.mock('../../api/lib/data-access.js', () => ({ ensureNovelOwner: mocks.owner, createCoverAssetsData: vi.fn() }))
vi.mock('../../api/lib/prisma.js', () => ({ DataAccessError: class extends Error {}, prisma: { aiUsageLog: { create: mocks.create, update: mocks.update, updateMany: mocks.updateMany } } }))
vi.mock('../../api/lib/billing/resolve-token-price.js', async original => ({ ...await original<object>(),
  resolveTokenPrice: async () => ({ version: 'credits-v1-exact', modelTier: 'speed', multiplierBps: 10000 }) }))
import { chatWithTools, generateTextCompletion, generateCoverImageData } from '../../api/lib/ai-service.js'

beforeEach(() => {
  mocks.imageCharge.mockReset()
  mocks.owner.mockReset().mockResolvedValue(undefined)
  mocks.create.mockReset().mockResolvedValue({ id: 'test-usage' })
  mocks.access.mockReset().mockResolvedValue(undefined)
  mocks.update.mockReset().mockResolvedValue({ id: 'test-usage' })
  mocks.updateMany.mockReset().mockResolvedValue({ count: 1 })
  mocks.runtime.mockReset().mockResolvedValue({ tier: 'speed', apiKey: 'fixture-not-a-key', provider: 'openai', reasoningEffort: 'high', multiplierBps: 10000, modelName: 'fixture' })
  mocks.charge.mockReset().mockResolvedValue({ chargedMilli: 0, remainingMilli: 1000, exhausted: false })
})
afterEach(() => vi.unstubAllGlobals())

async function invoke(usages: Array<Record<string, unknown>>) {
  const frames = usages.map(usage => `data: ${JSON.stringify({ usage, choices: [] })}\n\n`).join('')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(`${frames}data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)))
  return chatWithTools({ messages: [{ role: 'user', content: 'test input' }], tools: [], providerApiKey: 'fixture-not-a-key', usageLog: { userId: 'test', action: 'test' } })
}

describe('explicit zero provider usage is not missing usage', () => {
  it('returns generated output while retaining a failed settlement for recovery', async () => {
    mocks.charge.mockRejectedValueOnce(new Error('wallet unavailable'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '已保存用量的完整结果' } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }))))
    await expect(generateTextCompletion('system', 'user', { userId: 'test', action: 'test' })).resolves.toBe('已保存用量的完整结果')
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ billingStatus: 'pending_settlement' }) }))
  })
  it('requires the original price snapshot to persist before any provider dispatch', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    mocks.create.mockRejectedValueOnce(new Error('snapshot unavailable'))
    await expect(chatWithTools({ messages: [], tools: [], providerApiKey: 'fixture', usageLog: { userId: 'test', action: 'test' } })).rejects.toThrow('snapshot unavailable')
    expect(fetcher).not.toHaveBeenCalled()
    expect(mocks.charge).not.toHaveBeenCalled()
  })
  it.each([0, -1, 5, 1.5, NaN, Infinity])('rejects invalid shared-service image count %s before charging', async count => {
    await expect(generateCoverImageData('test', { prompt: '封面测试', size: '768x1024', count })).rejects.toThrow()
    expect(mocks.imageCharge).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('checks image novel ownership before any charge or provider dispatch', async () => {
    mocks.owner.mockRejectedValue(new Error('not owned'))
    await expect(generateCoverImageData('test', { prompt: '封面测试', size: '768x1024', count: 1, novelId: 'other-novel' })).rejects.toThrow('not owned')
    expect(mocks.owner).toHaveBeenCalledWith('test', 'other-novel')
    expect(mocks.imageCharge).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it.each(['empty', 'http-error', 'missing-usage'] as const)('30 CR02: non-streaming %s preserves only reported usage', async scenario => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }],
      ...(scenario === 'missing-usage' ? {} : { usage: { prompt_tokens: 12, completion_tokens: 0 } }) }), { status: scenario === 'http-error' ? 502 : 200 })))
    await expect(generateTextCompletion('system', 'user', { userId: 'test', action: 'test' })).rejects.toThrow()
    if (scenario === 'missing-usage') {
      expect(mocks.create).toHaveBeenCalledOnce()
      expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ usageSource: 'prepared' }) }))
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.charge).not.toHaveBeenCalled()
    } else {
      expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestTokens: 12, responseTokens: 0 }) }))
      expect(mocks.charge).toHaveBeenCalledOnce()
    }
  })

  it('30 CR01: non-streaming paid output also survives exact exhaustion', async () => {
    mocks.charge.mockResolvedValue({ chargedMilli: 10, remainingMilli: 0, exhausted: true })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '完整结果' } }], usage: { prompt_tokens: 12, completion_tokens: 3 } }))))
    await expect(generateTextCompletion('system', 'user', { userId: 'test', action: 'test' })).resolves.toBe('完整结果')
  })

  it.each(['bad-frame', 'provider-error', 'early-eof', 'read-error', 'abort'] as const)('30 CR02: preserves observed usage on %s without returning partial tools', async failure => {
    const controller = new AbortController()
    const first = `data: ${JSON.stringify({ usage: { prompt_tokens: 12, completion_tokens: 0, total_tokens: 12 },
      choices: [{ delta: { content: '尚未完成' } }] })}\n\n`
    const tail = failure === 'bad-frame' ? 'data: {broken\n\n' : failure === 'provider-error' ? 'data: {"error":{"message":"failed"}}\n\n' : ''
    const reader = { read: vi.fn().mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(first + tail) }), cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn() }
    if (failure === 'read-error') reader.read.mockRejectedValueOnce(new Error('connection failed'))
    else reader.read.mockResolvedValue({ done: true })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: { getReader: () => reader } })))
    await expect(chatWithTools({ messages: [{ role: 'user', content: 'test' }], tools: [], providerApiKey: 'fixture-not-a-key', signal: controller.signal,
      usageLog: { userId: 'test', action: 'test' }, onChunk: () => {
        if (failure === 'abort') { controller.abort(); throw new DOMException('stopped', 'AbortError') }
      } })).rejects.toThrow()
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestTokens: 12, responseTokens: 0 }) }))
    expect(mocks.charge).toHaveBeenCalledOnce()
    expect(reader.cancel).toHaveBeenCalledOnce()
    expect(reader.releaseLock).toHaveBeenCalledOnce()
  })

  it('30 CR02: missing output usage stays unknown rather than an estimate of partial output', async () => {
    const onUsage = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {"usage":{"prompt_tokens":12},"choices":[]}\n\ndata: {broken\n\n')))
    await expect(chatWithTools({ messages: [{ role: 'user', content: 'test' }], tools: [], providerApiKey: 'fixture-not-a-key',
      usageLog: { userId: 'test', action: 'test' }, onUsage })).rejects.toThrow()
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestTokens: 12, responseTokens: null }) }))
    expect(onUsage).toHaveBeenCalledOnce()
    expect(onUsage).toHaveBeenCalledWith({ promptTokens: 12, completionTokens: null, totalTokens: null })
  })

  it('30 CR06: a later invalid usage frame cannot replace earlier trusted usage', async () => {
    await expect(invoke([{ prompt_tokens: 12, completion_tokens: 3 }, { prompt_tokens: -1, completion_tokens: 3 }])).rejects.toThrow()
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestTokens: 12, responseTokens: 3 }) }))
    expect(mocks.charge).toHaveBeenCalledOnce()
  })

  it('30 CR01: delivers paid tool arguments at zero balance and blocks the next provider request', async () => {
    mocks.charge.mockResolvedValue({ chargedMilli: 10, remainingMilli: 0, exhausted: true })
    const args = JSON.stringify({ tasks: [{ title: '已付费的场景参数' }] })
    const frame = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'scene', type: 'function', function: { name: 'scene_task_build', arguments: args } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } }
    const fetcher = vi.fn(async () => new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`))
    vi.stubGlobal('fetch', fetcher)
    const params = { messages: [{ role: 'user' as const, content: '建立场景' }], tools: [], providerApiKey: 'fixture-not-a-key', usageLog: { userId: 'test', action: 'test' } }
    const result = await chatWithTools(params)
    expect(result.toolCalls).toContainEqual(expect.objectContaining({ id: 'scene', name: 'scene_task_build', arguments: args }))
    expect(mocks.charge).toHaveBeenCalledWith(expect.objectContaining({ usageLogId: 'test-usage', requestTokens: 20, responseTokens: 30 }))
    expect(mocks.update).toHaveBeenCalledOnce() // Observation updates the prepared record; no separate charge display write.
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('creditChargeMilli')
    mocks.access.mockRejectedValueOnce(new Error('credits unavailable'))
    await expect(chatWithTools(params)).rejects.toThrow('credits unavailable')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(mocks.charge).toHaveBeenCalledOnce()
  })

  it.each([[1, 0], [0, 1], [0, 0]])('preserves P=%i O=%i in the result, usage log and charge input', async (p, o) => {
    const result = await invoke([{ prompt_tokens: p, completion_tokens: o, total_tokens: p + o }])
    expect(result.usage).toMatchObject({ promptTokens: p, completionTokens: o, totalTokens: p + o })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestTokens: p, responseTokens: o }) }))
    expect(mocks.charge).toHaveBeenCalledWith(expect.objectContaining({ requestTokens: p, responseTokens: o }))
  })

  it('keeps earlier explicit zero when later frames omit the field', async () => {
    const result = await invoke([{ prompt_tokens: 1, completion_tokens: 0 }, { prompt_cache_hit_tokens: 0, prompt_tokens: 1 }])
    expect(result.usage).toMatchObject({ promptTokens: 1, completionTokens: 0 })
  })

  it('preserves the legacy missing-usage estimate until durable measurement provenance is connected', async () => {
    const result = await invoke([{}])
    expect(result.usage.promptTokens).toBeGreaterThan(0)
    expect(mocks.create).toHaveBeenCalledOnce()
  })
})
