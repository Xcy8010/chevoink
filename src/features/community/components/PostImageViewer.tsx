import { CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import Button from '@/components/ui/Button'

type PostImageViewerProps = {
  images: string[]
  initialIndex?: number
  onClose: () => void
}

/** 松手后位移超过该值即切到相邻图，否则弹回当前图 */
const SWIPE_THRESHOLD = 56

/**
 * 帖子配图查看器：全屏预览。
 * 手机端在横向轨道上跟手左右滑切换（微信朋友圈式）；
 * 桌面端用左右按钮 / 键盘方向键切换；Esc 与点击遮罩关闭。
 */
export default function PostImageViewer({ images, initialIndex = 0, onClose }: PostImageViewerProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), images.length - 1))
  // 拖拽中的实时位移（px）；非拖拽时归零并交给 transition 完成吸附动画
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const touchRef = useRef<{ startX: number; startY: number; horizontal: boolean | null } | null>(null)
  // 刚完成过滑动时吞掉紧随其后的 click，避免误触发遮罩关闭
  const swipedRef = useRef(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft') {
        setIndex((value) => Math.max(0, value - 1))
      } else if (event.key === 'ArrowRight') {
        setIndex((value) => Math.min(images.length - 1, value + 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [images.length, onClose])

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, horizontal: null }
  }

  const handleTouchMove = (event: React.TouchEvent) => {
    const state = touchRef.current
    if (!state || event.touches.length !== 1) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - state.startX
    const deltaY = touch.clientY - state.startY
    // 首次超过 8px 时锁定手势方向，纵向手势不接管
    if (state.horizontal === null && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
      state.horizontal = Math.abs(deltaX) > Math.abs(deltaY)
    }
    if (!state.horizontal) return
    setDragging(true)
    // 首尾越界时加阻尼，提示已到边界
    const atEdge = (index === 0 && deltaX > 0) || (index === images.length - 1 && deltaX < 0)
    setDragX(atEdge ? deltaX * 0.3 : deltaX)
  }

  const handleTouchEnd = () => {
    const state = touchRef.current
    touchRef.current = null
    if (!state?.horizontal) return
    if (Math.abs(dragX) > 4) swipedRef.current = true
    if (dragX <= -SWIPE_THRESHOLD) {
      setIndex((value) => Math.min(images.length - 1, value + 1))
    } else if (dragX >= SWIPE_THRESHOLD) {
      setIndex((value) => Math.max(0, value - 1))
    }
    setDragging(false)
    setDragX(0)
  }

  const handleBackdropClick = () => {
    if (swipedRef.current) {
      swipedRef.current = false
      return
    }
    onClose()
  }

  const trackStyle: CSSProperties = {
    transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
    transition: dragging ? 'none' : 'transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)',
  }

  const navButtonClass =
    'press-feedback inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white transition-opacity hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-30'

  return createPortal(
    <div
      className="fixed inset-0 z-[140] overflow-hidden bg-[rgba(15,23,42,0.78)] backdrop-blur-[4px]"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="配图预览"
    >
      {/* 横向轨道：每张图占满一屏，跟手位移 + 松手吸附 */}
      <div
        className="flex h-full w-full touch-none"
        style={trackStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {images.map((url, imageIndex) => (
          <div
            key={`${imageIndex}-${url}`}
            className="flex h-full w-full flex-none items-center justify-center px-4 py-8"
          >
            <img
              src={url}
              alt={`配图 ${imageIndex + 1}`}
              draggable={false}
              className="max-h-[86vh] max-w-full select-none rounded-[18px] object-contain shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ))}
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
        {images.length > 1 ? (
          <span className="text-sm tabular-nums text-white/85">
            {index + 1} / {images.length}
          </span>
        ) : null}
        <Button
          onClick={onClose}
          variant="secondary"
          size="sm"
          className="h-9 w-9 border border-[var(--border-subtle)] px-0"
          aria-label="关闭配图预览"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 左右切换按钮：手机端靠滑动手势，仅桌面/平板显示 */}
      {images.length > 1 ? (
        <div
          className="absolute left-3 top-1/2 hidden -translate-y-1/2 md:block lg:left-6"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
            aria-label="上一张"
            className={navButtonClass}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      {images.length > 1 ? (
        <div
          className="absolute right-3 top-1/2 hidden -translate-y-1/2 md:block lg:right-6"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setIndex((value) => Math.min(images.length - 1, value + 1))}
            disabled={index === images.length - 1}
            aria-label="下一张"
            className={navButtonClass}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
