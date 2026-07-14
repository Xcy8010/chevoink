import { useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronRight, Clock3, Flame, LoaderCircle, MessageSquare, MoveRight, PenSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import Tag from '@/components/ui/Tag'
import {
  asArray,
  getAuthorName,
  getCoverUrl,
  getDisplayTitle,
  getHomePayload,
  getNovelSummary,
  getPostExcerpt,
  getSafeTags,
  getTopicName,
} from '@/features/discover/api'
import { useStartReading } from '@/features/discover/useStartReading'

const statusMap = {
  draft: '草稿',
  published: '连载中',
  archived: '已完结',
} as const

const formatWordCount = (value: number) => `${Math.round(value / 10000)} 万字`

const formatUpdatedTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

export default function Home() {
  const homeQuery = useQuery({
    queryKey: ['home'],
    queryFn: getHomePayload,
  })
  const { startReading, isStarting, pendingNovelId } = useStartReading()

  if (homeQuery.isLoading) {
    return (
      <AppState
        tone="loading"
        title="正在整理今天值得先读的内容"
        description="推荐作品、更新动态和热门讨论正在陆续出现。"
      />
    )
  }

  if (homeQuery.isError) {
    return (
      <AppState
        tone="error"
        title="首页暂时没有打开"
        description={homeQuery.error instanceof Error ? homeQuery.error.message : '连接似乎中断了，请稍后再试。'}
        primaryAction={{
          label: homeQuery.isFetching ? '重新连接中...' : '重新连接',
          onClick: () => void homeQuery.refetch(),
        }}
      />
    )
  }

  const homePagePayload = homeQuery.data
  const continueReading = asArray(homePagePayload.continueReading).filter((novel) => novel.status === 'published')
  const recommendedNovels = asArray(homePagePayload.recommendedNovels).filter((novel) => novel.status === 'published')
  const latestUpdatedNovels = asArray(homePagePayload.latestUpdatedNovels).filter((novel) => novel.status === 'published')
  const hotPosts = asArray(homePagePayload.hotPosts)
  const hotTopics = asArray(homePagePayload.hotTopics)
  const featuredNovel =
    continueReading[0] ??
    recommendedNovels[0] ??
    latestUpdatedNovels[0]

  const continueShelf = [
    ...continueReading.slice(1),
    ...recommendedNovels.filter((novel) => novel.id !== featuredNovel?.id),
  ].slice(0, 3)

  const discoverShelf = [
    ...recommendedNovels.filter((novel) => novel.id !== featuredNovel?.id),
    ...latestUpdatedNovels.filter((novel) => novel.id !== featuredNovel?.id),
  ].filter((novel, index, list) => list.findIndex((item) => item.id === novel.id) === index)
    .slice(0, 4)

  if (!featuredNovel) {
    return (
      <AppState
        tone="empty"
        title="还没有找到可阅读的内容"
        description="换个时间再来看看，新作品和更新内容会在这里出现。"
        primaryAction={{
          label: '去分类发现',
          href: '/discover',
        }}
      />
    )
  }

  const rankingShelf = [featuredNovel, ...discoverShelf, ...continueShelf]
    .filter((novel, index, list) => list.findIndex((item) => item.id === novel.id) === index)
    .slice(0, 8)
  const bulletinShelf = [
    ...latestUpdatedNovels,
    ...recommendedNovels,
  ].filter((novel, index, list) => list.findIndex((item) => item.id === novel.id) === index)
    .slice(0, 6)

  const primaryActionClass =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-contrast)] px-4 text-sm font-medium text-[var(--text-contrast)] transition-colors hover:bg-[var(--surface-contrast-hover)] md:h-11'
  const secondaryActionClass =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] md:h-11'
  const featuredTitle = getDisplayTitle(featuredNovel)
  const featuredSummary = getNovelSummary(featuredNovel.summary)
  const featuredTags = getSafeTags(featuredNovel.tags)
  const featuredCoverUrl = getCoverUrl(featuredNovel.coverUrl)
  const featuredAuthorName = getAuthorName(featuredNovel.author)

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_320px]">
        <div className="space-y-4">
          <Surface
            as="section"
            padding="lg"
            className="overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(244,238,229,0.92)_100%)]"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="accent">
                  {continueReading.some((item) => item.id === featuredNovel.id) ? '继续阅读' : '本周推荐'}
                </Tag>
                <Tag>{statusMap[featuredNovel.status]}</Tag>
              </div>

              <div className="grid gap-5 sm:grid-cols-[116px_minmax(0,1fr)] lg:grid-cols-[140px_minmax(0,1fr)]">
                {featuredCoverUrl ? (
                  <img
                    src={featuredCoverUrl}
                    alt={featuredTitle}
                    className="h-[164px] w-[116px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover lg:h-[204px] lg:w-[140px]"
                  />
                ) : (
                  <div className="flex h-[164px] w-[116px] flex-col justify-end rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 lg:h-[204px] lg:w-[140px]">
                    <p className="text-xs text-[var(--text-tertiary)]">{featuredAuthorName}</p>
                    <p className="mt-2 line-clamp-3 text-base font-semibold text-[var(--text-primary)]">{featuredTitle}</p>
                  </div>
                )}
                <div className="min-w-0 space-y-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
                      <span className="font-medium text-[var(--text-primary)]">{featuredAuthorName}</span>
                      <span>{formatWordCount(featuredNovel.wordCount)}</span>
                      <span>{featuredNovel.chapterCount} 章</span>
                      <span>{featuredNovel.updatedAt ? formatUpdatedTime(featuredNovel.updatedAt) : '刚刚更新'}</span>
                    </div>
                    <h2 className="text-[1.85rem] font-semibold tracking-tight text-[var(--text-primary)] md:text-[2.2rem]">
                      {featuredTitle}
                    </h2>
                    <p className="line-clamp-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] md:text-base">
                      {featuredSummary}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {featuredTags.slice(0, 3).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => startReading(featuredNovel.id)}
                      disabled={isStarting && pendingNovelId === featuredNovel.id}
                      variant="primary"
                    >
                      {isStarting && pendingNovelId === featuredNovel.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <BookOpen className="h-4 w-4" />
                      )}
                      进入正文
                    </Button>
                    <Link to={`/novel/${featuredNovel.id}`} className={secondaryActionClass}>
                      查看详情
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </Surface>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Surface as="section" padding="md" className="space-y-2">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <BookOpen className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                <span className="whitespace-nowrap text-xs font-medium text-[var(--text-primary)] md:text-[13px] xl:text-sm">继续阅读</span>
                <button
                  type="button"
                  onClick={() => startReading(featuredNovel.id)}
                  disabled={isStarting && pendingNovelId === featuredNovel.id}
                  className="shrink-0 whitespace-nowrap pl-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-70 md:text-[13px] xl:text-sm"
                >
                  {isStarting && pendingNovelId === featuredNovel.id ? '打开中 >' : '去读 >'}
                </button>
              </div>
              <p className="text-[13px] leading-6 text-[var(--text-secondary)] md:text-[13px] xl:text-sm">
                {featuredTitle} · 回到最近打开的章节，直接继续往下读。
              </p>
            </Surface>

            <Surface as="section" padding="md" className="space-y-2">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <Flame className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                <span className="whitespace-nowrap text-xs font-medium text-[var(--text-primary)] md:text-[13px] xl:text-sm">发现更多</span>
                <Link to="/discover" className="shrink-0 whitespace-nowrap pl-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] md:text-[13px] xl:text-sm">
                  发现 &gt;
                </Link>
              </div>
              <p className="text-[13px] leading-6 text-[var(--text-secondary)] md:text-[13px] xl:text-sm">按题材、热度和更新节奏继续找书，把时间留给正文。</p>
            </Surface>

            <Surface as="section" padding="md" className="space-y-2">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <PenSquare className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                <span className="whitespace-nowrap text-xs font-medium text-[var(--text-primary)] md:text-[13px] xl:text-sm">打开创作</span>
                <Link to="/studio" className="shrink-0 whitespace-nowrap pl-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] md:text-[13px] xl:text-sm">
                  创作 &gt;
                </Link>
              </div>
              <p className="text-[13px] leading-6 text-[var(--text-secondary)] md:text-[13px] xl:text-sm">从作品设定、章节草稿到 AI 辅助，都能直接接着写。</p>
            </Surface>
          </div>

          <Surface as="section" padding="md" className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">正在热读</p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">把最近值得打开的内容放在这一屏</h2>
              </div>
              <Link to="/discover" className="hidden md:inline-flex md:items-center md:gap-2 md:text-sm md:font-medium md:text-[var(--text-secondary)]">
                去分类发现
                <MoveRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {rankingShelf.slice(0, 4).map((novel) => (
                <Link
                  key={novel.id}
                  to={`/novel/${novel.id}`}
                  className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-default)]"
                >
                  {getCoverUrl(novel.coverUrl) ? (
                    <img
                      src={getCoverUrl(novel.coverUrl) ?? ''}
                      alt={getDisplayTitle(novel)}
                      className="h-[86px] w-[64px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
                    />
                  ) : (
                    <div className="flex h-[86px] w-[64px] items-end rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2">
                      <p className="line-clamp-3 text-[11px] font-medium text-[var(--text-primary)]">{getDisplayTitle(novel)}</p>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
                      <span>{getAuthorName(novel.author)}</span>
                      <span>{formatWordCount(novel.wordCount)}</span>
                    </div>
                    <h3 className="mt-2 line-clamp-1 text-base font-semibold text-[var(--text-primary)]">{getDisplayTitle(novel)}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{getNovelSummary(novel.summary)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Surface>
        </div>

        <div className="grid gap-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7.5rem)] xl:overflow-y-auto xl:pr-1">
          <Surface padding="md" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <Clock3 className="h-4 w-4 text-[var(--text-secondary)]" />
                最新动态
              </div>
              <Link to="/discover" className="text-sm font-medium text-[var(--text-secondary)]">
                查看更多
              </Link>
            </div>
            <div className="space-y-2">
              {bulletinShelf.map((novel) => (
                <Link
                  key={novel.id}
                  to={`/novel/${novel.id}`}
                  className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] px-3 py-3 transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium text-[var(--text-primary)]">{novel.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-[var(--text-tertiary)]">{getAuthorName(novel.author)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{formatUpdatedTime(novel.updatedAt)}</span>
                </Link>
              ))}
            </div>
          </Surface>

          <Surface padding="md" className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <MessageSquare className="h-4 w-4 text-[var(--text-secondary)]" />
              热门讨论
            </div>
            <div className="space-y-3">
              {hotPosts.length > 0 ? hotPosts.slice(0, 3).map((post) => (
                <article key={post.id} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{getTopicName(post.topic)}</span>
                    <span>{formatUpdatedTime(post.updatedAt)}</span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-7 text-[var(--text-primary)]">{getPostExcerpt(post)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-tertiary)]">
                    <span>{getAuthorName(post.author)}</span>
                    <span>{post.commentCount} 评论</span>
                  </div>
                </article>
              )) : (
                <p className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                  现在还没有新的讨论，先去详情页看看目录和评论。
                </p>
              )}
            </div>
          </Surface>
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_320px]">
        <Surface as="section" padding="lg" className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">推荐榜</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--text-primary)]">从下一本想读的书开始今天的阅读</h2>
            </div>
            <Link to="/discover" className="hidden md:inline-flex md:items-center md:gap-2 md:text-sm md:font-medium md:text-[var(--text-secondary)]">
              去分类发现
              <MoveRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {rankingShelf.map((novel, index) => (
              <article
                key={novel.id}
                className="grid grid-cols-[28px_72px_minmax(0,1fr)] gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-default)]"
              >
                <div className="pt-1 text-lg font-semibold tracking-tight text-[var(--accent-strong)]">
                  {String(index + 1).padStart(2, '0')}
                </div>
                {getCoverUrl(novel.coverUrl) ? (
                  <img
                    src={getCoverUrl(novel.coverUrl) ?? ''}
                    alt={getDisplayTitle(novel)}
                    className="h-[96px] w-[72px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
                  />
                ) : (
                  <div className="flex h-[96px] w-[72px] items-end rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2">
                    <p className="line-clamp-4 text-[11px] font-medium text-[var(--text-primary)]">{getDisplayTitle(novel)}</p>
                  </div>
                )}
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="line-clamp-1 text-base font-semibold text-[var(--text-primary)]">{getDisplayTitle(novel)}</p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{getAuthorName(novel.author)}</p>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{getNovelSummary(novel.summary)}</p>
                  <div className="flex flex-wrap gap-2">
                    {getSafeTags(novel.tags).slice(0, 2).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Surface>

        <div className="grid gap-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7.5rem)] xl:overflow-y-auto xl:pr-1">
          {continueShelf.length ? (
            <Surface as="section" padding="md" className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">继续在读</p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)]">最近点开的作品</h2>
              </div>
              <div className="space-y-2">
                {continueShelf.map((novel) => (
                  <Link
                    key={novel.id}
                    to={`/novel/${novel.id}`}
                    className="block rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-default)]"
                  >
                    <p className="line-clamp-1 text-sm font-medium text-[var(--text-primary)]">{novel.title}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{novel.summary}</p>
                  </Link>
                ))}
              </div>
            </Surface>
          ) : null}

          <Surface padding="md" className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <Flame className="h-4 w-4 text-[var(--text-secondary)]" />
              热门话题
            </div>
            <div className="flex flex-wrap gap-2">
              {hotTopics.length > 0 ? hotTopics.map((topic) => (
                <Link
                  key={topic.id}
                  to="/discover"
                  className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                >
                  {topic.name}
                </Link>
              )) : (
                <span className="text-sm text-[var(--text-secondary)]">热门话题正在整理中</span>
              )}
            </div>
          </Surface>
        </div>
      </section>
    </div>
  )
}
