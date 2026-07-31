import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, CircleDot, LoaderCircle, PauseCircle } from 'lucide-react'

import Tag from '@/components/ui/Tag'
import { cn } from '@/lib/utils'

export type RunStatusTone = 'idle' | 'queued' | 'running' | 'paused' | 'success' | 'error'

type RunStatusBarProps = {
  tone: RunStatusTone
  label: string
  description?: string
  progress?: number
  meta?: ReactNode
  trailing?: ReactNode
  className?: string
}

const toneConfig: Record<
  RunStatusTone,
  {
    icon: typeof CircleDot
    tagTone: 'neutral' | 'accent' | 'contrast'
    barClassName: string
  }
> = {
  idle: {
    icon: CircleDot,
    tagTone: 'neutral',
    barClassName: 'bg-[var(--border-subtle)]',
  },
  queued: {
    icon: CircleDot,
    tagTone: 'neutral',
    barClassName: 'bg-[var(--text-tertiary)]',
  },
  running: {
    icon: LoaderCircle,
    tagTone: 'accent',
    barClassName: 'bg-[var(--accent-strong)]',
  },
  paused: {
    icon: PauseCircle,
    tagTone: 'neutral',
    barClassName: 'bg-[var(--text-secondary)]',
  },
  success: {
    icon: CheckCircle2,
    tagTone: 'accent',
    barClassName: 'bg-[var(--accent-strong)]',
  },
  error: {
    icon: AlertCircle,
    tagTone: 'contrast',
    barClassName: 'bg-[var(--surface-contrast)]',
  },
}

export default function RunStatusBar({
  tone,
  label,
  description,
  progress,
  meta,
  trailing,
  className,
}: RunStatusBarProps) {
  const { icon: Icon, tagTone, barClassName } = toneConfig[tone]
  const clampedProgress = typeof progress === 'number' ? Math.max(0, Math.min(progress, 100)) : null

  return (
    <div
      className={cn(
        'space-y-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Tag tone={tagTone} className="gap-1.5 px-2.5 py-1">
            <Icon className={cn('h-3.5 w-3.5', tone === 'running' && 'animate-spin')} />
            {label}
          </Tag>
          {description ? (
            <p className="text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>

      {clampedProgress !== null ? (
        <div className="space-y-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div
              className={cn('h-full rounded-full transition-[width] duration-300 ease-out', barClassName)}
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
            <span>{clampedProgress}%</span>
            {meta ? <span className="truncate">{meta}</span> : null}
          </div>
        </div>
      ) : meta ? (
        <div className="text-xs text-[var(--text-tertiary)]">{meta}</div>
      ) : null}
    </div>
  )
}
