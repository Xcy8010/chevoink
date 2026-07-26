import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type ResponsiveGridProps = {
  children: ReactNode
  /** 手机端列数，默认 1 */
  mobileCols?: 1 | 2
  /** 平板端列数，默认 2 */
  tabletCols?: 1 | 2 | 3
  /** 电脑端列数，默认 3 */
  desktopCols?: 1 | 2 | 3 | 4
  gap?: 'sm' | 'md' | 'lg'
  className?: string
}

const colClasses: Record<'mobile' | 'tablet' | 'desktop', Record<number, string>> = {
  mobile: {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
  },
  tablet: {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
  },
  desktop: {
    1: 'xl:grid-cols-1',
    2: 'xl:grid-cols-2',
    3: 'xl:grid-cols-3',
    4: 'xl:grid-cols-4',
  },
}

const gapClasses = {
  sm: 'gap-2 md:gap-3',
  md: 'gap-3 md:gap-4',
  lg: 'gap-4 md:gap-6',
}

/** 按三端断点自适应列数的网格容器 */
export default function ResponsiveGrid({
  children,
  mobileCols = 1,
  tabletCols = 2,
  desktopCols = 3,
  gap = 'md',
  className,
}: ResponsiveGridProps) {
  return (
    <div
      className={cn(
        'grid',
        colClasses.mobile[mobileCols],
        colClasses.tablet[tabletCols],
        colClasses.desktop[desktopCols],
        gapClasses[gap],
        className,
      )}
    >
      {children}
    </div>
  )
}
