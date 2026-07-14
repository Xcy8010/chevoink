import type { ReactNode } from 'react'
import { Check, LoaderCircle } from 'lucide-react'

import Tag from '@/components/ui/Tag'
import { cn } from '@/lib/utils'

export type StepFlowStatus = 'pending' | 'running' | 'completed' | 'error'

export type StepFlowItem = {
  id: string
  title: string
  description?: string
  status?: StepFlowStatus
  meta?: ReactNode
  aside?: ReactNode
}

type StepFlowProps = {
  items: ReadonlyArray<StepFlowItem>
  className?: string
  compact?: boolean
}

const statusClasses: Record<
  StepFlowStatus,
  {
    markerClassName: string
    lineClassName: string
    label: string
    tone: 'neutral' | 'accent' | 'contrast'
  }
> = {
  pending: {
    markerClassName: 'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-tertiary)]',
    lineClassName: 'bg-[var(--border-subtle)]',
    label: '等待中',
    tone: 'neutral',
  },
  running: {
    markerClassName: 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]',
    lineClassName: 'bg-[var(--accent-border)]',
    label: '进行中',
    tone: 'accent',
  },
  completed: {
    markerClassName: 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]',
    lineClassName: 'bg-[var(--accent-border)]',
    label: '已完成',
    tone: 'accent',
  },
  error: {
    markerClassName: 'border-[var(--border-contrast)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]',
    lineClassName: 'bg-[var(--surface-contrast)]',
    label: '需处理',
    tone: 'contrast',
  },
}

export default function StepFlow({ items, className, compact = false }: StepFlowProps) {
  return (
    <div className={cn('space-y-0', className)}>
      {items.map((item, index) => {
        const status = item.status ?? 'pending'
        const config = statusClasses[status]
        const isLast = index === items.length - 1

        return (
          <div key={item.id} className="flex gap-3">
            <div className="flex w-7 flex-col items-center">
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs',
                  config.markerClassName,
                )}
              >
                {status === 'completed' ? (
                  <Check className="h-4 w-4" />
                ) : status === 'running' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </span>
              {!isLast ? <span className={cn('mt-1 w-px flex-1', config.lineClassName)} /> : null}
            </div>

            <div className={cn('min-w-0 flex-1 pb-4', compact && 'pb-3')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">{item.title}</h3>
                    <Tag tone={config.tone} className="px-2.5 py-1">
                      {config.label}
                    </Tag>
                  </div>
                  {item.description ? (
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
                  ) : null}
                </div>
                {item.aside ? <div className="shrink-0">{item.aside}</div> : null}
              </div>
              {item.meta ? <div className="mt-2 text-xs text-[var(--text-tertiary)]">{item.meta}</div> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
