import { isNativeApp } from '@/lib/native-app'

export type PlatformCapabilities = {
  native: boolean
  visualViewport: boolean
  safeArea: boolean
  hardwareBack: boolean
  lifecycle: boolean
}

type NativeListener = { remove?: () => Promise<void> | void }
type AppPlugin = {
  addListener?: (event: 'backButton' | 'appStateChange', callback: (payload: { isActive?: boolean }) => void) => Promise<NativeListener> | NativeListener
}

function appPlugin(): AppPlugin | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: { Plugins?: { App?: AppPlugin } } }).Capacitor?.Plugins?.App
}

export function getPlatformCapabilities(): PlatformCapabilities {
  const native = isNativeApp()
  const app = appPlugin()
  return {
    native,
    visualViewport: typeof window !== 'undefined' && Boolean(window.visualViewport),
    safeArea: typeof CSS !== 'undefined' && CSS.supports('padding-bottom: env(safe-area-inset-bottom)'),
    hardwareBack: native && typeof app?.addListener === 'function',
    lifecycle: native && typeof app?.addListener === 'function',
  }
}

export function subscribePlatformLifecycle(handlers: { onBack: () => void; onResume: () => void }): () => void {
  const app = appPlugin()
  const listeners: NativeListener[] = []
  let disposed = false
  const add = async (event: 'backButton' | 'appStateChange', callback: (payload: { isActive?: boolean }) => void) => {
    const listener = await app?.addListener?.(event, callback)
    if (!listener) return
    if (disposed) void listener.remove?.()
    else listeners.push(listener)
  }
  void add('backButton', () => {
    // Dismiss a foreground model sheet before navigating away from the draft.
    const dialog = Array.from(document.querySelectorAll('dialog[open][data-native-back-dismiss]')).at(-1)
    if (dialog) dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    else handlers.onBack()
  })
  void add('appStateChange', (state) => { if (state.isActive) handlers.onResume() })
  const visibility = () => { if (document.visibilityState === 'visible') handlers.onResume() }
  document.addEventListener('visibilitychange', visibility)
  return () => {
    disposed = true
    document.removeEventListener('visibilitychange', visibility)
    for (const listener of listeners) void listener.remove?.()
  }
}
