import { useQuery } from '@tanstack/react-query'
import { BookOpen, MapPin, MessageSquareMore, UserPlus2 } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import SectionCard from '@/components/ui/SectionCard'
import { AuthorSkeleton, PostListSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { getDirectConversationByUserId, getMe, getUser, listConversations, listNovels, listPosts } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import PostCard from '@/features/community/components/PostCard'
import { formatRelativeTime } from '@/features/community/utils'
import { getDisplayTitle } from '@/features/discover/api'

export default function AuthorPage() {
  const navigate = useNavigate()
  const { authorId } = useParams()

  const meQuery = useQuery({
    queryKey: ['community', 'me'],
    queryFn: getMe,
  })

  const authorQuery = useQuery({
    queryKey: ['community', 'author', authorId],
    queryFn: () => getUser(authorId ?? ''),
    enabled: Boolean(authorId),
  })

  const novelsQuery = useQuery({
    queryKey: ['community', 'novels', 'author', authorId],
    queryFn: () => listNovels(20, { authorId, publishedOnly: true }),
    enabled: Boolean(authorId),
  })

  const postsQuery = useQuery({
    queryKey: ['community', 'posts', 'author', authorId],
    queryFn: () => listPosts(10, { authorId }),
    enabled: Boolean(authorId),
  })

  const conversationsQuery = useQuery({
    queryKey: ['community', 'conversations'],
    queryFn: () => listConversations(30),
    // 未登录时不请求会话列表，避免无意义的接口开销
    enabled: Boolean(meQuery.data?.user),
  })

  const authorNovels = useMemo(() => {
    const author = authorQuery.data
    if (!author) {
      return []
    }

    return (novelsQuery.data?.items ?? []).filter((novel) => novel.author.id === author.id)
  }, [authorQuery.data, novelsQuery.data?.items])

  const authorPosts = useMemo(() => {
    const author = authorQuery.data
    if (!author) {
      return []
    }

    return (postsQuery.data?.items ?? []).filter((post) => post.author.id === author.id)
  }, [authorQuery.data, postsQuery.data?.items])

  const isOwnProfile = Boolean(authorQuery.data && meQuery.data?.user && authorQuery.data.id === meQuery.data.user.id)
  const directConversation = useMemo(
    () => getDirectConversationByUserId(conversationsQuery.data?.items ?? [], authorQuery.data?.id),
    [authorQuery.data?.id, conversationsQuery.data?.items],
  )
  const latestActivityTime = authorPosts[0]?.createdAt ?? authorNovels[0]?.updatedAt ?? null

  if (!authorId) {
    return (
      <SectionCard eyebrow="作者主页" title="这位作者暂时没有找到">
        <AppState
          tone="empty"
          title="回到社区继续逛逛"
          description="你可以先去社区广场或作品详情里继续寻找感兴趣的作者。"
          primaryAction={{ label: '返回社区', href: '/community' }}
          className="min-h-[360px]"
        />
      </SectionCard>
    )
  }

  if (authorQuery.isLoading) {
    return (
      <SectionCard
        eyebrow="作者主页"
        title="先展示作者气质、代表作和最近互动，再把读者送进作品与私聊"
        description="作者页不做后台式资料陈列，而是把首屏做成可信的创作者介绍，桌面端并置作品和动态，手机端优先关注与开读。"
      >
        <AuthorSkeleton />
      </SectionCard>
    )
  }

  if (authorQuery.isError || !authorQuery.data) {
    return (
      <SectionCard
        eyebrow="作者主页"
        title="先展示作者气质、代表作和最近互动，再把读者送进作品与私聊"
        description="作者页不做后台式资料陈列，而是把首屏做成可信的创作者介绍，桌面端并置作品和动态，手机端优先关注与开读。"
      >
        <AppState
          tone="error"
          title="作者主页暂时没有打开"
          description={authorQuery.error instanceof Error ? authorQuery.error.message : '请稍后再试。'}
          primaryAction={{ label: '重新加载', onClick: () => void authorQuery.refetch() }}
          secondaryAction={{ label: '返回社区', href: '/community' }}
          className="min-h-[420px]"
        />
      </SectionCard>
    )
  }

  const author = authorQuery.data

  return (
    <SectionCard
      eyebrow="作者主页"
      title="先展示作者气质、代表作和最近互动，再把读者送进作品与私聊"
      description="作者页不做后台式资料陈列，而是把首屏做成可信的创作者介绍，桌面端并置作品和动态，手机端优先关注与开读。"
    >
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px]">
          <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <Avatar name={author.nickname} src={author.avatarUrl} size="lg" />
                <div className="space-y-3">
                  <div>
                    <h3 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                      {author.nickname}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                      {author.bio || '这位作者还没有留下简介。'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
                    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-3 py-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {author.isAuthor ? '作者身份已开启' : '读者身份'}
                    </span>
                    <span className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-3 py-1">
                      {author.createdAt ? `${formatRelativeTime(author.createdAt)} 加入` : '最近加入'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {isOwnProfile ? (
                  <>
                    <Button variant="primary" onClick={() => navigate('/studio')}>
                      继续创作
                    </Button>
                    <Button variant="secondary" onClick={() => navigate('/messages')}>
                      查看消息
                    </Button>
                  </>
                ) : null}
                {!isOwnProfile && directConversation ? (
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/messages?conversationId=${directConversation.id}`)}
                  >
                    <UserPlus2 className="h-4 w-4" />
                    发起私聊
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <p className="text-xs text-[var(--text-tertiary)]">粉丝</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{author.followerCount}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <p className="text-xs text-[var(--text-tertiary)]">已发布作品</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{authorNovels.length}</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
                <p className="text-xs text-[var(--text-tertiary)]">最近活跃</p>
                <p className="mt-2 text-sm leading-7 text-[var(--text-primary)]">
                  {latestActivityTime ? formatRelativeTime(latestActivityTime) : '最近还没有公开动态'}
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <MessageSquareMore className="h-4 w-4 text-[var(--text-tertiary)]" />
              作者近况
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--text-secondary)]">
              <p>公开作品 {authorNovels.length} 部，公开讨论 {authorPosts.length} 条。</p>
              <p>{latestActivityTime ? `最近一次公开更新在 ${formatRelativeTime(latestActivityTime)}。` : '最近还没有公开更新。'}</p>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <BookOpen className="h-4 w-4 text-[var(--text-tertiary)]" />
              代表作品
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {novelsQuery.isLoading ? (
                <>
                  <Skeleton className="aspect-[4/5] w-full rounded-[var(--radius-xl)]" />
                  <Skeleton className="aspect-[4/5] w-full rounded-[var(--radius-xl)]" />
                </>
              ) : authorNovels.length > 0 ? (
                authorNovels.map((novel) => (
                <Link
                  key={novel.id}
                  to={`/novel/${novel.id}`}
                  className="hover-lift rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--border-strong)]"
                >
                  <img
                    src={novel.coverUrl ?? ''}
                    alt={getDisplayTitle(novel)}
                    className="aspect-[4/5] w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] object-cover"
                  />
                  <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{getDisplayTitle(novel)}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{novel.summary}</p>
                </Link>
                ))
              ) : (
                <AppState
                  tone="empty"
                  title="这位作者还没有公开作品"
                  description="先去社区看看这位作者最近在聊什么。"
                  className="md:col-span-2 min-h-[260px]"
                />
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <MessageSquareMore className="h-4 w-4 text-[var(--text-tertiary)]" />
              最近讨论
            </div>
            {postsQuery.isLoading ? (
              <PostListSkeleton count={2} />
            ) : authorPosts.length > 0 ? (
              authorPosts.map((post) => <PostCard key={post.id} post={post} compact />)
            ) : (
              <AppState
                tone="empty"
                title="这位作者还没有公开讨论"
                description="等作者开始发帖后，这里会更新最近的互动内容。"
                className="min-h-[260px]"
              />
            )}
          </aside>
        </section>
      </div>
    </SectionCard>
  )
}
