import type { ReactNode } from 'react'
import { AlertCircle, LoaderCircle, SearchX } from 'lucide-react'

import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import { cn } from '@/lib/utils'

type AppStateTone = 'loading' | 'empty' | 'error'

type AppStateAction = {
  label: string
  onClick?: () => void
  href?: string
}

type AppStateProps = {
  tone?: AppStateTone
  eyebrow?: string
  title: string
  description?: string
  details?: ReactNode
  primaryAction?: AppStateAction
  secondaryAction?: AppStateAction
  className?: string
}

const toneIconMap = {
  loading: LoaderCircle,
  empty: SearchX,
  error: AlertCircle,
} as const

const toneLabelMap = {
  loading: '正在准备',
  empty: '暂时为空',
  error: '暂时无法打开',
} as const

export default function AppState({
  tone = 'empty',
  eyebrow,
  title,
  description,
  details,
  primaryAction,
  secondaryAction,
  className,
}: AppStateProps) {
  const Icon = toneIconMap[tone]
  const eyebrowText = eyebrow ?? toneLabelMap[tone]

  return (
    <Surface
      as="section"
      padding="md"
      className={cn('flex min-h-[220px] items-center justify-center text-center md:min-h-[280px]', className)}
    >
      <div className="mx-auto flex max-w-xl flex-col items-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
          <Icon className={cn('h-5 w-5', tone === 'loading' && 'animate-spin')} />
        </span>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
          {eyebrowText}
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)] md:text-2xl">{title}</h2>
        {description ? <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)] md:text-base">{description}</p> : null}
        {details ? <div className="mt-5 w-full text-left text-sm leading-6 text-[var(--text-secondary)]">{details}</div> : null}
        {primaryAction || secondaryAction ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {primaryAction ? (
              primaryAction.href ? (
                <a
                  href={primaryAction.href}
                  className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--surface-contrast)] px-4 text-sm font-medium text-[var(--text-contrast)] transition-colors hover:bg-[var(--surface-contrast-hover)]"
                >
                  {primaryAction.label}
                </a>
              ) : (
                <Button variant="primary" onClick={primaryAction.onClick}>
                  {primaryAction.label}
                </Button>
              )
            ) : null}
            {secondaryAction ? (
              secondaryAction.href ? (
                <a
                  href={secondaryAction.href}
                  className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
                >
                  {secondaryAction.label}
                </a>
              ) : (
                <Button variant="secondary" onClick={secondaryAction.onClick}>
                  {secondaryAction.label}
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </Surface>
  )
}
