import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** 最大高度比例，默认 85dvh */
  maxHeight?: string
  /** 是否显示关闭按钮 */
  showClose?: boolean
}

/**
 * 手机端全屏底部抽屉。
 * - 从底部滑入，顶部带拖拽指示条
 * - 点击遮罩或按 Escape 关闭
 * - 平板/电脑端自动降级为居中模态
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '85dvh',
  showClose = true,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ startY: number; currentY: number } | null>(null)

  useEffect(() => {
    if (!open) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const handleDragStart = (clientY: number) => {
    dragStateRef.current = { startY: clientY, currentY: clientY }
  }

  const handleDragMove = (clientY: number) => {
    const state = dragStateRef.current
    if (!state || !sheetRef.current) return
    state.currentY = clientY
    const delta = Math.max(0, clientY - state.startY)
    sheetRef.current.style.transform = `translateY(${delta}px)`
  }

  const handleDragEnd = () => {
    const state = dragStateRef.current
    if (!state || !sheetRef.current) return
    const delta = state.currentY - state.startY
    sheetRef.current.style.transform = ''
    dragStateRef.current = null
    if (delta > 96) onClose()
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={title}>
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 animate-fade-in"
      />

      {/* 手机端：底部抽屉；平板/电脑端：居中模态 */}
      <div
        ref={sheetRef}
        className={cn(
          'animate-sheet-slide-up absolute inset-x-0 bottom-0 flex flex-col overflow-hidden',
          'rounded-t-[var(--radius-xl)] border border-b-0 border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[var(--shadow-modal)]',
          'md:animate-fade-in-up md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(560px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2',
          'md:rounded-[var(--radius-xl)] md:border-b',
        )}
        style={{ maxHeight }}
      >
        {/* 拖拽指示条（仅手机端显示） */}
        <div
          className="flex cursor-grab items-center justify-center pb-1 pt-3 md:hidden touch-none"
          onTouchStart={(event) => handleDragStart(event.touches[0].clientY)}
          onTouchMove={(event) => handleDragMove(event.touches[0].clientY)}
          onTouchEnd={handleDragEnd}
        >
          <span className="h-1 w-9 rounded-full bg-[var(--border-strong)]" />
        </div>

        {title || showClose ? (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3 md:px-5">
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {showClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="touch-target inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}
