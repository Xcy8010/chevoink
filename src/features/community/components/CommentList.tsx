import { Heart, MessageSquareMore } from 'lucide-react'

import type { Comment } from '../../../../shared/contracts/index.js'
import Avatar from '@/features/community/components/Avatar'
import { formatCompactCount, formatRelativeTime } from '@/features/community/utils'

type CommentListProps = {
  comments: Comment[]
}

export default function CommentList({ comments }: CommentListProps) {
  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <article
          key={comment.id}
          className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70"
        >
          <div className="flex gap-3">
            <Avatar name={comment.author.nickname} src={comment.author.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-900 dark:text-slate-100">{comment.author.nickname}</span>
                <span>{formatRelativeTime(comment.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-700 dark:text-slate-200">{comment.content}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {formatCompactCount(comment.likeCount)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquareMore className="h-3.5 w-3.5" />
                  {formatCompactCount(comment.replyCount)}
                </span>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
