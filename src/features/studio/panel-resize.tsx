import type { PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '@/lib/utils'
import type { ResizablePanel } from './panel-widths'

type PanelResizeHandleProps = {
  panel: ResizablePanel
  /** 与当前面板共享同一段横向空间；当前面板放大时同步收窄该面板。 */
  linkedPanel?: ResizablePanel
  /** 把手吸附的边：章节树在列右缘，Agent 区在列左缘 */
  side: 'left' | 'right'
  label: string
  onBegin: (panel: ResizablePanel, event: ReactPointerEvent<HTMLDivElement>, linkedPanel?: ResizablePanel) => void
}

export function PanelResizeHandle({ panel, linkedPanel, side, label, onBegin }: PanelResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={(event) => onBegin(panel, event, linkedPanel)}
      className={cn(
        'absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none rounded-full transition-colors hover:bg-[var(--border-strong,rgba(15,23,42,0.16))] active:bg-[var(--border-strong,rgba(15,23,42,0.24))]',
        side === 'right' ? '-right-0.5' : 'left-0',
      )}
    />
  )
}
