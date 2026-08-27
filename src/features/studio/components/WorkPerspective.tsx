import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { BookCopy, BrainCircuit, ChevronLeft, ChevronRight, GitCompareArrows, ListTodo, PanelLeftClose, PanelRightClose, ScrollText } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ResizablePanel } from '../panel-widths'
import { PanelResizeHandle } from '../panel-resize'
import type { WorkInspectorTab } from './WorkInspector'
import { shouldShowWorkActivityDock } from './work-layout'

type Props = {
  taskRail: ReactNode
  compactTaskRail?: ReactNode
  conversation: ReactNode
  activityDock?: ReactNode
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
  onBeginResize: (panel: ResizablePanel, event: ReactPointerEvent<HTMLDivElement>, linkedPanel?: ResizablePanel) => void
}

const inspectorRailItems = [
  { key: 'work' as const, label: '作品', icon: BookCopy },
  { key: 'context' as const, label: '上下文', icon: ScrollText },
  { key: 'changes' as const, label: '变更', icon: GitCompareArrows },
  { key: 'memory' as const, label: '记忆', icon: BrainCircuit },
]

const PANEL_MOTION_MS = 220

/** Agent-first 工作台：默认只保留两条窄轨，需要时再展开任务、作品与证据。 */
export default function WorkPerspective({ taskRail, compactTaskRail, conversation, activityDock, inspector, viewer, leftOpen, rightOpen, taskWidth, inspectorWidth, viewerWidth, onToggleLeft, onToggleRight, onSelectInspectorTab, onBeginResize }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [renderedViewer, setRenderedViewer] = useState<ReactNode>(viewer)
  const viewerOpen = Boolean(viewer)
  const viewerPresent = Boolean(renderedViewer)
  // 四区展开时按参考稿保持约 35% 对话 / 44% 查看器 / 19% 检查区；
  // 仅默认值按比例计算；用户一旦拖拽成自定义宽度就完全尊重持久化结果。
  const resolvedInspectorWidth = viewerOpen
    ? inspectorWidth === 520
      ? Math.max(280, Math.round((containerWidth || 1600) * 0.19))
      : inspectorWidth
    : inspectorWidth
  const resolvedViewerWidth = viewerOpen
    ? viewerWidth === 900
      ? Math.max(520, Math.min(viewerWidth, Math.round((containerWidth || 1600) * 0.44)))
      : viewerWidth
    : viewerWidth
  const leftWidth = leftOpen ? taskWidth : 54
  const rightWidth = rightOpen ? resolvedInspectorWidth : 46
  const showActivityDock = shouldShowWorkActivityDock({
    containerWidth,
    leftWidth,
    rightWidth,
    hasActivity: Boolean(activityDock),
    hasViewer: viewerPresent,
  })

  useEffect(() => {
    if (viewer) {
      setRenderedViewer(viewer)
      return
    }
    if (!renderedViewer) return
    const timeout = window.setTimeout(() => setRenderedViewer(undefined), PANEL_MOTION_MS)
    return () => window.clearTimeout(timeout)
  }, [renderedViewer, viewer])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const updateWidth = () => setContainerWidth(element.getBoundingClientRect().width)
    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return <div ref={rootRef} data-studio-layout="work" data-activity-dock={showActivityDock ? 'visible' : 'hidden'} className="work-perspective flex h-full min-h-0 overflow-hidden bg-[var(--surface-default)]">
    <aside data-studio-panel="workTask" className="studio-resizable-panel relative h-full min-h-0 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--app-bg)]" style={{ width: leftOpen ? taskWidth : 54 }}>
      <div className={cn('absolute inset-0 min-h-0 overflow-hidden transition-[opacity,transform] duration-200 ease-out', leftOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-2 opacity-0')}>{taskRail}</div>
      <div className={cn('absolute inset-0 transition-opacity duration-200 ease-out', leftOpen ? 'pointer-events-none opacity-0' : 'opacity-100')}>{compactTaskRail ?? <div className="flex h-full flex-col items-center py-2"><button type="button" onClick={onToggleLeft} className="inline-flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="展开任务区"><ChevronRight className="h-4 w-4" /></button><div className="mt-3 h-px w-5 bg-[var(--border-subtle)]" /><ListTodo className="mt-4 h-4 w-4 text-[var(--text-tertiary)]" /></div>}</div>
      {leftOpen ? <><button type="button" onClick={onToggleLeft} className="absolute right-1 top-2 z-20 rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]" aria-label="收起任务区"><PanelLeftClose className="h-4 w-4" /></button><PanelResizeHandle panel="workTask" side="right" label="调整任务区宽度" onBegin={onBeginResize} /></> : null}
    </aside>
    <main
      className="min-w-0 flex-1 overflow-hidden bg-[var(--surface-default)] transition-[padding] duration-200 ease-out"
      style={{ paddingLeft: showActivityDock && !rightOpen ? Math.max(0, Math.min(260, 296 + rightWidth - leftWidth)) : 0 }}
    >{conversation}</main>
    {showActivityDock ? <aside className="h-full min-h-0 w-[296px] shrink-0 bg-[var(--surface-default)] px-3 py-4">{activityDock}</aside> : null}
    <section data-studio-panel="workViewer" aria-hidden={!viewerOpen} className="studio-resizable-panel relative h-full min-h-0 shrink-0 overflow-hidden border-l border-[var(--border-subtle)]" style={{ width: viewerOpen ? resolvedViewerWidth : 0 }}>
      {viewerOpen ? <PanelResizeHandle panel="workViewer" side="left" label="调整查看器宽度" onBegin={onBeginResize} /> : null}
      <div className={cn('h-full min-w-[320px] transition-[opacity,transform] duration-200 ease-out', viewerOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-2 opacity-0')}>{renderedViewer}</div>
    </section>
    <aside data-studio-panel="workInspector" className="studio-resizable-panel relative h-full min-h-0 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--app-bg)]" style={{ width: rightOpen ? resolvedInspectorWidth : 46 }}>
      <div className={cn('absolute inset-0 min-h-0 overflow-hidden transition-[opacity,transform] duration-200 ease-out', rightOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-2 opacity-0')}>{inspector}</div>
      <div className={cn('absolute inset-0 flex h-full flex-col items-center py-2 transition-opacity duration-200 ease-out', rightOpen ? 'pointer-events-none opacity-0' : 'opacity-100')}><button type="button" onClick={onToggleRight} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]" aria-label="展开检查区"><ChevronLeft className="h-4 w-4" /></button><div className="my-3 h-px w-5 bg-[var(--border-subtle)]" />{inspectorRailItems.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => { onSelectInspectorTab(key); onToggleRight() }} className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label={label} title={label}><Icon className="h-4 w-4" /></button>)}</div>
      {rightOpen ? <><button type="button" onClick={onToggleRight} className="absolute left-1 top-2 z-20 rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]" aria-label="收起检查区"><PanelRightClose className="h-4 w-4" /></button><PanelResizeHandle panel="workInspector" linkedPanel={viewerOpen ? 'workViewer' : undefined} side="left" label="调整检查区宽度" onBegin={onBeginResize} /></> : null}
    </aside>
  </div>
}
