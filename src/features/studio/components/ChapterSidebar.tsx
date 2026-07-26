import { useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FileText, FolderTree, NotebookText, ScrollText, Trash2 } from 'lucide-react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { StudioPayload } from '../../../../shared/contracts/index.js'
import type { WorkspacePlanFile } from '../types'

function formatChapterTreeLabel(chapter: StudioPayload['chapters'][number]) {
  const normalizedTitle = chapter.title.trim()

  if (!normalizedTitle) {
    return `第 ${chapter.orderIndex} 章`
  }

  const prefixedPattern = new RegExp(`^第\\s*${chapter.orderIndex}\\s*章(?:\\s*[：:.·\\-]\\s*.*)?$`)
  if (prefixedPattern.test(normalizedTitle)) {
    return normalizedTitle
  }

  return `第 ${chapter.orderIndex} 章 · ${normalizedTitle}`
}

type ChapterSidebarProps = {
  chapters: StudioPayload['chapters']
  savedPlans: WorkspacePlanFile[]
  selectedChapterId: string | null
  selectedTreeItemId: string | null
  catalogPreview: {
    title: string
    content: string
    description: string
  }
  novelWordCountLabel: string
  chapterCountLabel: string
  novelTitle: string
  activeCoverLabel: string
  onSelectChapter: (chapterId: string) => void
  onSelectPlan: (planId: string) => void
  onDeletePlan: (planId: string) => void
  onSelectCatalog: () => void
  onCreateChapter: () => void
  embedded?: boolean
}

export default function ChapterSidebar({
  chapters,
  savedPlans,
  selectedChapterId,
  selectedTreeItemId,
  catalogPreview,
  chapterCountLabel,
  novelTitle,
  onCreateChapter,
  onSelectCatalog,
  onSelectPlan,
  onDeletePlan,
  onSelectChapter,
  embedded = false,
}: ChapterSidebarProps) {
  const [novelExpanded, setNovelExpanded] = useState(true)
  const [planFolderExpanded, setPlanFolderExpanded] = useState(true)
  const [chapterFolderExpanded, setChapterFolderExpanded] = useState(true)
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-default)]',
        embedded
          ? 'px-4 py-5 xl:px-5'
          : 'rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3 pb-4 shadow-[var(--shadow-soft)]',
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-1 pb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">作品树</p>
          <span className="text-xs text-[var(--text-tertiary)]">{chapterCountLabel}</span>
        </div>
        <Button onClick={onCreateChapter} variant="ghost" size="sm">
          <FilePlus2 className="h-4 w-4" />
          新建章节
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3 pb-2">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setNovelExpanded((current) => !current)}
            className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
          >
            {novelExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
            )}
            <FolderTree className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
            <span className="truncate">{novelTitle}</span>
          </button>

          {novelExpanded ? (
            <div className="ml-4 border-l border-[var(--border-subtle)] pl-2">
              <button
                type="button"
                onClick={onSelectCatalog}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm transition',
                  selectedTreeItemId === 'catalog'
                    ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                <ScrollText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                <span className="truncate">目录</span>
              </button>

              <button
                type="button"
                onClick={() => setPlanFolderExpanded((current) => !current)}
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
              >
                {planFolderExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                )}
                <NotebookText className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                <span className="truncate">计划</span>
              </button>

              {planFolderExpanded ? (
                <div className="ml-4 border-l border-[var(--border-subtle)] pl-2">
                  {savedPlans.length > 0 ? (
                    savedPlans.map((plan, index) => (
                      <div
                        key={plan.id}
                        className={cn(
                          'group flex items-center gap-1 rounded-[10px] transition',
                          selectedTreeItemId === `plan:${plan.id}` ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectPlan(plan.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm transition',
                            selectedTreeItemId === `plan:${plan.id}`
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                          )}
                        >
                          <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                          <span className="truncate">
                            {plan.title.trim() || `计划 ${savedPlans.length - index}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeletePlan(plan.id)}
                          className={cn(
                            'mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] transition',
                            selectedTreeItemId === `plan:${plan.id}`
                              ? 'opacity-100 hover:bg-[var(--surface-default)] hover:text-[var(--danger-500)]'
                              : 'opacity-0 hover:bg-[var(--surface-default)] hover:text-[var(--danger-500)] group-hover:opacity-100',
                          )}
                          aria-label="删除这份计划"
                          title="删除这份计划"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="px-2 py-2 text-xs leading-6 text-[var(--text-tertiary)]">
                      当前作品还没存入计划，使用规划模式即可让 Agent 制定计划。
                    </div>
                  )}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setChapterFolderExpanded((current) => !current)}
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
              >
                {chapterFolderExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                )}
                <span className="truncate">全部章节</span>
              </button>

              {chapterFolderExpanded ? (
                <div className="ml-4 border-l border-[var(--border-subtle)] pl-2">
                  {chapters.map((chapter) => (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => onSelectChapter(chapter.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm transition',
                        selectedTreeItemId === `chapter:${chapter.id}` || (!selectedTreeItemId && selectedChapterId === chapter.id)
                          ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                      <span className="truncate">
                        {formatChapterTreeLabel(chapter)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
