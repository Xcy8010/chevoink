import { BookOpen, Bookmark, BookmarkCheck, ChevronLeft, PenLine, Share2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { NovelDetailState } from '../useNovelDetailState'

type DetailCtaRowProps = {
  state: NovelDetailState
  /** compact：手机底部固定操作栏模式（仅核心操作） */
  compact?: boolean
}

const secondaryButtonClass =
  'press-feedback inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]'

/** 作品操作组：开始阅读/继续阅读 + 加入书架 + 分享（+编辑/返回创作区） */
export default function DetailCtaRow({ state, compact = false }: DetailCtaRowProps) {
  const {
    fromStudio,
    backHref,
    canEditNovelPage,
    setIsEditing,
    firstPublishedChapter,
    isStartingThis,
    readingProgress,
    inShelf,
    handleContinueReading,
    handleToggleShelf,
    handleShare,
  } = state

  const primaryLabel = !firstPublishedChapter
    ? '暂未开放阅读'
    : isStartingThis
      ? '正在打开...'
      : readingProgress
        ? '继续阅读'
        : '开始阅读'

  return (
    <div className={compact ? 'flex items-center gap-2' : 'flex flex-wrap items-center gap-3'}>
      {fromStudio && !compact ? (
        <Link to={backHref} className={secondaryButtonClass + ' flex-none'}>
          <ChevronLeft className="h-4 w-4" />
          返回创作区
        </Link>
      ) : null}
      {canEditNovelPage && !compact ? (
        <button type="button" onClick={() => setIsEditing(true)} className={secondaryButtonClass + ' flex-none'}>
          <PenLine className="h-4 w-4" />
          编辑作品页
        </button>
      ) : null}

      <button
        type="button"
        onClick={handleToggleShelf}
        className={[
          secondaryButtonClass,
          inShelf ? 'border-[var(--color-brand)] text-[var(--color-brand)]' : '',
        ].join(' ')}
        aria-pressed={inShelf}
      >
        {inShelf ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {inShelf ? '已在书架' : '加入书架'}
      </button>

      <button
        type="button"
        onClick={handleContinueReading}
        disabled={!firstPublishedChapter || isStartingThis}
        className="press-feedback inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <BookOpen className="h-4 w-4" />
        {primaryLabel}
      </button>

      <button
        type="button"
        onClick={() => void handleShare()}
        className="press-feedback inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        aria-label="分享这本书"
      >
        <Share2 className="h-4 w-4" />
      </button>
    </div>
  )
}
