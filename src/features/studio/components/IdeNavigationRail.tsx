import type { ReactNode } from 'react'
import {
  BookCopy,
  BrainCircuit,
  GitCompareArrows,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Wrench,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { WorkInspectorTab } from './WorkInspector'

type Props = {
  tab: WorkInspectorTab
  open: boolean
  panel: ReactNode
  onSelect: (tab: WorkInspectorTab) => void
  onToggle: () => void
}

const navigationItems = [
  { key: 'work' as const, label: '作品', icon: BookCopy },
  { key: 'memory' as const, label: '记忆', icon: BrainCircuit },
  { key: 'context' as const, label: '上下文', icon: ScrollText },
  { key: 'changes' as const, label: '变更', icon: GitCompareArrows },
  { key: 'skills' as const, label: '技能', icon: Wrench },
]

/** IDE 左侧活动栏：折叠时仍保留全部一级入口，展开后在右侧显示对应面板。 */
export default function IdeNavigationRail({ tab, open, panel, onSelect, onToggle }: Props) {
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--app-bg)]">
      <nav className="flex w-[46px] shrink-0 flex-col items-center border-r border-[var(--border-subtle)] py-2" aria-label="IDE 工作区导航">
        <button
          type="button"
          onClick={onToggle}
          className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          aria-label={open ? '收起左侧面板' : '展开左侧面板'}
          title={open ? '收起左侧面板' : '展开左侧面板'}
        >
          {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <div className="h-px w-5 bg-[var(--border-subtle)]" />
        <div className="mt-2 flex flex-col gap-1">
          {navigationItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                'relative inline-flex h-9 w-9 items-center justify-center rounded-[8px] transition-colors',
                tab === key && open
                  ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
              )}
              aria-label={label}
              title={label}
              aria-pressed={tab === key && open}
            >
              {tab === key && open ? <span className="absolute -left-[4px] h-5 w-0.5 rounded-full bg-emerald-500" aria-hidden /> : null}
              <Icon className="h-[17px] w-[17px]" />
            </button>
          ))}
        </div>
      </nav>
      <div
        aria-hidden={!open}
        className={cn(
          'min-w-0 flex-1 overflow-hidden bg-[var(--surface-default)] transition-[opacity,transform] duration-200 ease-out',
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-2 opacity-0',
        )}
      >
        {panel}
      </div>
    </div>
  )
}
