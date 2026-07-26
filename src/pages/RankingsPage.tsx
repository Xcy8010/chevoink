import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronUp, LayoutGrid, LoaderCircle, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { DiscoverSkeleton } from '@/components/ui/Skeleton'
import {
  asArray,
  getAuthorName,
  getCoverUrl,
  getDisplayTitle,
  getNovelSummary,
  getSafeTags,
  listNovels,
} from '@/features/discover/api'
import { RANKING_BOARDS, CATEGORY_RANKING_TAGS, buildBoardNovels, buildCategoryBoardNovels, type RankingBoardId } from '@/features/discover/ranking'
import { useStartReading } from '@/features/discover/useStartReading'
import { formatWordCount } from '@/features/home/utils'
import { cn } from '@/lib/utils'

const isBoardId = (value: string | null): value is RankingBoardId =>
  RANKING_BOARDS.some((board) => board.id === value)

const isCategoryTag = (value: string | null): value is string =>
  value !== null && CATEGORY_RANKING_TAGS.includes(value)

/** 前三名醒目色（与首页排行榜一致） */
const rankColor = (rank: number) =>
  rank <= 3 ? 'text-[#f26a4b]' : 'text-[var(--text-tertiary)]'

/** 完整榜单页：左侧榜单导航 + 右侧完整排名列表，参考番茄小说的扁平榜单排版 */
export default function RankingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // 窄屏时榜单导航默认只露两行网格，点展开按钮后展示全部榜单与分类榜
  const [navExpanded, setNavExpanded] = useState(false)
  const boardParam = searchParams.get('board')
  // 分类榜直接用标签名作为 board 参数，如 ?board=科幻
  const activeCategoryTag = isCategoryTag(boardParam) ? boardParam : null
  const activeBoardId: RankingBoardId = isBoardId(boardParam) ? boardParam : 'hot'
  const activeBoard = RANKING_BOARDS.find((board) => board.id === activeBoardId) ?? RANKING_BOARDS[0]
  const boardLabel = activeCategoryTag ? `${activeCategoryTag}榜` : activeBoard.label
  const boardDescription = activeCategoryTag
    ? `「${activeCategoryTag}」分类下最受欢迎的作品，按热度排序。`
    : activeBoard.description

  // 统一的榜单入口目录（六大榜单 + 分类榜），供窄屏网格导航使用
  const navEntries = [
    ...RANKING_BOARDS.map((board) => ({
      key: board.id,
      label: board.label,
      active: !activeCategoryTag && board.id === activeBoardId,
      select: () => setSearchParams(board.id === 'hot' ? {} : { board: board.id }),
    })),
    ...CATEGORY_RANKING_TAGS.map((tag) => ({
      key: `tag-${tag}`,
      label: `${tag}榜`,
      active: tag === activeCategoryTag,
      select: () => setSearchParams({ board: tag }),
    })),
  ]
  // 收起态每行固定 4 个，展示 7 个入口 + 1 个展开按钮凑满两行；选中项不在前 7 时替换末位保持高亮可见
  const COLLAPSED_NAV_COUNT = 7
  const activeEntryIndex = navEntries.findIndex((entry) => entry.active)
  const collapsedEntries =
    activeEntryIndex >= COLLAPSED_NAV_COUNT
      ? [...navEntries.slice(0, COLLAPSED_NAV_COUNT - 1), navEntries[activeEntryIndex]]
      : navEntries.slice(0, COLLAPSED_NAV_COUNT)
  const mobileNavEntries = navExpanded ? navEntries : collapsedEntries

  const novelsQuery = useQuery({
    queryKey: ['rankings-novels'],
    queryFn: () => listNovels({ page: 1, pageSize: 60, publishedOnly: true }),
  })
  const { startReading, isStarting, pendingNovelId } = useStartReading()

  const allNovels = useMemo(
    () => asArray(novelsQuery.data?.items).filter((novel) => novel.status !== 'draft'),
    [novelsQuery.data],
  )
  const boardNovels = useMemo(
    () =>
      activeCategoryTag
        ? buildCategoryBoardNovels(activeCategoryTag, allNovels, 20)
        : buildBoardNovels(activeBoardId, allNovels, 20),
    [activeBoardId, activeCategoryTag, allNovels],
  )

  if (novelsQuery.isLoading) {
    return <DiscoverSkeleton />
  }

  if (novelsQuery.isError) {
    return (
      <AppState
        tone="error"
        title="榜单暂时没有打开"
        description={novelsQuery.error instanceof Error ? novelsQuery.error.message : '连接似乎中断了，请稍后再试。'}
        primaryAction={{
          label: novelsQuery.isFetching ? '重新连接中...' : '重新连接',
          onClick: () => void novelsQuery.refetch(),
        }}
      />
    )
  }

  if (allNovels.length === 0) {
    return (
      <AppState
        tone="empty"
        title="榜单还在等第一批作品"
        description="稍后再回来看看，也许会有新的上榜作品出现。"
        primaryAction={{ label: '回到首页', href: '/' }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[var(--shadow-card)]">
      <div className="grid lg:grid-cols-[188px_minmax(0,1fr)]">
        {/* 榜单导航：桌面端左侧竖排，窄屏顶部固定每行 4 个的网格（参考首页分类导航），杜绝横向溢出 */}
        <aside className="min-w-0 border-b border-[var(--border-subtle)] px-3 py-3 lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
          <div className="mb-1 hidden items-center gap-2 px-3 pb-3 text-sm font-bold text-[var(--text-primary)] lg:flex">
            <Trophy className="h-4 w-4 text-[#f26a4b]" />
            排行榜
          </div>
          {/* 窄屏网格导航：收起两行，末位是展开/收起按钮 */}
          <nav className="grid grid-cols-4 gap-1 lg:hidden" aria-label="榜单类型">
            {mobileNavEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={entry.select}
                className={cn(
                  'min-w-0 truncate rounded-[var(--radius-md)] px-1 py-2 text-center text-[13px] transition-colors',
                  entry.active
                    ? 'bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                {entry.label}
              </button>
            ))}
            <button
              type="button"
              aria-label={navExpanded ? '收起榜单导航' : '展开全部榜单'}
              aria-expanded={navExpanded}
              onClick={() => setNavExpanded((current) => !current)}
              className="press-feedback inline-flex min-w-0 items-center justify-center gap-1 rounded-[var(--radius-md)] px-1 py-2 text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            >
              {navExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              {navExpanded ? '收起' : '全部'}
            </button>
          </nav>
          {/* 桌面端竖排导航：全部榜单 + 分类榜分组 */}
          <nav className="hidden lg:flex lg:flex-col lg:gap-1" aria-label="榜单类型">
            {RANKING_BOARDS.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => setSearchParams(board.id === 'hot' ? {} : { board: board.id })}
                className={cn(
                  'rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors',
                  !activeCategoryTag && board.id === activeBoardId
                    ? 'bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                {board.label}
              </button>
            ))}
            {/* 分类榜：按作品标签划分的频道榜单 */}
            <div className="my-1 border-t border-[var(--border-subtle)] px-3 pt-3 text-xs font-semibold text-[var(--text-tertiary)]">
              分类榜
            </div>
            {CATEGORY_RANKING_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSearchParams({ board: tag })}
                className={cn(
                  'rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors',
                  tag === activeCategoryTag
                    ? 'bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                {tag}榜
              </button>
            ))}
          </nav>
        </aside>

        {/* 榜单主体：标题 + 描述 + 扁平排名列表（分隔线分行，不嵌套卡片） */}
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <header className="flex items-baseline justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{boardLabel}</h1>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">{boardDescription}</p>
            </div>
            <Link
              to="/discover"
              className="inline-flex shrink-0 items-center gap-0.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)]"
            >
              去发现页
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </header>

          {boardNovels.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">
              {activeCategoryTag
                ? `「${activeCategoryTag}」分类还没有上榜作品，换个榜单看看吧。`
                : activeBoardId === 'finished'
                  ? '还没有完结作品上榜，先去追更几本连载吧。'
                  : '暂无上榜作品'}
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-[var(--border-subtle)]">
              {boardNovels.map((novel, index) => {
                const rank = index + 1
                const cover = getCoverUrl(novel.coverUrl)
                const pending = isStarting && pendingNovelId === novel.id
                return (
                  <li key={novel.id}>
                    <div className="group flex items-center gap-3 py-3.5 sm:gap-4">
                      <span className={cn('w-7 shrink-0 text-center text-lg font-bold italic tabular-nums', rankColor(rank))}>
                        {rank}
                      </span>
                      <Link to={`/novel/${novel.id}`} className="shrink-0">
                        {cover ? (
                          <img
                            src={cover}
                            alt={getDisplayTitle(novel)}
                            loading="lazy"
                            className="h-[104px] w-[78px] rounded-[var(--radius-sm)] object-cover"
                          />
                        ) : (
                          <span className="flex h-[104px] w-[78px] items-end rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-1.5">
                            <span className="line-clamp-3 text-[11px] font-medium leading-tight text-[var(--text-primary)]">
                              {getDisplayTitle(novel)}
                            </span>
                          </span>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/novel/${novel.id}`}
                          className="line-clamp-1 break-all text-[15px] font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]"
                        >
                          {getDisplayTitle(novel)}
                        </Link>
                        <p className="mt-1.5 line-clamp-2 break-all text-[13px] leading-6 text-[var(--text-secondary)]">
                          {getNovelSummary(novel.summary)}
                        </p>
                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-tertiary)]">
                          <span className="max-w-full truncate">{getAuthorName(novel.author)}</span>
                          <span>·</span>
                          <span>{formatWordCount(novel.wordCount)}</span>
                          {novel.status === 'archived' ? (
                            <>
                              <span>·</span>
                              <span>已完结</span>
                            </>
                          ) : null}
                          {getSafeTags(novel.tags)
                            .slice(0, 3)
                            .map((tag) => (
                              <span
                                key={tag}
                                className="rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px]"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startReading(novel.id)}
                        disabled={pending}
                        className="press-feedback hidden h-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-brand)] px-4 text-sm font-medium text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)] hover:text-white disabled:cursor-not-allowed disabled:opacity-70 sm:inline-flex"
                      >
                        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                        {pending ? '打开中' : '阅读'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </main>
      </div>
    </div>
  )
}
