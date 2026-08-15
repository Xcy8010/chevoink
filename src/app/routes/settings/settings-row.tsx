/**
 * 设置页通用行与分区标题组件
 * 由 SettingsPage.tsx 模块级抽取而来。
 */
import { ChevronDown, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/** 分组标题：扁平列表式设置页的分区抬头 */
export function SectionTitle({ children }: { children: string }) {
  return <h2 className="px-1 pb-1 text-[13px] font-semibold text-[var(--text-tertiary)]">{children}</h2>
}

/** 单行设置项外壳：图标 + 标题/说明 + 右侧值区，行本身可点击 */
export interface SettingsRowProps {
  icon: React.ReactNode
  title: string
  caption?: string
  value?: React.ReactNode
  chevron?: 'right' | 'down' | 'up' | 'none'
  onClick?: () => void
  danger?: boolean
}

export function SettingsRow({ icon, title, caption, value, chevron = 'none', onClick, danger }: SettingsRowProps) {
  const content = (
    <>
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)]',
          danger ? 'text-[var(--color-danger,#dc2626)]' : 'text-[var(--text-secondary)]',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            'block text-[15px] font-medium',
            danger ? 'text-[var(--color-danger,#dc2626)]' : 'text-[var(--text-primary)]',
          )}
        >
          {title}
        </span>
        {caption ? <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">{caption}</span> : null}
      </span>
      {value ? <span className="shrink-0 text-sm text-[var(--text-tertiary)]">{value}</span> : null}
      {chevron === 'right' ? <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" /> : null}
      {chevron === 'down' || chevron === 'up' ? (
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform',
            chevron === 'up' && 'rotate-180',
          )}
        />
      ) : null}
    </>
  )

  if (!onClick) {
    return <div className="flex w-full items-center gap-3.5 py-3.5">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="press-feedback -mx-2 flex w-[calc(100%+16px)] items-center gap-3.5 rounded-[var(--radius-md)] px-2 py-3.5 text-left transition-colors hover:bg-[var(--surface-muted)]"
    >
      {content}
    </button>
  )
}
