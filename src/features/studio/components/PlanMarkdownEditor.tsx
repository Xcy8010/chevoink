import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

import type { EditorSelectionState } from '../types'
import LocalFirstTextarea from './LocalFirstTextarea'
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

  // Milkdown 富文本每次击键都会同步上报 markdown，直接透传会让 StudioWorkspace 整树
  // 每字重渲染一遍（与章节正文同样的“打字断一下”问题）；这里先缓冲，停顿后一次性上报。
  const pendingMarkdownRef = useRef<string | null>(null)
  const markdownCommitTimerRef = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur

  const flushPendingMarkdown = useCallback(() => {
    if (markdownCommitTimerRef.current !== null) {
      window.clearTimeout(markdownCommitTimerRef.current)
      markdownCommitTimerRef.current = null
    }
    if (pendingMarkdownRef.current !== null) {
      const next = pendingMarkdownRef.current
      pendingMarkdownRef.current = null
      onChangeRef.current?.(next)
    }
  }, [])

  const handleRichMarkdownChange = useCallback(
    (next: string) => {
      pendingMarkdownRef.current = next
      if (markdownCommitTimerRef.current !== null) window.clearTimeout(markdownCommitTimerRef.current)
      markdownCommitTimerRef.current = window.setTimeout(() => {
        markdownCommitTimerRef.current = null
        flushPendingMarkdown()
      }, 160)
    },
    [flushPendingMarkdown],
  )

  const handleRichEditorBlur = useCallback(() => {
    // 失焦先把缓冲的计划内容上报，再交给外部的失焦保存逻辑。
    flushPendingMarkdown()
    onBlurRef.current?.()
  }, [flushPendingMarkdown])

  // 卸载时上报最后一批输入，防止切计划丢字。
  useEffect(
    () => () => {
      if (markdownCommitTimerRef.current !== null) window.clearTimeout(markdownCommitTimerRef.current)
      if (pendingMarkdownRef.current !== null) onChangeRef.current?.(pendingMarkdownRef.current)
    },
    [],
  )

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
            onChange={handleRichMarkdownChange}
            onBlur={handleRichEditorBlur}
            onSelectionChange={onSelectionChange}
            streaming={streaming}
          />
        </Suspense>
      ) : (
        <LocalFirstTextarea
          ref={markdownScroll.ref}
          onScroll={markdownScroll.onScroll}
          value={markdown}
          readOnly={!editable}
          resetKey={documentId}
          onCommit={(next) => onChange?.(next)}
          onSelectionChange={onSelectionChange}
          onBlur={onBlur}
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
