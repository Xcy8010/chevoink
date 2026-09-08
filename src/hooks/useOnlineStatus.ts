import { useEffect, useState } from 'react'
import { isWindowsDesktopApp } from '@/lib/desktop-app'

/** 订阅浏览器在线状态（断网兜底 UI 用）：初始取 navigator.onLine，后续随 online/offline 事件刷新 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => isWindowsDesktopApp() || typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    let controller: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    const cancelProbe = () => { const previous = controller; controller = undefined; previous?.abort(); clearTimeout(timer) }
    const handleOnline = () => { cancelProbe(); setOnline(true) }
    const handleOffline = () => {
      if (!isWindowsDesktopApp()) { setOnline(false); return }
      // Windows NCSI can report offline with working HTTPS (VPN/proxy/first boot).
      // Verify once per offline signal, without polling or authenticated requests.
      cancelProbe()
      const probe = new AbortController()
      controller = probe
      timer = setTimeout(() => probe.abort(), 5000)
      void fetch('/api/health', { cache: 'no-store', credentials: 'omit', signal: probe.signal })
        .then(() => { if (!disposed && controller === probe) setOnline(true) })
        .catch(() => { if (!disposed && controller === probe) setOnline(false) })
        .finally(() => { if (controller === probe) clearTimeout(timer) })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!navigator.onLine) handleOffline()
    return () => {
      disposed = true
      cancelProbe()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
