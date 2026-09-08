export const WINDOWS_MANIFEST_URL = '/download/windows/stable/latest.json'
export const WINDOWS_RELEASES_URL = 'https://github.com/Xcy8010/chevoink/releases'

export type WindowsDownload = { version: string; url: string; signature: string }

export function parseWindowsDownload(value: unknown): WindowsDownload {
  if (!value || typeof value !== 'object') throw new Error('Windows 下载信息不可用')
  const manifest = value as Record<string, unknown>
  const version = manifest.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Windows 稳定版本信息无效')
  }
  const platforms = manifest.platforms as Record<string, unknown> | undefined
  const asset = platforms?.['windows-x86_64'] as Record<string, unknown> | undefined
  if (!asset || typeof asset.url !== 'string' || typeof asset.signature !== 'string' || !asset.signature.trim()) {
    throw new Error('Windows x64 安装包尚未就绪')
  }
  const url = new URL(asset.url)
  const name = `Chevoink_${version}_x64-setup.exe`
  const allowed = (url.origin === 'https://chevoink.chevolink.com' && url.pathname === `/download/windows/${version}/${name}`)
    || (url.origin === 'https://github.com' && url.pathname === `/Xcy8010/chevoink/releases/download/windows-v${version}/${name}`)
  if (!allowed || url.username || url.password || url.search || url.hash) throw new Error('Windows 下载地址未通过校验')
  return { version, url: url.href, signature: asset.signature }
}

/** No retry loop or global GitHub latest: failure must leave the old release usable. */
export async function getWindowsDownload(signal?: AbortSignal): Promise<WindowsDownload> {
  const response = await fetch(WINDOWS_MANIFEST_URL, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    cache: 'no-store', redirect: 'error', credentials: 'omit',
  })
  if (!response.ok) throw new Error('Windows 客户端暂不可下载，请稍后重试')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Windows 下载信息无效')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 32768) throw new Error('Windows 下载信息无效')
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return parseWindowsDownload(JSON.parse(text))
}
