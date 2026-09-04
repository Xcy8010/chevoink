import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('uses the real Capacitor proxy with Android bridge headers without Promise assimilation deadlock', async () => {
  vi.stubGlobal('androidBridge', {})
  const status = { ready: false, sdkReady: true, downloadBytes: 240193589 }
  const nativePromise = vi.fn(async () => status)
  vi.stubGlobal('Capacitor', {
    PluginHeaders: [{ name: 'ChevoinkSpeech', methods: [{ name: 'status', rtype: 'promise' }] }],
    nativePromise,
  })
  const { getNativeSpeech } = await import('../../src/features/studio/agent/voice/native-speech')
  const native = await getNativeSpeech()
  expect(native).toBeDefined()
  expect(await native!.status()).toEqual(status)
  expect(nativePromise).toHaveBeenCalledWith('ChevoinkSpeech', 'status', undefined)
})
