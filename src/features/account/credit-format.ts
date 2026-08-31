/** 用户可见的 Credits 数量统一按整数展示，避免 milli-credit 内部精度泄漏到界面。 */
export function roundCreditAmount(value: number): number {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value)
  return Object.is(rounded, -0) ? 0 : rounded
}

export function formatCreditAmount(value: number): string {
  return roundCreditAmount(value).toLocaleString('zh-CN')
}

