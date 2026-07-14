import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Compass, Flame, PenSquare, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import SectionCard from '@/components/ui/SectionCard'
import { createPost, listNovels, listPosts } from '@/features/community/api'
import PostCard from '@/features/community/components/PostCard'
import { communityPrompts } from '@/features/community/constants'
import { formatRelativeTime } from '@/features/community/utils'

const feedModes = [
  { id: 'recommended', label: '推荐' },
  { id: 'latest', label: '最新' },
]

export default function CommunityPage() {
  const queryClient = useQueryClient()
  const [activeTopicId, setActiveTopicId] = useState('all')
  const [activeFeedMode, setActiveFeedMode] = useState('recommended')
  const [composerText, setComposerText] = useState(communityPrompts[0])

  const postsQuery = useQuery({
    queryKey: ['community', 'posts'],
    queryFn: () => listPosts(30),
  })

  const novelsQuery = useQuery({
    queryKey: ['community', 'novels'],
    queryFn: () => listNovels(12),
  })

  const createPostMutation = useMutation({
    mutationFn: createPost,
    onSuccess: async () => {
      setComposerText('')
      await queryClient.invalidateQueries({ queryKey: ['community', 'posts'] })
    },
  })

  const rawPosts = postsQuery.data?.items ?? []
  const rawNovels = novelsQuery.data?.items ?? []

  const topics = useMemo(() => {
    const topicMap = new Map<string, { id: string; name: string; slug: string; postCount: number }>()

    for (const post of rawPosts) {
      if (!post.topic) {
        continue
      }

      const existing = topicMap.get(post.topic.id)
      if (existing) {
        existing.postCount += 1
        continue
      }

      topicMap.set(post.topic.id, {
        ...post.topic,
        postCount: 1,
      })
    }

    return [
      { id: 'all', name: '全部话题', slug: 'all', postCount: rawPosts.length },
      ...Array.from(topicMap.values()),
    ]
  }, [rawPosts])

  const insights = useMemo(
    () => [
      { id: 'insight-1', label: '讨论总数', value: `${postsQuery.data?.pagination.total ?? 0}`, description: '当前社区里可浏览的公开讨论' },
      {
        id: 'insight-2',
        label: '关联作品',
        value: `${rawPosts.filter((post) => post.relatedNovel).length}`,
        description: '直接连接到作品详情的讨论',
      },
      {
        id: 'insight-3',
        label: '最近活跃',
        value: rawPosts[0]?.createdAt ? formatRelativeTime(rawPosts[0].createdAt) : '刚刚',
        description: '最新一条讨论进入社区的时间',
      },
    ],
    [postsQuery.data?.pagination.total, rawPosts],
  )

  const posts = useMemo(() => {
    const filteredItems =
      activeTopicId === 'all' ? rawPosts : rawPosts.filter((item) => item.topic?.id === activeTopicId)

    if (activeFeedMode === 'latest') {
      return [...filteredItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }

    return [...filteredItems].sort(
      (a, b) =>
        b.commentCount + b.likeCount + b.favoriteCount - (a.commentCount + a.likeCount + a.favoriteCount),
    )
  }, [activeFeedMode, activeTopicId, rawPosts])

  const spotlightNovel = useMemo(() => {
    const relatedNovelId = rawPosts.find((post) => post.relatedNovel)?.relatedNovel?.id
    return rawNovels.find((novel) => novel.id === relatedNovelId) ?? rawNovels[0] ?? null
  }, [rawNovels, rawPosts])

  const handleCreatePost = () => {
    const content = composerText.trim()
    if (!content) {
      return
    }

    createPostMutation.mutate({ content })
  }

  const isLoading = postsQuery.isLoading || novelsQuery.isLoading
  const isError = postsQuery.isError || novelsQuery.isError
  const errorMessage =
    (postsQuery.error instanceof Error && postsQuery.error.message) ||
    (novelsQuery.error instanceof Error && novelsQuery.error.message) ||
    '社区内容暂时没有加载出来。'

  return (
    <SectionCard
      eyebrow="社区广场"
      title="像现代内容社区一样承接追更、拆解和作者互动"
      description="手机端保持单列刷流，平板开始分出话题和热度区，桌面端让信息流、话题趋势和作品讨论同时并行。"
    >
      <div className="space-y-6">
        {isLoading ? (
          <AppState
            tone="loading"
            title="社区内容正在整理中"
            description="稍等一下，最新讨论很快就会出现。"
            className="min-h-[360px]"
          />
        ) : null}

        {isError ? (
          <AppState
            tone="error"
            title="社区内容暂时没有打开"
            description={errorMessage}
            primaryAction={{ label: '重新加载', onClick: () => void postsQuery.refetch() }}
            className="min-h-[360px]"
          />
        ) : null}

        {!isLoading && !isError ? (
          <>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_340px]">
          <div className="space-y-4 rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/86">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  <Compass className="h-3.5 w-3.5" />
                  社区在读现场
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                  讨论先围绕内容本身，再把读者自然送去详情、作者页和私聊
                </h3>
                <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                  这里不做老论坛楼层感，而是让话题、作品和作者在同一条浏览路径里轻量连接，适合快速刷流，也适合认真翻评论。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {feedModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setActiveFeedMode(mode.id)}
                    className={[
                      'rounded-full border px-4 py-2 text-sm font-medium transition',
                      activeFeedMode === mode.id
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50',
                    ].join(' ')}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                <PenSquare className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                发起一条新讨论
              </div>
              <textarea
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                rows={4}
                placeholder="把你的观察、追更感受或写作心得发出来。"
                className="mt-4 w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition focus:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-slate-600"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {communityPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setComposerText(prompt)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="primary"
                  onClick={handleCreatePost}
                  disabled={!composerText.trim() || createPostMutation.isPending}
                >
                  {createPostMutation.isPending ? '发布中' : '发布讨论'}
                </Button>
              </div>
            </div>
          </div>

          <aside className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            {insights.map((item) => (
              <div
                key={item.id}
                className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
              </div>
            ))}
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
          <aside className="space-y-3">
            {topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => setActiveTopicId(topic.id)}
                className={[
                  'flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left transition',
                  activeTopicId === topic.id
                    ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                    : 'border-slate-200 bg-white/88 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/86 dark:text-slate-200 dark:hover:border-slate-700',
                ].join(' ')}
              >
                <span>
                  <span className="block text-sm font-medium">{topic.name}</span>
                  <span className="mt-1 block text-xs opacity-70">{topic.postCount} 条讨论</span>
                </span>
              </button>
            ))}
          </aside>

          <div className="space-y-4">
            {posts.length > 0 ? (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <AppState
                tone="empty"
                title="这个话题下还没有新的讨论"
                description="先看看其他话题，或者直接发出你的第一条想法。"
                className="min-h-[260px]"
              />
            )}
          </div>

          <aside className="space-y-4">
            {spotlightNovel ? (
              <div className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                  <Flame className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  关联作品热议
                </div>
                <div className="mt-4 space-y-3">
                  <Link
                    to={`/novel/${spotlightNovel.id}`}
                    className="block rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700"
                  >
                    <img
                      src={spotlightNovel.coverUrl ?? ''}
                      alt={spotlightNovel.title}
                      className="aspect-[16/10] w-full rounded-[18px] border border-slate-200 object-cover dark:border-slate-800"
                    />
                    <p className="mt-3 text-sm font-medium text-slate-950 dark:text-slate-50">{spotlightNovel.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{spotlightNovel.summary}</p>
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                <Sparkles className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                社区节奏
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                <p>先看热议作品，再顺手进入帖子详情和评论区，浏览路径会更自然。</p>
                <p>适合追更、拆解章节节奏，也适合围绕作者和作品形成持续互动。</p>
              </div>
            </div>
          </aside>
        </section>
          </>
        ) : null}
      </div>
    </SectionCard>
  )
}
