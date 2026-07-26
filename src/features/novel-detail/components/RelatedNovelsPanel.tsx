import { Link } from 'react-router-dom'

import Empty from '@/components/Empty'
import { getAuthorName, getCoverUrl, getDisplayTitle, getNovelSummary } from '@/features/discover/api'
import type { NovelCard } from '../../../../shared/contracts'

type RelatedNovelsPanelProps = {
  novels: NovelCard[]
  /** grid：主区域网格卡片；list：桌面右栏紧凑列表 */
  variant?: 'grid' | 'list'
}

function RelatedCover({ novel, className }: { novel: NovelCard; className?: string }) {
  const coverUrl = getCoverUrl(novel.coverUrl)
  const title = getDisplayTitle(novel)

  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt={title}
        className={['aspect-[3/4] self-start rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover', className ?? ''].join(' ')}
      />
    )
  }

  return (
    <div
      className={[
        'flex aspect-[3/4] items-end self-start rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3',
        className ?? '',
      ].join(' ')}
    >
      <p className="line-clamp-4 text-xs font-medium text-[var(--text-primary)]">{title}</p>
    </div>
  )
}

/** 相关推荐：grid 变体用于主区，list 变体用于桌面右栏 */
export default function RelatedNovelsPanel({ novels, variant = 'grid' }: RelatedNovelsPanelProps) {
  if (novels.length === 0) {
    return <Empty title="暂时还没有更多推荐" description="把这本先读完，也许下一本很快就会出现。" />
  }

  if (variant === 'list') {
    return (
      <div className="space-y-3">
        {novels.slice(0, 5).map((novel) => (
          <Link
            key={novel.id}
            to={`/novel/${novel.id}`}
            className="flex gap-3 rounded-[var(--radius-lg)] p-2 transition-colors hover:bg-[var(--surface-muted)]"
          >
            <RelatedCover novel={novel} className="w-12 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
                {getDisplayTitle(novel)}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{getAuthorName(novel.author)}</span>
              {/* 不能和 block 同用：display:block 会覆盖 line-clamp 的 -webkit-box 导致截断失效；固定两行高度保证每条推荐等高 */}
              <span className="mt-1 line-clamp-2 h-10 text-xs leading-5 text-[var(--text-secondary)]">
                {getNovelSummary(novel.summary)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {novels.map((novel) => (
        <Link
          key={novel.id}
          to={`/novel/${novel.id}`}
          className="hover-lift grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-3 transition-colors hover:border-[var(--border-strong)]"
        >
          <RelatedCover novel={novel} className="w-full" />
          <span className="min-w-0">
            <span className="line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
              {getDisplayTitle(novel)}
            </span>
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{getAuthorName(novel.author)}</span>
            <span className="mt-2 line-clamp-2 h-10 text-xs leading-5 text-[var(--text-secondary)]">
              {getNovelSummary(novel.summary)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}
