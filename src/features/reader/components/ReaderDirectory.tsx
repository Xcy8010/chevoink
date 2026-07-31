import { Link } from 'react-router-dom'

import Empty from '@/components/Empty'
import { isPublicReadableChapter } from '@/features/discover/api'
import { cn } from '@/lib/utils'
import type { ReaderState } from '../useReaderState'

type ReaderDirectoryProps = {
  state: ReaderState
  /** 点击章节后的回调（如关闭抽屉） */
  onNavigate?: () => void
}

/** 章节目录列表：当前章高亮，未发布章节置灰 */
export default function ReaderDirectory({ state, onNavigate }: ReaderDirectoryProps) {
  const { chapterList, reader, fromStudio, buildReadHref } = state
  if (!reader) return null

  if (chapterList.length === 0) {
    return (
      <Empty
        title="目录暂时还没整理好"
        description={fromStudio ? '等你开始写这一章后，这里会自动出现章节列表。' : '公开章节准备好后，会直接显示在这里。'}
      />
    )
  }

  return (
    <div className="space-y-1.5 p-1">
      {chapterList.map((chapter) => {
        const isReadable = fromStudio || isPublicReadableChapter(chapter)
        const isActive = chapter.id === reader.currentChapter.id

        if (!isReadable) {
          return (
            <div
              key={chapter.id}
              className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--text-tertiary)]"
            >
              <p className="font-medium">{chapter.title}</p>
              <p className="mt-0.5 text-xs">第 {chapter.orderIndex} 章 · 待更新</p>
            </div>
          )
        }

        return (
          <Link
            key={chapter.id}
            to={buildReadHref(chapter.id)}
            onClick={onNavigate}
            className={cn(
              'block rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition-colors press-feedback',
              isActive
                ? 'bg-[var(--color-brand)] text-white'
                : 'text-[var(--text-primary)] hover:bg-[var(--surface-muted)]',
            )}
          >
            <p className="font-medium">{chapter.title}</p>
            <p className={cn('mt-0.5 text-xs', isActive ? 'text-white/75' : 'text-[var(--text-tertiary)]')}>
              第 {chapter.orderIndex} 章
            </p>
          </Link>
        )
      })}
    </div>
  )
}
