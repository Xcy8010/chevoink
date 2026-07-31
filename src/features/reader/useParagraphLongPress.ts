import { useCallback, useEffect, useRef } from 'react'

/**
 * 长按选段手势（方案 20 §2.6）：500ms 静止即选中段落，与翻页手势互斥。
 *
 * 由翻页视图在自己的 touch 处理里调用 `start/move/end`：
 * - `start` 记录起点并起定时器，命中 `[data-tts-p]` 的段落节点才生效；
 * - `move` 位移超过 10px 视为翻页意图，取消长按；
 * - 长按已触发时 `firedRef.current` 为 true，调用方据此吞掉本次轻点/翻页。
 */

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10

type UseParagraphLongPressArgs = {
  enabled: boolean
  onLongPress: (paragraphIndex: number, anchor: DOMRect) => void
}

export function useParagraphLongPress({ enabled, onLongPress }: UseParagraphLongPressArgs) {
  const timerRef = useRef<number | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)
  const handlerRef = useRef(onLongPress)
  handlerRef.current = onLongPress

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const start = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      firedRef.current = false
      clearTimer()
      if (!enabled) return

      const element = target instanceof Element ? target.closest<HTMLElement>('[data-tts-p]') : null
      if (!element) return

      const paragraphIndex = Number(element.dataset.ttsP)
      if (!Number.isInteger(paragraphIndex)) return

      originRef.current = { x: clientX, y: clientY }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        firedRef.current = true
        navigator.vibrate?.(12)
        handlerRef.current(paragraphIndex, element.getBoundingClientRect())
      }, LONG_PRESS_MS)
    },
    [enabled, clearTimer],
  )

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const origin = originRef.current
      if (!origin || timerRef.current === null) return
      if (Math.abs(clientX - origin.x) > MOVE_TOLERANCE || Math.abs(clientY - origin.y) > MOVE_TOLERANCE) {
        clearTimer()
      }
    },
    [clearTimer],
  )

  const end = useCallback(() => {
    clearTimer()
    originRef.current = null
  }, [clearTimer])

  return { start, move, end, firedRef }
}
