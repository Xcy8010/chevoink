import { FilePenLine, LoaderCircle, RefreshCcw, Save, Settings2, WandSparkles } from 'lucide-react'

import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import type { ChapterStatus } from '../../../../shared/contracts/index.js'

import { type ChapterDraftState, type SaveState } from '../types'
import { SaveStatusPill } from './StudioControls'

type EditorCanvasProps = {
  chapterDraft: ChapterDraftState | null
  chapterLoading: boolean
  chapterErrorMessage: string | null
  chapterSaveState: SaveState
  chapterSaveMessage: string
  latestWordCountLabel: string
  selectedCommentCount: number
  onSelectionChange?: (next: { start: number; end: number; text: string }) => void
  onSave: () => void
  onEnterImmersive: () => void
  onRetryLoad: () => void
  onCreateChapter: () => void
  onOpenChapterSettings: () => void
  onStatusChange: (nextStatus: ChapterStatus) => void
  onChange: (next: ChapterDraftState) => void
  onRetrySave?: () => void
  embedded?: boolean
}

export default function EditorCanvas({
  chapterDraft,
  chapterLoading,
  chapterErrorMessage,
  chapterSaveState,
  chapterSaveMessage,
  latestWordCountLabel,
  selectedCommentCount,
  onSelectionChange,
  onSave,
  onEnterImmersive,
  onRetryLoad,
  onCreateChapter,
  onOpenChapterSettings,
  onStatusChange: _onStatusChange,
  onChange,
  onRetrySave,
  embedded = false,
}: EditorCanvasProps) {
  const sectionClassName = embedded
    ? 'flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-default)]'
    : 'flex h-full min-h-0 flex-col overflow-hidden pb-2'

  if (chapterLoading && !chapterDraft) {
    return (
      <Surface as="section" padding="md" className={embedded ? 'flex h-full min-h-[32rem] items-center justify-center border-0 shadow-none' : 'flex h-full min-h-[32rem] items-center justify-center'}>
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          <span>正在加载章节内容...</span>
        </div>
      </Surface>
    )
  }

  if (chapterErrorMessage && !chapterDraft) {
    return (
      <Surface as="section" padding="md" className={embedded ? 'space-y-4 border-0 shadow-none' : 'space-y-4'}>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">这一章暂时无法打开</h2>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">{chapterErrorMessage}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetryLoad} variant="secondary">
            <RefreshCcw className="h-4 w-4" />
            重新加载
          </Button>
          <Button onClick={onCreateChapter} variant="ghost">
            <FilePenLine className="h-4 w-4" />
            新建章节
          </Button>
        </div>
      </Surface>
    )
  }

  if (!chapterDraft) {
    return (
      <Surface as="section" padding="md" className={embedded ? 'flex h-full min-h-[32rem] items-center justify-center border-0 shadow-none' : 'flex h-full min-h-[32rem] items-center justify-center'}>
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">从章节目录中选择一章</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">也可以直接新建章节，马上开始写作。</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={onCreateChapter} variant="secondary">
              <FilePenLine className="h-4 w-4" />
              新建章节
            </Button>
            <Button onClick={onEnterImmersive} variant="ghost">
              <WandSparkles className="h-4 w-4" />
              进入沉浸创作
            </Button>
          </div>
        </div>
      </Surface>
    )
  }

  function emitSelection(target: HTMLTextAreaElement) {
    onSelectionChange?.({
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
      text: target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0),
    })
  }

  return (
    <Surface as="section" padding="md" className={embedded ? `${sectionClassName} border-0 px-5 py-5 shadow-none xl:px-6` : sectionClassName}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-4">
        <SaveStatusPill
          state={chapterSaveState}
          message={chapterSaveMessage}
          onRetry={onRetrySave}
          compact
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onOpenChapterSettings} variant="ghost" size="sm">
            <Settings2 className="h-4 w-4" />
            章节设置
          </Button>
          <Button onClick={onSave} variant="secondary" size="sm" disabled={chapterSaveState === 'saving'}>
            <Save className="h-4 w-4" />
            保存
          </Button>
          <Button onClick={onEnterImmersive} variant="ghost" size="sm">
            <WandSparkles className="h-4 w-4" />
            沉浸
          </Button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pr-1 pb-2">
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
          rows={20}
          className="min-h-[34rem] w-full flex-1 resize-y overflow-y-auto rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-5 py-5 text-sm leading-8 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
          placeholder="继续写这一章。章节标题、摘要、状态和可见范围已移到章节设置里。"
        />
      </div>
    </Surface>
  )
}
