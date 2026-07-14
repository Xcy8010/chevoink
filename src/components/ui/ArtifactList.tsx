import type { ReactNode } from 'react'
import { CheckCircle2, Clock3, FileText, Sparkles, TriangleAlert } from 'lucide-react'

import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import { cn } from '@/lib/utils'

export type ArtifactTone = 'default' | 'draft' | 'success' | 'warning'

export type ArtifactAction = {
  key: string
  label: string
  onClick?: () => void
  href?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
}

export type ArtifactListItem = {
  id: string
  title: string
  description?: string
  preview?: ReactNode
  meta?: ReactNode
  timestamp?: string
  tone?: ArtifactTone
  badge?: ReactNode
  actions?: ReadonlyArray<ArtifactAction>
}

type ArtifactListProps = {
  items: ReadonlyArray<ArtifactListItem>
  className?: string
  emptySlot?: ReactNode
}

const toneConfig: Record<
  ArtifactTone,
  {
    icon: typeof FileText
    tagLabel: string
    tagTone: 'neutral' | 'accent' | 'contrast'
  }
> = {
  default: {
    icon: FileText,
    tagLabel: '结果',
    tagTone: 'neutral',
  },
  draft: {
    icon: Sparkles,
    tagLabel: '候选版本',
    tagTone: 'accent',
  },
  success: {
    icon: CheckCircle2,
    tagLabel: '已可使用',
    tagTone: 'accent',
  },
  warning: {
    icon: TriangleAlert,
    tagLabel: '待确认',
    tagTone: 'contrast',
  },
}

function ArtifactActionButton({
  label,
  onClick,
  href,
  variant = 'secondary',
  disabled,
}: Omit<ArtifactAction, 'key'>) {
  if (href) {
    return (
      <a
        href={href}
        aria-disabled={disabled}
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-[var(--radius-pill)] px-3 text-sm font-medium transition-colors',
          variant === 'primary' &&
            'bg-[var(--surface-contrast)] text-[var(--text-contrast)] hover:bg-[var(--surface-contrast-hover)]',
          variant === 'secondary' &&
            'border border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]',
          variant === 'ghost' &&
            'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {label}
      </a>
    )
  }

  return (
    <Button size="sm" variant={variant} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
}

export default function ArtifactList({ items, className, emptySlot }: ArtifactListProps) {
  if (!items.length) {
    return emptySlot ? <div className={className}>{emptySlot}</div> : null
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        const { icon: Icon, tagLabel, tagTone } = toneConfig[item.tone ?? 'default']

        return (
          <article
            key={item.id}
            className="space-y-3 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-[var(--text-primary)]">{item.title}</h3>
                    {item.description ? (
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={tagTone}>{tagLabel}</Tag>
                  {item.badge}
                  {item.timestamp ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {item.timestamp}
                    </span>
                  ) : null}
                </div>
              </div>

              {item.meta ? <div className="shrink-0 text-right text-xs text-[var(--text-tertiary)]">{item.meta}</div> : null}
            </div>

            {item.preview ? (
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                {item.preview}
              </div>
            ) : null}

            {item.actions?.length ? (
              <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
                {item.actions.map((action) => (
                  <ArtifactActionButton
                    key={action.key}
                    label={action.label}
                    onClick={action.onClick}
                    href={action.href}
                    variant={action.variant}
                    disabled={action.disabled}
                  />
                ))}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
