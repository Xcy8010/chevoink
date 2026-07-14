import { useQuery } from '@tanstack/react-query'
import { Compass, Flame, Layers3, LoaderCircle, MoveRight, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
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
import { useStartReading } from '@/features/discover/useStartReading'

const formatWordCount = (value: number) => `${Math.round(value / 10000)} 万字`
const formatUpdatedTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))

const sortTabs = [
  { id: 'all', label: '全部作品' },
  { id: 'updated', label: '最近更新' },
  { id: 'wordCount', label: '长篇优先' },
  { id: 'chapterCount', label: '章节更多' },
] as const

type SortTabId = (typeof sortTabs)[number]['id']

export default function DiscoverPage() {
  const [sortBy, setSortBy] = useState<SortTabId>('all')
  const novelsQuery = useQuery({
    queryKey: ['discover-novels'],
    queryFn: () => listNovels({ page: 1, pageSize: 12 }),
  })
  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: getHomePayload,
  })
  const { startReading, isStarting, pendingNovelId } = useStartReading()

  const novels = asArray(novelsQuery.data?.items).filter((novel) => novel.status === 'published')
  const hotTopics = asArray(homeQuery.data?.hotTopics)

  const sortedNovels = useMemo(() => {
    const next = [...novels]

    switch (sortBy) {
      case 'updated':
        return next.sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        )
      case 'wordCount':
        return next.sort((left, right) => right.wordCount - left.wordCount)
      case 'chapterCount':
        return next.sort((left, right) => right.chapterCount - left.chapterCount)
      default:
        return next
    }
  }, [novels, sortBy])

  const rankingBoards = useMemo(
    () => [
      {
        title: '更新榜',
        description: '优先展示最近仍在持续推进的作品。',
        novels: [...novels]
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
          .slice(0, 3),
      },
      {
        title: '长篇榜',
        description: '适合一次追入正文的长线内容。',
        novels: [...novels].sort((left, right) => right.wordCount - left.wordCount).slice(0, 3),
      },
    ],
    [novels],
  )

  if (novelsQuery.isLoading) {
    return (
      <AppState
        tone="loading"
        title="正在整理适合开读的作品"
        description="分类书单和推荐排序正在陆续出现。"
      />
    )
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

  if (novels.length === 0) {
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

  const featuredNovels = sortedNovels.slice(0, 2)
  const catalogNovels = sortedNovels.slice(2)

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 lg:p-6 dark:border-slate-800 dark:bg-slate-950/86">
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.08fr)_272px] xl:grid-cols-[minmax(0,1.18fr)_320px]">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">分类发现</p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2rem]">
                先缩短找书时间，再把读者送进正文
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                先用更新频率、篇幅规模和目录完整度缩小范围，把更多注意力留给真正值得打开的内容。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {sortTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSortBy(tab.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    sortBy === tab.id
                      ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {featuredNovels.map((novel) => (
                <article
                  key={novel.id}
                  className="grid gap-4 rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4 sm:grid-cols-[88px_minmax(0,1fr)] dark:border-slate-800 dark:bg-slate-900/70"
                >
                  {getCoverUrl(novel.coverUrl) ? (
                    <img
                      src={getCoverUrl(novel.coverUrl) ?? ''}
                      alt={getDisplayTitle(novel)}
                      className="aspect-[3/4] w-full rounded-[18px] border border-slate-200 object-cover dark:border-slate-800"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] w-full items-end rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                      <p className="line-clamp-4 text-sm font-medium text-slate-950 dark:text-slate-50">{getDisplayTitle(novel)}</p>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                      <Compass className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span className="line-clamp-1">{getDisplayTitle(novel)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{getNovelSummary(novel.summary)}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{getAuthorName(novel.author)}</span>
                      <span>·</span>
                      <span>{formatWordCount(novel.wordCount)}</span>
                      <span>·</span>
                      <span>{novel.chapterCount} 章</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startReading(novel.id)}
                        disabled={isStarting && pendingNovelId === novel.id}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                      >
                        {isStarting && pendingNovelId === novel.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                        {isStarting && pendingNovelId === novel.id ? '正在打开...' : '立即阅读'}
                      </button>
                      <Link
                        to={`/novel/${novel.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600"
                      >
                        详情
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:pr-1">
            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                <Flame className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                热门话题
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {hotTopics.length > 0 ? hotTopics.map((topic) => (
                  <Link
                    key={topic.id}
                    to="/"
                    className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-50"
                  >
                    {topic.name}
                  </Link>
                )) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400">话题正在整理中</span>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                <Layers3 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                选书建议
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                <p>先看最近更新，更容易判断这本书是否还在稳定推进。</p>
                <p>再看篇幅和章节数，长线内容更适合连续追读。</p>
                <p>决定前先扫一眼简介和标签，能明显减少试错。</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_272px] xl:grid-cols-[minmax(0,1.1fr)_320px]">
        <div className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 lg:p-6 dark:border-slate-800 dark:bg-slate-950/86">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
              <Compass className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              全部作品
            </div>
            <Link
              to="/"
              className="hidden items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 md:inline-flex dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600"
            >
              回首页
              <MoveRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {(catalogNovels.length > 0 ? catalogNovels : sortedNovels).map((novel) => (
              <article
                key={novel.id}
                className="grid gap-4 rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4 sm:grid-cols-[88px_minmax(0,1fr)] dark:border-slate-800 dark:bg-slate-900/70"
              >
                {getCoverUrl(novel.coverUrl) ? (
                  <img
                    src={getCoverUrl(novel.coverUrl) ?? ''}
                    alt={getDisplayTitle(novel)}
                    className="aspect-[3/4] w-full rounded-[18px] border border-slate-200 object-cover dark:border-slate-800"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-end rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <p className="line-clamp-4 text-sm font-medium text-slate-950 dark:text-slate-50">{getDisplayTitle(novel)}</p>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{getAuthorName(novel.author)}</span>
                    <span>·</span>
                    <span>{formatWordCount(novel.wordCount)}</span>
                    <span>·</span>
                    <span>{formatUpdatedTime(novel.updatedAt)}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">{getDisplayTitle(novel)}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{getNovelSummary(novel.summary)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getSafeTags(novel.tags).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300"
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
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                    >
                      {isStarting && pendingNovelId === novel.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                      {isStarting && pendingNovelId === novel.id ? '正在打开...' : '开始阅读'}
                    </button>
                    <Link
                      to={`/novel/${novel.id}`}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600"
                    >
                      查看详情
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:pr-1">
          {rankingBoards.map((board) => (
            <section
              key={board.title}
              className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                <Trophy className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                {board.title}
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{board.description}</p>
              <div className="mt-4 space-y-3">
                {board.novels.map((novel, index) => (
                  <button
                    key={novel.id}
                    type="button"
                    onClick={() => startReading(novel.id)}
                    className="flex w-full gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-3 text-left transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-950"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-950 dark:bg-slate-950 dark:text-slate-50">
                      {index + 1}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="line-clamp-1 text-sm font-medium text-slate-950 dark:text-slate-50">{getDisplayTitle(novel)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {getAuthorName(novel.author)} · {formatUpdatedTime(novel.updatedAt)}
                      </p>
                      <p className="line-clamp-2 text-xs leading-6 text-slate-600 dark:text-slate-300">{getNovelSummary(novel.summary)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>
      </section>
    </div>
  )
}
