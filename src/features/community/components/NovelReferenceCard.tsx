import { BookOpen, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import AppImage from '@/components/ui/AppImage'

type NovelReferenceCardProps = {
  novel: {
    id: string
    title: string
    coverUrl: string | null
  }
  className?: string
}

export default function NovelReferenceCard({ novel, className }: NovelReferenceCardProps) {
  return (
    <Link
      to={`/novel/${novel.id}`}
      className={[
        'flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-default)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {novel.coverUrl ? (
        <AppImage
          src={novel.coverUrl}
          alt={novel.title}
          className="h-16 w-12 shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
        />
      ) : (
        <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-tertiary)]">
          <BookOpen className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <BookOpen className="h-3.5 w-3.5" />
          关联作品
        </div>
        <p className="mt-1 line-clamp-1 text-sm font-medium text-[var(--text-primary)]">{novel.title}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
    </Link>
  )
}
