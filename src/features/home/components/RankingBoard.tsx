import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { getAuthorName, getCoverUrl, getDisplayTitle } from '@/features/discover/api'
import { formatWordCount } from '@/features/home/utils'
import { cn } from '@/lib/utils'
import type { NovelCard } from '../../../../shared/contracts/index.js'

type RankingBoardProps = {
  hot: NovelCard[]
  fresh: NovelCard[]
  finished: NovelCard[]
  /** 每个榜单可见条数 */
  visibleCount?: number
  /** tabs: 单列 Tab 切换（手机端）；columns: 多榜并排（平板/电脑端） */
  variant?: 'tabs' | 'columns'
}

type BoardTab = 'hot' | 'fresh' | 'finished'

const TABS: { key: BoardTab; label: string }[] = [
  { key: 'hot', label: '热读榜' },
  { key: 'fresh', label: '新书榜' },
  { key: 'finished', label: '完结榜' },
]

/** 前三名醒目色 */
const rankColor = (rank: number) =>
  rank <= 3 ? 'text-[#f26a4b]' : 'text-[var(--text-tertiary)]'

function RankingList({ novels, visibleCount }: { novels: NovelCard[]; visibleCount: number }) {
  const items = novels.slice(0, visibleCount)

  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-[var(--text-tertiary)]">暂无上榜作品</p>
  }

  return (
    <ol>
      {items.map((novel, index) => {
        const rank = index + 1
        const cover = getCoverUrl(novel.coverUrl)
        return (
          <li key={novel.id}>
            <Link to={`/novel/${novel.id}`} className="group flex items-center gap-3 py-2">
              <span className={cn('w-5 shrink-0 text-center text-[15px] font-bold italic tabular-nums', rankColor(rank))}>
                {rank}
              </span>
              {cover ? (
                <img
                  src={cover}
                  alt={getDisplayTitle(novel)}
                  loading="lazy"
                  className="h-16 w-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <span className="flex h-16 w-12 shrink-0 items-end rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-1">
                  <span className="line-clamp-3 text-[10px] font-medium leading-tight text-[var(--text-primary)]">{getDisplayTitle(novel)}</span>
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                  {getDisplayTitle(novel)}
                </span>
                <span className="mt-1 line-clamp-1 text-xs text-[var(--text-tertiary)]">
                  {getAuthorName(novel.author)} · {formatWordCount(novel.wordCount)}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/** 排行榜：手机端 Tab 切换、桌面端三榜并排，数字序号前三着色，无卡片容器 */
export default function RankingBoard({ hot, fresh, finished, visibleCount = 5, variant = 'tabs' }: RankingBoardProps) {
  const [tab, setTab] = useState<BoardTab>('hot')

  if (variant === 'columns') {
    const boards: { key: BoardTab; label: string; novels: NovelCard[] }[] = [
      { key: 'hot', label: '热读榜', novels: hot },
      { key: 'fresh', label: '新书榜', novels: fresh },
      { key: 'finished', label: '完结榜', novels: finished },
    ]

    return (
      <section aria-label="排行榜" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)] md:text-xl">排行榜</h2>
          <Link
            to="/rankings"
            className="inline-flex items-center gap-0.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)] md:text-sm"
          >
            完整榜单
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <div key={board.key} className="min-w-0">
              <h3 className="border-b border-[var(--border-subtle)] pb-2 text-[15px] font-semibold text-[var(--text-primary)]">
                {board.label}
              </h3>
              <RankingList novels={board.novels} visibleCount={visibleCount} />
            </div>
          ))}
        </div>
      </section>
    )
  }

  const source = tab === 'hot' ? hot : tab === 'fresh' ? fresh : finished

  return (
    <section aria-label="排行榜" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="tablist" aria-label="榜单类型">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'press-feedback rounded-[var(--radius-md)] px-2 py-1 transition-colors first:pl-0',
                tab === item.key
                  ? 'text-lg font-bold text-[var(--text-primary)]'
                  : 'text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Link to="/rankings" className="inline-flex shrink-0 items-center gap-0.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)]">
          完整榜单
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <RankingList novels={source} visibleCount={visibleCount} />
    </section>
  )
}
