/** 用户可见的 Credits 数量统一按整数展示，避免 milli-credit 内部精度泄漏到界面。 */
export function roundCreditAmount(value: number): number {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value)
  return Object.is(rounded, -0) ? 0 : rounded
}

export function formatCreditAmount(value: number): string {
  return roundCreditAmount(value).toLocaleString('zh-CN')
}

/** 每日额度重置时刻的短文案，用于创作区侧栏与顶栏的用量卡片。 */
export function formatCreditResetLabel(value?: string | null): string {
  if (!value) return '稍后自动重置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '稍后自动重置'
  return `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 重置`
}

