// 安全区兜底探测：部分安卓内置 WebView（QQ、微信等）以沉浸式全屏承载页面
// （内容延伸进状态栏/挖孔区），但其内核不上报 env(safe-area-inset-top)，CSS 读到恒为 0，
// 导致顶部固定导航被刘海/挖孔遮挡。此处探测该场景并给 --safe-top 注入状态栏高度兜底值。
// 标准浏览器（env 正常上报）与非沉浸式布局不受影响。

/** 安卓状态栏兜底高度：常见机型 24~40px CSS 像素，取偏保守的中间值 */
const ANDROID_STATUS_BAR_FALLBACK = '32px'

export function setupSafeAreaFallback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // 仅安卓需要：iOS WebKit 全系正确上报 env 安全区
  if (!/Android/i.test(navigator.userAgent)) return

  // 探针元素读取浏览器真实上报的 env 值（getComputedStyle 无法直接解析 env）
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);pointer-events:none;visibility:hidden;'
  document.documentElement.appendChild(probe)

  const apply = () => {
    // Fullscreen API 主动全屏时浏览器自行处理挖孔（letterbox），无需兜底
    if (document.fullscreenElement) {
      document.documentElement.style.removeProperty('--safe-top')
      return
    }
    const envTop = probe.getBoundingClientRect().height
    // 视口铺满整块屏幕（沉浸式）但 env 上报为 0 → 内核不支持安全区，注入兜底
    const immersive = window.innerHeight >= window.screen.height - 1
    if (envTop < 1 && immersive) {
      document.documentElement.style.setProperty('--safe-top', ANDROID_STATUS_BAR_FALLBACK)
    } else {
      document.documentElement.style.removeProperty('--safe-top')
    }
  }

  apply()
  window.addEventListener('resize', apply)
  document.addEventListener('fullscreenchange', apply)
}
