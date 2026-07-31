import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** auto=内容自适应（最高 86dvh）；full=固定 92dvh 全屏面板 */
  height?: 'auto' | 'full'
  title?: string
  /** 覆盖层 z-index（沉浸创作 portal 为 z-90，需要更高层级） */
  zIndexClassName?: string
  contentClassName?: string
}

const EXIT_DURATION = 180

/**
 * 移动端通用底部弹层：拖拽跟手关闭（位移>35% 或松手速度>0.5px/ms）、
 * transform/opacity 动画、safe-area 底部留白、打开时锁定 body 滚动。
 */
export default function BottomSheet({
  open,
  onClose,
  children,
  height = 'auto',
  title,
  zIndexClassName = 'z-[70]',
  contentClassName,
}: BottomSheetProps) {
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const dragStartTime = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      setClosing(false)
      setDragOffset(0)
      return
    }

    // 下一帧再进场，保证 translate-y-full -> 0 有过渡
    const raf = requestAnimationFrame(() => setEntered(true))
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  function requestClose() {
    if (closing) {
      return
    }
    setClosing(true)
    window.setTimeout(onClose, EXIT_DURATION)
  }

  function handleDragStart(event: TouchEvent<HTMLDivElement>) {
    dragStartY.current = event.touches[0]?.clientY ?? null
    dragStartTime.current = performance.now()
    dragging.current = true
  }

  function handleDragMove(event: TouchEvent<HTMLDivElement>) {
    if (!dragging.current || dragStartY.current === null) {
      return
    }
    const delta = (event.touches[0]?.clientY ?? dragStartY.current) - dragStartY.current
    // 向下位移直接跟手，向上做 0.2 阻尼防止拉飞
    setDragOffset(delta > 0 ? delta : delta * 0.2)
  }

  function handleDragEnd() {
    if (!dragging.current || dragStartY.current === null) {
      return
    }
    dragging.current = false
    dragStartY.current = null
    const sheetHeight = sheetRef.current?.offsetHeight ?? 1
    const elapsed = Math.max(1, performance.now() - dragStartTime.current)
    const velocity = dragOffset / elapsed
    if (dragOffset > sheetHeight * 0.35 || velocity > 0.5) {
      requestClose()
      return
    }
    setDragOffset(0)
  }

  if (!open) {
    return null
  }

  const hidden = !entered || closing

  return createPortal(
    <div className={cn('fixed inset-0', zIndexClassName)}>
      <div
        className={cn(
          'absolute inset-0 bg-[rgba(15,23,42,0.4)] transition-opacity duration-200',
          hidden ? 'opacity-0' : 'opacity-100',
        )}
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={sheetRef}
        className={cn(
          // 用不透明的 app-bg，避免透出底下内容（--surface-default 是 0.94 半透明）；
          // bottom 随软键盘上移，面板内输入框（如章节评论）不被键盘遮挡
          'absolute inset-x-0 bottom-[var(--keyboard-inset,0px)] flex flex-col overflow-hidden rounded-t-[20px] bg-[var(--app-bg)] shadow-[0_-16px_48px_rgba(15,23,42,0.24)] will-change-transform',
          height === 'full'
            ? 'h-[min(92dvh,calc(100dvh-var(--keyboard-inset,0px)))]'
            : 'max-h-[min(86dvh,calc(100dvh-var(--keyboard-inset,0px)))]',
          // 手指拖拽期间关掉过渡，保证跟手；松手/出入场恢复
          dragOffset !== 0 && !closing ? 'transition-none' : 'transition-transform duration-200 ease-out',
        )}
        style={{ transform: hidden ? 'translateY(100%)' : `translateY(${Math.max(0, dragOffset)}px)` }}
        role="dialog"
        aria-modal
      >
        <div
          className="shrink-0 touch-none px-4 pb-1 pt-2.5"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onTouchCancel={handleDragEnd}
        >
          <div className="mx-auto h-1 w-9 rounded-full bg-[var(--border-strong)]" />
          {title ? (
            <p className="pt-2 text-center text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          ) : null}
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(var(--safe-bottom)+12px)] [-webkit-overflow-scrolling:touch]',
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
