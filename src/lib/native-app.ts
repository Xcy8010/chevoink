// APP 壳（Capacitor）环境识别与原生系统栏配色同步。
//
// 站点以「远程模式」被装进原生 WebView：APP 通过 capacitor.config 的
// appendUserAgent: 'ChevoinkApp' 在 UA 里打上标识，前端据此判断自己运行在 APP 壳内，
// 从而隐藏与原生冲突的网页交互（如全屏弹窗/设置）、并接管系统状态栏与导航栏配色。
//
// 普通浏览器下 isNativeApp() 恒为 false，本文件所有函数均为无副作用的空操作，
// 网页版行为零变化。

/** 当前是否运行在启创墨域 APP 壳内（Capacitor WebView）。 */
export function isNativeApp(): boolean {
  if (typeof navigator === 'undefined') return false
  return /\bChevoinkApp\b/.test(navigator.userAgent)
}

/**
 * 从 UA 解析当前 APP 壳版本号（形如 `ChevoinkApp/1.0.0`）。
 * 用于 APP 内更新提示与线上 version.json 比对；非 APP 或旧版无版本号时返回 null。
 */
export function getNativeAppVersion(): string | null {
  if (typeof navigator === 'undefined') return null
  const match = navigator.userAgent.match(/\bChevoinkApp\/(\d+(?:\.\d+)*)/)
  return match ? match[1] : null
}

/**
 * 在系统浏览器中打开链接（用于 APK 下载等必须离开壳内 WebView 的场景）。
 *
 * Capacitor 壳只会把「非同源」导航交给系统浏览器（比对 host + scheme），
 * 与站点同域的下载链接会被 WebView 当作站内导航吞掉；这里把 https 换成 http
 * 制造 scheme 差异强制外跳系统浏览器，再由 nginx 80 端口 301 回 https 完成下载。
 * 壳内外跳后当前页面不会导航，APP 停留在原处；普通浏览器下直接新开标签页。
 */
export function openExternalUrl(url: string): void {
  if (isNativeApp()) {
    window.location.href = url.replace(/^https:\/\//, 'http://')
    return
  }
  window.open(url, '_blank', 'noopener')
}

type StatusBarPlugin = {
  setBackgroundColor?: (options: { color: string }) => Promise<void>
  setStyle?: (options: { style: 'DARK' | 'LIGHT' | 'DEFAULT' }) => Promise<void>
}
type NavigationBarPlugin = {
  setNavigationBarColor?: (options: { color: string; darkButtons?: boolean }) => Promise<void>
}

/** 取原生桥注入的插件集合；浏览器或桥未就绪时返回 undefined。 */
function nativePlugins(): { StatusBar?: StatusBarPlugin; NavigationBar?: NavigationBarPlugin } | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins as
    | { StatusBar?: StatusBarPlugin; NavigationBar?: NavigationBarPlugin }
    | undefined
}

/**
 * 将原生状态栏（顶部）与导航栏（底部）染成与网页当前背景一致的颜色，使安全区跟随主题。
 * 仅在 APP 壳内生效；浏览器为空操作。
 *
 * @param backgroundColor 背景色（#RRGGBB，通常取自 CSS 变量 --app-bg）
 * @param dark 是否深色主题：深色→浅色图标；浅色→深色图标
 */
export function syncNativeSystemBars(backgroundColor: string, dark: boolean): void {
  if (!isNativeApp() || !backgroundColor) return
  const plugins = nativePlugins()
  if (!plugins) return
  const style = dark ? 'DARK' : 'LIGHT'
  plugins.StatusBar?.setBackgroundColor?.({ color: backgroundColor }).catch(() => {})
  plugins.StatusBar?.setStyle?.({ style }).catch(() => {})
  plugins.NavigationBar?.setNavigationBarColor?.({ color: backgroundColor, darkButtons: !dark }).catch(() => {})
}
