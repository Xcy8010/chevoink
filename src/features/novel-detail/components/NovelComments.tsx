import { CornerDownRight, Heart, LoaderCircle, MessageSquare, Send, X } from 'lucide-react'

import Empty from '@/components/Empty'
import Avatar from '@/features/community/components/Avatar'
import { getAuthorName, getCommentBody } from '@/features/discover/api'
import { formatRelativeTime } from '@/features/community/utils'
import type { NovelDetailState } from '../useNovelDetailState'

type NovelCommentsProps = {
  state: NovelDetailState
}

/** 作品评论区：头像 + 输入框 + 评论列表（点赞数 + 回复入口） */
export default function NovelComments({ state }: NovelCommentsProps) {
  const {
    commentsQuery,
    novelComments,
    sessionUser,
    commentDraft,
    setCommentDraft,
    replyTarget,
    setReplyTarget,
    createCommentMutation,
    handleSubmitComment,
  } = state

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        读者评论
        {commentsQuery.data ? (
          <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
            共 {commentsQuery.data.pagination.total} 条
          </span>
        ) : null}
      </p>

      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
        {replyTarget ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand-soft)] px-3 py-2 text-xs text-[var(--color-brand)]">
            <span className="flex min-w-0 items-center gap-1.5">
              <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">回复 {getAuthorName(replyTarget.author)}：{getCommentBody(replyTarget)}</span>
            </span>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-[var(--surface-default)]"
              aria-label="取消回复"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div className="flex items-start gap-3">
          <Avatar name={sessionUser?.nickname ?? '游客'} src={sessionUser?.avatarUrl ?? null} size="sm" />
          <div className="min-w-0 flex-1">
            <textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              rows={2}
              placeholder={sessionUser ? '写下你的想法，和作者聊聊这本书...' : '登录后参与讨论...'}
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-brand)]"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--text-tertiary)]">
                {commentDraft.length > 0 ? `${commentDraft.length} 字` : '友善交流，理性讨论'}
              </span>
              <button
                type="button"
                onClick={handleSubmitComment}
                disabled={!commentDraft.trim() || createCommentMutation.isPending}
                className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-brand)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createCommentMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                发表评论
              </button>
            </div>
          </div>
        </div>
      </div>

      {commentsQuery.isLoading ? (
        <div className="mt-6 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在加载评论...
        </div>
      ) : commentsQuery.isError ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm leading-7 text-[var(--text-secondary)]">
            {commentsQuery.error instanceof Error ? commentsQuery.error.message : '评论暂时没有打开。'}
          </p>
          <button
            type="button"
            onClick={() => void commentsQuery.refetch()}
            className="inline-flex h-9 items-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-4 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            重新加载
          </button>
        </div>
      ) : novelComments.length === 0 ? (
        <div className="mt-4">
          <Empty title="还没有读者留言" description="看完第一章后，来写下这本书的第一条评论吧。" />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {novelComments.map((comment) => (
            <article
              key={comment.id}
              className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar name={getAuthorName(comment.author)} src={comment.author.avatarUrl ?? null} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {getAuthorName(comment.author)}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">{formatRelativeTime(comment.createdAt)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--text-primary)]">{getCommentBody(comment)}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {comment.likeCount > 0 ? comment.likeCount : '点赞'}
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTarget(comment)}
                  className="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-brand)]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {comment.replyCount > 0 ? `回复 ${comment.replyCount}` : '回复'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
