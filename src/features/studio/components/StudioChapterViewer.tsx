import { FilePlus2, FolderPlus, LoaderCircle, MessageSquarePlus, X } from 'lucide-react'

import type { ChapterDraftState, EditorSelectionState, WorkspaceDocumentView } from '../types'
import PlanMarkdownEditor from './PlanMarkdownEditor'

type Props = {
  draft: ChapterDraftState | null
  workspaceDocument?: WorkspaceDocumentView | null
  loading?: boolean
  selection: EditorSelectionState
  onChange: (draft: ChapterDraftState) => void
  onWorkspaceDocumentChange?: (next: { title: string; content: string }) => void
  onSelectionChange: (selection: EditorSelectionState) => void
  onAddSelection: () => void
  onCreateVolume?: () => void
  onCreateChapter?: () => void
  onClose: () => void
  onBlur: () => void
  streamingContent?: string
  writeLocked?: boolean
}

export default function StudioChapterViewer({ draft, workspaceDocument = null, loading, selection, onChange, onWorkspaceDocumentChange, onSelectionChange, onAddSelection, onCreateVolume, onCreateChapter, onClose, onBlur, streamingContent, writeLocked = false }: Props) {
  const emitSelection = (target: HTMLTextAreaElement) => onSelectionChange({ start: target.selectionStart ?? 0, end: target.selectionEnd ?? 0, text: target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0) })
  const hasDocument = Boolean(workspaceDocument)
  return <section className="flex h-full min-h-0 flex-col bg-[var(--surface-default)]">
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
      {workspaceDocument?.editableTitle ? <input value={workspaceDocument.title} disabled={writeLocked} onChange={(event) => onWorkspaceDocumentChange?.({ title: event.target.value, content: workspaceDocument.content })} className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--text-primary)] outline-none disabled:opacity-65" aria-label="文档标题" /> : <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">{workspaceDocument?.title || draft?.title || '查看器'}</span>}
      {writeLocked ? <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]"><LoaderCircle className="h-3 w-3 animate-spin" />Agent 写入中 · 暂停编辑</span> : null}
      {workspaceDocument?.kind === 'catalog' && onCreateVolume ? <button type="button" onClick={onCreateVolume} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><FolderPlus className="h-3.5 w-3.5" />新建卷</button> : null}
      {workspaceDocument?.kind === 'catalog' && onCreateChapter ? <button type="button" onClick={onCreateChapter} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><FilePlus2 className="h-3.5 w-3.5" />新建章节</button> : null}
      <button type="button" disabled={!selection.text.trim()} onClick={onAddSelection} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-35"><MessageSquarePlus className="h-3.5 w-3.5" />添加到输入框</button>
      <button type="button" onClick={onClose} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="关闭查看器"><X className="h-4 w-4" /></button>
    </div>
    {loading && !draft && !hasDocument ? <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-secondary)]">正在载入内容…</div> : workspaceDocument ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
      {workspaceDocument.kind === 'plan' ? <PlanMarkdownEditor documentId={workspaceDocument.id} markdown={streamingContent ?? workspaceDocument.content} editable={workspaceDocument.editableContent && !writeLocked} onChange={(content) => onWorkspaceDocumentChange?.({ title: workspaceDocument.title, content })} onSelectionChange={onSelectionChange} onBlur={onBlur} /> : <textarea value={streamingContent ?? workspaceDocument.content} readOnly={!workspaceDocument.editableContent || writeLocked} onChange={(event) => { onWorkspaceDocumentChange?.({ title: workspaceDocument.title, content: event.target.value }); emitSelection(event.target) }} onSelect={(event) => emitSelection(event.currentTarget)} onClick={(event) => emitSelection(event.currentTarget)} onKeyUp={(event) => emitSelection(event.currentTarget)} onBlur={(event) => { emitSelection(event.currentTarget); onBlur() }} className="h-full w-full resize-none bg-transparent text-[14px] leading-8 text-[var(--text-primary)] outline-none" placeholder="在这里维护目录内容。" />}
    </div> : draft ? <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
      <textarea value={streamingContent ?? draft.content} readOnly={writeLocked} onChange={(event) => { onChange({ ...draft, content: event.target.value }); emitSelection(event.target) }} onSelect={(event) => emitSelection(event.currentTarget)} onClick={(event) => emitSelection(event.currentTarget)} onKeyUp={(event) => emitSelection(event.currentTarget)} onBlur={(event) => { emitSelection(event.currentTarget); onBlur() }} className="h-full w-full resize-none bg-transparent font-serif text-[15px] leading-8 text-[var(--text-primary)] outline-none read-only:cursor-progress read-only:opacity-90" placeholder="继续写这一章的正文。" />
    </div> : <div className="flex flex-1 items-center justify-center px-8 text-center text-xs leading-6 text-[var(--text-secondary)]">从右侧作品树选择章节、计划或目录，在查看器中查看和修改。</div>}
  </section>
}
