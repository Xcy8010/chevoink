import { cn } from '@/lib/utils'

export type CommunityTopic = {
  id: string
  name: string
  slug: string
  postCount: number
}

type TopicChannelBarProps = {
  topics: CommunityTopic[]
  activeTopicId: string
  onChange: (topicId: string) => void
  /** rail：手机端横滑（品牌色下划线）；sidebar：平板/桌面竖排列表 */
  variant?: 'rail' | 'sidebar'
}

/** 话题频道导航（方案 8.3.1）：话题从附属属性提升为频道导航 */
export default function TopicChannelBar({
  topics,
  activeTopicId,
  onChange,
  variant = 'rail',
}: TopicChannelBarProps) {
  if (variant === 'sidebar') {
    return (
      <nav className="space-y-1" aria-label="话题频道">
        {topics.map((topic) => {
          const isActive = topic.id === activeTopicId
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => onChange(topic.id)}
              className={cn(
                'press-feedback flex w-full items-center justify-between rounded-[var(--radius-md)] px-3.5 py-2.5 text-left text-sm transition-colors',
                isActive
                  ? 'bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
              )}
            >
              <span className="line-clamp-1">{topic.name}</span>
              <span
                className={cn(
                  'ml-2 shrink-0 text-xs',
                  isActive ? 'text-[var(--color-brand)]/75' : 'text-[var(--text-tertiary)]',
                )}
              >
                {topic.postCount}
              </span>
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="rail-scroll -mx-4 flex gap-1 overflow-x-auto px-4" aria-label="话题频道">
      {topics.map((topic) => {
        const isActive = topic.id === activeTopicId
        return (
          <button
            key={topic.id}
            type="button"
            onClick={() => onChange(topic.id)}
            className={cn(
              'press-feedback relative shrink-0 px-3 pb-2.5 pt-1 text-sm transition-colors',
              isActive ? 'font-medium text-[var(--color-brand)]' : 'text-[var(--text-secondary)]',
            )}
          >
            <span className="inline-flex items-baseline gap-1.5">
              {topic.name}
              <span className="text-[11px] opacity-60">{topic.postCount}</span>
            </span>
            <span
              className={cn(
                'absolute inset-x-3 bottom-0 h-[2.5px] rounded-full bg-[var(--color-brand)] transition-opacity [transition-duration:var(--duration-fast)]',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
          </button>
        )
      })}
    </nav>
  )
}
