import { BookOpen, FileText, Heart, Layers, MessageSquare } from 'lucide-react'

import type { NovelDetailState } from '../useNovelDetailState'

const numberFormatter = new Intl.NumberFormat('zh-CN')

const formatNumber = (value: number) => numberFormatter.format(value)

const formatWordCount = (value: number) => {
  if (value >= 10000) {
    const formatted = (Math.round((value / 10000) * 10) / 10).toFixed(1).replace(/\.0$/, '')
    return `${formatted}万字`
  }

  return `${formatNumber(value)}字`
}

type DetailStatsRowProps = {
  state: NovelDetailState
  /** inverted：手机端封面遮罩上的反白模式 */
  inverted?: boolean
}

/** 数据行：图标 + 数字横排（字数/章节/阅读/收藏/评论） */
export default function DetailStatsRow({ state, inverted = false }: DetailStatsRowProps) {
  const { detail, actualWordCount, actualChapterCount } = state

  if (!detail) {
    return null
  }

  const items = [
    { icon: FileText, label: '字数', value: formatWordCount(actualWordCount) },
    { icon: Layers, label: '章节', value: formatNumber(actualChapterCount) },
    { icon: BookOpen, label: '读者', value: formatNumber(detail.novel.viewCount) },
    { icon: Heart, label: '收藏', value: formatNumber(detail.novel.favoriteCount) },
    { icon: MessageSquare, label: '评论', value: formatNumber(detail.novel.commentCount) },
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((item) => (
        <span
          key={item.label}
          className={[
            'inline-flex items-center gap-1.5 text-[13px]',
            inverted ? 'text-white/85' : 'text-[var(--text-secondary)]',
          ].join(' ')}
        >
          <item.icon className="h-4 w-4" />
          <span className={['font-semibold tabular-nums', inverted ? 'text-white' : 'text-[var(--text-primary)]'].join(' ')}>
            {item.value}
          </span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  )
}
