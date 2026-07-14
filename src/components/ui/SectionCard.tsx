import { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import Surface from '@/components/ui/Surface'

type SectionCardProps = {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export default function SectionCard({
  eyebrow,
  title,
  description,
  children,
  className,
}: SectionCardProps) {
  return (
    <Surface as="section" padding="lg" className={cn('gap-0', className)}>
      <div className="mb-5 space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Surface>
  )
}
