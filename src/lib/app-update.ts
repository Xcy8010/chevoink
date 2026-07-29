// APP 壳版本更新检测：拉取线上 version.json 与 UA 中的壳版本比对。
// 供顶部更新条幅（UpdateBanner）与设置页「检测更新」共用同一套逻辑。
import { getNativeAppVersion, isNativeApp } from '@/lib/native-app'

export type VersionManifest = {
  latestVersionName?: string
  url?: string
  notes?: string
  mandatory?: boolean
}

// 比较形如 1.0.0 的版本号：a>b 返回正数，a<b 返回负数，相等返回 0
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export type UpdateCheckResult =
  /** 非 APP 壳或壳版本不可读，无更新概念 */
  | { status: 'not-app' }
  /** 已是最新版本 */
  | { status: 'latest'; installed: string }
  /** 有新版本可用 */
  | { status: 'update'; installed: string; manifest: VersionManifest }

/**
 * 检测 APP 是否有新版本。网络失败时抛错，由调用方决定提示或静默。
 */
export async function checkAppUpdate(): Promise<UpdateCheckResult> {
  if (!isNativeApp()) return { status: 'not-app' }
  const installed = getNativeAppVersion()
  if (!installed) return { status: 'not-app' }

  const res = await fetch('/download/version.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`version.json ${res.status}`)
  const manifest = (await res.json()) as VersionManifest
  if (!manifest.latestVersionName || !manifest.url || compareVersion(manifest.latestVersionName, installed) <= 0) {
    return { status: 'latest', installed }
  }
  return { status: 'update', installed, manifest }
}
