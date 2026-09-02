/**
 * 任务活跃时间的相对表述：刚刚 / n 分钟前 / n 小时前 / n 天前 / n 个月前 / n 年前。
 * 社区侧的 formatRelativeTime 超过一周就退化成日期，任务卡片需要一直保持「多久前」的语感，故单独一份。
 */
export function formatTaskRelativeTime(value: string | null | undefined): string {
  if (!value) return '刚刚'
  const target = new Date(value).getTime()
  if (!Number.isFinite(target)) return '刚刚'

  const diffSeconds = Math.max(0, Math.round((Date.now() - target) / 1000))
  if (diffSeconds < 60) return '刚刚'

  const minutes = Math.floor(diffSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`

  return `${Math.floor(months / 12)} 年前`
}
