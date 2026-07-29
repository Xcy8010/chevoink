/**
 * 会话令牌的本地持久化（localStorage）。
 *
 * 主认证通道仍是 HttpOnly cookie；但安卓 WebView 的 CookieManager 懒刷盘，
 * 登录后立刻杀掉 APP 会丢失尚未落盘的会话 cookie。登录响应里的令牌与 cookie
 * 同值，持久化到 localStorage 后随请求以 Authorization 头兜底，保证登录态不丢。
 */

const STORAGE_KEY = 'chevoink-session-token'

export function getSessionToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // 忽略隐私模式等写入失败
  }
}

/** 拼接鉴权请求头：有令牌时附带 Bearer 头（cookie 丢失时服务端以此恢复会话） */
export function buildAuthHeader(): Record<string, string> {
  const token = getSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
