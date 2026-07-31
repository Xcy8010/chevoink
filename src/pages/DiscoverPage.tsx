import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Flame, Layers3, LoaderCircle, MoveRight, Rocket, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { DiscoverSkeleton } from '@/components/ui/Skeleton'
import {
  asArray,
  getAuthorName,
  getCoverUrl,
  getDisplayTitle,
  getHomePayload,
  getNovelSummary,
  getSafeTags,
  listNovels,
} from '@/features/discover/api'
import { buildBoardNovels, hotScore } from '@/features/discover/ranking'
import { buildRecommendedNovels } from '@/features/discover/recommend'
import { useStartReading } from '@/features/discover/useStartReading'
import { formatWordCount } from '@/features/home/utils'
import { cn } from '@/lib/utils'

const formatUpdatedTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))

const sortTabs = [
  { id: 'all', label: '综合推荐' },
  { id: 'updated', label: '最近更新' },
  { id: 'wordCount', label: '长篇优先' },
  { id: 'chapterCount', label: '章节更多' },
] as const

type SortTabId = (typeof sortTabs)[number]['id']

/** 榜单前三名醒目色（与首页排行榜一致） */
const rankColor = (rank: number) =>
  rank <= 3 ? 'text-[#f26a4b]' : 'text-[var(--text-tertiary)]'

export default function DiscoverPage() {
  const [sortBy, setSortBy] = useState<SortTabId>('all')
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTag = searchParams.get('tag')
  const novelsQuery = useQuery({
    queryKey: ['discover-novels'],
    queryFn: () => listNovels({ page: 1, pageSize: 24, publishedOnly: true }),
  })
  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: getHomePayload,
  })
  const { startReading, isStarting, pendingNovelId } = useStartReading()

  const allNovels = asArray(novelsQuery.data?.items).filter((novel) => novel.status !== 'draft')
  // 分类筛选：首页分类导航携带 ?tag= 进入，按作品标签过滤
  const novels = activeTag
    ? allNovels.filter((novel) => getSafeTags(novel.tags).includes(activeTag))
    : allNovels
  const hotTopics = asArray(homeQuery.data?.hotTopics)

  const sortedNovels = useMemo(() => {
    const next = [...novels]

    switch (sortBy) {
      case 'updated':
        return next.sort(
          (left, right) =>
            new Date(right.lastPublishedAt ?? right.updatedAt).getTime() -
            new Date(left.lastPublishedAt ?? left.updatedAt).getTime(),
        )
      case 'wordCount':
        return next.sort((left, right) => right.wordCount - left.wordCount)
      case 'chapterCount':
        return next.sort((left, right) => right.chapterCount - left.chapterCount)
      default:
        return next.sort((left, right) => hotScore(right) - hotScore(left))
    }
  }, [novels, sortBy])

  const rankingBoards = useMemo(
    () => [
      { id: 'popular', title: '人气榜', novels: buildBoardNovels('popular', allNovels, 6) },
      { id: 'update', title: '更新榜', novels: buildBoardNovels('update', allNovels, 6) },
      { id: 'long', title: '长篇榜', novels: buildBoardNovels('long', allNovels, 6) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [novelsQuery.data],
  )

  // 新书抢先看：按发布时间取最新 12 本，填补左列下方的缺口
  const freshNovels = useMemo(
    () => buildBoardNovels('new', allNovels, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [novelsQuery.data],
  )

  // 推荐作品：基于最近阅读的标签口味挑 4 本，没有阅读记录时随机挑选；排除主推位已展示的书避免重复露出
  const recommendation = useMemo(
    () =>
      buildRecommendedNovels(
        novels,
        4,
        sortedNovels.slice(0, 2).map((novel) => novel.id),
      ),
    [novels, sortedNovels],
  )

  if (novelsQuery.isLoading) {
    return <DiscoverSkeleton />
  }

  if (novelsQuery.isError) {
    return (
      <AppState
        tone="error"
        title="分类发现暂时没有打开"
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
        title="这里还没有可浏览的作品"
        description="稍后再回来看看，也许会有新的更新和推荐出现。"
        primaryAction={{
          label: '回到首页',
          href: '/',
        }}
      />
    )
  }

  if (novels.length === 0) {
    return (
      <AppState
        tone="empty"
        title={`「${activeTag}」分类下暂时没有作品`}
        description="换个分类看看，或浏览全部作品。"
        primaryAction={{
          label: '查看全部作品',
          onClick: () => setSearchParams({}),
        }}
      />
    )
  }

  const featuredNovels = sortedNovels.slice(0, 2)

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)] sm:p-5 lg:p-6">
        {/* 顶部区域扫平化：单卡片内左右分栏，右栏用竖分隔线代替嵌套卡片 */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">分类发现</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
              先缩短找书时间，再把读者送进正文
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              先用更新频率、篇幅规模和目录完整度缩小范围，把更多注意力留给真正值得打开的内容。
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {activeTag ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand)] px-4 py-2 text-sm text-white">
                  {activeTag}
                  <button
                    type="button"
                    aria-label="清除分类筛选"
                    onClick={() => setSearchParams({})}
                    className="text-white/80 transition-colors hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ) : null}
              {sortTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSortBy(tab.id)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    sortBy === tab.id
                      ? 'bg-[var(--color-brand)] font-medium text-white'
                      : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 主推位：去掉内层卡片背景，封面 + 文字直接平铺 */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {featuredNovels.map((novel) => {
                const cover = getCoverUrl(novel.coverUrl)
                const pending = isStarting && pendingNovelId === novel.id
                return (
                  <article key={novel.id} className="group flex gap-4">
                    <Link to={`/novel/${novel.id}`} className="shrink-0">
                      {cover ? (
                        <img
                          src={cover}
                          alt={getDisplayTitle(novel)}
                          loading="lazy"
                          className="h-[128px] w-[96px] rounded-[var(--radius-md)] object-cover"
                        />
                      ) : (
                        <span className="flex h-[128px] w-[96px] items-end rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-2">
                          <span className="line-clamp-3 text-xs font-medium leading-tight text-[var(--text-primary)]">
                            {getDisplayTitle(novel)}
                          </span>
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/novel/${novel.id}`}
                        className="line-clamp-1 text-[15px] font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]"
                      >
                        {getDisplayTitle(novel)}
                      </Link>
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-[var(--text-secondary)]">
                        {getNovelSummary(novel.summary)}
                      </p>
                      <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                        {getAuthorName(novel.author)} · {formatWordCount(novel.wordCount)} · {novel.chapterCount} 章
                      </p>
                      <button
                        type="button"
                        onClick={() => startReading(novel.id)}
                        disabled={pending}
                        className="press-feedback mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-brand)] px-3.5 text-[13px] font-medium text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                        {pending ? '打开中' : '立即阅读'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          <aside className="border-t border-[var(--border-subtle)] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-center gap-1.5 text-[15px] font-bold text-[var(--text-primary)]">
              <Flame className="h-4 w-4 text-[#f26a4b]" />
              热门话题
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {hotTopics.length > 0 ? hotTopics.map((topic) => (
                <Link
                  key={topic.id}
                  to="/"
                  className="rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--color-brand)]"
                >
                  {topic.name}
                </Link>
              )) : (
                <span className="text-sm text-[var(--text-tertiary)]">话题正在整理中</span>
              )}
            </div>

            <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex items-center gap-1.5 text-[15px] font-bold text-[var(--text-primary)]">
                <Layers3 className="h-4 w-4 text-[var(--text-tertiary)]" />
                选书建议
              </div>
              <ul className="mt-3 space-y-2 text-[13px] leading-6 text-[var(--text-secondary)]">
                <li>先看最近更新，更容易判断这本书是否还在稳定推进。</li>
                <li>再看篇幅和章节数，长线内容更适合连续追读。</li>
                <li>决定前先扫一眼简介和标签，能明显减少试错。</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_272px] md:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1.1fr)_320px]">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)] sm:p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <Sparkles className="h-4 w-4 text-[#f26a4b]" />
                推荐作品
              </div>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                {recommendation.personalized ? '根据你最近的阅读口味挑选' : '随机为你挑选，读几本后会更懂你'}
              </p>
            </div>
            <Link
              to="/"
              className="hidden items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] md:inline-flex"
            >
              回首页
              <MoveRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {recommendation.novels.map((novel) => (
              <article
                key={novel.id}
                className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 sm:grid-cols-[88px_minmax(0,1fr)]"
              >
                {getCoverUrl(novel.coverUrl) ? (
                  <img
                    src={getCoverUrl(novel.coverUrl) ?? ''}
                    alt={getDisplayTitle(novel)}
                    className="aspect-[3/4] w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-end rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4">
                    <p className="line-clamp-4 text-sm font-medium text-[var(--text-primary)]">{getDisplayTitle(novel)}</p>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                    <span>{getAuthorName(novel.author)}</span>
                    <span>·</span>
                    <span>{formatWordCount(novel.wordCount)}</span>
                    <span>·</span>
                    <span>{formatUpdatedTime(novel.updatedAt)}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{getDisplayTitle(novel)}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-7 text-[var(--text-secondary)]">{getNovelSummary(novel.summary)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getSafeTags(novel.tags).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[var(--radius-pill)] bg-[var(--surface-default)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startReading(novel.id)}
                      disabled={isStarting && pendingNovelId === novel.id}
                      className="press-feedback inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isStarting && pendingNovelId === novel.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                      {isStarting && pendingNovelId === novel.id ? '正在打开...' : '开始阅读'}
                    </button>
                    <Link
                      to={`/novel/${novel.id}`}
                      className="inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    >
                      查看详情
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="md:row-span-2 lg:sticky lg:top-24">
          {/* 参考番茄小说的扫平榜单：单一卡片内三榜分段，条目用排名数字 + 小封面直接分行，不再嵌套子卡片 */}
          <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-4 shadow-[var(--shadow-card)] sm:px-5">
            {rankingBoards.map((board, boardIndex) => (
              <section key={board.id} className={boardIndex > 0 ? 'mt-4 border-t border-[var(--border-subtle)] pt-4' : ''}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[15px] font-bold text-[var(--text-primary)]">{board.title}</h3>
                  <Link
                    to={`/rankings?board=${board.id}`}
                    className="inline-flex items-center gap-0.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)]"
                  >
                    完整榜
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                {board.novels.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">暂无上榜作品</p>
                ) : (
                  <ol className="mt-1.5">
                    {board.novels.map((novel, index) => {
                      const rank = index + 1
                      const cover = getCoverUrl(novel.coverUrl)
                      // 前三名带封面展示，后续名次收成单行，层次更轻
                      if (rank <= 3) {
                        return (
                          <li key={novel.id}>
                            <Link to={`/novel/${novel.id}`} className="group flex items-center gap-2.5 py-2">
                              <span className={cn('w-4 shrink-0 text-center text-[15px] font-bold italic tabular-nums', rankColor(rank))}>
                                {rank}
                              </span>
                              {cover ? (
                                <img
                                  src={cover}
                                  alt={getDisplayTitle(novel)}
                                  loading="lazy"
                                  className="h-14 w-[42px] shrink-0 rounded-[var(--radius-sm)] object-cover"
                                />
                              ) : (
                                <span className="flex h-14 w-[42px] shrink-0 items-end rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-1">
                                  <span className="line-clamp-3 text-[9px] font-medium leading-tight text-[var(--text-primary)]">
                                    {getDisplayTitle(novel)}
                                  </span>
                                </span>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-1 text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                                  {getDisplayTitle(novel)}
                                </span>
                                <span className="mt-0.5 line-clamp-1 text-xs text-[var(--text-tertiary)]">
                                  {getAuthorName(novel.author)} · {formatWordCount(novel.wordCount)}
                                </span>
                              </span>
                            </Link>
                          </li>
                        )
                      }
                      return (
                        <li key={novel.id}>
                          <Link to={`/novel/${novel.id}`} className="group flex items-center gap-2.5 py-1.5">
                            <span className={cn('w-4 shrink-0 text-center text-[13px] font-bold italic tabular-nums', rankColor(rank))}>
                              {rank}
                            </span>
                            <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-[var(--text-secondary)] transition-colors group-hover:text-[var(--color-brand)]">
                              {getDisplayTitle(novel)}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </aside>

        {/* 新书抢先看：放在左列全部作品下方，填补右侧长榜单留出的左下缺口 */}
        {freshNovels.length > 0 ? (
          <section className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)] sm:p-5 lg:p-6 md:col-start-1">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-[var(--text-primary)]">
                <Rocket className="h-4 w-4 text-[#f26a4b]" />
                新书抢先看
              </h3>
              <Link
                to="/rankings?board=new"
                className="inline-flex items-center gap-0.5 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)]"
              >
                新书榜
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
              {freshNovels.map((novel) => {
                const cover = getCoverUrl(novel.coverUrl)
                return (
                  <Link key={novel.id} to={`/novel/${novel.id}`} className="group min-w-0">
                    {cover ? (
                      <img
                        src={cover}
                        alt={getDisplayTitle(novel)}
                        loading="lazy"
                        className="aspect-[3/4] w-full rounded-[var(--radius-md)] object-cover transition-transform duration-200 group-hover:-translate-y-0.5"
                      />
                    ) : (
                      <span className="flex aspect-[3/4] w-full items-end rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-2">
                        <span className="line-clamp-4 text-xs font-medium leading-tight text-[var(--text-primary)]">
                          {getDisplayTitle(novel)}
                        </span>
                      </span>
                    )}
                    <p className="mt-2 line-clamp-1 text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                      {getDisplayTitle(novel)}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-tertiary)]">{getAuthorName(novel.author)}</p>
                  </Link>
                )
              })}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  )
}
