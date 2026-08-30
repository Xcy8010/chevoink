import { lazy, Suspense, useEffect, useState } from 'react'

import type { EditorSelectionState } from '../types'
import { useStreamingAutoFollow } from './useStreamingAutoFollow'

const PlanRichMarkdownEditor = lazy(() => import('./PlanRichMarkdownEditor'))

export type PlanEditorMode = 'preview' | 'markdown'

type Props = {
  documentId: string
  markdown: string
  editable?: boolean
  mobile?: boolean
  className?: string
  onChange?: (markdown: string) => void
  onBlur?: () => void
  onSelectionChange?: (selection: EditorSelectionState) => void
  streaming?: boolean
}

function PlanEditorModeSwitch({ mode, onChange }: { mode: PlanEditorMode; onChange: (mode: PlanEditorMode) => void }) {
  return (
    <div
      className="inline-flex h-8 items-center rounded-lg bg-[var(--surface-muted)] p-0.5 text-xs"
      role="group"
      aria-label="计划文档显示方式"
    >
      {(['preview', 'markdown'] as const).map((nextMode) => (
        <button
          key={nextMode}
          type="button"
          onClick={() => onChange(nextMode)}
          aria-pressed={mode === nextMode}
          className={`h-7 rounded-md px-3 transition-[background-color,color,box-shadow] duration-200 ${
            mode === nextMode
              ? 'bg-[var(--surface-default)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {nextMode === 'preview' ? '预览' : 'Markdown'}
        </button>
      ))}
    </div>
  )
}

function emitTextareaSelection(target: HTMLTextAreaElement, onSelectionChange?: (selection: EditorSelectionState) => void) {
  const start = target.selectionStart ?? 0
  const end = target.selectionEnd ?? start
  onSelectionChange?.({ start, end, text: target.value.slice(start, end) })
}

export default function PlanMarkdownEditor({
  documentId,
  markdown,
  editable = true,
  mobile = false,
  className = '',
  onChange,
  onBlur,
  onSelectionChange,
  streaming = false,
}: Props) {
  const [mode, setMode] = useState<PlanEditorMode>('preview')
  const markdownScroll = useStreamingAutoFollow<HTMLTextAreaElement>(streaming, markdown)

  useEffect(() => {
    setMode('preview')
  }, [documentId])

  return (
    <div className={`plan-markdown-editor flex min-h-0 flex-1 flex-col ${className}`} data-mode={mode}>
      <div className="sticky top-0 z-20 flex shrink-0 justify-end bg-[var(--surface-default)]/95 pb-2 backdrop-blur-sm">
        <PlanEditorModeSwitch mode={mode} onChange={setMode} />
      </div>

      {mode === 'preview' ? (
        <Suspense
          fallback={(
            <div className="flex min-h-[12rem] flex-1 items-center justify-center text-sm text-[var(--text-tertiary)]">
              正在准备 Markdown 预览…
            </div>
          )}
        >
          <PlanRichMarkdownEditor
            key={documentId}
            markdown={markdown}
            editable={editable}
            mobile={mobile}
            onChange={onChange}
            onBlur={onBlur}
            onSelectionChange={onSelectionChange}
            streaming={streaming}
          />
        </Suspense>
      ) : (
        <textarea
          ref={markdownScroll.ref}
          onScroll={markdownScroll.onScroll}
          value={markdown}
          readOnly={!editable}
          onChange={(event) => {
            onChange?.(event.target.value)
            emitTextareaSelection(event.target, onSelectionChange)
          }}
          onSelect={(event) => emitTextareaSelection(event.currentTarget, onSelectionChange)}
          onClick={(event) => emitTextareaSelection(event.currentTarget, onSelectionChange)}
          onKeyUp={(event) => emitTextareaSelection(event.currentTarget, onSelectionChange)}
          onBlur={(event) => {
            emitTextareaSelection(event.currentTarget, onSelectionChange)
            onBlur?.()
          }}
          spellCheck={false}
          className={`${
            mobile ? 'min-h-[60vh]' : 'min-h-[28rem] flex-1'
          } w-full resize-none overflow-y-auto bg-transparent font-mono text-[13px] leading-7 text-[var(--text-primary)] outline-none`}
          placeholder="继续完善这份创作计划。"
          aria-label="Markdown 原文"
        />
      )}
    </div>
  )
}
