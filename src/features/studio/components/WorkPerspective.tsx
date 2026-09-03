import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { BookCopy, Brain, ChevronLeft, GitCompareArrows, Network, PanelRightClose, Wrench } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ResizablePanel } from '../panel-widths'
import { PanelResizeHandle } from '../panel-resize'
import type { WorkInspectorTab } from './WorkInspector'
import { FLOATING_DOCK_MIN_CLEARANCE, shouldShowWorkActivityDock } from './work-layout'

type Props = {
  conversationRail: ReactNode
  conversation: ReactNode
  activityDock?: ReactNode
  inspector: ReactNode
  viewer?: ReactNode
  /** Agent 聊天区最小宽度：左侧栏折叠后变小（保底 160），展开后回420，变化带过渡动画 */
  conversationMinWidth?: number
  /** 外层创作侧栏是否展开：折叠后对话区在整个视口居中（任务状态卡改悬浮，不再挤压对话列） */
  outerSidebarOpen?: boolean
  rightOpen: boolean
  inspectorWidth: number
  viewerWidth: number
  onToggleRight: () => void
  inspectorTab: WorkInspectorTab
  onSelectInspectorTab: (tab: WorkInspectorTab) => void
  onBeginResize: (panel: ResizablePanel, event: ReactPointerEvent<HTMLDivElement>, linkedPanel?: ResizablePanel) => void
}

const inspectorRailItems = [
  { key: 'work' as const, label: '作品', icon: BookCopy },
  { key: 'context' as const, label: '记忆', icon: Brain },
  { key: 'changes' as const, label: '变更', icon: GitCompareArrows },
  { key: 'memory' as const, label: '关系网', icon: Network },
  { key: 'skills' as const, label: '技能', icon: Wrench },
]

const PANEL_MOTION_MS = 220

/** Agent-first 工作台：左侧窄轨对应当前任务的逐轮聊天，右侧窄轨按需展开作品与证据。 */
export default function WorkPerspective({ conversationRail, conversation, activityDock, inspector, viewer, conversationMinWidth = 420, outerSidebarOpen = true, rightOpen, inspectorWidth, viewerWidth, onToggleRight, onSelectInspectorTab, onBeginResize }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [renderedViewer, setRenderedViewer] = useState<ReactNode>(viewer)
  const viewerOpen = Boolean(viewer)
  const viewerPresent = Boolean(renderedViewer)
  // 查看器打开时按参考稿优先保证正文阅读宽度：约 50% 查看器 / 18.5% 检查区，
  // 其余空间留给对话与窄轨；用户一旦拖拽成自定义宽度就完全尊重持久化结果。
  const resolvedInspectorWidth = viewerOpen
    ? inspectorWidth === 520
      ? Math.max(280, Math.round((containerWidth || 1600) * 0.185))
      : inspectorWidth
    : inspectorWidth
  const resolvedViewerWidth = viewerOpen
    ? viewerWidth === 900
      ? Math.max(560, Math.min(1280, Math.round((containerWidth || 1600) * 0.5)))
      : viewerWidth
    : viewerWidth
  const leftWidth = 0
  const rightWidth = rightOpen ? resolvedInspectorWidth : 46
  const showActivityDock = shouldShowWorkActivityDock({
    containerWidth,
    leftWidth,
    rightWidth,
    hasActivity: Boolean(activityDock),
    hasViewer: viewerPresent,
  })
  // 外层侧栏折叠时对话列需在整个视口居中：任务状态卡改为悬浮定位（不再占据 main 右侧流空间），
  // 对话列 mx-auto 即落在视口中心；外层侧栏展开或窗口不够宽时保持流内布局不变。
  // 悬浮层级必须高于 main（z-40）：悬浮后 main 的 flex-1 占满全宽，其不透明背景会盖住低层级的卡片。
  const floatDock = !outerSidebarOpen && showActivityDock && containerWidth - rightWidth >= FLOATING_DOCK_MIN_CLEARANCE

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

  return <div ref={rootRef} data-studio-layout="work" data-activity-dock={showActivityDock ? 'visible' : 'hidden'} className="work-perspective relative flex h-full min-h-0 overflow-hidden bg-[var(--surface-default)]">
    <aside className="h-full w-11 shrink-0 bg-transparent motion-safe:animate-[conversation-rail-in_220ms_cubic-bezier(.22,1,.36,1)]">{conversationRail}</aside>
    <main
      className="relative z-40 flex-1 overflow-visible bg-[var(--surface-default)] transition-[min-width] duration-300 ease-out"
      style={{
        minWidth: conversationMinWidth,
      }}
    >{conversation}</main>
    {showActivityDock ? <aside className={cn('h-full min-h-0 w-[296px] shrink-0 px-3 py-4', floatDock ? 'absolute top-0 z-50 bg-transparent' : 'bg-[var(--surface-default)]')} style={floatDock ? { right: rightWidth } : undefined}>{activityDock}</aside> : null}
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
