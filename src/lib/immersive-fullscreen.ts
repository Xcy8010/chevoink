/**
 * 全站沉浸全屏的进入逻辑（AppShell 的 pointerup 监听与首次进入选择弹窗共用）。
 *
 * 部分安卓浏览器（如小米浏览器）把网页全屏按视频全屏处理：进入时强制切横屏（与系统
 * 自动旋转开关无关）且拒绝方向锁定。对策分两层：先按回退链尝试锁回竖屏；若锁不住且
 * 检测到「进入前竖屏、进入后被强制横屏」，则退出全屏并在本设备上永久停用自动全屏。
 */

const BLOCKED_KEY = 'chevoink-fullscreen-blocked'

const isPhone = () => Math.min(window.screen.width, window.screen.height) < 768

const tryLockPortrait = async () => {
  const orientation = window.screen.orientation as ScreenOrientation & {
    lock?: (target: string) => Promise<void>
  }
  if (!orientation?.lock) return false
  // 不同内核对锁定目标的支持度不一，逐个回退尝试
  for (const target of ['portrait', 'portrait-primary', 'natural']) {
    try {
      await orientation.lock(target)
      return true
    } catch {
      // 继续尝试下一个目标
    }
  }
  return false
}

/** 进入沉浸全屏（必须在用户手势中调用）；不支持或被本设备停用时静默返回 */
export function enterImmersiveFullscreen() {
  if (document.fullscreenElement) return
  if (window.localStorage.getItem(BLOCKED_KEY)) return
  // 焦点在输入框上时不进入：全屏会盖住软键盘避让（微信/QQ 内核感知不到键盘高度），
  // 与 keyboard-inset 的「全屏下检测不到键盘则退出全屏」兜底互相配合、避免打架
  const active = document.activeElement
  if (active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')) {
    return
  }
  const wasPortrait = window.innerHeight >= window.innerWidth
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(async () => {
      if (isPhone()) {
        await tryLockPortrait()
        if (wasPortrait) {
          // 稍等浏览器完成旋转后复检：仍被强制横屏说明该内核锁不住，
          // 退出全屏并记住本设备不再自动全屏（宁可没有沉浸全屏也不能横屏）
          window.setTimeout(() => {
            if (!document.fullscreenElement) return
            if (window.innerWidth > window.innerHeight) {
              window.localStorage.setItem(BLOCKED_KEY, '1')
              document.exitFullscreen?.().catch(() => {})
            }
          }, 800)
        }
      }
    })
    .catch(() => {})
}
