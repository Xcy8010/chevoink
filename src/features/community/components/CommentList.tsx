import { Heart, MessageSquareMore } from 'lucide-react'
import { useState } from 'react'

import type { Comment } from '../../../../shared/contracts/index.js'
import { useToast } from '@/components/ui/Toast'
import { createComment, setCommentLike } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import { formatCompactCount, formatRelativeTime } from '@/features/community/utils'
import { cn } from '@/lib/utils'

type CommentListProps = {
  comments: Comment[]
  /** 回复成功后的回调（供上层刷新评论列表） */
  onReplied?: () => void
}

export default function CommentList({ comments, onReplied }: CommentListProps) {
  const toast = useToast()
  // 点赞乐观状态：key=commentId，未记录时以服务端 likedByViewer 为准
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [isReplying, setIsReplying] = useState(false)

  const handleToggleLike = (comment: Comment) => {
    const current = likedMap[comment.id] ?? Boolean(comment.likedByViewer)
    const next = !current
    setLikedMap((prev) => ({ ...prev, [comment.id]: next }))
    setCommentLike(comment.id, next).catch((error) => {
      setLikedMap((prev) => ({ ...prev, [comment.id]: current }))
      toast.error(error instanceof Error ? error.message : '操作失败，请稍后再试')
    })
  }

  const handleToggleReply = (comment: Comment) => {
    setReplyTargetId((prev) => (prev === comment.id ? null : comment.id))
    setReplyDraft('')
  }

  const handleSubmitReply = async (comment: Comment) => {
    const content = replyDraft.trim()
    if (!content || isReplying) return

    setIsReplying(true)
    try {
      await createComment({
        targetType: comment.targetType,
        targetId: comment.targetId,
        parentId: comment.id,
        content,
      })
      setReplyTargetId(null)
      setReplyDraft('')
      toast.success('回复已发布')
      onReplied?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '回复失败，请稍后再试')
    } finally {
      setIsReplying(false)
    }
  }

  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      {comments.map((comment) => {
        const liked = likedMap[comment.id] ?? Boolean(comment.likedByViewer)
        const likeCount = Math.max(
          0,
          comment.likeCount + Number(liked) - Number(Boolean(comment.likedByViewer)),
        )

        return (
          <article key={comment.id} className="py-4 first:pt-1 last:pb-0">
            <div className="flex gap-3">
              <Avatar name={comment.author.nickname} src={comment.author.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <span className="font-medium text-[var(--text-primary)]">{comment.author.nickname}</span>
                  <span>{formatRelativeTime(comment.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm leading-7 text-[var(--text-primary)]">{comment.content}</p>
                <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(comment)}
                    className={cn(
                      'press-feedback inline-flex items-center gap-1 transition-colors',
                      liked ? 'text-[var(--color-brand)]' : 'hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Heart className={cn('h-3.5 w-3.5', liked && 'fill-current')} />
                    {formatCompactCount(likeCount)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleReply(comment)}
                    className={cn(
                      'press-feedback inline-flex items-center gap-1 transition-colors',
                      replyTargetId === comment.id
                        ? 'text-[var(--color-brand)]'
                        : 'hover:text-[var(--text-primary)]',
                    )}
                  >
                    <MessageSquareMore className="h-3.5 w-3.5" />
                    {formatCompactCount(comment.replyCount)}
                  </button>
                </div>

                {replyTargetId === comment.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value.slice(0, 500))}
                      rows={2}
                      placeholder={`回复 ${comment.author.nickname}…`}
                      className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-brand)]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyTargetId(null)}
                        className="press-feedback rounded-[var(--radius-pill)] px-3 py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={!replyDraft.trim() || isReplying}
                        onClick={() => void handleSubmitReply(comment)}
                        className="press-feedback rounded-[var(--radius-pill)] bg-[var(--color-brand)] px-4 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                      >
                        {isReplying ? '发送中…' : '回复'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
