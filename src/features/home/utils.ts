/** 相对时间格式："3分钟前"、"2小时前"、"昨天"、"5月3日" */
export function formatRelativeTime(value: string | Date): string {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''

  const diffMs = Date.now() - time
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes}分钟前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}小时前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays}天前`

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(time))
}

/** 字数格式化：12.5万字 / 3,200字 */
export function formatWordCount(value: number): string {
  if (value >= 10000) {
    const wan = value / 10000
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)}万字`
  }

  return `${value.toLocaleString('zh-CN')}字`
}
