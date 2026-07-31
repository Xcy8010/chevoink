import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type SegmentedTabItem<T extends string> = {
  value: T
  label: string
  hint?: string
  badge?: ReactNode
  disabled?: boolean
}

type SegmentedTabsProps<T extends string> = {
  value: T
  items: ReadonlyArray<SegmentedTabItem<T>>
  onValueChange: (value: T) => void
  className?: string
  listClassName?: string
  stretch?: boolean
}

export default function SegmentedTabs<T extends string>({
  value,
  items,
  onValueChange,
  className,
  listClassName,
  stretch = true,
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className={cn(
          'inline-flex min-w-0 items-stretch gap-1 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1',
          stretch && 'grid w-full auto-cols-fr grid-flow-col',
          listClassName,
        )}
      >
        {items.map((item) => {
          const isActive = item.value === value

          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              onClick={() => onValueChange(item.value)}
              className={cn(
                'min-w-0 rounded-[16px] px-3 py-2 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-muted)]',
                isActive
                  ? 'bg-[var(--surface-default)] text-[var(--text-primary)] shadow-[var(--shadow-soft)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-default)]/80 hover:text-[var(--text-primary)]',
                item.disabled && 'pointer-events-none opacity-50',
              )}
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.hint ? (
                    <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">
                      {item.hint}
                    </span>
                  ) : null}
                </span>
                {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
