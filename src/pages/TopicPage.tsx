import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { PostListSkeleton } from '@/components/ui/Skeleton'
import { listPosts, resolveTopic } from '@/features/community/api'
import PostCard from '@/features/community/components/PostCard'
import { cn } from '@/lib/utils'

const feedModes = [
  { id: 'recommended', label: '热门' },
  { id: 'latest', label: '最新' },
] as const

/**
 * 话题详情页（方案 18 §3.7）：
 * - 正文 #话题 / 推荐话题点进来的落地页
 * - 头部展示话题名与讨论数，热门/最新双 tab（下划线样式）
 * - 帖子流复用社区推荐排序 + 快照式游标无限滚动
 */
export default function TopicPage() {
  const { topicKey = '' } = useParams()
  const navigate = useNavigate()
  const [activeFeedMode, setActiveFeedMode] = useState<(typeof feedModes)[number]['id']>('recommended')

  const topicQuery = useQuery({
    queryKey: ['community', 'topic', topicKey],
    queryFn: () => resolveTopic(topicKey),
    enabled: Boolean(topicKey),
    retry: false,
  })
  const topic = topicQuery.data ?? null

  const postsQuery = useInfiniteQuery({
    queryKey: ['community', 'posts', 'topic-page', topic?.id, activeFeedMode],
    queryFn: ({ pageParam }) =>
      listPosts(30, {
        page: pageParam.page,
        topicId: topic?.id,
        sort: activeFeedMode,
        snapshotAt: pageParam.snapshotAt,
      }),
    initialPageParam: { page: 1 } as { page: number; snapshotAt?: string },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.pagination.hasMore ? { page: allPages.length + 1, snapshotAt: lastPage.snapshotAt } : undefined,
    enabled: Boolean(topic?.id),
  })

  const posts = useMemo(() => postsQuery.data?.pages.flatMap((page) => page.items) ?? [], [postsQuery.data])
  const totalPosts = postsQuery.data?.pages[0]?.pagination.total ?? topic?.postCount ?? 0

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/community')
  }

  if (topicQuery.isLoading) {
    return <PostListSkeleton />
  }

  if (topicQuery.isError || !topic) {
    return (
      <AppState
        tone="empty"
        title="这个话题还没有被创建"
        description="它可能已被移除，或者还没有人用 # 发起过这个话题。"
        primaryAction={{ label: '回社区看看', onClick: () => navigate('/community') }}
        className="min-h-[360px]"
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {/* 话题头部：返回 + 话题名 + 讨论数 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label="返回"
          className="press-feedback inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-[var(--text-primary)]">#{topic.name}</h1>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{totalPosts} 条讨论</p>
        </div>
      </div>

      {/* 热门 / 最新 tab：与作者页一致的下划线样式 */}
      <div className="mt-3 flex border-b border-[var(--border-subtle)]">
        {feedModes.map((mode) => {
          const active = activeFeedMode === mode.id

          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setActiveFeedMode(mode.id)}
              className="press-feedback relative flex-1 px-2 py-3 text-center transition-colors hover:bg-[var(--surface-muted)] sm:flex-none sm:px-6"
            >
              <span
                className={cn(
                  'text-[15px] transition-colors',
                  active ? 'font-bold text-[var(--text-primary)]' : 'font-medium text-[var(--text-tertiary)]',
                )}
              >
                {mode.label}
              </span>
              {active ? (
                <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-14 rounded-full bg-[var(--color-brand)]" />
              ) : null}
            </button>
          )
        })}
      </div>

      {/* 帖子流 */}
      <div className="mt-4">
        {postsQuery.isLoading ? (
          <PostListSkeleton />
        ) : postsQuery.isError ? (
          <AppState
            tone="error"
            title="话题内容暂时没有打开"
            description={postsQuery.error instanceof Error ? postsQuery.error.message : '话题内容暂时没有加载出来。'}
            primaryAction={{ label: '重新加载', onClick: () => void postsQuery.refetch() }}
            className="min-h-[260px]"
          />
        ) : posts.length > 0 ? (
          <>
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            {postsQuery.hasNextPage ? (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  disabled={postsQuery.isFetchingNextPage}
                  onClick={() => void postsQuery.fetchNextPage()}
                  className="press-feedback rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-6 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60"
                >
                  {postsQuery.isFetchingNextPage ? '正在加载…' : '加载更多讨论'}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <AppState
            tone="empty"
            title="这个话题下还没有讨论"
            description={`去社区发一条带 #${topic.name} 的帖子，成为第一个发起讨论的人。`}
            primaryAction={{ label: '去发帖', onClick: () => navigate('/community') }}
            className="min-h-[260px]"
          />
        )}
      </div>
    </div>
  )
}
