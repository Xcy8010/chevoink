import { Fragment } from 'react'
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
  const { chapterList, volumes, reader, fromStudio, buildReadHref } = state
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
      {chapterList.map((chapter, index) => {
        const isReadable = fromStudio || isPublicReadableChapter(chapter)
        const isActive = chapter.id === reader.currentChapter.id
        const previous = index > 0 ? chapterList[index - 1] : null
        const volume = volumes.find((item) => item.id === chapter.volumeId)
        const volumeHeading = !previous || previous.volumeId !== chapter.volumeId ? <div className="sticky top-0 z-10 mt-2 flex items-center justify-between border-y border-[var(--border-subtle)] bg-[var(--surface-default)]/95 px-3 py-2 backdrop-blur"><span className="text-xs font-semibold text-[var(--text-primary)]">{volume ? `第 ${volume.orderIndex} 卷 · ${volume.title}` : '未分卷章节'}</span><span className="text-[10px] text-[var(--text-tertiary)]">{volume?.chapterCount ?? 0} 章</span></div> : null

        if (!isReadable) {
          return (
            <Fragment key={chapter.id}>
            {volumeHeading}
            <div
              className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--text-tertiary)]"
            >
              <p className="font-medium">{chapter.title}</p>
              <p className="mt-0.5 text-xs">卷内第 {chapter.orderInVolume} 章 · 待更新</p>
            </div>
            </Fragment>
          )
        }

        return (
          <Fragment key={chapter.id}>
          {volumeHeading}
          <Link
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
              卷内第 {chapter.orderInVolume} 章 · 全书第 {chapter.orderIndex} 章
            </p>
          </Link>
          </Fragment>
        )
      })}
    </div>
  )
}
