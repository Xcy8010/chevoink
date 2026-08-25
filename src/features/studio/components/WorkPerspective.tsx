import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { BookCopy, BrainCircuit, ChevronLeft, ChevronRight, GitCompareArrows, ListTodo, PanelLeftClose, PanelRightClose, ScrollText } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ResizablePanel } from '../panel-widths'
import { PanelResizeHandle } from '../panel-resize'
import type { WorkInspectorTab } from './WorkInspector'

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
  inspectorTab: WorkInspectorTab
  onSelectInspectorTab: (tab: WorkInspectorTab) => void
  onBeginResize: (panel: ResizablePanel, event: ReactPointerEvent<HTMLDivElement>) => void
}

const inspectorRailItems = [
  { key: 'work' as const, label: '作品', icon: BookCopy },
  { key: 'context' as const, label: '上下文', icon: ScrollText },
  { key: 'changes' as const, label: '变更', icon: GitCompareArrows },
  { key: 'memory' as const, label: '记忆', icon: BrainCircuit },
]

/** Agent-first 工作台：默认只保留两条窄轨，需要时再展开任务、作品与证据。 */
export default function WorkPerspective({ taskRail, conversation, inspector, viewer, leftOpen, rightOpen, taskWidth, inspectorWidth, viewerWidth, onToggleLeft, onToggleRight, inspectorTab, onSelectInspectorTab, onBeginResize }: Props) {
  return <div className="flex h-full min-h-0 overflow-hidden bg-[var(--surface-default)]">
    <aside className="relative h-full min-h-0 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--app-bg)]" style={{ width: leftOpen ? taskWidth : 46 }}>
      {leftOpen ? <><div className="h-full min-h-0 overflow-hidden">{taskRail}</div><button type="button" onClick={onToggleLeft} className="absolute right-1 top-2 z-20 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="收起任务区"><PanelLeftClose className="h-4 w-4" /></button><PanelResizeHandle panel="workTask" side="right" label="调整任务区宽度" onBegin={onBeginResize} /></> : <div className="flex h-full flex-col items-center py-2"><button type="button" onClick={onToggleLeft} className="inline-flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="展开任务区"><ChevronRight className="h-4 w-4" /></button><div className="mt-3 h-px w-5 bg-[var(--border-subtle)]" /><ListTodo className="mt-4 h-4 w-4 text-[var(--text-tertiary)]" /></div>}
    </aside>
    <main className="min-w-[340px] flex-1 overflow-hidden bg-[var(--surface-default)]">{conversation}</main>
    {viewer ? <section className="relative h-full min-h-0 shrink-0 border-l border-[var(--border-subtle)]" style={{ width: viewerWidth }}><PanelResizeHandle panel="workViewer" side="left" label="调整查看器宽度" onBegin={onBeginResize} />{viewer}</section> : null}
    <aside className="relative h-full min-h-0 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--app-bg)]" style={{ width: rightOpen ? inspectorWidth : 46 }}>
      {rightOpen ? <><button type="button" onClick={onToggleRight} className="absolute left-1 top-2 z-20 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="收起检查区"><PanelRightClose className="h-4 w-4" /></button><PanelResizeHandle panel="workInspector" side="left" label="调整检查区宽度" onBegin={onBeginResize} /><div className="h-full min-h-0 overflow-hidden">{inspector}</div></> : <div className="flex h-full flex-col items-center py-2"><button type="button" onClick={onToggleRight} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="展开检查区"><ChevronLeft className="h-4 w-4" /></button><div className="my-3 h-px w-5 bg-[var(--border-subtle)]" />{inspectorRailItems.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => { onSelectInspectorTab(key); onToggleRight() }} className={cn('mb-1 inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors', inspectorTab === key ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]')} aria-label={label} title={label}><Icon className="h-4 w-4" /></button>)}</div>}
    </aside>
  </div>
}
