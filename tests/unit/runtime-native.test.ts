import sharp from 'sharp'
import { EdgeTTS } from 'node-edge-tts'
import { describe, expect, it } from 'vitest'

describe('candidate runtime module compatibility', () => {
  it('encodes and decodes a real WebP using the native image library', async () => {
    const encoded = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#4488cc' } }).webp().toBuffer()
    const metadata = await sharp(encoded).metadata()
    expect(metadata).toMatchObject({ format: 'webp', width: 8, height: 6 })
  })
  it('loads and configures the current server speech adapter without connecting', () => {
    const speech = new EdgeTTS({ voice: 'zh-CN-XiaoxiaoNeural', lang: 'zh-CN', timeout: 1000 })
    expect(typeof speech.ttsPromise).toBe('function')
    // This is an import/constructor smoke check, not a network/audio quality test.
  })
})
