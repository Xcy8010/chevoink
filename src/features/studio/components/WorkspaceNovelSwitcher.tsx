import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Novel } from '../../../../shared/contracts/index.js'

type WorkspaceNovelSwitcherProps = {
  currentNovelId: string
  currentNovelTitle: string
  novels: Novel[]
  busy?: boolean
  onSelectNovel: (novelId: string) => void
  onCreateNovel: () => void
}

function getNovelDisplayTitle(novel: Novel) {
  return novel.displayTitle?.trim() || novel.title || '未命名作品'
}

export default function WorkspaceNovelSwitcher({
  currentNovelId,
  currentNovelTitle,
  novels,
  busy = false,
  onSelectNovel,
  onCreateNovel,
}: WorkspaceNovelSwitcherProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)]"
      >
        <BookOpen className="h-4 w-4 text-[var(--text-secondary)]" />
        <span className="max-w-[15rem] truncate">{currentNovelTitle}</span>
        <ChevronDown className={cn('h-4 w-4 text-[var(--text-secondary)] transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2 shadow-[0_20px_48px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <div>
              <p className="text-xs tracking-[0.08em] text-[var(--text-secondary)]">我的作品</p>
              <p className="text-sm text-[var(--text-secondary)]">切换到你创建的其他作品，Agent 记录会一起恢复。</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onCreateNovel()
            }}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--surface-muted)] text-[var(--text-primary)]">
              <Plus className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-medium text-[var(--text-primary)]">新建作品</span>
              <span className="block text-xs text-[var(--text-secondary)]">立即创建一部新的作品并进入创作台</span>
            </span>
          </button>

          <div className="mt-2 max-h-[18rem] space-y-1 overflow-y-auto">
            {novels.map((novel) => {
              const isActive = novel.id === currentNovelId
              const title = getNovelDisplayTitle(novel)
              return (
                <button
                  key={novel.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onSelectNovel(novel.id)
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[16px] px-3 py-3 text-left transition',
                    isActive ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'hover:bg-[var(--surface-muted)]',
                  )}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--surface-muted)] text-sm font-semibold text-[var(--text-primary)]">
                    {title.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{title}</span>
                    <span className="block text-xs text-[var(--text-secondary)]">
                      {novel.chapterCount} 章 · {novel.wordCount} 字
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
