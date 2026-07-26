import { Link } from 'react-router-dom'

import { getDisplayTitle } from '@/features/discover/api'
import { formatRelativeTime } from '@/features/home/utils'
import type { NovelCard } from '../../../../shared/contracts/index.js'

type LatestUpdatesListProps = {
  novels: NovelCard[]
  maxItems?: number
}

/** 最新更新：无容器的紧凑分隔列表，给追更用户快速扫读 */
export default function LatestUpdatesList({ novels, maxItems = 6 }: LatestUpdatesListProps) {
  const items = novels.slice(0, maxItems)
  if (items.length === 0) return null

  return (
    <section aria-label="最新更新" className="space-y-2">
      <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)] md:text-xl">最新更新</h2>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {items.map((novel) => (
          <li key={novel.id}>
            <Link
              to={`/novel/${novel.id}`}
              className="group flex items-center justify-between gap-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                  {getDisplayTitle(novel)}
                </span>
                <span className="line-clamp-1 text-xs text-[var(--text-tertiary)]">
                  更新至 {novel.chapterCount} 章
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
                {formatRelativeTime(novel.lastPublishedAt ?? novel.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
