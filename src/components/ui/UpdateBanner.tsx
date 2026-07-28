import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'

import Button from '@/components/ui/Button'
import { getNativeAppVersion, isNativeApp } from '@/lib/native-app'
import { cn } from '@/lib/utils'

type VersionManifest = {
  latestVersionName?: string
  url?: string
  notes?: string
  mandatory?: boolean
}

// 比较形如 1.0.0 的版本号：a>b 返回正数，a<b 返回负数，相等返回 0
function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

const DISMISS_KEY_PREFIX = 'chevoink:update-dismissed:'

/**
 * APP 内轻量更新提示条幅：仅在原生壳（Capacitor WebView）内生效。
 * 启动时拉取 /download/version.json，与 UA 中的当前壳版本（ChevoinkApp/x.y.z）比对，
 * 发现更高版本则在顶部弹出条幅，点击跳浏览器下载新 APK（安卓不允许非商店 App 静默自升级）。
 * 普通浏览器下 isNativeApp() 恒为 false，整段逻辑为空操作，网页版零影响。
 */
export default function UpdateBanner() {
  const [manifest, setManifest] = useState<VersionManifest | null>(null)

  useEffect(() => {
    if (!isNativeApp()) return
    const installed = getNativeAppVersion()
    if (!installed) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/download/version.json', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as VersionManifest
        if (cancelled || !data.latestVersionName || !data.url) return
        if (compareVersion(data.latestVersionName, installed) <= 0) return
        if (localStorage.getItem(DISMISS_KEY_PREFIX + data.latestVersionName)) return
        setManifest(data)
      } catch {
        // 弱网/离线静默忽略，下次打开再试
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (!manifest) return null

  const dismiss = () => {
    if (manifest.latestVersionName) {
      try {
        localStorage.setItem(DISMISS_KEY_PREFIX + manifest.latestVersionName, '1')
      } catch {
        // 忽略隐私模式等写入失败
      }
    }
    setManifest(null)
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+8px)] z-[130] flex justify-center px-3">
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-elevated)]',
          'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)]',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <Download className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">发现新版本 {manifest.latestVersionName}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {manifest.notes?.trim() || '点击更新以获取最新功能与修复'}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="shrink-0"
          onClick={() => {
            window.open(manifest.url, '_blank')
          }}
        >
          更新
        </Button>
        {!manifest.mandatory ? (
          <button
            type="button"
            aria-label="忽略此版本"
            className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
