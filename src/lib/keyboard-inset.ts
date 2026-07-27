/**
 * 全局软键盘避让（主要服务 iOS Safari / 不缩小布局视口的 WebView）：
 * - 监听 visualViewport，把键盘占高写入根节点 CSS 变量 --keyboard-inset，
 *   供应用壳（高度收缩）与各 fixed 弹层（bottom/padding 偏移）消费；
 * - 键盘打开时给 <html> 挂 keyboard-open 类，CSS 侧可收起底部导航预留的留白；
 * - focusin 兜底：键盘动画结束后把仍被遮挡的输入框滚到可视区中部，
 *   覆盖文档流中的评论框、回复框等没有独立避让逻辑的输入位。
 *
 * Android Chrome 108+ 由 viewport meta 的 interactive-widget=resizes-content
 * 直接缩小布局视口（此时 inset 恒为 0），本模块自动退化为 no-op。
 *
 * 例外：Fullscreen API 全屏期间（全站沉浸全屏开关）Chromium 强制键盘纯覆盖——
 * resizes-content 失效且 visualViewport 不缩小，上述两路信号全部拿不到键盘高度。
 * 改用 VirtualKeyboard API（Android Chrome 94+）：全屏时设 overlaysContent=true
 * 并监听 geometrychange 拿键盘实际高度，写入同一个 --keyboard-inset。
 *
 * 最后一道兜底：微信/QQ 内置浏览器（X5/XWeb 内核）不支持 VirtualKeyboard API，
 * 全屏下三路信号全部失效。聚焦输入框后若检测不到任何键盘高度，则自动退出全屏
 * ——退出后布局视口恢复 resize，键盘自然把输入框顶起（配合 enterImmersiveFullscreen
 * 的「焦点在输入框时不进入全屏」，避免输入过程中被 pointerup 监听拉回全屏）。
 */

const KEYBOARD_OPEN_CLASS = 'keyboard-open'
/** 小于该值视为地址栏收放等噪声，不算键盘（与 useKeyboardInset 保持一致） */
const MIN_KEYBOARD_INSET = 80
/** 等键盘弹出动画结束后再判断是否需要滚动 */
const SCROLL_FALLBACK_DELAY = 350

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

/** VirtualKeyboard API（仅 Chromium，TS DOM lib 尚未收录） */
type VirtualKeyboardLike = {
  overlaysContent: boolean
  boundingRect: DOMRect
  addEventListener: (type: 'geometrychange', listener: () => void) => void
}

export function setupKeyboardInsetWatcher() {
  if (typeof window === 'undefined') return

  const root = document.documentElement
  root.style.setProperty('--keyboard-inset', '0px')

  // 三路信号：
  // viewportInset — iOS 等键盘叠在视口上方的浏览器（visualViewport 缩小）；
  // vkInset — Fullscreen API 全屏期间由 VirtualKeyboard geometrychange 上报；
  // focusOpen — Android resizes-content 模式下 inset 恒为 0，靠聚焦事件判断
  let viewportInset = 0
  let vkInset = 0
  let focusOpen = false
  const applyInset = () => {
    const inset = Math.max(viewportInset, vkInset)
    root.style.setProperty('--keyboard-inset', `${inset}px`)
    root.classList.toggle(KEYBOARD_OPEN_CLASS, inset > 0 || focusOpen)
  }

  const viewport = window.visualViewport
  if (viewport) {
    const update = () => {
      const raw = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      viewportInset = raw < MIN_KEYBOARD_INSET ? 0 : Math.round(raw)
      applyInset()
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
  }

  const virtualKeyboard = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike })
    .virtualKeyboard
  if (virtualKeyboard) {
    // 仅全屏期间接管为 overlay 模式（非全屏仍走 resizes-content 缩视口），
    // 退出全屏时还原并清零，避免残留 inset 把布局顶在半空
    const syncOverlayMode = () => {
      virtualKeyboard.overlaysContent = Boolean(document.fullscreenElement)
      if (!document.fullscreenElement && vkInset !== 0) {
        vkInset = 0
        applyInset()
      }
    }
    syncOverlayMode()
    document.addEventListener('fullscreenchange', syncOverlayMode)
    virtualKeyboard.addEventListener('geometrychange', () => {
      vkInset = Math.max(0, Math.round(virtualKeyboard.boundingRect.height))
      applyInset()
    })
  }

  // 仅触摸设备需要聚焦信号与滚动兜底，桌面端聚焦不应引起视图变化
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  if (!isTouch) return

  let focusOutTimer = 0

  document.addEventListener('focusin', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (!target.matches(EDITABLE_SELECTOR)) return

    window.clearTimeout(focusOutTimer)
    focusOpen = true
    applyInset()

    window.setTimeout(() => {
      // 键盘动画期间可能已切换焦点或收起键盘
      if (document.activeElement !== target) return

      const scrollIntoViewIfCovered = () => {
        if (document.activeElement !== target) return
        // 全屏 overlay 模式下 visualViewport 不缩小，真实可见高要再扣掉 vkInset
        const visibleHeight = (window.visualViewport?.height ?? window.innerHeight) - vkInset
        const rect = target.getBoundingClientRect()
        // 输入框底部已在键盘上方可见时不动，避免无意义的滚动跳动
        if (rect.bottom <= visibleHeight - 8 && rect.top >= 0) return
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }

      // 微信/QQ 等不支持 VirtualKeyboard API 的内核：全屏下键盘弹出后仍拿不到
      // 任何键盘高度，唯一可行的兜底是退出全屏，让布局视口恢复 resize 把输入框顶起；
      // 限定 coarse pointer（手机/平板），避免触屏笔记本全屏点输入框被误退
      if (
        document.fullscreenElement &&
        viewportInset === 0 &&
        vkInset === 0 &&
        window.matchMedia('(pointer: coarse)').matches
      ) {
        document.exitFullscreen?.().catch(() => {})
        // 退出全屏触发视口重排，稍等稳定后再做一次滚动兜底
        window.setTimeout(scrollIntoViewIfCovered, SCROLL_FALLBACK_DELAY)
        return
      }

      scrollIntoViewIfCovered()
    }, SCROLL_FALLBACK_DELAY)
  })

  document.addEventListener('focusout', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement) || !target.matches(EDITABLE_SELECTOR)) return
    // 延迟移除：在两个输入框间切换焦点时避免布局闪烁
    window.clearTimeout(focusOutTimer)
    focusOutTimer = window.setTimeout(() => {
      focusOpen = false
      applyInset()
    }, 120)
  })
}
