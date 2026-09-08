import { afterEach, expect, it, vi } from 'vitest'
import { getWindowsDownload, parseWindowsDownload } from '../../src/lib/windows-download'

const manifest = (url = 'https://chevoink.chevolink.com/download/windows/1.0.0/Chevoink_1.0.0_x64-setup.exe') => ({ version: '1.0.0', platforms: { 'windows-x86_64': { url, signature: 'test-signature' } } })
afterEach(() => vi.unstubAllGlobals())

it('selects the exact Windows stable artifact, independently of Android latest', () => {
  expect(parseWindowsDownload(manifest()).version).toBe('1.0.0')
  expect(parseWindowsDownload(manifest('https://github.com/Xcy8010/chevoink/releases/download/windows-v1.0.0/Chevoink_1.0.0_x64-setup.exe')).url).toContain('windows-v1.0.0')
})
it.each([
  'http://chevoink.chevolink.com/download/windows/1.0.0/Chevoink_1.0.0_x64-setup.exe',
  'https://chevoink.chevolink.com.evil.test/download/windows/1.0.0/Chevoink_1.0.0_x64-setup.exe',
  'https://github.com/Xcy8010/chevoink/releases/latest/download/chevoink.apk',
  'https://github.com/other/repo/releases/download/windows-v1.0.0/Chevoink_1.0.0_x64-setup.exe',
  'https://chevoink.chevolink.com/download/windows/2.0.0/Chevoink_2.0.0_x64-setup.exe',
  'https://chevoink.chevolink.com/download/windows/1.0.0/Chevoink_1.0.0_x64-setup.exe?token=private',
  'https://user@chevoink.chevolink.com/download/windows/1.0.0/Chevoink_1.0.0_x64-setup.exe',
])('rejects untrusted or mismatched asset %s', (url) => expect(() => parseWindowsDownload(manifest(url))).toThrow())
it.each([null, {}, { version: '1.0.0-beta', platforms: manifest().platforms }, { version: '1.0.0', platforms: { 'windows-aarch64': {} } }])('does not treat invalid/unavailable builds as stable', (value) => expect(() => parseWindowsDownload(value)).toThrow())
it('does not retry failed requests or carry cookies to the download service', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  await expect(getWindowsDownload()).rejects.toThrow('暂不可下载')
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/download/windows/stable/latest.json', expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }))
})
