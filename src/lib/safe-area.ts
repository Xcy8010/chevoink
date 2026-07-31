// 安全区兜底探测：部分安卓内置 WebView（QQ、微信等）以沉浸式全屏承载页面
// （内容延伸进状态栏/挖孔区），但其内核不上报 env(safe-area-inset-top)，CSS 读到恒为 0，
// 导致顶部固定导航被刘海/挖孔遮挡。此处探测该场景并给 --safe-top 注入状态栏高度兜底值。
// 标准浏览器（env 正常上报）与非沉浸式布局不受影响。
//
// APP 壳沉浸态（方案 20）：阅读区调用 StatusBar.setOverlaysWebView(true) 后 WebView
// 铺满整块屏幕，状态栏/底部手势条区域需要页面自己避让。该状态由 ReaderMobile 通过
// setNativeImmersiveSafeArea 显式声明，取值优先级：env 上报 > 原生 getInfo 高度 > 固定兜底。
// --safe-bottom 只在 APP 沉浸态注入，普通浏览器（含 QQ/微信全屏）行为与从前完全一致。

/** 安卓状态栏兜底高度：常见机型 24~40px CSS 像素，取偏保守的中间值 */
const ANDROID_STATUS_BAR_FALLBACK = '32px'
/** 安卓手势导航条兜底高度（仅 APP 沉浸态、env 不上报时使用） */
const ANDROID_NAV_BAR_FALLBACK = '24px'

let applyFn: (() => void) | null = null
let nativeImmersive = false
let nativeTopHint: number | null = null
let nativeBottomHint: number | null = null

/**
 * APP 壳阅读区进入/退出全屏沉浸时调用：声明沉浸态并立即重测安全区。
 * @param insets 原生 ImmersiveMode.enter() 上报的安全区（CSS px），没有则走固定兜底
 */
export function setNativeImmersiveSafeArea(
  active: boolean,
  insets?: { top: number; bottom: number } | null,
) {
  nativeImmersive = active
  nativeTopHint = active && insets ? insets.top : null
  nativeBottomHint = active && insets ? insets.bottom : null
  applyFn?.()
}

/** 主动触发一次安全区重测（overlay 切换不一定派发 resize 事件） */
export function refreshSafeArea() {
  applyFn?.()
}

export function setupSafeAreaFallback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // 仅安卓需要：iOS WebKit 全系正确上报 env 安全区
  if (!/Android/i.test(navigator.userAgent)) return

  // 探针元素读取浏览器真实上报的 env 值（getComputedStyle 无法直接解析 env）
  const probeTop = document.createElement('div')
  probeTop.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden;'
  const probeBottom = document.createElement('div')
  probeBottom.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;'
  document.documentElement.append(probeTop, probeBottom)

  const apply = () => {
    const rootStyle = document.documentElement.style
    // Fullscreen API 主动全屏时无需兜底
    if (document.fullscreenElement) {
      rootStyle.removeProperty('--safe-top')
      rootStyle.removeProperty('--safe-bottom')
      return
    }
    const envTop = probeTop.getBoundingClientRect().height
    if (nativeImmersive) {
      // APP 壳沉浸态：env 上报即信任 env（保持 CSS 变量走 env 原值），
      // 不上报时注入原生上报的 insets 或固定兜底
      if (envTop >= 1) {
        rootStyle.removeProperty('--safe-top')
      } else {
        rootStyle.setProperty(
          '--safe-top',
          nativeTopHint ? `${nativeTopHint}px` : ANDROID_STATUS_BAR_FALLBACK,
        )
      }
      const envBottom = probeBottom.getBoundingClientRect().height
      if (envBottom >= 1) {
        rootStyle.removeProperty('--safe-bottom')
      } else {
        rootStyle.setProperty(
          '--safe-bottom',
          nativeBottomHint ? `${nativeBottomHint}px` : ANDROID_NAV_BAR_FALLBACK,
        )
      }
      return
    }
    // 非沉浸态（APP 内其他页面与普通浏览器）：维持既有行为，--safe-bottom 从不注入
    rootStyle.removeProperty('--safe-bottom')
    // 视口铺满整块屏幕（沉浸式）但 env 上报为 0 → 内核不支持安全区，注入兜底
    const immersive = window.innerHeight >= window.screen.height - 1
    if (envTop < 1 && immersive) {
      rootStyle.setProperty('--safe-top', ANDROID_STATUS_BAR_FALLBACK)
    } else {
      rootStyle.removeProperty('--safe-top')
    }
  }

  applyFn = apply
  apply()
  window.addEventListener('resize', apply)
  document.addEventListener('fullscreenchange', apply)
}
