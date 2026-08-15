import type { PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '@/lib/utils'
import type { ResizablePanel } from './panel-widths'

type PanelResizeHandleProps = {
  panel: ResizablePanel
  /** 把手吸附的边：章节树在列右缘，Agent 区在列左缘 */
  side: 'left' | 'right'
  label: string
  onBegin: (panel: ResizablePanel, event: ReactPointerEvent<HTMLDivElement>) => void
}

export function PanelResizeHandle({ panel, side, label, onBegin }: PanelResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={(event) => onBegin(panel, event)}
      className={cn(
        'absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none rounded-full transition-colors hover:bg-[var(--border-strong,rgba(15,23,42,0.16))] active:bg-[var(--border-strong,rgba(15,23,42,0.24))]',
        side === 'right' ? '-right-0.5' : 'left-0',
      )}
    />
  )
}
