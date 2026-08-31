import { useState, type DragEvent } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FileText, FolderPlus, FolderTree, GripVertical, NotebookPen, NotebookText, ScrollText, Settings2 } from 'lucide-react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { StudioPayload } from '../../../../shared/contracts/index.js'
import type { WorkspacePlanFile } from '../types'
import { COMPOSER_REFERENCE_MIME, serializeComposerReferenceTransfer } from '../agent/composer-content'

function formatChapterTreeLabel(chapter: StudioPayload['chapters'][number]) {
  const normalizedTitle = chapter.title.trim()

  if (!normalizedTitle) {
    return `第 ${chapter.orderInVolume} 章`
  }

  const prefixedPattern = new RegExp(`^第\\s*${chapter.orderInVolume}\\s*章(?:\\s*[：:.·\\-]\\s*.*)?$`)
  if (prefixedPattern.test(normalizedTitle)) {
    return normalizedTitle
  }

  return `第 ${chapter.orderInVolume} 章 · ${normalizedTitle}`
}

type ChapterSidebarProps = {
  chapters: StudioPayload['chapters']
  volumes: StudioPayload['volumes']
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
  onCreateVolume?: () => void
  onCreatePlan: () => void
  onMoveChapter?: (chapterId: string, targetVolumeId: string, position: number) => void | Promise<void>
  onMovePlan?: (planId: string, position: number) => void | Promise<void>
  /** 打开章节设置抽屉（会先切到该章） */
  onOpenChapterSettings: (chapterId: string) => void
  /** 打开计划设置抽屉（改名 / 删除） */
  onOpenPlanSettings: (planId: string) => void
  embedded?: boolean
}

export default function ChapterSidebar({
  chapters,
  volumes,
  savedPlans,
  selectedChapterId,
  selectedTreeItemId,
  chapterCountLabel,
  novelTitle,
  onCreateChapter,
  onCreateVolume,
  onCreatePlan,
  onMoveChapter,
  onMovePlan,
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
  const [draggedItem, setDraggedItem] = useState<{ kind: 'chapter' | 'plan'; id: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const volumeGroups = volumes.map((volume) => ({
    volume,
    chapters: chapters.filter((chapter) => chapter.volumeId === volume.id),
  }))
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
        <div className={cn('mt-2 grid items-center gap-1', onCreateVolume ? 'grid-cols-3' : 'grid-cols-2')}>
          {onCreateVolume ? <Button onClick={onCreateVolume} variant="ghost" size="sm" className="min-w-0 justify-center px-1.5">
            <FolderPlus className="h-4 w-4" />
            新建卷
          </Button> : null}
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
                        draggable={Boolean(onMovePlan)}
                        onDragStart={(event) => {
                          setDraggedItem({ kind: 'plan', id: plan.id })
                          event.dataTransfer.effectAllowed = 'copyMove'
                          event.dataTransfer.setData('text/plain', `plan:${plan.id}`)
                          event.dataTransfer.setData(COMPOSER_REFERENCE_MIME, serializeComposerReferenceTransfer({
                            id: `plan:${plan.id}`,
                            kind: 'plan',
                            name: plan.title.trim() || `计划 ${savedPlans.length - index}`,
                            text: plan.content,
                            startLine: 1,
                            endLine: Math.max(1, plan.content.split('\n').length),
                          }))
                        }}
                        onDragEnd={() => { setDraggedItem(null); setDropTarget(null) }}
                        onDragOver={(event) => {
                          if (draggedItem?.kind !== 'plan') return
                          event.preventDefault()
                          setDropTarget(`plan:${plan.id}`)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggedItem?.kind === 'plan' && draggedItem.id !== plan.id) {
                            void onMovePlan?.(draggedItem.id, index + 1)
                          }
                          setDraggedItem(null)
                          setDropTarget(null)
                        }}
                        className={cn(
                          'group flex items-center gap-1 rounded-[10px] border-t border-transparent transition',
                          selectedTreeItemId === `plan:${plan.id}` ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]',
                          dropTarget === `plan:${plan.id}` && 'border-t-[var(--text-primary)]',
                        )}
                      >
                        <GripVertical className="ml-1 h-3.5 w-3.5 shrink-0 cursor-grab text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
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
                  {volumeGroups.map(({ volume, chapters: volumeChapters }) => (
                    <div key={volume.id} className="py-0.5">
                      <div
                        onDragOver={(event) => {
                          if (draggedItem?.kind !== 'chapter') return
                          event.preventDefault()
                          setDropTarget(`volume:${volume.id}`)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggedItem?.kind === 'chapter') {
                            void onMoveChapter?.(draggedItem.id, volume.id, volumeChapters.length + 1)
                          }
                          setDraggedItem(null)
                          setDropTarget(null)
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors',
                          dropTarget === `volume:${volume.id}` && 'border-[var(--border-strong)] bg-[var(--surface-muted)]',
                        )}
                      >
                        <NotebookText className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        <span className="truncate">第 {volume.orderIndex} 卷 · {volume.title}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-[var(--text-tertiary)]">{volumeChapters.length} 章</span>
                      </div>
                      <div className="ml-3 border-l border-[var(--border-subtle)] pl-1.5">
                  {volumeChapters.map((chapter) => {
                    const chapterActive =
                      selectedTreeItemId === `chapter:${chapter.id}` ||
                      (!selectedTreeItemId && selectedChapterId === chapter.id)

                    return (
                      <div
                        key={chapter.id}
                        draggable={Boolean(onMoveChapter)}
                        onDragStart={(event) => {
                          setDraggedItem({ kind: 'chapter', id: chapter.id })
                          event.dataTransfer.effectAllowed = 'copyMove'
                          event.dataTransfer.setData('text/plain', `chapter:${chapter.id}`)
                          event.dataTransfer.setData(COMPOSER_REFERENCE_MIME, serializeComposerReferenceTransfer({
                            id: `chapter:${chapter.id}`,
                            kind: 'chapter',
                            name: formatChapterTreeLabel(chapter),
                            // 作品树列表为轻量 ChapterListItem，不携带正文；输入框接收后按 id 懒取全文。
                            text: '',
                            startLine: 1,
                            endLine: 1,
                          }))
                        }}
                        onDragEnd={() => { setDraggedItem(null); setDropTarget(null) }}
                        onDragOver={(event: DragEvent<HTMLDivElement>) => {
                          if (draggedItem?.kind !== 'chapter') return
                          event.preventDefault()
                          event.stopPropagation()
                          setDropTarget(`chapter:${chapter.id}`)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (draggedItem?.kind === 'chapter' && draggedItem.id !== chapter.id) {
                            void onMoveChapter?.(draggedItem.id, volume.id, chapter.orderInVolume)
                          }
                          setDraggedItem(null)
                          setDropTarget(null)
                        }}
                        className={cn(
                          'group flex items-center gap-1 rounded-[10px] border-t border-transparent transition',
                          chapterActive ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]',
                          dropTarget === `chapter:${chapter.id}` && 'border-t-[var(--text-primary)]',
                        )}
                      >
                        <GripVertical className="ml-1 h-3.5 w-3.5 shrink-0 cursor-grab text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
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
                        {volumeChapters.length === 0 ? (
                          <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">空卷</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {volumeGroups.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-[var(--text-tertiary)]">暂未建立卷结构</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
