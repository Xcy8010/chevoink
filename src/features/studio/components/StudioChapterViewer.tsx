import { MessageSquarePlus, X } from 'lucide-react'

import type { ChapterDraftState, EditorSelectionState } from '../types'

type Props = {
  draft: ChapterDraftState | null
  loading?: boolean
  selection: EditorSelectionState
  onChange: (draft: ChapterDraftState) => void
  onSelectionChange: (selection: EditorSelectionState) => void
  onAddSelection: () => void
  onClose: () => void
  onBlur: () => void
}

export default function StudioChapterViewer({ draft, loading, selection, onChange, onSelectionChange, onAddSelection, onClose, onBlur }: Props) {
  const emitSelection = (target: HTMLTextAreaElement) => onSelectionChange({ start: target.selectionStart ?? 0, end: target.selectionEnd ?? 0, text: target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0) })
  return <section className="flex h-full min-h-0 flex-col bg-[var(--surface-default)]">
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">{draft?.title || '章节查看器'}</span>
      <button type="button" disabled={!selection.text.trim()} onClick={onAddSelection} className="inline-flex h-7 items-center gap-1 px-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-35"><MessageSquarePlus className="h-3.5 w-3.5" />添加到对话</button>
      <button type="button" onClick={onClose} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="关闭查看器"><X className="h-4 w-4" /></button>
    </div>
    {loading && !draft ? <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-secondary)]">正在载入章节…</div> : draft ? <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
      <textarea value={draft.content} onChange={(event) => { onChange({ ...draft, content: event.target.value }); emitSelection(event.target) }} onSelect={(event) => emitSelection(event.currentTarget)} onClick={(event) => emitSelection(event.currentTarget)} onKeyUp={(event) => emitSelection(event.currentTarget)} onBlur={(event) => { emitSelection(event.currentTarget); onBlur() }} className="h-full w-full resize-none bg-transparent font-serif text-[15px] leading-8 text-[var(--text-primary)] outline-none" placeholder="继续写这一章的正文。" />
    </div> : <div className="flex flex-1 items-center justify-center px-8 text-center text-xs leading-6 text-[var(--text-secondary)]">从右侧作品树选择章节，在这里查看和修改正文。</div>}
  </section>
}
