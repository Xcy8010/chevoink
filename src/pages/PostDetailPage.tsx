import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquareMore, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import SectionCard from '@/components/ui/SectionCard'
import { createComment, getPostDetail, listPosts } from '@/features/community/api'
import CommentList from '@/features/community/components/CommentList'
import PostCard from '@/features/community/components/PostCard'

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
      .slice(0, 2)
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
      <SectionCard eyebrow="帖子详情" title="这条讨论暂时没有找到">
        <AppState
          tone="empty"
          title="换一条讨论继续看"
          description="回到社区广场，挑一条你感兴趣的话题继续浏览。"
          primaryAction={{ label: '返回社区', href: '/community' }}
          className="min-h-[360px]"
        />
      </SectionCard>
    )
  }

  if (detailQuery.isLoading) {
    return (
      <SectionCard
        eyebrow="帖子详情"
        title="把正文、评论线程和关联作品压进同一条阅读路径"
        description="帖子详情优先完整阅读体验，再给出评论和关联作品，不把页面做成论坛树形结构或过重的运营位。"
      >
        <AppState
          tone="loading"
          title="这条讨论正在打开"
          description="稍等一下，正文和评论很快就会出现。"
          className="min-h-[420px]"
        />
      </SectionCard>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <SectionCard
        eyebrow="帖子详情"
        title="把正文、评论线程和关联作品压进同一条阅读路径"
        description="帖子详情优先完整阅读体验，再给出评论和关联作品，不把页面做成论坛树形结构或过重的运营位。"
      >
        <AppState
          tone="error"
          title="这条讨论暂时没有打开"
          description={detailQuery.error instanceof Error ? detailQuery.error.message : '请稍后再试。'}
          primaryAction={{ label: '重新加载', onClick: () => void detailQuery.refetch() }}
          secondaryAction={{ label: '返回社区', href: '/community' }}
          className="min-h-[420px]"
        />
      </SectionCard>
    )
  }

  return (
    <SectionCard
      eyebrow="帖子详情"
      title="把正文、评论线程和关联作品压进同一条阅读路径"
      description="帖子详情优先完整阅读体验，再给出评论和关联作品，不把页面做成论坛树形结构或过重的运营位。"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_340px]">
        <div className="space-y-4">
          <PostCard post={detailQuery.data.post} />

          <section className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/86">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
              <MessageSquareMore className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              评论线程
            </div>
            <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <textarea
                value={draftComment}
                onChange={(event) => setDraftComment(event.target.value)}
                rows={3}
                placeholder="写下你的想法，让讨论继续展开。"
                className="w-full resize-none bg-transparent text-sm leading-7 text-slate-700 outline-none dark:text-slate-200"
              />
              <div className="mt-3 flex items-center justify-end gap-3">
                <Button
                  variant="primary"
                  onClick={handleCreateComment}
                  disabled={!draftComment.trim() || createCommentMutation.isPending}
                >
                  {createCommentMutation.isPending ? '发布中' : '发表评论'}
                </Button>
              </div>
            </div>

            <div className="mt-4">
              {detailQuery.data.comments.length > 0 ? (
                <CommentList comments={detailQuery.data.comments} />
              ) : (
                <AppState
                  tone="empty"
                  title="评论区还很安静"
                  description="先留下你的看法，让这条讨论继续展开。"
                  className="min-h-[260px]"
                />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
              <Sparkles className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              同主题延伸
            </div>
            <div className="mt-4 space-y-3">
              {relatedPosts.length > 0 ? (
                relatedPosts.map((post) => <PostCard key={post.id} post={post} compact />)
              ) : (
                <AppState
                  tone="empty"
                  title="暂时没有更多相关讨论"
                  description="回到社区广场，继续看看其他人正在聊什么。"
                  className="min-h-[220px]"
                />
              )}
            </div>
          </section>
        </aside>
      </div>
    </SectionCard>
  )
}
