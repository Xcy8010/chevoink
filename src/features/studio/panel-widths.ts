import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * 三区布局（章节树 / 内容区 / Agent 对话区）拖拽调宽的共享实现：
 * 创作中心与沉浸区共用同一份宽度限制、localStorage 持久化与指针拖拽逻辑。
 */

const STUDIO_PANEL_WIDTHS_STORAGE_KEY = 'studio-panel-widths'

export const TREE_PANEL_WIDTH_LIMITS = { min: 200, fallback: 264 }
export const AGENT_PANEL_WIDTH_LIMITS = { min: 340, fallback: 424 }
export const WORK_TASK_PANEL_WIDTH_LIMITS = { min: 200, fallback: 232 }
export const WORK_INSPECTOR_PANEL_WIDTH_LIMITS = { min: 220, fallback: 264 }
export const WORK_VIEWER_PANEL_WIDTH_LIMITS = { min: 320, fallback: 420 }

export type StudioPanelWidths = { tree: number; agent: number; workTask: number; workInspector: number; workViewer: number }
export type ResizablePanel = keyof StudioPanelWidths

function viewportMaximum(): number {
  return typeof window === 'undefined' ? 1920 : Math.max(420, window.innerWidth - 320)
}

function clampPanelWidth(value: number, limits: { min: number }): number {
  return Math.min(viewportMaximum(), Math.max(limits.min, Math.round(value)))
}

function readStoredPanelWidths(): StudioPanelWidths {
  const fallback: StudioPanelWidths = {
    tree: TREE_PANEL_WIDTH_LIMITS.fallback,
    agent: AGENT_PANEL_WIDTH_LIMITS.fallback,
    workTask: WORK_TASK_PANEL_WIDTH_LIMITS.fallback,
    workInspector: WORK_INSPECTOR_PANEL_WIDTH_LIMITS.fallback,
    workViewer: WORK_VIEWER_PANEL_WIDTH_LIMITS.fallback,
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(STUDIO_PANEL_WIDTHS_STORAGE_KEY)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<StudioPanelWidths>
    return {
      tree: clampPanelWidth(Number(parsed.tree) || fallback.tree, TREE_PANEL_WIDTH_LIMITS),
      agent: clampPanelWidth(Number(parsed.agent) || fallback.agent, AGENT_PANEL_WIDTH_LIMITS),
      workTask: clampPanelWidth(Number(parsed.workTask) || fallback.workTask, WORK_TASK_PANEL_WIDTH_LIMITS),
      workInspector: clampPanelWidth(Number(parsed.workInspector) || fallback.workInspector, WORK_INSPECTOR_PANEL_WIDTH_LIMITS),
      workViewer: clampPanelWidth(Number(parsed.workViewer) || fallback.workViewer, WORK_VIEWER_PANEL_WIDTH_LIMITS),
    }
  } catch {
    return fallback
  }
}

function storePanelWidths(widths: StudioPanelWidths) {
  try {
    window.localStorage.setItem(STUDIO_PANEL_WIDTHS_STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // 存储不可用时忽略，仅影响下次打开的默认宽度
  }
}

export function useStudioPanelWidths(options: { onCollapse?: (panel: ResizablePanel) => void } = {}) {
  const [panelWidths, setPanelWidths] = useState<StudioPanelWidths>(readStoredPanelWidths)
  const panelWidthsRef = useRef(panelWidths)
  panelWidthsRef.current = panelWidths

  // 拖拽调宽：指针按下后追踪位移，松手时持久化到 localStorage
  const beginPanelResize = useCallback(
    (panel: ResizablePanel, event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const handle = event.currentTarget
      const startX = event.clientX
      const startWidth = panelWidthsRef.current[panel]
      const limits = panel === 'tree'
        ? TREE_PANEL_WIDTH_LIMITS
        : panel === 'agent'
          ? AGENT_PANEL_WIDTH_LIMITS
          : panel === 'workTask'
            ? WORK_TASK_PANEL_WIDTH_LIMITS
            : panel === 'workInspector'
              ? WORK_INSPECTOR_PANEL_WIDTH_LIMITS
              : WORK_VIEWER_PANEL_WIDTH_LIMITS
      handle.setPointerCapture(event.pointerId)
      let rawWidth = startWidth

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX
        const growsRight = panel === 'tree' || panel === 'workTask'
        rawWidth = growsRight ? startWidth + delta : startWidth - delta
        const nextWidth = clampPanelWidth(rawWidth, limits)
        setPanelWidths((current) =>
          current[panel] === nextWidth
            ? current
            : { ...current, [panel]: nextWidth },
        )
      }
      const handleUp = () => {
        handle.removeEventListener('pointermove', handleMove)
        handle.removeEventListener('pointerup', handleUp)
        handle.removeEventListener('pointercancel', handleUp)
        if (rawWidth <= Math.round(limits.min * 0.62)) {
          options.onCollapse?.(panel)
        } else {
          storePanelWidths(panelWidthsRef.current)
        }
      }

      handle.addEventListener('pointermove', handleMove)
      handle.addEventListener('pointerup', handleUp)
      handle.addEventListener('pointercancel', handleUp)
    },
    [options],
  )

  return { panelWidths, beginPanelResize }
}
