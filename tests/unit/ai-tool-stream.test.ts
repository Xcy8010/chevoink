import { afterEach, describe, expect, it, vi } from 'vitest'
import { SseDataDecoder } from '../../api/lib/ai-sse.js'
vi.mock('../../api/lib/credits.js', () => ({ assertCreditAccess: vi.fn(), consumeTokenCredits: vi.fn(async () => ({ chargedMilli: 0 })) }))
vi.mock('../../api/lib/prisma.js', () => ({ DataAccessError: class extends Error {}, prisma: { aiUsageLog: { create: vi.fn(async () => ({ id: 'usage' })) } } }))
import { chatWithTools } from '../../api/lib/ai-service.js'

afterEach(() => vi.unstubAllGlobals())
const delta = (args: string, first = false) => ({ choices: [{ delta: { tool_calls: [{ index: 0, ...(first ? { id: 'call', function: { name: 'scene_task_build', arguments: args } } : { function: { arguments: args } }) }] } }] })
const ending = (reason: string) => ({ choices: [{ finish_reason: reason, delta: {} }] })
function stream(text: string) {
  const bytes = new TextEncoder().encode(text)
  // One byte per chunk exercises split CRLF, delimiters and multi-byte Chinese characters.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
    controller.close()
  } }))))
}
const invoke = () => chatWithTools({ messages: [], tools: [], providerApiKey: 'fake-test-key', usageLog: { userId: 'test', action: 'test' } })
describe('lossless tool argument transport', () => {
  it.each(['\n', '\r\n', '\r'])('handles %j events, interleaved comments, UTF8 and EOF without final blank line', async newline => {
    stream([`: heartbeat`, '', `data: ${JSON.stringify(delta('{"tasks":[', true))}`, '', `data: ${JSON.stringify(delta('{"goal":"审俘破线"}]}'))}`, '', `data: ${JSON.stringify(ending('tool_calls'))}`].join(newline))
    const result = await invoke()
    expect(result.toolCalls).toEqual([{ id: 'call', name: 'scene_task_build', arguments: '{"tasks":[{"goal":"审俘破线"}]}' }])
  })
  it('preserves length finish reason and marks partial calls unsafe to execute', async () => {
    stream(`data: ${JSON.stringify(delta('{"tasks":[', true))}\n\ndata: ${JSON.stringify(ending('length'))}\n\n`)
    const result = await invoke()
    expect(result.finishReason).toBe('length')
    expect(result.toolCalls[0].incomplete).toBe(true)
  })
  it('fails closed on corrupt event instead of silently dropping argument bytes', async () => {
    stream(`data: ${JSON.stringify(delta('{"tasks":[', true))}\n\ndata: {BROKEN}\n\ndata: [DONE]\n\n`)
    await expect(invoke()).rejects.toThrow('流式事件损坏')
  })
  it('does not treat an unconfirmed EOF as a completed tool call', async () => {
    stream(`data: ${JSON.stringify(delta('{}', true))}\n\n`)
    await expect(invoke()).rejects.toThrow('连接提前结束')
  })
  it('joins multi-line data and propagates callback errors', () => {
    const values: string[] = []
    const decoder = new SseDataDecoder(value => values.push(value))
    decoder.push('data: {\r\ndata: "x":1\r\ndata: }\r\n\r')
    decoder.push('\n')
    expect(JSON.parse(values[0])).toEqual({ x: 1 })
    expect(() => new SseDataDecoder(() => { throw new Error('consumer failed') }).push('data: {}\n\n')).toThrow('consumer failed')
  })
})
