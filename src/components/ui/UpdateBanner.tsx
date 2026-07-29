import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'

import Button from '@/components/ui/Button'
import { checkAppUpdate, type VersionManifest } from '@/lib/app-update'
import { openExternalUrl } from '@/lib/native-app'
import { cn } from '@/lib/utils'

const DISMISS_KEY_PREFIX = 'chevoink:update-dismissed:'

/**
 * APP 内轻量更新提示条幅：仅在原生壳（Capacitor WebView）内生效。
 * 启动时拉取 /download/version.json，与 UA 中的当前壳版本（ChevoinkApp/x.y.z）比对，
 * 发现更高版本则在顶部弹出条幅，点击跳系统浏览器下载新 APK（安卓不允许非商店 App 静默自升级）。
 * 关闭按钮只在本次运行内生效（sessionStorage），重启 APP 后会再次提示，避免用户永久错过新版本。
 * 普通浏览器下整段逻辑为空操作，网页版零影响。
 */
export default function UpdateBanner() {
  const [manifest, setManifest] = useState<VersionManifest | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await checkAppUpdate()
        if (cancelled || result.status !== 'update') return
        if (sessionStorage.getItem(DISMISS_KEY_PREFIX + result.manifest.latestVersionName)) return
        setManifest(result.manifest)
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
        // 只记在本次运行：重启 APP 后若仍未升级会再次提醒
        sessionStorage.setItem(DISMISS_KEY_PREFIX + manifest.latestVersionName, '1')
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
            if (manifest.url) openExternalUrl(manifest.url)
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
