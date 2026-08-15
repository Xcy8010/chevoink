import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ToastContext, type ToastContextValue, type ToastTone } from './toast-context'

type ToastItem = {
  id: number
  tone: ToastTone
  message: string
}

const toneConfig: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'border-[var(--color-success)]/30 bg-[var(--color-success)] text-white',
  },
  error: {
    icon: XCircle,
    className: 'border-[var(--color-error)]/30 bg-[var(--color-error)] text-white',
  },
  info: {
    icon: Info,
    className: 'border-[var(--border-strong)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      idRef.current += 1
      const id = idRef.current
      setToasts((current) => [...current.slice(-2), { id, tone, message }])
      window.setTimeout(() => dismiss(id), 3000)
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, 'success'),
      error: (message: string) => toast(message, 'error'),
      info: (message: string) => toast(message, 'info'),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* portal 到 body 并置于全站最高层级（高于沉浸层 90 / 弹窗 120 / 灯箱 140），避免被沉浸创作区等全屏浮层盖住 */}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+12px)] z-[150] flex flex-col items-center gap-2 px-4">
          {toasts.map((item) => {
            const config = toneConfig[item.tone]
            const Icon = config.icon
            return (
              <div
                key={item.id}
                role="status"
                className={cn(
                  'animate-toast-slide-down pointer-events-auto flex max-w-[min(420px,100%)] items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-elevated)]',
                  config.className,
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="line-clamp-2">{item.message}</span>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
