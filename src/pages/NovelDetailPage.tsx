import { useQuery } from '@tanstack/react-query'
import { BookOpen, Clock3, Heart, ListOrdered, MessageSquare, MoveRight, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import Empty from '@/components/Empty'
import AppState from '@/components/ui/AppState'
import {
  asArray,
  getAuthorName,
  getCommentBody,
  getCoverUrl,
  getDisplayTitle,
  getNovelDetailPayload,
  getNovelSummary,
  getSafeTags,
  isPublicReadableChapter,
} from '@/features/discover/api'
import { useStartReading } from '@/features/discover/useStartReading'

const numberFormatter = new Intl.NumberFormat('zh-CN')

const formatNumber = (value: number) => numberFormatter.format(value)
const formatWordCount = (value: number) => `${Math.round(value / 10000)} 万字`
const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '暂未更新'

const statusMap = {
  draft: '草稿',
  published: '连载中',
  archived: '已完结',
} as const

export default function NovelDetailPage() {
  const { novelId } = useParams()
  const detailQuery = useQuery({
    queryKey: ['novel-detail', novelId],
    queryFn: () => getNovelDetailPayload(novelId ?? ''),
    enabled: Boolean(novelId),
  })
  const { startReading, isStarting, pendingNovelId } = useStartReading()

  if (!novelId) {
    return (
      <AppState
        tone="error"
        title="这本书暂时没有找到"
        description="换一本继续看看，或者回到发现页重新挑选。"
        primaryAction={{
          label: '去分类发现',
          href: '/discover',
        }}
      />
    )
  }

  if (detailQuery.isLoading) {
    return (
      <AppState
        tone="loading"
        title="正在打开作品详情"
        description="简介、目录和评论正在陆续出现。"
      />
    )
  }

  if (detailQuery.isError) {
    return (
      <AppState
        tone="error"
        title="作品详情暂时没有打开"
        description={detailQuery.error instanceof Error ? detailQuery.error.message : '连接似乎中断了，请稍后再试。'}
        primaryAction={{
          label: detailQuery.isFetching ? '重新连接中...' : '重新连接',
          onClick: () => void detailQuery.refetch(),
        }}
        secondaryAction={{
          label: '回到发现页',
          href: '/discover',
        }}
      />
    )
  }

  const detail = detailQuery.data
  const chapters = asArray(detail.chapters)
  const topComments = asArray(detail.topComments)
  const relatedNovels = asArray(detail.relatedNovels)
  const publishedChapters = [...chapters].filter(isPublicReadableChapter).sort((left, right) => left.orderIndex - right.orderIndex)
  const firstPublishedChapter = publishedChapters[0] ?? null
  const latestPublishedChapter = publishedChapters[publishedChapters.length - 1] ?? null
  const detailTitle = getDisplayTitle(detail.novel)
  const detailSummary = getNovelSummary(detail.novel.summary)
  const detailTags = getSafeTags(detail.novel.tags)
  const detailCoverUrl = getCoverUrl(detail.novel.coverUrl)
  const authorName = getAuthorName(detail.novel.author)

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 lg:p-6 dark:border-slate-800 dark:bg-slate-950/86">
        <div className="grid gap-5 md:grid-cols-[160px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-3">
            {detailCoverUrl ? (
              <img
                src={detailCoverUrl}
                alt={detailTitle}
                className="aspect-[3/4] w-full rounded-[24px] border border-slate-200 object-cover dark:border-slate-800"
              />
            ) : (
              <div className="flex aspect-[3/4] w-full flex-col justify-end rounded-[24px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">{authorName}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">{detailTitle}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">字数</p>
                <p className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{formatWordCount(detail.novel.wordCount)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">章节</p>
                <p className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{detail.novel.chapterCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">收藏</p>
                <p className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{formatNumber(detail.novel.favoriteCount)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                <span>{detail.novel.categoryName}</span>
                <span className="rounded-full border border-slate-200 px-2 py-1 tracking-normal text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {statusMap[detail.novel.status]}
                </span>
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2rem]">
                  {detailTitle}
                </h2>
                <p className="line-clamp-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:line-clamp-none">{detailSummary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {detailTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => startReading(detail.novel.id)}
                disabled={!firstPublishedChapter || (isStarting && pendingNovelId === detail.novel.id)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
              >
                <BookOpen className="h-4 w-4" />
                {!firstPublishedChapter ? '暂未开放阅读' : isStarting && pendingNovelId === detail.novel.id ? '正在打开...' : '开始阅读'}
              </button>
              <a
                href="#novel-comments"
                className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 px-5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50"
              >
                查看评论
              </a>
            </div>

            <div className="grid gap-4 border-t border-slate-200/80 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <UserRound className="h-4 w-4" />
                  作者
                </div>
                <p className="mt-2 font-medium text-slate-950 dark:text-slate-50">{authorName}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatNumber(detail.novel.author.followerCount)} 关注</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Clock3 className="h-4 w-4" />
                  更新
                </div>
                <p className="mt-2 font-medium text-slate-950 dark:text-slate-50">{formatDateTime(detail.novel.lastPublishedAt)}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <MessageSquare className="h-4 w-4" />
                  评论
                </div>
                <p className="mt-2 font-medium text-slate-950 dark:text-slate-50">{formatNumber(detail.novel.commentCount)} 条</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Heart className="h-4 w-4" />
                  热度
                </div>
                <p className="mt-2 font-medium text-slate-950 dark:text-slate-50">{formatNumber(detail.novel.viewCount)} 阅读</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 lg:p-6 dark:border-slate-800 dark:bg-slate-950/86">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
            <ListOrdered className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            章节目录
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">先看已发布章节，未开放内容会自动置灰，避免误入空目录。</p>
          <div className="mt-5 grid gap-3 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:pr-1">
            {chapters.length === 0 ? (
              <Empty
                title="目录还在整理中"
                description="公开章节准备好后，会直接出现在这里。"
              />
            ) : chapters.map((chapter) => {
              const isReadable = isPublicReadableChapter(chapter)

              if (!isReadable) {
                return (
                  <div
                    key={chapter.id}
                    className="flex items-center justify-between gap-4 rounded-[20px] border border-slate-200/70 bg-slate-50/40 px-4 py-4 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{chapter.title}</p>
                      <p className="mt-1 text-xs">待更新</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span>{chapter.orderIndex}</span>
                      <span>未开放</span>
                    </div>
                  </div>
                )
              }

              return (
                <Link
                  key={chapter.id}
                  to={`/novel/${detail.novel.id}/read/${chapter.id}`}
                  className="flex items-center justify-between gap-4 rounded-[20px] border border-slate-200/80 bg-slate-50/70 px-4 py-4 transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-950"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-950 dark:text-slate-50">{chapter.title}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{chapter.wordCount} 字</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{chapter.orderIndex}</span>
                    <MoveRight className="h-4 w-4" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
          <section className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86">
            <p className="text-sm font-medium text-slate-950 dark:text-slate-50">开读信息</p>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              <div className="rounded-[20px] bg-slate-50/80 px-4 py-4 dark:bg-slate-900/70">
                <p className="text-xs text-slate-500 dark:text-slate-400">从这里开始</p>
                <p className="mt-1 font-medium text-slate-950 dark:text-slate-50">{firstPublishedChapter?.title ?? '目录整理中'}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {firstPublishedChapter ? `${firstPublishedChapter.wordCount} 字` : '稍后再来看看'}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200/80 px-4 py-3 dark:border-slate-700">
                最新章节：{latestPublishedChapter?.title ?? detail.novel.lastChapterTitle ?? '暂未更新'}
              </div>
              <div className="rounded-[20px] border border-slate-200/80 px-4 py-3 dark:border-slate-700">
                最近更新时间：{formatDateTime(detail.novel.lastPublishedAt)}
              </div>
            </div>
          </section>

          <section
            id="novel-comments"
            className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
              <MessageSquare className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              评论摘要
            </div>
            {topComments.length === 0 ? (
              <div className="mt-4">
                <Empty
                  title="还没有读者留言"
                  description="等第一批读者看完之后，讨论会在这里慢慢聚起来。"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {topComments.map((comment) => (
                  <article
                    key={comment.id}
                    className="rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{getAuthorName(comment.author)}</span>
                      <span>{comment.likeCount} 赞</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-200">{getCommentBody(comment)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>

      <section className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/86">
        <p className="text-sm font-medium text-slate-950 dark:text-slate-50">相关推荐</p>
        {relatedNovels.length === 0 ? (
          <div className="mt-4">
            <Empty
              title="暂时还没有更多推荐"
              description="把这本先读完，也许下一本很快就会出现。"
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {relatedNovels.map((novel) => (
              <Link
                key={novel.id}
                to={`/novel/${novel.id}`}
                className="grid gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-3 transition hover:border-slate-300 hover:bg-white md:grid-cols-[72px_minmax(0,1fr)] dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-950"
              >
                {getCoverUrl(novel.coverUrl) ? (
                  <img
                    src={getCoverUrl(novel.coverUrl) ?? ''}
                    alt={getDisplayTitle(novel)}
                    className="aspect-[3/4] w-full rounded-2xl border border-slate-200 object-cover dark:border-slate-800"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-end rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <p className="line-clamp-4 text-sm font-medium text-slate-950 dark:text-slate-50">{getDisplayTitle(novel)}</p>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-950 dark:text-slate-50">{getDisplayTitle(novel)}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{getAuthorName(novel.author)}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-6 text-slate-600 dark:text-slate-300">{getNovelSummary(novel.summary)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
