import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Flame } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useDevice } from '@/components/layout/device-context'
import AppState from '@/components/ui/AppState'
import { PostListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/toast-context'
import { createPost, listPosts, listTopics } from '@/features/community/api'
import PostCard from '@/features/community/components/PostCard'
import PostComposer from '@/features/community/components/PostComposer'
import TopicChannelBar, { type CommunityTopic } from '@/features/community/components/TopicChannelBar'
import { readShareDraftFromState, type CommunityShareDraft } from '@/features/community/share'
import { formatRelativeTime } from '@/features/community/utils'
import { cn } from '@/lib/utils'

const feedModes = [
  { id: 'recommended', label: '推荐' },
  { id: 'latest', label: '最新' },
] as const

/**
 * 社区页（方案 2.5.4 / 8.2）：
 * - 手机：横滑话题频道 + 发帖入口 + 单列帖子流，发帖为全屏编辑页
 * - 平板：左侧话题列表 200px + 双列帖子流
 * - 电脑：左话题 + 中单列(max 640px) + 右热门话题/社区数据三栏
 */
export default function CommunityPage() {
  const { isMobile, isTablet } = useDevice()
  const queryClient = useQueryClient()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTopicId, setActiveTopicId] = useState('all')
  const [activeFeedMode, setActiveFeedMode] = useState<(typeof feedModes)[number]['id']>('recommended')
  // 从作品页/作者页带入的分享草稿：捕获后立即清掉 history state，避免刷新/返回重复弹出
  const [shareDraft, setShareDraft] = useState<CommunityShareDraft | null>(() =>
    readShareDraftFromState(location.state),
  )

  useEffect(() => {
    const draft = readShareDraftFromState(location.state)
    if (draft) {
      setShareDraft(draft)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  // 话题筛选走后端 topicId 过滤 + hasMore 翻页（方案 6.2）；
  // 排序服务端化（方案 18 §1）：推荐流用快照式游标，同一轮浏览榜单冻结不跳位，刷新重算
  const postsQuery = useInfiniteQuery({
    queryKey: ['community', 'posts', activeTopicId, activeFeedMode],
    queryFn: ({ pageParam }) =>
      listPosts(30, {
        page: pageParam.page,
        topicId: activeTopicId === 'all' ? undefined : activeTopicId,
        sort: activeFeedMode,
        snapshotAt: pageParam.snapshotAt,
      }),
    initialPageParam: { page: 1 } as { page: number; snapshotAt?: string },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.pagination.hasMore ? { page: allPages.length + 1, snapshotAt: lastPage.snapshotAt } : undefined,
  })

  const topicsQuery = useQuery({
    queryKey: ['community', 'topics'],
    queryFn: listTopics,
  })

  const createPostMutation = useMutation({
    mutationFn: createPost,
    onSuccess: async () => {
      toast.success('发布成功，你的讨论已上线')
      setShareDraft(null)
      // 发帖后切到「最新」并回顶：自己的新帖立刻可见，推荐流不做假置顶（方案 18 §1.4）
      setActiveFeedMode('latest')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      await queryClient.invalidateQueries({ queryKey: ['community', 'posts'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '发布失败，请稍后再试')
    },
  })

  const rawPosts = useMemo(() => postsQuery.data?.pages.flatMap((page) => page.items) ?? [], [postsQuery.data])

  // 「全部」计数必须用未过滤口径：帖子流查询带 topicId 筛选，复用它的 pagination.total
  // 会导致切到别的频道后「全部」变成筛选后的条数。这里独立发一次不带筛选的轻量请求只取 total；
  // queryKey 以 ['community','posts'] 开头，发帖/删帖等现有 invalidate 会顺带刷新它
  const allTotalQuery = useQuery({
    queryKey: ['community', 'posts', 'all-total'],
    queryFn: () => listPosts(1, { page: 1, sort: 'latest' }),
    staleTime: 60_000,
  })
  const totalPosts =
    allTotalQuery.data?.pagination.total ?? postsQuery.data?.pages[0]?.pagination.total ?? rawPosts.length

  const topics = useMemo<CommunityTopic[]>(() => {
    const items = topicsQuery.data?.items ?? []

    return [
      // 「全部」用未过滤的帖子总数（allTotalQuery），不随当前频道筛选跳动
      { id: 'all', name: '全部', slug: 'all', postCount: totalPosts },
      ...items.map((topic) => ({ id: topic.id, name: topic.name, slug: topic.slug, postCount: topic.postCount })),
    ]
  }, [topicsQuery.data, totalPosts])

  const hotTopics = useMemo(
    () => topics.filter((topic) => topic.id !== 'all').sort((a, b) => b.postCount - a.postCount).slice(0, 5),
    [topics],
  )

  // 排序已全部服务端化，前端直接按服务端顺序展示，不再二次重排
  const posts = rawPosts

  const communityStats = useMemo(
    () => [
      { id: 'total', label: '讨论总数', value: `${totalPosts}` },
      { id: 'linked', label: '关联作品', value: `${rawPosts.filter((post) => post.relatedNovel).length}` },
      {
        id: 'recent',
        label: '最近活跃',
        value: rawPosts[0]?.createdAt ? formatRelativeTime(rawPosts[0].createdAt) : '刚刚',
      },
    ],
    [totalPosts, rawPosts],
  )

  if (postsQuery.isLoading) {
    return <PostListSkeleton />
  }

  if (postsQuery.isError) {
    return (
      <AppState
        tone="error"
        title="社区内容暂时没有打开"
        description={postsQuery.error instanceof Error ? postsQuery.error.message : '社区内容暂时没有加载出来。'}
        primaryAction={{ label: '重新加载', onClick: () => void postsQuery.refetch() }}
        className="min-h-[360px]"
      />
    )
  }

  const sortTabs = (
    <div className="inline-flex rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1">
      {feedModes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => setActiveFeedMode(mode.id)}
          className={cn(
            'press-feedback rounded-[var(--radius-pill)] px-4 py-1.5 text-sm transition-colors',
            activeFeedMode === mode.id
              ? 'bg-[var(--color-brand)] font-medium text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )

  const loadMoreButton = postsQuery.hasNextPage ? (
    <div className="flex justify-center pt-1">
      <button
        type="button"
        disabled={postsQuery.isFetchingNextPage}
        onClick={() => void postsQuery.fetchNextPage()}
        className="press-feedback rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-6 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60"
      >
        {postsQuery.isFetchingNextPage ? '正在加载…' : '加载更多讨论'}
      </button>
    </div>
  ) : null

  const postFeed = (twoColumns = false) =>
    posts.length > 0 ? (
      <>
        <div className={cn(twoColumns ? 'grid grid-cols-2 items-start gap-4' : 'space-y-4')}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        {loadMoreButton}
      </>
    ) : (
      <AppState
        tone="empty"
        title="这个话题下还没有新的讨论"
        description="先看看其他话题，或者直接发出你的第一条想法。"
        className="min-h-[260px]"
      />
    )

  const composer = (
    <PostComposer
      isSubmitting={createPostMutation.isPending}
      initialShare={shareDraft}
      onSubmit={(payload) => createPostMutation.mutate(payload)}
    />
  )

  // 手机端：横滑频道 + 发帖入口 + 单列流
  if (isMobile) {
    return (
      <div className="space-y-4">
        <TopicChannelBar topics={topics} activeTopicId={activeTopicId} onChange={setActiveTopicId} variant="rail" />
        {composer}
        <div className="flex items-center justify-between">
          {sortTabs}
          <span className="text-xs text-[var(--text-tertiary)]">{posts.length} 条讨论</span>
        </div>
        {postFeed()}
      </div>
    )
  }

  // 平板端：左话题 200px + 右双列帖子流
  if (isTablet) {
    return (
      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-5">
        <aside className="sticky top-24 self-start rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2 shadow-[var(--shadow-card)]">
          <p className="px-3 pb-2 pt-2 text-xs font-medium text-[var(--text-tertiary)]">话题频道</p>
          <TopicChannelBar topics={topics} activeTopicId={activeTopicId} onChange={setActiveTopicId} variant="sidebar" />
        </aside>
        <div className="space-y-4">
          {composer}
          <div className="flex items-center justify-between">
            {sortTabs}
            <span className="text-xs text-[var(--text-tertiary)]">{posts.length} 条讨论</span>
          </div>
          {postFeed(true)}
        </div>
      </div>
    )
  }

  // 电脑端：左话题 + 中单列(640px) + 右推荐面板
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)_300px] gap-6">
      <aside className="sticky top-24 self-start rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2 shadow-[var(--shadow-card)]">
        <p className="px-3 pb-2 pt-2 text-xs font-medium text-[var(--text-tertiary)]">话题频道</p>
        <TopicChannelBar topics={topics} activeTopicId={activeTopicId} onChange={setActiveTopicId} variant="sidebar" />
      </aside>

      <div className="mx-auto w-full max-w-[640px] space-y-4">
        {composer}
        <div className="flex items-center justify-between">
          {sortTabs}
          <span className="text-xs text-[var(--text-tertiary)]">{posts.length} 条讨论</span>
        </div>
        {postFeed()}
      </div>

      <aside className="sticky top-24 space-y-4 self-start">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Flame className="h-4 w-4 text-[var(--color-brand)]" />
            热门话题 Top 5
          </div>
          <div className="mt-3 space-y-1">
            {hotTopics.length > 0 ? (
              hotTopics.map((topic, index) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setActiveTopicId(topic.id)}
                  className={cn(
                    'press-feedback flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm transition-colors',
                    activeTopicId === topic.id
                      ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]',
                  )}
                >
                  <span
                    className={cn(
                      'w-4 text-center text-xs font-semibold',
                      index < 3 ? 'text-[var(--color-brand)]' : 'text-[var(--text-tertiary)]',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 line-clamp-1">{topic.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{topic.postCount}</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-[var(--text-tertiary)]">话题正在聚集中。</p>
            )}
          </div>
        </section>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <BarChart3 className="h-4 w-4 text-[var(--color-brand)]" />
            社区数据
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {communityStats.map((item) => (
              <div key={item.id} className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-2 py-3 text-center">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.value}</p>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{item.label}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  )
}
