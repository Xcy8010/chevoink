export function formatCompactCount(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)} 万`
  }

  return `${value}`
}

export function formatRelativeTime(value: string) {
  const target = new Date(value).getTime()
  const diffMinutes = Math.max(1, Math.round((Date.now() - target) / 60000))

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) {
    return `${diffDays} 天前`
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

export function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase()
}
