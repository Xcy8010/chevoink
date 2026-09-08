/** Presentation/compatibility only: a user agent is never an authorization credential. */
export function isWindowsDesktopApp(): boolean {
  return typeof navigator !== 'undefined' && /\bChevoinkDesktop\/\d+\.\d+\.\d+\b/.test(navigator.userAgent)
}

/** Physical platform, deliberately independent of responsive viewport width. */
export function isMobileClientPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|HarmonyOS/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}
