import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  getAuthorName,
  getCoverUrl,
  getDisplayTitle,
  getNovelSummary,
} from '@/features/discover/api'
import { formatWordCount } from '@/features/home/utils'
import { cn } from '@/lib/utils'
import type { NovelCard } from '../../../../shared/contracts/index.js'

type FeaturedNovelListProps = {
  novels: NovelCard[]
  /** list: 手机端纵向列表；grid: 平板/电脑端书封网格 */
  variant?: 'list' | 'grid'
  maxItems?: number
}

const statusLabel: Record<string, string> = {
  published: '连载中',
  archived: '完结',
  draft: '草稿',
}

/** 书封：3:4 比例，无封面时用底色 + 书名兜底 */
function NovelCover({ novel, className }: { novel: NovelCard; className?: string }) {
  const cover = getCoverUrl(novel.coverUrl)

  if (cover) {
    return (
      <img
        src={cover}
        alt={getDisplayTitle(novel)}
        loading="lazy"
        className={cn('aspect-[3/4] w-full rounded-[var(--radius-md)] object-cover', className)}
      />
    )
  }

  return (
    <span className={cn('flex aspect-[3/4] w-full items-end rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-2', className)}>
      <span className="line-clamp-3 text-xs font-semibold text-[var(--text-primary)]">{getDisplayTitle(novel)}</span>
    </span>
  )
}

/** 精选推荐：番茄式书封网格 / 手机端书封信息流，无卡片容器 */
export default function FeaturedNovelList({ novels, variant = 'list', maxItems = 10 }: FeaturedNovelListProps) {
  const items = novels.slice(0, maxItems)
  if (items.length === 0) return null

  return (
    <section aria-label="精选推荐" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)] md:text-xl">精选好书</h2>
        <Link
          to="/discover"
          className="inline-flex items-center gap-0.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)] md:text-sm"
        >
          更多
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {variant === 'grid' ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4">
          {items.map((novel) => (
            <Link key={novel.id} to={`/novel/${novel.id}`} className="group block min-w-0">
              <NovelCover novel={novel} className="transition-transform duration-[var(--duration-normal)] group-hover:-translate-y-0.5" />
              <h3 className="mt-2 line-clamp-1 text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                {getDisplayTitle(novel)}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-tertiary)]">
                {getAuthorName(novel.author)} · {statusLabel[novel.status] ?? novel.status}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {items.map((novel) => (
            <Link key={novel.id} to={`/novel/${novel.id}`} className="group flex gap-3 py-3 first:pt-0 last:pb-0">
              <NovelCover novel={novel} className="w-[84px] shrink-0" />
              <div className="min-w-0 flex-1 py-0.5">
                <h3 className="line-clamp-1 text-[15px] font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                  {getDisplayTitle(novel)}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
                  {getNovelSummary(novel.summary)}
                </p>
                <p className="mt-1.5 line-clamp-1 text-xs text-[var(--text-tertiary)]">
                  {getAuthorName(novel.author)} · {statusLabel[novel.status] ?? novel.status} · {formatWordCount(novel.wordCount)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
