import { useCallback, useEffect, useRef, useState } from 'react'

function growTextarea(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

/**
 * 移动端 textarea 自动增高：高度始终等于内容高度，由外层页面统一滚动，
 * 消除「滚动容器套 textarea 内部滚动」的嵌套滚动问题（iOS 无惯性、滚动链冲突）。
 *
 * 返回回调 ref：textarea 与审查视图（PlanChangeReview/ChapterChangeReview）是条件渲染，
 * 采纳/拒绝后 textarea 会在内容不变的情况下重新挂载，仅靠 [value] effect 不会重算高度，
 * 必须在元素挂载瞬间立即量高撑开，否则新元素停留在 rows=1 只露出正文第一行。
 */
export function useAutoGrowTextarea(value: string, enabled = true) {
  const elementRef = useRef<HTMLTextAreaElement | null>(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const ref = useCallback((element: HTMLTextAreaElement | null) => {
    elementRef.current = element
    if (element && enabledRef.current) {
      growTextarea(element)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const element = elementRef.current
    if (!element) {
      return
    }
    growTextarea(element)
  }, [value, enabled])

  return ref
}

/** 软键盘占高（px）：基于 visualViewport，键盘收起或不支持时为 0 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) {
      return
    }

    const update = () => {
      const next = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      // 小于 80px 视为地址栏收放等噪声，不算键盘
      setInset(next < 80 ? 0 : Math.round(next))
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
