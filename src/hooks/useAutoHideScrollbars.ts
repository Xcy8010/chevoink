import { useEffect } from 'react'

const SCROLLING_ATTR = 'data-scrolling'
const HIDE_DELAY = 720

/**
 * 创作区（含沉浸创作）滚动条自动隐藏：
 * 挂载期间给 body 加 autohide-scrollbars 作用域类（配合 index.css 默认隐藏滚动条），
 * 用捕获阶段的全局 scroll 监听覆盖所有滚动容器（含 BottomSheet / 沉浸创作等 portal），
 * 正在滚动的元素临时打上 data-scrolling 显示滚动条，停止滚动后延时隐藏。
 */
export function useAutoHideScrollbars(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    document.body.classList.add('autohide-scrollbars')
    const timers = new Map<Element, number>()

    const handleScroll = (event: Event) => {
      const element = event.target instanceof Element ? event.target : document.documentElement
      element.setAttribute(SCROLLING_ATTR, 'true')
      const existing = timers.get(element)
      if (existing) {
        window.clearTimeout(existing)
      }
      timers.set(
        element,
        window.setTimeout(() => {
          element.removeAttribute(SCROLLING_ATTR)
          timers.delete(element)
        }, HIDE_DELAY),
      )
    }

    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      document.body.classList.remove('autohide-scrollbars')
      timers.forEach((timer, element) => {
        window.clearTimeout(timer)
        element.removeAttribute(SCROLLING_ATTR)
      })
      timers.clear()
    }
  }, [enabled])
}
