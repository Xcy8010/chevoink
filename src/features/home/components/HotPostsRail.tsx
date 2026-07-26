import { MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

import Avatar from '@/features/community/components/Avatar'
import {
  getAuthorName,
  getPostExcerpt,
  getTopicName,
} from '@/features/discover/api'
import { formatRelativeTime } from '@/features/home/utils'
import type { Post } from '../../../../shared/contracts/index.js'

type HotPostsRailProps = {
  posts: Post[]
}

/** 社区热帖横滑卡片 */
export default function HotPostsRail({ posts }: HotPostsRailProps) {
  if (posts.length === 0) return null

  return (
    <section aria-label="社区热帖" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)] md:text-xl">社区热帖</h2>
        <Link to="/community" className="text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)] md:text-sm">
          去社区
        </Link>
      </div>

      {/* scroll-padding 与左右内边距对齐，保证吸附后首卡不被滑动口左缘裁切 */}
      <div className="rail-scroll -mx-1 flex gap-3 scroll-px-1 px-1 pb-1">
        {posts.slice(0, 6).map((post) => (
          <Link
            key={post.id}
            to={`/post/${post.id}`}
            className="w-[240px] shrink-0 rounded-[var(--radius-lg)] bg-[var(--surface-muted)]/60 p-4 transition-colors hover:bg-[var(--surface-muted)] md:w-[280px]"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-tertiary)]">
              <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-2 py-0.5 font-medium text-[var(--color-brand)]">
                {getTopicName(post.topic)}
              </span>
              <span>{formatRelativeTime(post.updatedAt)}</span>
            </div>
            <p className="mt-2.5 line-clamp-3 text-sm leading-6 text-[var(--text-primary)]">
              {getPostExcerpt(post)}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar name={getAuthorName(post.author)} src={post.author?.avatarUrl ?? null} size="sm" className="h-5 w-5" />
                <span className="truncate">{getAuthorName(post.author)}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                <MessageSquare className="h-3.5 w-3.5" />
                {post.commentCount}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
