import dns from 'node:dns'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { viewImageTool } from '../../api/lib/agent/tools/attachment-tools.js'
import type { ToolContext } from '../../api/lib/agent/tools/types.js'

const vision = vi.hoisted(() => vi.fn().mockResolvedValue('should not see rejected bytes'))
vi.mock('../../api/lib/vision-service.js', () => ({ describeImageWithVision: vision }))
const context = (signal = new AbortController().signal): ToolContext => ({
  userId: 'fixture', novelId: 'fixture', sessionId: 'fixture', runId: 'fixture',
  chapterId: null, callId: 'fixture', mode: 'build', creativeFreedom: 'balanced',
  qualityMode: 'premium', emit: vi.fn(), signal,
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vision.mockClear() })

describe('remote image tool egress protection', () => {
  it('does not send an already cancelled task image to vision', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn().mockResolvedValue(new Response('not an image', { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(viewImageTool.execute(context(controller.signal), { url: 'https://image.example/image.png' })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(vision).not.toHaveBeenCalled()
  })

  it('rejects a DNS name resolving to loopback before contacting vision', async () => {
    // No external traffic: the real connector must reject this mocked DNS answer.
    const lookup = vi.spyOn(dns, 'lookup').mockImplementation(((_hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => {
      expect(options.all).toBe(true)
      callback(null, [{ address: '127.0.0.1', family: 4 }])
    }) as typeof dns.lookup)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private data', { headers: { 'content-type': 'image/png' } })))
    const result = await viewImageTool.execute(context(), { url: 'https://image.example/private.png' })
    expect(result.output).toContain('失败')
    expect(lookup).toHaveBeenCalledOnce()
    expect(vision).not.toHaveBeenCalled()
  })
})
