import { useCallback, useEffect, useRef, type MutableRefObject, type RefCallback } from 'react'

/**
 * 流式正文的“贴底才跟随”：用户上滑阅读时暂停，主动回到底部后自动恢复。
 * 与思考信道使用同一阈值语义，但允许富文本编辑器在下一帧完成 DOM 替换后再滚动。
 */
export function useStreamingAutoFollow<T extends HTMLElement>(
  active: boolean,
  content: string | undefined,
): { ref: RefCallback<T>; nodeRef: MutableRefObject<T | null>; onScroll: () => void } {
  const ref = useRef<T | null>(null)
  const followRef = useRef(true)
  const wasActiveRef = useRef(false)

  useEffect(() => {
    if (active && !wasActiveRef.current) followRef.current = true
    wasActiveRef.current = active
    if (!active || !followRef.current) return
    const frame = window.requestAnimationFrame(() => {
      const node = ref.current
      if (node && followRef.current) node.scrollTop = node.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active, content])

  const onScroll = useCallback(() => {
    const node = ref.current
    if (!node) return
    followRef.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 12
  }, [])

  const setRef = useCallback((node: T | null) => {
    ref.current = node
  }, [])

  return { ref: setRef, nodeRef: ref, onScroll }
}
