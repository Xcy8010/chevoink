import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
vi.mock('../../api/lib/prisma.js', () => ({ DataAccessError: class extends Error {},
  prisma: { aiUsageLog: { create: mocks.create, update: mocks.update } } }))
vi.mock('../../api/lib/tool-model-config.js', () => ({ getToolModelRuntime: async () => ({
  baseUrl: 'https://vision.example/v1', apiKey: 'test-only', modelName: 'vision-fixture',
}) }))
import { describeImageWithVision } from '../../api/lib/vision-service.js'

const image = { buffer: Buffer.from('fixture'), mime: 'image/png' }
const scope = () => ({ userId: 'user', runId: 'run', signal: new AbortController().signal })
beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({ id: 'usage' })
  mocks.update.mockReset().mockResolvedValue({ id: 'usage' })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('standalone vision internal usage', () => {
  it.each([undefined, { prompt_tokens: 0, completion_tokens: 0 }, { prompt_tokens: -1, completion_tokens: 5 }])('keeps unknown and explicit zero distinct: %j', async usage => {
    const fetcher = vi.fn(async () => {
      expect(mocks.create).toHaveBeenCalledOnce()
      return new Response(JSON.stringify({ choices: [{ message: { content: '图片描述' } }], usage }))
    })
    vi.stubGlobal('fetch', fetcher)
    expect(await describeImageWithVision(image, '描述图片', scope())).toBe('图片描述')
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      providerType: 'image', agentRunId: 'run', action: 'view_image', requestTokens: null, responseTokens: null,
    }) }))
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      requestTokens: usage?.prompt_tokens === 0 ? 0 : null, responseTokens: usage?.completion_tokens ?? null,
    }) }))
    expect(fetcher.mock.calls[0]).toBeDefined()
  })
  it('preserves paid output when final usage persistence fails', async () => {
    mocks.update.mockRejectedValue(new Error('database unavailable'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '已生成的描述' } }], usage: { prompt_tokens: 12, completion_tokens: 8 },
    })))
    vi.stubGlobal('fetch', fetcher)
    try {
      expect(await describeImageWithVision(image, '描述图片', scope())).toBe('已生成的描述')
      expect(fetcher).toHaveBeenCalledOnce()
      expect(warning).toHaveBeenCalled()
    } finally { warning.mockRestore() }
  })
  it('does not dispatch when the pre-request usage record fails', async () => {
    mocks.create.mockRejectedValue(new Error('database unavailable'))
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(describeImageWithVision(image, '描述图片', scope())).rejects.toThrow('database unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('preserves reported usage on a non-success response without exposing its body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'private-provider-detail' },
      usage: { prompt_tokens: 12, completion_tokens: 0 } }), { status: 400 })))
    await expect(describeImageWithVision(image, '描述图片', scope())).rejects.not.toThrow('private-provider-detail')
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestTokens: 12, responseTokens: 0 }) }))
  })
  it('does not dispatch an already cancelled task', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(describeImageWithVision(image, '描述图片', { ...scope(), signal: controller.signal })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('retains an unknown observation after transport failure without blindly retrying', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('connection lost'))
    vi.stubGlobal('fetch', fetcher)
    await expect(describeImageWithVision(image, '描述图片', scope())).rejects.toThrow('connection lost')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestTokens: null, responseTokens: null }) }))
  })
})
