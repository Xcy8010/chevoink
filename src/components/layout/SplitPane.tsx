import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SplitPaneProps = {
  /** 左侧/主面板 */
  primary: ReactNode
  /** 右侧/辅助面板，传 null 或 collapsed 时不渲染 */
  secondary?: ReactNode
  /** 三栏时的第三面板 */
  tertiary?: ReactNode
  /** 主面板最小宽度策略 */
  primaryClassName?: string
  secondaryClassName?: string
  tertiaryClassName?: string
  className?: string
  /** 面板间距 */
  gap?: 'sm' | 'md' | 'lg'
}

const gapClasses = {
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
}

/**
 * 双栏/三栏分栏容器。
 * 平板端用于"左面板 + 右内容"，电脑端用于"左 + 中 + 右"三栏工作台。
 */
export default function SplitPane({
  primary,
  secondary,
  tertiary,
  primaryClassName,
  secondaryClassName,
  tertiaryClassName,
  className,
  gap = 'md',
}: SplitPaneProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 items-stretch', gapClasses[gap], className)}>
      <div className={cn('min-w-0 flex-1', primaryClassName)}>{primary}</div>
      {secondary ? (
        <div className={cn('w-[280px] shrink-0', secondaryClassName)}>{secondary}</div>
      ) : null}
      {tertiary ? (
        <div className={cn('w-[280px] shrink-0', tertiaryClassName)}>{tertiary}</div>
      ) : null}
    </div>
  )
}
