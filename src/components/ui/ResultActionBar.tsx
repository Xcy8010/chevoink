import type { ReactNode } from 'react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type ResultActionVariant = 'primary' | 'secondary' | 'ghost'

export type ResultActionItem = {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  href?: string
  variant?: ResultActionVariant
  disabled?: boolean
}

type ResultActionBarProps = {
  title?: string
  description?: string
  actions: ReadonlyArray<ResultActionItem>
  aside?: ReactNode
  className?: string
}

function ActionButton({
  label,
  icon,
  onClick,
  href,
  variant = 'secondary',
  disabled,
}: Omit<ResultActionItem, 'key'>) {
  if (href) {
    return (
      <a
        href={href}
        aria-disabled={disabled}
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 text-sm font-medium transition-colors md:h-11',
          variant === 'primary' &&
            'bg-[var(--surface-contrast)] text-[var(--text-contrast)] hover:bg-[var(--surface-contrast-hover)]',
          variant === 'secondary' &&
            'border border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]',
          variant === 'ghost' &&
            'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {icon}
        {label}
      </a>
    )
  }

  return (
    <Button variant={variant} disabled={disabled} onClick={onClick}>
      {icon}
      {label}
    </Button>
  )
}

export default function ResultActionBar({
  title,
  description,
  actions,
  aside,
  className,
}: ResultActionBarProps) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3',
        className,
      )}
    >
      {title || description || aside ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title ? <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3> : null}
            {description ? (
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
            ) : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <ActionButton
            key={action.key}
            label={action.label}
            icon={action.icon}
            onClick={action.onClick}
            href={action.href}
            variant={action.variant}
            disabled={action.disabled}
          />
        ))}
      </div>
    </div>
  )
}
