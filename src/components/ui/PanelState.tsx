import type { ReactNode } from 'react'
import { AlertCircle, LoaderCircle, SearchX } from 'lucide-react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export type PanelStateTone = 'loading' | 'empty' | 'error'

export type PanelStateAction = {
  label: string
  onClick?: () => void
  href?: string
}

type PanelStateProps = {
  tone?: PanelStateTone
  title: string
  description?: string
  details?: ReactNode
  primaryAction?: PanelStateAction
  secondaryAction?: PanelStateAction
  className?: string
  compact?: boolean
}

const toneConfig = {
  loading: {
    icon: LoaderCircle,
    label: '正在准备',
  },
  empty: {
    icon: SearchX,
    label: '暂时为空',
  },
  error: {
    icon: AlertCircle,
    label: '暂时无法完成',
  },
} as const

function ActionLink({
  label,
  href,
  variant,
}: {
  label: string
  href: string
  variant: 'primary' | 'secondary'
}) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] px-4 text-sm font-medium transition-colors md:h-11',
        variant === 'primary'
          ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)] hover:bg-[var(--surface-contrast-hover)]'
          : 'border border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]',
      )}
    >
      {label}
    </a>
  )
}

export default function PanelState({
  tone = 'empty',
  title,
  description,
  details,
  primaryAction,
  secondaryAction,
  className,
  compact = false,
}: PanelStateProps) {
  const { icon: Icon, label } = toneConfig[tone]

  return (
    <section
      className={cn(
        'flex min-h-[180px] items-center justify-center rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-6 text-center',
        compact && 'min-h-[144px] px-4 py-5',
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-secondary)]">
          <Icon className={cn('h-4 w-4', tone === 'loading' && 'animate-spin')} />
        </span>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{label}</p>
        <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
        {description ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
        {details ? <div className="mt-4 w-full text-left text-sm leading-6 text-[var(--text-secondary)]">{details}</div> : null}
        {primaryAction || secondaryAction ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {primaryAction ? (
              primaryAction.href ? (
                <ActionLink label={primaryAction.label} href={primaryAction.href} variant="primary" />
              ) : (
                <Button variant="primary" onClick={primaryAction.onClick}>
                  {primaryAction.label}
                </Button>
              )
            ) : null}
            {secondaryAction ? (
              secondaryAction.href ? (
                <ActionLink label={secondaryAction.label} href={secondaryAction.href} variant="secondary" />
              ) : (
                <Button variant="secondary" onClick={secondaryAction.onClick}>
                  {secondaryAction.label}
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
