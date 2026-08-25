import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { BrainCircuit, ChevronLeft, ChevronRight, Files, ListTodo, PanelLeftClose, PanelRightClose } from 'lucide-react'

import type { ResizablePanel } from '../panel-widths'
import { PanelResizeHandle } from '../panel-resize'

type Props = {
  taskRail: ReactNode
  conversation: ReactNode
  inspector: ReactNode
  viewer?: ReactNode
  leftOpen: boolean
  rightOpen: boolean
  taskWidth: number
  inspectorWidth: number
  viewerWidth: number
  onToggleLeft: () => void
  onToggleRight: () => void
  onBeginResize: (panel: ResizablePanel, event: ReactPointerEvent<HTMLDivElement>) => void
}

/** Agent-first 工作台：默认只保留两条窄轨，需要时再展开任务、作品与证据。 */
export default function WorkPerspective({ taskRail, conversation, inspector, viewer, leftOpen, rightOpen, taskWidth, inspectorWidth, viewerWidth, onToggleLeft, onToggleRight, onBeginResize }: Props) {
  return <div className="flex h-full min-h-0 overflow-hidden bg-[var(--surface-default)]">
    <aside className="relative h-full min-h-0 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--app-bg)]" style={{ width: leftOpen ? taskWidth : 46 }}>
      {leftOpen ? <><div className="h-full min-h-0 overflow-hidden">{taskRail}</div><button type="button" onClick={onToggleLeft} className="absolute right-1 top-2 z-20 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="收起任务区"><PanelLeftClose className="h-4 w-4" /></button><PanelResizeHandle panel="workTask" side="right" label="调整任务区宽度" onBegin={onBeginResize} /></> : <div className="flex h-full flex-col items-center py-2"><button type="button" onClick={onToggleLeft} className="inline-flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="展开任务区"><ChevronRight className="h-4 w-4" /></button><div className="mt-3 h-px w-5 bg-[var(--border-subtle)]" /><ListTodo className="mt-4 h-4 w-4 text-[var(--text-tertiary)]" /></div>}
    </aside>
    <main className="min-w-[340px] flex-1 overflow-hidden bg-[var(--surface-default)]">{conversation}</main>
    {viewer ? <section className="relative h-full min-h-0 shrink-0 border-l border-[var(--border-subtle)]" style={{ width: viewerWidth }}><PanelResizeHandle panel="workViewer" side="left" label="调整查看器宽度" onBegin={onBeginResize} />{viewer}</section> : null}
    <aside className="relative h-full min-h-0 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--app-bg)]" style={{ width: rightOpen ? inspectorWidth : 46 }}>
      {rightOpen ? <><button type="button" onClick={onToggleRight} className="absolute left-1 top-2 z-20 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="收起检查区"><PanelRightClose className="h-4 w-4" /></button><PanelResizeHandle panel="workInspector" side="left" label="调整检查区宽度" onBegin={onBeginResize} /><div className="h-full min-h-0 overflow-hidden">{inspector}</div></> : <div className="flex h-full flex-col items-center py-2"><button type="button" onClick={onToggleRight} className="inline-flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="展开检查区"><ChevronLeft className="h-4 w-4" /></button><div className="mt-3 h-px w-5 bg-[var(--border-subtle)]" /><Files className="mt-4 h-4 w-4 text-[var(--text-tertiary)]" /><BrainCircuit className="mt-4 h-4 w-4 text-[var(--text-tertiary)]" /></div>}
    </aside>
  </div>
}
