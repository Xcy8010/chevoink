import { afterEach, expect, it, vi } from 'vitest'
import { checkAppUpdate } from '../../src/lib/app-update'

const native = vi.hoisted(() => ({ version: '1.0.6' }))
vi.mock('../../src/lib/native-app', () => ({ isNativeApp: () => true, getNativeAppVersion: () => native.version }))
afterEach(() => vi.unstubAllGlobals())
it.each(['1.0.5.1', '1.0.6', '1.0.7'])('discovers the brand release correctly from %s', async (installed) => {
  native.version = installed
  const manifest = { latestVersionName: '1.0.7', url: 'https://chevoink.chevolink.com/download/chevoink-v1.0.7.apk' }
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => manifest })
  vi.stubGlobal('fetch', fetch)
  const result = await checkAppUpdate()
  expect(result.status).toBe(installed === '1.0.7' ? 'latest' : 'update')
  if (result.status === 'update') expect(result.manifest.url).toBe(manifest.url)
  expect(fetch).toHaveBeenCalledWith('/download/version.json', { cache: 'no-store' })
})
