import { type ReactNode, useId } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

type CollapsiblePanelMode = 'inline' | 'drawer'

type CollapsiblePanelProps = {
  title: string
  description?: string
  summary?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  mode?: CollapsiblePanelMode
  className?: string
  contentClassName?: string
}

export default function CollapsiblePanel({
  title,
  description,
  summary,
  badge,
  actions,
  open,
  onOpenChange,
  children,
  mode = 'inline',
  className,
  contentClassName,
}: CollapsiblePanelProps) {
  const contentId = useId()

  return (
    <section
      className={cn(
        'overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-default)]',
        mode === 'drawer' ? 'rounded-t-[24px] rounded-b-[20px] shadow-[var(--shadow-soft)]' : 'rounded-[24px]',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3 px-4 py-3',
          mode === 'drawer' ? 'bg-[var(--surface-muted)]' : 'bg-transparent',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onOpenChange(!open)}
          className={cn(
            'flex min-w-0 flex-1 items-start gap-3 text-left transition-colors',
            mode === 'drawer' ? 'hover:text-[var(--text-primary)]' : 'hover:text-[var(--text-primary)]',
          )}
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-[var(--text-primary)]">{title}</span>
              {badge ? <span className="shrink-0">{badge}</span> : null}
            </span>
            {description ? (
              <span className="block text-sm leading-6 text-[var(--text-secondary)]">{description}</span>
            ) : null}
            {!open && summary ? (
              <span className="block text-xs leading-5 text-[var(--text-tertiary)]">{summary}</span>
            ) : null}
          </span>

          <span
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-secondary)] transition-transform',
              open && 'rotate-180',
            )}
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>

        {actions ? <div className="hidden shrink-0 sm:block">{actions}</div> : null}
      </div>

      <div
        id={contentId}
        hidden={!open}
        className={cn(
          'border-t border-[var(--border-subtle)] px-4 py-4',
          mode === 'drawer' && 'bg-[var(--surface-default)]',
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  )
}
