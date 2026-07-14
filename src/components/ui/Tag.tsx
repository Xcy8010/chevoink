import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type TagTone = 'neutral' | 'accent' | 'contrast'

type TagProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: TagTone
}

const toneClasses: Record<TagTone, string> = {
  neutral: 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
  accent: 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  contrast: 'border-[var(--border-contrast)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]',
}

export default function Tag({ className, tone = 'neutral', ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium leading-none tracking-[0.02em]',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  )
}
