import { ChevronRight, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import Avatar from '@/features/community/components/Avatar'

type AuthorReferenceCardProps = {
  author: {
    id: string
    nickname: string
    avatarUrl: string | null
    bio: string | null
  }
  className?: string
}

/** 帖子内嵌的作者主页卡片（与 NovelReferenceCard 同款式）：头像完整不裁切，点击进作者页 */
export default function AuthorReferenceCard({ author, className }: AuthorReferenceCardProps) {
  return (
    <Link
      to={`/author/${author.id}`}
      className={[
        'flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-default)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Avatar name={author.nickname} src={author.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <UserRound className="h-3.5 w-3.5" />
          推荐作者
        </div>
        <p className="mt-1 line-clamp-1 text-sm font-medium text-[var(--text-primary)]">{author.nickname}</p>
        {author.bio ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-tertiary)]">{author.bio}</p>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
    </Link>
  )
}
