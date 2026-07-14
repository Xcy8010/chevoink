import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive,
  ArrowLeft,
  Clock3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileText as FileTextIcon,
  FolderTree,
  Globe2,
  Lock,
  Save,
  Settings2,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { cn } from '@/lib/utils'
import type { ChapterStatus, Novel, StudioPayload, Visibility } from '../../../../shared/contracts/index.js'
import type {
  ChapterDraftState,
  ChapterPendingReview,
  EditorSelectionState,
  SaveState,
} from '../types'
import ChapterChangeReview from './ChapterChangeReview'
import ConfirmDialog from './ConfirmDialog'
import { ActionCommandButton, InputLabel, SaveStatusPill } from './StudioControls'
import WorkspaceNovelSwitcher from './WorkspaceNovelSwitcher'

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

type ImmersiveComposerProps = {
  currentNovelId: string
  novelTitle: string
  novelTitleMissing?: boolean
  novelOptions: Novel[]
  chapterDraft: ChapterDraftState | null
  chapters: StudioPayload['chapters']
  selectedChapterId: string | null
  saveState: SaveState
  saveMessage: string
  wordCountLabel: string
  onClose: () => void
  onSave: () => void
  onRetrySave?: () => void
  onSelectNovel: (novelId: string) => void
  onCreateNovel: () => void
  onEditNovelTitle?: () => void
  onSelectChapter: (chapterId: string) => void
  onCreateChapter: () => void
  onDeleteChapter: () => void | Promise<void>
  onChange: (next: ChapterDraftState) => void
  onSelectionChange?: (next: EditorSelectionState) => void
  pendingChapterReview?: ChapterPendingReview | null
  pendingChapterReviewBusy?: boolean
  onKeepPendingReview?: () => void
  onRevertPendingReview?: () => void
  agentPanel: ReactNode
  switchingNovel?: boolean
}

export default function ImmersiveComposer({
  currentNovelId,
  novelTitle,
  novelTitleMissing = false,
  novelOptions,
  chapterDraft,
  chapters,
  selectedChapterId,
  saveState,
  saveMessage,
  wordCountLabel,
  onClose,
  onSave,
  onRetrySave,
  onSelectNovel,
  onCreateNovel,
  onEditNovelTitle,
  onSelectChapter,
  onCreateChapter,
  onDeleteChapter,
  onChange,
  onSelectionChange,
  pendingChapterReview = null,
  pendingChapterReviewBusy = false,
  onKeepPendingReview,
  onRevertPendingReview,
  agentPanel,
  switchingNovel = false,
}: ImmersiveComposerProps) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : false,
  )
  const [mobilePanel, setMobilePanel] = useState<'agent' | 'editor' | 'chapters'>('editor')
  const [novelExpanded, setNovelExpanded] = useState(true)
  const [chapterFolderExpanded, setChapterFolderExpanded] = useState(true)
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
    <div className="fixed inset-0 z-[90] isolate overflow-hidden bg-[#f5f1ea] text-[var(--text-primary)]">
      <div className="mx-auto flex h-full max-w-[140rem] flex-col px-4 py-4 md:px-6 md:py-5">
        <div
          className={cn(
            'border-b border-[var(--border-subtle)] pb-4',
            isDesktop ? 'flex flex-wrap items-center justify-between gap-3' : 'space-y-3',
          )}
        >
          <div className="min-w-0 space-y-3">
            <WorkspaceNovelSwitcher
              currentNovelId={currentNovelId}
              currentNovelTitle={novelTitle}
              novels={novelOptions}
              busy={switchingNovel}
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
                    className="inline-flex h-9 items-center rounded-full bg-[#101114] px-4 text-sm font-medium text-white transition hover:bg-[#17191f]"
                  >
                    去命名作品
                  </button>
                ) : null}
              </div>
              <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)] md:text-xl">
                {chapterDraft?.title || '继续写作'}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveStatusPill state={saveState} message={saveMessage} onRetry={onRetrySave} />
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

        {!isDesktop ? (
          <div className="mt-4 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-secondary)]">当前创作上下文</p>
                <p className="mt-2 truncate text-base font-semibold text-[var(--text-primary)]">
                  {chapterDraft?.title || '当前还没有选中章节'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{wordCountLabel}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChapterSettings(true)}
                disabled={!chapterDraft}
              >
                <Settings2 className="h-4 w-4" />
                设置
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={onCreateChapter}>
                <FilePlus2 className="h-4 w-4" />
                新建章节
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
        ) : null}

        {!isDesktop ? (
          <div className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-[#f5f1ea] px-1 py-4">
            <div className="inline-flex min-w-full gap-2">
              {[
                ['editor', '写作'],
                ['chapters', '章节'],
                ['agent', 'Agent'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobilePanel(key as 'agent' | 'editor' | 'chapters')}
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
            'min-h-0 flex-1 pt-4',
            isDesktop ? 'overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] xl:grid xl:grid-cols-[320px_minmax(0,1fr)_280px]' : '',
          )}
        >
          {(isDesktop || mobilePanel === 'agent') ? (
            <div className={cn('min-h-0', isDesktop && 'border-r border-[var(--border-subtle)] bg-[#f7f3ec] px-4 py-4')}>
              <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', !isDesktop && 'rounded-[28px] border border-[var(--border-subtle)] bg-[#f7f3ec] p-4 shadow-[var(--shadow-soft)]')}>
                {agentPanel}
              </div>
            </div>
          ) : null}

          {(isDesktop || mobilePanel === 'editor') ? (
            <div className={cn('flex h-full min-h-0 flex-col', isDesktop && 'border-r border-[var(--border-subtle)] px-5 py-5 xl:px-6')}>
              {chapterDraft ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                    <SaveStatusPill state={saveState} message={saveMessage} onRetry={onRetrySave} />
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={onCreateChapter}>
                        <FilePlus2 className="h-4 w-4" />
                        新建章节
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowChapterSettings((current) => !current)}
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

          {(isDesktop || mobilePanel === 'chapters') ? (
            <aside className={cn('min-h-0 overflow-hidden', isDesktop ? 'bg-[#f7f3ec] p-4' : 'rounded-[28px] border border-[var(--border-subtle)] bg-[#f7f3ec] p-4 shadow-[var(--shadow-soft)]')}>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">章节树</p>
                  <span className="text-xs text-[var(--text-tertiary)]">共 {chapters.length} 章</span>
                </div>
                <Button onClick={onCreateChapter} variant="ghost" size="sm">
                  <FilePlus2 className="h-4 w-4" />
                  新建章节
                </Button>
              </div>
              <div className="mt-3 min-h-0 overflow-y-auto overscroll-contain pr-1">
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
                    <span className="truncate">当前作品</span>
                  </button>

                  {novelExpanded ? (
                    <div className="ml-4 border-l border-[var(--border-subtle)] pl-2">
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
                                selectedChapterId === chapter.id
                                  ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                              )}
                            >
                              <FileTextIcon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
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
            </aside>
          ) : null}
        </div>
      </div>
      {chapterDraft && showChapterSettings ? (
        <div
          className="fixed inset-0 z-[110] bg-[rgba(15,23,42,0.18)]"
          onClick={() => setShowChapterSettings(false)}
        >
          <div
            className="absolute inset-y-4 right-4 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full min-h-0 flex-col p-5">
              <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">章节设置</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    调整当前章节状态、可见范围和摘要。
                  </p>
                </div>
                <Button
                  onClick={() => setShowChapterSettings(false)}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 px-0"
                  aria-label="关闭章节设置"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <label className="space-y-2">
                  <InputLabel label="章节标题" />
                  <TextInput
                    value={chapterDraft.title}
                    onChange={(event) => onChange({ ...chapterDraft, title: event.target.value })}
                    placeholder="例如：第三十七章 失控回环"
                  />
                </label>

                <div className="space-y-4">
                  <label className="space-y-2">
                    <InputLabel label="状态操作" hint="直接点击动作按钮，确认后立即执行。" />
                    <div className="flex flex-wrap gap-2">
                      <ActionCommandButton
                        icon={<FileTextIcon className="h-4 w-4" />}
                        label="状态设置为草稿"
                        onClick={() => requestStatusAction('draft')}
                        disabled={chapterDraft.status === 'draft'}
                      />
                      <ActionCommandButton
                        icon={<Upload className="h-4 w-4" />}
                        label="立即上架"
                        onClick={() => requestStatusAction('published')}
                        disabled={chapterDraft.status === 'published'}
                      />
                      <ActionCommandButton
                        icon={<Clock3 className="h-4 w-4" />}
                        label="状态设置为定时"
                        onClick={() => requestStatusAction('scheduled')}
                        disabled={chapterDraft.status === 'scheduled'}
                      />
                      <ActionCommandButton
                        icon={<Archive className="h-4 w-4" />}
                        label="立即下架"
                        onClick={() => requestStatusAction('archived')}
                        disabled={chapterDraft.status === 'archived'}
                        tone="danger"
                      />
                    </div>
                  </label>
                  <label className="space-y-2">
                    <InputLabel label="可见范围操作" hint="直接执行可见范围变更，不需要再手动挑选。" />
                    <div className="flex flex-wrap gap-2">
                      <ActionCommandButton
                        icon={<Lock className="h-4 w-4" />}
                        label="可见范围设置为个人"
                        onClick={() => requestVisibilityAction('private')}
                        disabled={chapterDraft.visibility === 'private'}
                      />
                      <ActionCommandButton
                        icon={<Users className="h-4 w-4" />}
                        label="可见范围设置为关注可见"
                        onClick={() => requestVisibilityAction('followers')}
                        disabled={chapterDraft.visibility === 'followers'}
                      />
                      <ActionCommandButton
                        icon={<Globe2 className="h-4 w-4" />}
                        label="可见范围设置为公开"
                        onClick={() => requestVisibilityAction('public')}
                        disabled={chapterDraft.visibility === 'public'}
                      />
                    </div>
                  </label>
                </div>

                <label className="space-y-2">
                  <InputLabel label="章节摘要" />
                  <textarea
                    value={chapterDraft.summary}
                    onChange={(event) => onChange({ ...chapterDraft, summary: event.target.value })}
                    rows={5}
                    className="min-h-[9rem] w-full resize-y overflow-y-auto rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
                    placeholder="补充这一章的目标、节奏或推进重点。"
                  />
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
                <Button
                  onClick={handleDeleteRequest}
                  variant="ghost"
                  className="text-[rgb(153,27,27)] hover:bg-[rgba(127,29,29,0.08)] hover:text-[rgb(127,29,29)]"
                >
                  <Trash2 className="h-4 w-4" />
                  删除章节
                </Button>
                <Button onClick={() => setShowChapterSettings(false)} variant="secondary">
                  完成
                </Button>
              </div>
            </div>
          </div>
        </div>
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
