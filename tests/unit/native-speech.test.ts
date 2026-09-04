import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ then: vi.fn(), status: vi.fn(), download: vi.fn(), cancel: vi.fn(), listen: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true },
  // The real Capacitor proxy synthesizes then() too: returning it from an async
  // function leaves that function pending forever. Preserve this in the regression.
  registerPlugin: () => new Proxy({}, { get: (_, name) => name === 'then' ? bridge.then : name === 'addListener' ? bridge.listen : bridge[name as keyof typeof bridge] ?? vi.fn() }),
}))

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.resetModules() })

describe('Android speech bridge', () => {
  it('resolves a non-thenable facade without invoking native then', async () => {
    const { getNativeSpeech } = await import('../../src/features/studio/agent/voice/native-speech')
    const native = await getNativeSpeech()
    expect(native).toBeDefined()
    expect('then' in native!).toBe(false)
    expect(bridge.then).not.toHaveBeenCalled()
    bridge.status.mockResolvedValue({ ready: false })
    expect(await native!.status()).toEqual({ ready: false })
  })

  it('subscribes before download and forwards byte progress', async () => {
    const { getNativeSpeech, prepareNativeSpeech } = await import('../../src/features/studio/agent/voice/native-speech')
    const native = await getNativeSpeech()
    const remove = vi.fn().mockResolvedValue(undefined)
    let emit: (event: { progress: number }) => void = () => {}
    bridge.listen.mockImplementation(async (_event, callback) => { emit = callback; return { remove } })
    bridge.download.mockImplementation(async () => { emit({ progress: 0.025 }); emit({ progress: 1 }); return { ready: true } })
    const progress = vi.fn()
    await prepareNativeSpeech(native!, progress)
    expect(progress.mock.calls.map(([value]) => value)).toEqual([0.025, 1])
    expect(remove).toHaveBeenCalledOnce()
  })

  it('bounds metadata checks without cancelling another active recording', async () => {
    vi.useFakeTimers()
    const { getNativeSpeech, nativeOperation } = await import('../../src/features/studio/agent/voice/native-speech')
    const native = await getNativeSpeech()
    const result = nativeOperation(native!, () => new Promise(() => {}), undefined, 3000, false)
    const rejection = expect(result).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(3000)
    await rejection
    expect(bridge.cancel).not.toHaveBeenCalled()
  })
})
