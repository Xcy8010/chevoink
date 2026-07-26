import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText as FileTextIcon,
  ImagePlus,
  Save,
  Settings2,
  Upload,
} from 'lucide-react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { ChapterStatus, Novel, StudioPayload, Visibility } from '../../../../shared/contracts/index.js'
import type {
  ChapterDraftState,
  ChapterPendingReview,
  EditorSelectionState,
  PlanPendingReview,
  SaveState,
  WorkspaceDocumentView,
  WorkspacePlanFile,
} from '../types'
import ChapterSidebar from './ChapterSidebar'
import ChapterChangeReview from './ChapterChangeReview'
import PlanChangeReview from './PlanChangeReview'
import ChapterSettingsPanel from './ChapterSettingsPanel'
import ConfirmDialog from './ConfirmDialog'
import { SaveStatusPill } from './StudioControls'
import WorkspaceNovelSwitcher from './WorkspaceNovelSwitcher'
import { PanelResizeHandle, useStudioPanelWidths } from '../panel-resize'

type ImmersiveComposerProps = {
  currentNovelId: string
  novelTitle: string
  novelTitleMissing?: boolean
  novelOptions: Novel[]
  chapterDraft: ChapterDraftState | null
  chapters: StudioPayload['chapters']
  savedPlans: WorkspacePlanFile[]
  selectedChapterId: string | null
  selectedTreeItemId: string | null
  catalogPreview: {
    title: string
    content: string
    description: string
  }
  workspaceDocument?: WorkspaceDocumentView | null
  saveState: SaveState
  saveMessage: string
  wordCountLabel: string
  onClose: () => void
  onSave: () => void
  onRetrySave?: () => void
  onSelectNovel: (novelId: string) => void
  onCreateNovel: () => void
  onEditNovelTitle?: () => void
  detailPreviewHref?: string
  previewHref?: string
  onSelectChapter: (chapterId: string) => void
  onSelectPlan: (planId: string) => void
  onDeletePlan: (planId: string) => void
  onSelectCatalog: () => void
  onCreateChapter: () => void
  onDeleteChapter: () => void | Promise<void>
  onChange: (next: ChapterDraftState) => void
  onWorkspaceDocumentChange?: (next: { title: string; content: string }) => void
  onSelectionChange?: (next: EditorSelectionState) => void
  pendingChapterReview?: ChapterPendingReview | null
  pendingChapterReviewBusy?: boolean
  onKeepPendingReview?: () => void
  onRevertPendingReview?: () => void
  pendingPlanReview?: PlanPendingReview | null
  pendingPlanReviewBusy?: boolean
  onKeepPendingPlanReview?: () => void
  onRevertPendingPlanReview?: () => void
  onOpenCover?: () => void
  onOpenMeta?: () => void
  onPublishNovel?: () => void
  novelPublished?: boolean
  novelSaving?: boolean
  agentPanel: ReactNode
  taskSidebar?: ReactNode
  coverPanel?: ReactNode
  showCoverPanel?: boolean
  metaPanel?: ReactNode
  showMetaPanel?: boolean
  switchingNovel?: boolean
  novelsLoading?: boolean
}

export default function ImmersiveComposer({
  currentNovelId,
  novelTitle,
  novelTitleMissing = false,
  novelOptions,
  chapterDraft,
  chapters,
  savedPlans,
  selectedChapterId,
  selectedTreeItemId,
  catalogPreview,
  workspaceDocument = null,
  saveState,
  saveMessage,
  wordCountLabel,
  onClose,
  onSave,
  onRetrySave,
  onSelectNovel,
  onCreateNovel,
  onEditNovelTitle,
  detailPreviewHref,
  previewHref,
  onSelectChapter,
  onSelectPlan,
  onDeletePlan,
  onSelectCatalog,
  onCreateChapter,
  onDeleteChapter,
  onChange,
  onWorkspaceDocumentChange,
  onSelectionChange,
  pendingChapterReview = null,
  pendingChapterReviewBusy = false,
  onKeepPendingReview,
  onRevertPendingReview,
  pendingPlanReview = null,
  pendingPlanReviewBusy = false,
  onKeepPendingPlanReview,
  onRevertPendingPlanReview,
  onOpenCover,
  onOpenMeta,
  onPublishNovel,
  novelPublished = false,
  novelSaving = false,
  agentPanel,
  taskSidebar,
  coverPanel,
  showCoverPanel = false,
  metaPanel,
  showMetaPanel = false,
  switchingNovel = false,
  novelsLoading = false,
}: ImmersiveComposerProps) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : false,
  )
  const { panelWidths, beginPanelResize } = useStudioPanelWidths()
  // 手机端默认直接展示 Agent 对话区，保持沉浸简洁
  const [mobilePanel, setMobilePanel] = useState<'agent' | 'editor' | 'chapters' | 'cover' | 'meta'>('agent')
  const [showChapterSettings, setShowChapterSettings] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'default' | 'danger'
    onConfirm: () => void | Promise<void>
  } | null>(null)
  const currentIndex = chapters.findIndex((chapter) => chapter.id === selectedChapterId)
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const nextChapter = currentIndex >= 0 ? chapters[currentIndex + 1] ?? null : null

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)')
    setIsDesktop(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!chapterDraft && mobilePanel === 'editor') {
      setMobilePanel('agent')
    }
  }, [chapterDraft, mobilePanel])

  // 外部（发布引导、Agent 指令等）打开作品设置/封面面板时，手机端联动切到对应标签页
  useEffect(() => {
    if (isDesktop) {
      return
    }
    if (showMetaPanel && metaPanel) {
      setMobilePanel('meta')
    } else if (showCoverPanel && coverPanel) {
      setMobilePanel('cover')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, showMetaPanel, showCoverPanel])

  async function handleConfirmDialog() {
    if (!confirmDialog) {
      return
    }

    setSettingsBusy(true)
    try {
      await confirmDialog.onConfirm()
      setConfirmDialog(null)
    } finally {
      setSettingsBusy(false)
    }
  }

  function requestStatusAction(nextStatus: ChapterStatus) {
    if (!chapterDraft || chapterDraft.status === nextStatus) {
      return
    }

    const statusActionMap: Record<
      ChapterStatus,
      { title: string; description: string; confirmLabel: string }
    > = {
      draft: {
        title: '确认将状态设置为草稿',
        description: '执行后，这一章会切回草稿状态。',
        confirmLabel: '确认设置为草稿',
      },
      published: {
        title: '确认立即上架',
        description: '执行后，这一章会立刻切到上架状态。',
        confirmLabel: '确认上架',
      },
      scheduled: {
        title: '确认将状态设置为定时',
        description: '执行后，这一章会切到定时发布状态。',
        confirmLabel: '确认设置为定时',
      },
      archived: {
        title: '确认立即下架',
        description: '执行后，这一章会立刻从上架状态切到下架状态。',
        confirmLabel: '确认下架',
      },
    }

    const config = statusActionMap[nextStatus]
    setConfirmDialog({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      cancelLabel: '取消',
      tone: nextStatus === 'archived' ? 'danger' : 'default',
      onConfirm: () => {
        onChange({ ...chapterDraft, status: nextStatus })
      },
    })
  }

  function requestVisibilityAction(nextVisibility: Visibility) {
    if (!chapterDraft || chapterDraft.visibility === nextVisibility) {
      return
    }

    const visibilityActionMap: Record<
      Visibility,
      { title: string; description: string; confirmLabel: string }
    > = {
      private: {
        title: '确认将可见范围设置为个人',
        description: '执行后，这一章只对你自己可见。',
        confirmLabel: '确认设置为个人',
      },
      followers: {
        title: '确认将可见范围设置为关注可见',
        description: '执行后，这一章只对关注你的用户可见。',
        confirmLabel: '确认设置为关注可见',
      },
      public: {
        title: '确认将可见范围设置为公开',
        description: '执行后，这一章会对外公开可见。',
        confirmLabel: '确认设置为公开',
      },
    }

    const config = visibilityActionMap[nextVisibility]
    setConfirmDialog({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      cancelLabel: '取消',
      onConfirm: () => {
        onChange({ ...chapterDraft, visibility: nextVisibility })
      },
    })
  }

  function handleDeleteRequest() {
    if (!chapterDraft) {
      return
    }

    if (chapterDraft.status === 'published') {
      setConfirmDialog({
        title: '当前章节暂不可删除',
        description: '请先将章节下架后才可删除。',
        confirmLabel: '知道了',
        cancelLabel: '关闭',
        tone: 'default',
        onConfirm: () => undefined,
      })
      return
    }

    setConfirmDialog({
      title: '确认删除章节',
      description: '章节删除后内容将会丢失，您真的确定要删除吗？',
      confirmLabel: '确定删除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        await onDeleteChapter()
        setShowChapterSettings(false)
      },
    })
  }

  function emitSelection(target: HTMLTextAreaElement) {
    onSelectionChange?.({
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
      text: target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0),
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] isolate overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex h-full max-w-[140rem] flex-col px-3 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] md:px-6 md:py-5">
        {isDesktop ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
            <div className="min-w-0 space-y-3">
            <WorkspaceNovelSwitcher
              currentNovelId={currentNovelId}
              currentNovelTitle={novelTitle}
              novels={novelOptions}
              busy={switchingNovel}
              loading={novelsLoading}
              onSelectNovel={onSelectNovel}
              onCreateNovel={onCreateNovel}
            />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-[var(--text-secondary)]">{novelTitle}</p>
                {novelTitleMissing && onEditNovelTitle ? (
                  <button
                    type="button"
                    onClick={onEditNovelTitle}
                    className="inline-flex h-9 items-center rounded-full bg-[var(--surface-contrast)] px-4 text-sm font-medium text-[var(--text-contrast)] transition hover:bg-[var(--surface-contrast-hover)]"
                  >
                    去命名作品
                  </button>
                ) : null}
              </div>
              <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)] md:text-xl">
                {workspaceDocument?.title || chapterDraft?.title || '继续写作'}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveStatusPill state={saveState} message={saveMessage} onRetry={onRetrySave} />
            {detailPreviewHref ? (
              <Link
                to={detailPreviewHref}
                title="查看作品页"
                aria-label="查看作品页"
                className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
              >
                <FileTextIcon className="h-4 w-4" />
              </Link>
            ) : null}
            {onOpenCover ? (
              <Button
                variant={showCoverPanel ? 'secondary' : 'ghost'}
                onClick={onOpenCover}
                title="封面设计"
                aria-label="封面设计"
                className="h-10 w-10 border border-[var(--border-subtle)] px-0"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
            ) : null}
            {onOpenMeta ? (
              <Button
                variant={showMetaPanel ? 'secondary' : 'ghost'}
                onClick={onOpenMeta}
                title="作品设置"
                aria-label="作品设置"
                className="h-10 w-10 border border-[var(--border-subtle)] px-0"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            ) : null}
            {onPublishNovel ? (
              <Button variant="secondary" onClick={onPublishNovel} disabled={novelSaving}>
                <Upload className="h-4 w-4" />
                {novelPublished ? '更新发布' : '发布'}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={onSave}
              disabled={!chapterDraft || pendingChapterReviewBusy || Boolean(pendingChapterReview)}
            >
              <Save className="h-4 w-4" />
              立即保存
            </Button>
            <Button variant="ghost" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" />
              退出沉浸
            </Button>
          </div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
            >
              <ArrowLeft className="h-4 w-4" />
              退出沉浸
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--text-primary)]">
              {workspaceDocument?.title || chapterDraft?.title || novelTitle}
            </p>
            <SaveStatusPill compact state={saveState} message={saveMessage} onRetry={onRetrySave} />
          </div>
        )}

        {!isDesktop ? (
          <div className="sticky top-0 z-10 -mx-1 shrink-0 overflow-x-auto bg-[var(--app-bg)] px-1 py-3">
            <div className="inline-flex min-w-full gap-2">
              {[
                ['editor', '写作'],
                ['chapters', '作品'],
                ['agent', 'Agent'],
                ...(coverPanel ? [['cover', '封面']] : []),
                ...(metaPanel ? [['meta', '设置']] : []),
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobilePanel(key as 'agent' | 'editor' | 'chapters' | 'cover' | 'meta')}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium transition',
                    mobilePanel === key
                      ? 'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col pt-4',
            isDesktop &&
              'overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] xl:grid',
          )}
          style={
            isDesktop
              ? {
                  // 与创作中心共享的三区拖拽宽度（章节树 / 内容 / Agent）
                  gridTemplateColumns:
                    showCoverPanel || showMetaPanel || taskSidebar
                      ? `${panelWidths.tree}px minmax(0,1fr) ${panelWidths.agent}px auto`
                      : `${panelWidths.tree}px minmax(0,1fr) ${panelWidths.agent}px`,
                  // 锁定唯一一行为容器高度，保证各列内部（尤其 Agent 消息流）自行滚动
                  gridTemplateRows: 'minmax(0, 1fr)',
                }
              : undefined
          }
        >
          {isDesktop ? (
            <div className={cn('flex h-full min-h-0 flex-col', isDesktop && 'relative border-r border-[var(--border-subtle)] bg-[var(--surface-default)] p-4')}>
              <ChapterSidebar
                embedded
                chapters={chapters}
                savedPlans={savedPlans}
                selectedChapterId={selectedChapterId}
                selectedTreeItemId={selectedTreeItemId}
                catalogPreview={catalogPreview}
                novelWordCountLabel={wordCountLabel}
                chapterCountLabel={`共 ${chapters.length} 章`}
                novelTitle={novelTitle}
                activeCoverLabel=""
                onSelectChapter={onSelectChapter}
                onSelectPlan={onSelectPlan}
                onDeletePlan={onDeletePlan}
                onSelectCatalog={onSelectCatalog}
                onCreateChapter={onCreateChapter}
              />
              <PanelResizeHandle
                panel="tree"
                side="right"
                label="拖拽调整章节树宽度"
                onBegin={beginPanelResize}
              />
            </div>
          ) : null}

          {(isDesktop || mobilePanel === 'editor') ? (
            <div className={cn('flex h-full min-h-0 flex-col', isDesktop && 'border-r border-[var(--border-subtle)] px-5 py-5 xl:px-6')}>
              {workspaceDocument ? (
                <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4">
                  {workspaceDocument.kind === 'plan' && pendingPlanReview ? (
                    <PlanChangeReview
                      review={pendingPlanReview}
                      busy={pendingPlanReviewBusy}
                      onKeep={onKeepPendingPlanReview ?? (() => undefined)}
                      onRevert={onRevertPendingPlanReview ?? (() => undefined)}
                      className="min-h-0 flex-1"
                    />
                  ) : (
                  <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-6 py-6 md:px-8 md:py-8">
                    <div className="border-b border-[var(--border-subtle)] pb-5">
                      {workspaceDocument.editableTitle ? (
                        <input
                          value={workspaceDocument.title}
                          onChange={(event) =>
                            onWorkspaceDocumentChange?.({
                              title: event.target.value,
                              content: workspaceDocument.content,
                            })
                          }
                          className="w-full border-0 bg-transparent text-[1.18rem] font-semibold tracking-[0.01em] text-[var(--text-primary)] outline-none"
                          placeholder={workspaceDocument.kind === 'plan' ? '给这份创作计划命名' : '目录'}
                        />
                      ) : (
                        <p className="text-[1.18rem] font-semibold tracking-[0.01em] text-[var(--text-primary)]">
                          {workspaceDocument.title}
                        </p>
                      )}
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {workspaceDocument.description}
                      </p>
                    </div>
                    {workspaceDocument.editableContent ? (
                      <textarea
                        value={workspaceDocument.content}
                        onChange={(event) =>
                          onWorkspaceDocumentChange?.({
                            title: workspaceDocument.title,
                            content: event.target.value,
                          })
                        }
                        rows={24}
                        className="mt-5 min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-base leading-9 text-[var(--text-primary)] outline-none md:text-[1.04rem]"
                        placeholder={workspaceDocument.kind === 'plan' ? '继续完善这份创作计划。' : '在这里维护目录内容。'}
                      />
                    ) : (
                      <div className="mt-5 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-base leading-9 text-[var(--text-primary)] md:text-[1.04rem]">
                        {workspaceDocument.content}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ) : chapterDraft ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                    <SaveStatusPill state={saveState} message={saveMessage} onRetry={onRetrySave} />
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={onCreateChapter}>
                        <FilePlus2 className="h-4 w-4" />
                        新建章节
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setShowChapterSettings((current) => !current)}
                        className="bg-zinc-900 text-white hover:bg-zinc-800"
                      >
                        <Settings2 className="h-4 w-4" />
                        章节设置
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => previousChapter && onSelectChapter(previousChapter.id)}
                        disabled={!previousChapter}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一章
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => nextChapter && onSelectChapter(nextChapter.id)}
                        disabled={!nextChapter}
                      >
                        下一章
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4">
                    {pendingChapterReview ? (
                      <ChapterChangeReview
                        review={pendingChapterReview}
                        busy={pendingChapterReviewBusy}
                        onKeep={onKeepPendingReview ?? (() => undefined)}
                        onRevert={onRevertPendingReview ?? (() => undefined)}
                        className="min-h-0 flex-1"
                      />
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-6 py-6 md:px-8 md:py-8">
                        <div className="border-b border-[var(--border-subtle)] pb-5">
                          <p className="text-[1.18rem] font-semibold tracking-[0.01em] text-[var(--text-primary)]">
                            {chapterDraft.title.trim() || `第 ${chapterDraft.orderIndex} 章`}
                          </p>
                        </div>
                        <textarea
                          value={chapterDraft.content}
                          onChange={(event) => {
                            onChange({ ...chapterDraft, content: event.target.value })
                            emitSelection(event.target)
                          }}
                          onSelect={(event) => emitSelection(event.currentTarget)}
                          onClick={(event) => emitSelection(event.currentTarget)}
                          onKeyUp={(event) => emitSelection(event.currentTarget)}
                          onBlur={(event) => emitSelection(event.currentTarget)}
                          rows={24}
                          className="mt-5 min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-base leading-9 text-[var(--text-primary)] outline-none md:text-[1.04rem]"
                          placeholder="继续写这一章的正文。"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-default)] px-6 py-10">
                  <div className="max-w-md space-y-4 text-center">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">沉浸区已经打开</h3>
                      <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                        现在可以先和 Agent 继续对话，也可以新建章节或切到已有章节开始写作。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button onClick={onCreateChapter} variant="secondary">
                        <FilePlus2 className="h-4 w-4" />
                        新建章节
                      </Button>
                      {chapters[0] ? (
                        <Button onClick={() => onSelectChapter(chapters[0].id)} variant="ghost">
                          选择现有章节
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {(isDesktop || mobilePanel === 'agent') ? (
            <div className={cn('flex min-h-0 flex-1 flex-col', isDesktop && 'relative border-r border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-4')}>
              {isDesktop ? (
                <PanelResizeHandle
                  panel="agent"
                  side="left"
                  label="拖拽调整 Agent 对话区宽度"
                  onBegin={beginPanelResize}
                />
              ) : null}
              <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', !isDesktop && 'rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-soft)]')}>
                {agentPanel}
              </div>
            </div>
          ) : null}

          {isDesktop && showCoverPanel && coverPanel ? (
            <div className="min-h-0 overflow-hidden">{coverPanel}</div>
          ) : isDesktop && showMetaPanel && metaPanel ? (
            <div className="min-h-0 overflow-hidden">{metaPanel}</div>
          ) : isDesktop && taskSidebar ? (
            <div className="min-h-0 overflow-hidden">{taskSidebar}</div>
          ) : null}

          {!isDesktop && mobilePanel === 'chapters' ? (
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-soft)]">
              {previewHref ? (
                <Link
                  to={previewHref}
                  className="mb-3 inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]"
                >
                  <BookOpen className="h-4 w-4" />
                  预览阅读
                </Link>
              ) : null}
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChapterSidebar
                  chapters={chapters}
                  savedPlans={savedPlans}
                  selectedChapterId={selectedChapterId}
                  selectedTreeItemId={selectedTreeItemId}
                  catalogPreview={catalogPreview}
                  novelWordCountLabel={wordCountLabel}
                  chapterCountLabel={`共 ${chapters.length} 章`}
                  novelTitle={novelTitle}
                  activeCoverLabel=""
                  onSelectChapter={onSelectChapter}
                  onSelectPlan={onSelectPlan}
                  onDeletePlan={onDeletePlan}
                  onSelectCatalog={onSelectCatalog}
                  onCreateChapter={onCreateChapter}
                />
              </div>
            </aside>
          ) : null}

          {!isDesktop && mobilePanel === 'cover' && coverPanel ? (
            <div className="min-h-0 overflow-hidden">{coverPanel}</div>
          ) : null}

          {!isDesktop && mobilePanel === 'meta' && metaPanel ? (
            <div className="min-h-0 overflow-hidden">{metaPanel}</div>
          ) : null}
        </div>
      </div>
      {chapterDraft && showChapterSettings ? (
        <ChapterSettingsPanel
          chapterDraft={chapterDraft}
          onChange={onChange}
          onRequestStatusAction={requestStatusAction}
          onRequestVisibilityAction={requestVisibilityAction}
          onRequestDelete={handleDeleteRequest}
          onClose={() => setShowChapterSettings(false)}
          overlayClassName="z-[110]"
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ''}
        description={confirmDialog?.description ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        cancelLabel={confirmDialog?.cancelLabel}
        tone={confirmDialog?.tone}
        busy={settingsBusy}
        onCancel={() => {
          if (settingsBusy) {
            return
          }
          setConfirmDialog(null)
        }}
        onConfirm={() => void handleConfirmDialog()}
      />
    </div>,
    document.body,
  )
}
