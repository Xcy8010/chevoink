import { Heart, MessageSquareMore, MoveRight, Star } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { Post } from '../../../../shared/contracts/index.js'
import Avatar from '@/features/community/components/Avatar'
import NovelReferenceCard from '@/features/community/components/NovelReferenceCard'
import { formatCompactCount, formatRelativeTime } from '@/features/community/utils'

type PostCardProps = {
  post: Post
  compact?: boolean
}

export default function PostCard({ post, compact = false }: PostCardProps) {
  return (
    <article className="rounded-[28px] border border-slate-200/80 bg-white/88 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/86">
      <div className="flex items-start gap-3">
        <Link to={`/author/${post.author.id}`} aria-label={`查看 ${post.author.nickname} 的主页`}>
          <Avatar name={post.author.nickname} src={post.author.avatarUrl} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Link
              to={`/author/${post.author.id}`}
              className="font-medium text-slate-900 transition hover:text-slate-700 dark:text-slate-100 dark:hover:text-white"
            >
              {post.author.nickname}
            </Link>
            <span>{formatRelativeTime(post.createdAt)}</span>
            {post.topic ? (
              <span className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {post.topic.name}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-200">
            {compact ? post.excerpt : post.content}
          </p>
        </div>
      </div>

      {post.imageUrls[0] ? (
        <img
          src={post.imageUrls[0]}
          alt={post.excerpt}
          className="mt-4 aspect-[16/9] w-full rounded-[22px] border border-slate-200 object-cover dark:border-slate-800"
        />
      ) : null}

      {post.relatedNovel ? <div className="mt-4"><NovelReferenceCard novel={post.relatedNovel} /></div> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {formatCompactCount(post.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquareMore className="h-3.5 w-3.5" />
            {formatCompactCount(post.commentCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5" />
            {formatCompactCount(post.favoriteCount)}
          </span>
        </div>
        <Link
          to={`/post/${post.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50"
        >
          查看讨论
          <MoveRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  )
}
