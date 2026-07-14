import { BookOpen, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

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
        'flex items-center gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3 transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700 dark:hover:bg-slate-950',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        src={novel.coverUrl ?? ''}
        alt={novel.title}
        className="h-16 w-12 rounded-[14px] border border-slate-200 object-cover dark:border-slate-800"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <BookOpen className="h-3.5 w-3.5" />
          关联作品
        </div>
        <p className="mt-1 line-clamp-1 text-sm font-medium text-slate-950 dark:text-slate-50">{novel.title}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </Link>
  )
}
