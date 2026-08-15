import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, MessageSquareMore } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { PostDetailSkeleton } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import { createComment, getPostDetail, listPosts } from '@/features/community/api'
import { formatCompactCount, formatRelativeTime } from '@/features/community/utils'
import CommentList from '@/features/community/components/CommentList'
import PostCard from '@/features/community/components/PostCard'

/**
 * 帖子详情页：正文平铺为页面主体，评论线程与输入框保持单层结构，
 * 桌面端右侧挂一列扁平的相关讨论，不做卡片套卡片。
 */
export default function PostDetailPage() {
  const queryClient = useQueryClient()
  const { postId } = useParams()
  const [draftComment, setDraftComment] = useState('')

  const detailQuery = useQuery({
    queryKey: ['community', 'post-detail', postId],
    queryFn: () => getPostDetail(postId ?? ''),
    enabled: Boolean(postId),
  })

  const postsQuery = useQuery({
    queryKey: ['community', 'posts'],
    queryFn: () => listPosts(30),
  })

  const createCommentMutation = useMutation({
    mutationFn: createComment,
    onSuccess: async () => {
      setDraftComment('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'post-detail', postId] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'posts'] }),
      ])
    },
  })

  const relatedPosts = useMemo(() => {
    const currentPost = detailQuery.data?.post
    if (!currentPost) {
      return []
    }

    const allPosts = postsQuery.data?.items ?? []

    return allPosts
      .filter((post) => post.id !== currentPost.id)
      .sort((left, right) => {
        const leftScore =
          (left.topic?.id === currentPost.topic?.id ? 1000 : 0) + left.commentCount + left.likeCount
        const rightScore =
          (right.topic?.id === currentPost.topic?.id ? 1000 : 0) + right.commentCount + right.likeCount

        return rightScore - leftScore
      })
      .slice(0, 4)
  }, [detailQuery.data?.post, postsQuery.data?.items])

  const handleCreateComment = () => {
    const content = draftComment.trim()
    if (!postId || !content) {
      return
    }

    createCommentMutation.mutate({
      targetType: 'post',
      targetId: postId,
      content,
    })
  }

  if (!postId) {
    return (
      <AppState
        tone="empty"
        title="这条讨论暂时没有找到"
        description="回到社区广场，挑一条你感兴趣的话题继续浏览。"
        primaryAction={{ label: '返回社区', href: '/community' }}
        className="min-h-[360px]"
      />
    )
  }

  if (detailQuery.isLoading) {
    return <PostDetailSkeleton />
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <AppState
        tone="error"
        title="这条讨论暂时没有打开"
        description={detailQuery.error instanceof Error ? detailQuery.error.message : '请稍后再试。'}
        primaryAction={{ label: '重新加载', onClick: () => void detailQuery.refetch() }}
        secondaryAction={{ label: '返回社区', href: '/community' }}
        className="min-h-[420px]"
      />
    )
  }

  const comments = detailQuery.data.comments

  return (
    <div className="animate-fade-in-up mx-auto w-full max-w-[720px] xl:mx-0 xl:max-w-none">
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* 主内容列：返回入口 + 帖子正文 + 评论线程，全部平铺 */}
        <div className="min-w-0">
          <Link
            to="/community"
            className="press-feedback -ml-1 inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-1.5 py-1 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ChevronLeft className="h-4 w-4" />
            返回社区
          </Link>

          <div className="mt-3">
            <PostCard post={detailQuery.data.post} flat />
          </div>

          <section className="mt-8 border-t border-[var(--border-subtle)] pt-6" aria-label="评论线程">
            <h2 className="flex items-baseline gap-2 text-base font-bold tracking-tight text-[var(--text-primary)]">
              <MessageSquareMore className="h-4 w-4 self-center text-[var(--text-tertiary)]" />
              评论
              <span className="text-sm font-normal tabular-nums text-[var(--text-tertiary)]">
                {formatCompactCount(comments.length)}
              </span>
            </h2>

            {/* 输入区：单层轻量输入框，聚焦时描边提亮（仅桌面；手机端改用底部评论栏） */}
            <div className="mt-4 hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 transition-colors focus-within:border-[var(--color-brand)] focus-within:bg-[var(--surface-default)] xl:block">
              <textarea
                value={draftComment}
                onChange={(event) => setDraftComment(event.target.value)}
                rows={3}
                placeholder="写下你的想法，让讨论继续展开。"
                className="w-full resize-none bg-transparent px-4 pt-3 text-sm leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <div className="flex items-center justify-end px-3 pb-3">
                <Button
                  variant="primary"
                  onClick={handleCreateComment}
                  disabled={!draftComment.trim() || createCommentMutation.isPending}
                >
                  {createCommentMutation.isPending ? '发布中' : '发表评论'}
                </Button>
              </div>
            </div>

            <div className="mt-5">
              {comments.length > 0 ? (
                <CommentList
                  comments={comments}
                  onReplied={() => {
                    void queryClient.invalidateQueries({ queryKey: ['community', 'post-detail', postId] })
                  }}
                />
              ) : (
                <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">
                  评论区还很安静，先留下你的看法吧。
                </p>
              )}
            </div>
          </section>
        </div>

        {/* 相关讨论：仅桌面展示，扁平分隔列表，跟随右侧黏滞 */}
        <aside className="hidden xl:block">
          <div className="sticky top-[calc(var(--app-header-height,132px)+12px)]">
            <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)]">相关讨论</h2>
            {relatedPosts.length > 0 ? (
              <div className="mt-2 divide-y divide-[var(--border-subtle)]">
                {relatedPosts.map((post) => (
                  <Link key={post.id} to={`/post/${post.id}`} className="group block py-3">
                    <p className="line-clamp-2 text-sm leading-6 text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                      {post.excerpt}
                    </p>
                    <p className="mt-1.5 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                      <span className="truncate">{post.author.nickname}</span>
                      <span className="shrink-0">{formatCompactCount(post.commentCount)} 评论</span>
                      <span className="ml-auto shrink-0">{formatRelativeTime(post.createdAt)}</span>
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-tertiary)]">
                暂时没有更多相关讨论，去社区看看其他话题吧。
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* 手机端评论栏：与评论列表拆成两个区域，sticky 贴住滚动容器底部——
          键盘弹起时容器随视口收缩，评论栏整体被顶到键盘上方（与聊天页同一布局机制，
          不依赖任何滚动 JS）；键盘收起时避开底部导航悬浮在列表上方 */}
      <div className="post-composer-bar sticky z-20 mt-4 border-t border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 px-4 pb-[calc(10px+var(--safe-bottom))] pt-3 backdrop-blur xl:hidden">
        <div className="flex items-end gap-2">
          <textarea
            value={draftComment}
            onChange={(event) => setDraftComment(event.target.value)}
            rows={2}
            placeholder="写下你的想法，让讨论继续展开。"
            className="min-h-0 flex-1 resize-none rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 px-3 py-2 text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-brand)] focus:bg-[var(--surface-default)]"
          />
          <Button
            variant="primary"
            onClick={handleCreateComment}
            disabled={!draftComment.trim() || createCommentMutation.isPending}
          >
            {createCommentMutation.isPending ? '发布中' : '发表评论'}
          </Button>
        </div>
      </div>
    </div>
  )
}
