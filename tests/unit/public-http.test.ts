import dns from 'node:dns'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from 'undici'
import { getPublicHttpBytes, isPublicEgressAddress, parsePublicHttpUrl, publicEgressLookup, readBoundedPublicBody } from '../../api/lib/public-http.js'

const transport = vi.hoisted(() => vi.fn())
vi.mock('undici', async original => ({ ...await original<typeof import('undici')>(), fetch: transport }))
afterEach(() => { vi.restoreAllMocks(); transport.mockReset() })

describe('public egress policy', () => {
  it.each(['127.0.0.1', '10.2.3.4', '172.16.0.1', '192.168.1.1', '169.254.169.254',
    '100.100.100.200', '0.0.0.0', '192.0.0.8', '198.19.0.1', '192.0.2.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', 'fc00::1', 'fe80::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::',
    '2001:db8::1', '3fff::1', '2001::1', 'fe80::1%eth0', 'not-an-ip'])('denies %s', address => {
    expect(isPublicEgressAddress(address)).toBe(false)
  })
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])('admits public unicast %s', address => {
    expect(isPublicEgressAddress(address)).toBe(true)
  })
  it.each(['http://example.com/a', 'file:///etc/passwd', 'https://user:pass@example.com/',
    'https://127.1/a', 'https://2130706433/a', 'https://0x7f000001/a', 'https://[::1]/a',
    'https://localhost./a', 'https://a.local/a', 'https://a.internal/a', 'https://example.com:8443/a',
    'https://intranet/a'])('rejects unsafe URL %s', url => {
    expect(() => parsePublicHttpUrl(url)).toThrow()
  })
  it('retains signed query parameters and strips fragments without decoding the path', () => {
    expect(parsePublicHttpUrl('https://example.com/a%2Fb?signature=a%2Bb#private').href).toBe('https://example.com/a%2Fb?signature=a%2Bb')
    expect(parsePublicHttpUrl('http://example.com', true).protocol).toBe('http:')
  })
  it('hands the checked DNS answers directly to the socket, with no second resolution', async () => {
    const answers = [{ address: '1.1.1.1', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }]
    const lookup = vi.spyOn(dns, 'lookup').mockImplementation(((_host: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => {
      expect(options.all).toBe(true)
      callback(null, answers)
    }) as typeof dns.lookup)
    const result = await new Promise(resolve => publicEgressLookup('example.com', { all: true }, (err, addresses) => resolve({ err, addresses })))
    expect(result).toEqual({ err: null, addresses: answers })
    expect(lookup).toHaveBeenCalledTimes(1)
    const ipv6 = await new Promise(resolve => publicEgressLookup('example.com', { family: 6 }, (err, address, family) => resolve({ err, address, family })))
    expect(ipv6).toEqual({ err: null, address: answers[1].address, family: 6 })
  })
  it.each([
    { answers: [] }, { answers: [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }] },
    { answers: [{ address: '1.1.1.1', family: 6 }] },
  ])('fails closed for empty, mixed-private or malformed DNS answers $answers', async ({ answers }) => {
    vi.spyOn(dns, 'lookup').mockImplementation(((_host: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => {
      expect(options.all).toBe(true)
      callback(null, answers)
    }) as typeof dns.lookup)
    const error = await new Promise(resolve => publicEgressLookup('example.com', {}, err => resolve(err)))
    expect(error).toMatchObject({ code: 'PUBLIC_EGRESS_DENIED' })
  })
})

describe('bounded decoded response body', () => {
  it('accepts exactly the limit without a Content-Length header', async () => {
    expect(await readBoundedPublicBody(new Response('1234'), 4)).toEqual(Buffer.from('1234'))
  })
  it.each([undefined, '1'])('cancels a body exceeding the limit (declared length %s)', async declared => {
    let pulls = 0
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(Uint8Array.of(65)) }, cancel,
    }, { highWaterMark: 0 })
    const response = new Response(stream, { headers: declared ? { 'content-length': declared } : undefined })
    await expect(readBoundedPublicBody(response, 2)).rejects.toThrow('PUBLIC_BODY_TOO_LARGE')
    expect(pulls).toBe(3)
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })
  it('cancels a declared oversized response before pulling any bytes', async () => {
    const pull = vi.fn(), cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 })
    await expect(readBoundedPublicBody(new Response(stream, { headers: { 'content-length': '9999' } }), 2)).rejects.toThrow('PUBLIC_BODY_TOO_LARGE')
    expect(pull).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('releases reader locks on an interrupted body and does not return partial bytes', async () => {
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('fixture interrupted')) } })
    await expect(readBoundedPublicBody(new Response(stream), 8)).rejects.toThrow('fixture interrupted')
    expect(stream.locked).toBe(false)
  })
  it('does not accept an empty response', async () => {
    await expect(readBoundedPublicBody(new Response(''), 8)).rejects.toThrow('PUBLIC_BODY_EMPTY')
  })
})

describe('isolated bounded GET lifecycle', () => {
  it('follows an allowed relative redirect and preserves charset and the final signed URL', async () => {
    const cancel = vi.fn()
    transport.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 302, headers: { location: '/chapter?sig=a%2Bb' } }))
    transport.mockResolvedValueOnce(new Response('1234', { headers: { 'content-type': 'text/html; charset="gbk"' } }))
    const result = await getPublicHttpBytes('https://example.com/start?old=private', { maxBytes: 4, timeoutMs: 1000, maxRedirects: 5, allowHttp: true })
    expect(result.finalUrl).toBe('https://example.com/chapter?sig=a%2Bb')
    expect(result.contentType).toBe('text/html; charset="gbk"')
    expect(cancel).toHaveBeenCalledOnce()
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[1][1].headers).not.toHaveProperty('Referer')
    expect(transport.mock.calls[1][1].headers).not.toHaveProperty('referer')
  })
  it.each(['http://127.0.0.1/', 'https://[::ffff:127.0.0.1]/', 'https://user:secret@example.com/', 'https://example.com:8443/', 'http://example.com/plain'])('does not follow a rejected redirect %s', async location => {
    const cancel = vi.fn()
    transport.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 302, headers: { location } }))
    await expect(getPublicHttpBytes('https://example.com/start', { maxBytes: 4, timeoutMs: 1000, maxRedirects: 5, allowHttp: true })).rejects.toThrow()
    expect(transport).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(transport.mock.calls[0][1].dispatcher.destroyed).toBe(true)
  })
  it('bounds redirect count and releases every redirect body', async () => {
    const cancels = Array.from({ length: 3 }, () => vi.fn())
    for (let i = 0; i < 3; i++) transport.mockResolvedValueOnce(new Response(new ReadableStream({ cancel: cancels[i] }), { status: 307, headers: { location: `/page${i}` } }))
    await expect(getPublicHttpBytes('https://example.com/start', { maxBytes: 4, timeoutMs: 1000, maxRedirects: 2 })).rejects.toThrow('PUBLIC_REDIRECT_LIMIT')
    expect(transport).toHaveBeenCalledTimes(3)
    for (const cancel of cancels) expect(cancel).toHaveBeenCalledOnce()
  })
  it('detects redirect loops without requesting the same URL again', async () => {
    transport.mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/start' } }))
    await expect(getPublicHttpBytes('https://example.com/start', { maxBytes: 4, timeoutMs: 1000, maxRedirects: 5 })).rejects.toThrow('PUBLIC_REDIRECT_LOOP')
    expect(transport).toHaveBeenCalledOnce()
  })
  it('rejects unsupported content before pulling its bytes', async () => {
    const cancel = vi.fn(), pull = vi.fn()
    transport.mockResolvedValueOnce(new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), { headers: { 'content-type': 'application/octet-stream' } }))
    await expect(getPublicHttpBytes('https://example.com/file', { maxBytes: 4, timeoutMs: 1000, acceptedContentTypes: ['text/html'] })).rejects.toThrow('PUBLIC_CONTENT_TYPE_REJECTED')
    expect(pull).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('uses a private dispatcher, disables redirects and destroys the dispatcher after success', async () => {
    transport.mockResolvedValue(new Response('1234', { headers: { 'content-type': 'image/png' } }))
    const result = await getPublicHttpBytes('https://example.com/image', { maxBytes: 4, timeoutMs: 1000 })
    expect(result).toEqual({ bytes: Buffer.from('1234'), contentType: 'image/png', finalUrl: 'https://example.com/image' })
    const init = transport.mock.calls[0][1]
    expect(init.redirect).toBe('manual')
    expect(init.dispatcher).toBeInstanceOf(Agent)
    expect(init.dispatcher.destroyed).toBe(true)
    expect(init.headers).not.toHaveProperty('authorization')
    expect(init.headers).not.toHaveProperty('cookie')
  })
  it('cancels redirect bodies without following Location', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    transport.mockResolvedValue(new Response(stream, { status: 302, headers: { location: 'http://127.0.0.1/' } }))
    await expect(getPublicHttpBytes('https://example.com/image', { maxBytes: 4, timeoutMs: 1000 })).rejects.toThrow('PUBLIC_HTTP_302')
    expect(transport).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(transport.mock.calls[0][1].dispatcher.destroyed).toBe(true)
  })
  it('propagates external cancellation and destroys the dispatcher', async () => {
    const controller = new AbortController()
    transport.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    }))
    const promise = getPublicHttpBytes('https://example.com/image', { maxBytes: 4, timeoutMs: 1000, signal: controller.signal })
    controller.abort(new Error('fixture stop'))
    await expect(promise).rejects.toThrow('fixture stop')
    expect(transport.mock.calls[0][1].dispatcher.destroyed).toBe(true)
  })
  it('bounds the full request duration', async () => {
    transport.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    }))
    await expect(getPublicHttpBytes('https://example.com/image', { maxBytes: 4, timeoutMs: 20 })).rejects.toThrow('PUBLIC_FETCH_TIMEOUT')
    expect(transport.mock.calls[0][1].dispatcher.destroyed).toBe(true)
  })
})
