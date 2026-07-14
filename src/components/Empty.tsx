import type { ReactNode } from 'react'

import AppState from '@/components/ui/AppState'

type EmptyProps = {
  title?: string
  description?: string
  details?: ReactNode
}

export default function Empty({
  title = '这里暂时还没有内容',
  description = '换个入口看看，或者稍后再回来继续浏览。',
  details,
}: EmptyProps) {
  return <AppState tone="empty" title={title} description={description} details={details} />
}
