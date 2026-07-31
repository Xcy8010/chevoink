import { useQuery } from '@tanstack/react-query'
import { Heart, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { PostListSkeleton } from '@/components/ui/Skeleton'
import { listUserBookmarkedPosts, listUserLikedPosts, listUserReplies } from '@/features/community/api'
import PostCard from '@/features/community/components/PostCard'
import { formatRelativeTime } from '@/features/community/utils'
import type { UserReplyItem } from '../../../../shared/contracts'

/**
 * 「喜欢」「已回复」内容面板：个人中心与作者主页共用。
 * 后端按隐私设置返回 restricted 标记时展示占位，不抛错误。
 */

function RestrictedState({ label }: { label: string }) {
  return (
    <AppState
      tone="empty"
      title={`${label}未公开`}
      description="对方设置了隐私权限，这部分内容暂时不可见。"
      className="min-h-[240px] border-0 shadow-none"
    />
  )
}

export function LikedPostsPanel({ userId, isSelf = false }: { userId: string; isSelf?: boolean }) {
  const query = useQuery({
    queryKey: ['community', 'liked-posts', userId],
    queryFn: () => listUserLikedPosts(userId),
    enabled: Boolean(userId),
  })

  if (query.isLoading) {
    return (
      <div className="pt-3">
        <PostListSkeleton count={2} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <AppState
        tone="error"
        title="喜欢列表暂时没有打开"
        description={query.error instanceof Error ? query.error.message : '请稍后再试。'}
        primaryAction={{ label: '重新加载', onClick: () => void query.refetch() }}
        className="min-h-[240px] border-0 shadow-none"
      />
    )
  }

  if (query.data?.restricted) {
    return <RestrictedState label="喜欢列表" />
  }

  const items = query.data?.items ?? []

  if (items.length === 0) {
    return (
      <AppState
        tone="empty"
        title={isSelf ? '你还没有喜欢的内容' : 'TA 还没有喜欢的内容'}
        description={
          isSelf ? '在社区里给打动你的帖子点个赞，它们会被收进这里。' : '等 TA 开始点赞后，这里会展示喜欢过的帖子。'
        }
        className="min-h-[240px] border-0 shadow-none"
      />
    )
  }

  return (
    <div className="space-y-3 pt-3">
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

/** 收藏的帖子面板：个人中心收藏页的「帖子」子栏，仅本人可见 */
export function BookmarkedPostsPanel({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ['community', 'bookmarked-posts', userId],
    queryFn: () => listUserBookmarkedPosts(userId),
    enabled: Boolean(userId),
  })

  if (query.isLoading) {
    return (
      <div className="pt-3">
        <PostListSkeleton count={2} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <AppState
        tone="error"
        title="收藏的帖子暂时没有打开"
        description={query.error instanceof Error ? query.error.message : '请稍后再试。'}
        primaryAction={{ label: '重新加载', onClick: () => void query.refetch() }}
        className="min-h-[240px] border-0 shadow-none"
      />
    )
  }

  if (query.data?.restricted) {
    return <RestrictedState label="收藏列表" />
  }

  const items = query.data?.items ?? []

  if (items.length === 0) {
    return (
      <AppState
        tone="empty"
        title="你还没有收藏帖子"
        description="在社区里点亮帖子下方的星标，它们会被收进这里。"
        className="min-h-[240px] border-0 shadow-none"
      />
    )
  }

  return (
    <div className="space-y-3 pt-3">
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

/** 单条回复的动作描述：按评论目标类型区分帖子 / 作品 / 章节 */
function replyActionLabel(item: UserReplyItem) {
  if (item.targetType === 'post') {
    return '回复了帖子'
  }
  if (item.targetType === 'chapter') {
    return '评论了章节'
  }
  return '评价了作品'
}

function replyTargetLabel(item: UserReplyItem) {
  if (item.targetType === 'post') {
    return item.targetExcerpt ?? null
  }

  const novelTitle = item.novelTitle ? `《${item.novelTitle}》` : null
  if (item.targetType === 'chapter') {
    return [novelTitle, item.chapterTitle].filter(Boolean).join(' · ') || null
  }
  return novelTitle
}

export function RepliesPanel({ userId, isSelf = false }: { userId: string; isSelf?: boolean }) {
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['community', 'user-replies', userId],
    queryFn: () => listUserReplies(userId),
    enabled: Boolean(userId),
  })

  if (query.isLoading) {
    return (
      <div className="pt-3">
        <PostListSkeleton count={2} />
      </div>
    )
  }

  if (query.isError) {
    return (
      <AppState
        tone="error"
        title="已回复列表暂时没有打开"
        description={query.error instanceof Error ? query.error.message : '请稍后再试。'}
        primaryAction={{ label: '重新加载', onClick: () => void query.refetch() }}
        className="min-h-[240px] border-0 shadow-none"
      />
    )
  }

  if (query.data?.restricted) {
    return <RestrictedState label="已回复列表" />
  }

  const items = query.data?.items ?? []

  if (items.length === 0) {
    return (
      <AppState
        tone="empty"
        title={isSelf ? '你还没有回复过内容' : 'TA 还没有回复过内容'}
        description={
          isSelf
            ? '去帖子或作品下面留下你的第一条评论，它们会被收进这里。'
            : '等 TA 开始参与讨论后，这里会展示发出的评论。'
        }
        className="min-h-[240px] border-0 shadow-none"
      />
    )
  }

  function openReplyTarget(item: UserReplyItem) {
    if (item.targetType === 'post' && item.postId) {
      navigate(`/post/${item.postId}`)
      return
    }
    if (item.novelId) {
      navigate(`/novel/${item.novelId}`)
    }
  }

  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      {items.map((item) => {
        const targetLabel = replyTargetLabel(item)

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => openReplyTarget(item)}
            className="block w-full px-1 py-3.5 text-left transition-colors hover:bg-[var(--surface-muted)] sm:rounded-[var(--radius-lg)] sm:px-2"
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-tertiary)]">
              <span>{replyActionLabel(item)}</span>
              {item.targetType !== 'post' && targetLabel ? (
                <span className="truncate font-medium text-[var(--text-secondary)]">{targetLabel}</span>
              ) : null}
              {typeof item.rating === 'number' && item.rating > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-[var(--color-brand)]">
                  <Star className="h-3 w-3 fill-current" />
                  {item.rating}
                </span>
              ) : null}
              <span>·</span>
              <span>{formatRelativeTime(item.createdAt)}</span>
            </p>

            {item.targetType === 'post' && targetLabel ? (
              <p className="mt-1.5 line-clamp-1 border-l-2 border-[var(--border-subtle)] pl-2.5 text-xs leading-5 text-[var(--text-tertiary)]">
                {targetLabel}
              </p>
            ) : null}

            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">
              {item.content}
            </p>

            {item.likeCount > 0 ? (
              <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                <Heart
                  className={
                    item.likedByViewer
                      ? 'h-3.5 w-3.5 fill-[var(--color-brand)] text-[var(--color-brand)]'
                      : 'h-3.5 w-3.5'
                  }
                />
                {item.likeCount}
              </p>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
