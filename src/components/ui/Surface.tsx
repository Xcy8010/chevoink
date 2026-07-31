import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SurfaceTone = 'default' | 'muted' | 'contrast'
type SurfacePadding = 'none' | 'sm' | 'md' | 'lg'

type SurfaceProps<T extends ElementType = 'div'> = {
  as?: T
  tone?: SurfaceTone
  padding?: SurfacePadding
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>

const toneClasses: Record<SurfaceTone, string> = {
  default: 'border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-primary)]',
  muted: 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-primary)]',
  contrast: 'border-[var(--border-contrast)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]',
}

const paddingClasses: Record<SurfacePadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-4 md:p-5',
  lg: 'p-5 md:p-6',
}

export default function Surface<T extends ElementType = 'div'>({
  as,
  tone = 'default',
  padding = 'md',
  className,
  children,
  ...props
}: SurfaceProps<T>) {
  const Component = as ?? 'div'

  return (
    <Component
      className={cn(
        'rounded-[var(--radius-lg)] border shadow-[var(--shadow-soft)]',
        toneClasses[tone],
        paddingClasses[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  )
}
