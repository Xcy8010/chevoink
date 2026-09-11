import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react'

/** Reserve only a scrollable tail, never an opaque footer behind the floating controls. */
export function useComposerInset(
  scrollRef: RefObject<HTMLDivElement>,
  pinned: MutableRefObject<boolean>,
  lastScrollTop: MutableRefObject<number>,
  collapsed: boolean,
) {
  const footerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const footer = footerRef.current, scroll = scrollRef.current
    if (!footer || !scroll || collapsed) return
    const measure = () => {
      const height = Math.ceil(footer.getBoundingClientRect().height)
      scroll.style.setProperty('--agent-footer-height', `${height}px`)
      if (pinned.current) {
        scroll.scrollTop = scroll.scrollHeight
        lastScrollTop.current = scroll.scrollTop
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [scrollRef, pinned, lastScrollTop, collapsed])
  return footerRef
}
