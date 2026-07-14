import type { ReactNode } from 'react'

import Surface from '@/components/ui/Surface'
import { cn } from '@/lib/utils'

type AgentPanelShellProps = {
  eyebrow?: string
  title: string
  description?: string
  headerMeta?: ReactNode
  statusSlot?: ReactNode
  tabsSlot?: ReactNode
  footerSlot?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export default function AgentPanelShell({
  eyebrow,
  title,
  description,
  headerMeta,
  statusSlot,
  tabsSlot,
  footerSlot,
  children,
  className,
  bodyClassName,
}: AgentPanelShellProps) {
  return (
    <Surface
      as="section"
      padding="md"
      className={cn('flex min-h-0 flex-col gap-4 rounded-[28px] shadow-none', className)}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)] md:text-lg">
                {title}
              </h2>
              {description ? (
                <p className="text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
              ) : null}
            </div>
            {headerMeta ? <div className="shrink-0">{headerMeta}</div> : null}
          </div>
        </div>
        {statusSlot}
        {tabsSlot}
      </div>

      <div className={cn('min-h-0 flex-1 space-y-4', bodyClassName)}>{children}</div>

      {footerSlot ? <div className="border-t border-[var(--border-subtle)] pt-4">{footerSlot}</div> : null}
    </Surface>
  )
}
