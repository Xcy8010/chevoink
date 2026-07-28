// 统一复制到剪贴板工具，兼容 APP 壳（Capacitor WebView）与各类浏览器。
//
// 背景：作品/帖子分享等直接调用 navigator.clipboard.writeText 在 Android WebView 内
// 常因权限/焦点策略被拒（抛异常或该 API 不存在），导致「复制失败」。此处提供带降级的实现：
// 优先用异步 Clipboard API，失败或缺失时回退到临时 textarea + execCommand('copy')，
// 后者在 WebView 与旧浏览器里成功率更高。

/**
 * 将文本复制到系统剪贴板。成功返回 true，全部方案失败返回 false（调用方据此提示用户）。
 * 需在用户手势（点击等）回调中调用，以满足浏览器/WebView 的剪贴板写入策略。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 首选：异步 Clipboard API（需安全上下文 + 用户手势）
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到下面的 execCommand 兜底
  }

  // 兜底：临时 textarea + execCommand('copy')，兼容 WebView / 旧内核
  if (typeof document === 'undefined') return false
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    // 保持在文档流内且可聚焦，但视觉上不可见，避免页面跳动
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.padding = '0'
    textarea.style.border = 'none'
    textarea.style.outline = 'none'
    textarea.style.boxShadow = 'none'
    textarea.style.background = 'transparent'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)

    const selection = document.getSelection()
    const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)

    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)

    // 还原用户原本的选区
    if (savedRange && selection) {
      selection.removeAllRanges()
      selection.addRange(savedRange)
    }
    return ok
  } catch {
    return false
  }
}
