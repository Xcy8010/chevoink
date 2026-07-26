import { useRef, type TouchEvent } from 'react'

type GestureHandlers = {
  /** 左滑 → 下一章 */
  onSwipeLeft?: () => void
  /** 右滑 → 上一章 */
  onSwipeRight?: () => void
  /** 轻点正文（用于呼出/隐藏控制栏） */
  onTap?: () => void
}

const SWIPE_THRESHOLD_X = 72
const SWIPE_MAX_Y = 56
const TAP_MAX_DISTANCE = 12
const TAP_MAX_DURATION = 350

/**
 * 章节触摸手势：左右滑翻章 + 轻点呼出控制栏。
 * 返回绑定到正文滚动容器的 touch 事件处理器。
 */
export function useChapterGestures({ onSwipeLeft, onSwipeRight, onTap }: GestureHandlers) {
  const startRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    startRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  const onTouchEnd = (event: TouchEvent) => {
    const start = startRef.current
    startRef.current = null
    if (!start) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const duration = Date.now() - start.time

    if (Math.abs(deltaX) >= SWIPE_THRESHOLD_X && Math.abs(deltaY) <= SWIPE_MAX_Y) {
      if (deltaX < 0) onSwipeLeft?.()
      else onSwipeRight?.()
      return
    }

    if (
      Math.abs(deltaX) <= TAP_MAX_DISTANCE &&
      Math.abs(deltaY) <= TAP_MAX_DISTANCE &&
      duration <= TAP_MAX_DURATION
    ) {
      onTap?.()
    }
  }

  return { onTouchStart, onTouchEnd }
}
