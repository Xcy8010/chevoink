import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * 微信/QQ 式键盘顶起：软键盘弹起或底部栏隐藏使聊天容器变矮时，
 * 滚动位置按变矮量上移——原本贴底的内容仍贴底，浏览历史时当前可见
 * 内容不被裁出视口；容器变高（键盘收起）时不动滚动位置。
 * 供「上消息流 + 下输入栏」的聊天式布局滚动容器使用；
 * 文档流页面（输入框在页面中部）由 lib/keyboard-inset.ts 的祖先链顶起覆盖。
 *
 * ready 用于容器延迟挂载的场景（如消息区加载完成后才渲染）：
 * ready 翻真时重新绑定观察器。
 */
export function useKeyboardPushScroll(scrollRef: RefObject<HTMLElement | null>, ready = true) {
  useEffect(() => {
    if (!ready) {
      return
    }
    const node = scrollRef.current
    if (!node) {
      return
    }

    let previousHeight = node.clientHeight
    const observer = new ResizeObserver(() => {
      const nextHeight = node.clientHeight
      const shrink = previousHeight - nextHeight
      previousHeight = nextHeight
      if (shrink <= 0) {
        return
      }
      node.scrollTop += shrink
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [scrollRef, ready])
}
