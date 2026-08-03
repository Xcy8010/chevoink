import { useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FileText, FolderTree, NotebookPen, NotebookText, ScrollText, Settings2 } from 'lucide-react'

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
  onSelectCatalog: () => void
  onCreateChapter: () => void
  onCreatePlan: () => void
  /** 打开章节设置抽屉（会先切到该章） */
  onOpenChapterSettings: (chapterId: string) => void
  /** 打开计划设置抽屉（改名 / 删除） */
  onOpenPlanSettings: (planId: string) => void
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
  onCreatePlan,
  onOpenChapterSettings,
  onOpenPlanSettings,
  onSelectCatalog,
  onSelectPlan,
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
      <div className="border-b border-[var(--border-subtle)] px-1 pb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">作品树</p>
          <span className="text-xs text-[var(--text-tertiary)]">{chapterCountLabel}</span>
        </div>
        {/* 侧栏宽度有限，两个新建入口平分一行 */}
        <div className="mt-2 flex items-center gap-1.5">
          <Button onClick={onCreateChapter} variant="ghost" size="sm" className="flex-1 justify-center px-2">
            <FilePlus2 className="h-4 w-4" />
            新建章节
          </Button>
          <Button onClick={onCreatePlan} variant="ghost" size="sm" className="flex-1 justify-center px-2">
            <NotebookPen className="h-4 w-4" />
            新建计划
          </Button>
        </div>
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
                          onClick={() => onOpenPlanSettings(plan.id)}
                          className={cn(
                            'mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] transition hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)]',
                            // 手机端无 hover，小屏常驻显示；桌面端仅选中或悬停时显示
                            selectedTreeItemId === `plan:${plan.id}`
                              ? 'opacity-100'
                              : 'opacity-100 md:opacity-0 md:group-hover:opacity-100',
                          )}
                          aria-label="计划设置"
                          title="计划设置"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="px-2 py-2 text-xs leading-6 text-[var(--text-tertiary)]">
                      当前作品还没存入计划，点上方「新建计划」自己写，或用规划模式让 Agent 制定。
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
                  {chapters.map((chapter) => {
                    const chapterActive =
                      selectedTreeItemId === `chapter:${chapter.id}` ||
                      (!selectedTreeItemId && selectedChapterId === chapter.id)

                    return (
                      <div
                        key={chapter.id}
                        className={cn(
                          'group flex items-center gap-1 rounded-[10px] transition',
                          chapterActive ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectChapter(chapter.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-2 text-left text-sm transition',
                            chapterActive
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                          )}
                        >
                          <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                          <span className="truncate">
                            {formatChapterTreeLabel(chapter)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenChapterSettings(chapter.id)}
                          className={cn(
                            'mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] transition hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)]',
                            chapterActive
                              ? 'opacity-100'
                              : 'opacity-100 md:opacity-0 md:group-hover:opacity-100',
                          )}
                          aria-label="章节设置"
                          title="章节设置"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
