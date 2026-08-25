import type { ReactNode } from 'react'
import { BookCopy, BrainCircuit, GitCompareArrows, ScrollText } from 'lucide-react'

import { cn } from '@/lib/utils'

export type WorkInspectorTab = 'work' | 'context' | 'changes' | 'memory'

type Props = {
  tab: WorkInspectorTab
  onTabChange: (tab: WorkInspectorTab) => void
  workTree: ReactNode
  novelTitle: string
  chapterTitle: string
  chapterCount: number
  wordCount: string
  pendingReviewCount: number
  activeArtifactTitle?: string | null
  onOpenMemory: () => void
  onOpenMemoryReview?: () => void
  compactNavigation?: boolean
  showNavigation?: boolean
}

export default function WorkInspector({ tab, onTabChange, workTree, novelTitle, chapterTitle, chapterCount, wordCount, pendingReviewCount, activeArtifactTitle, onOpenMemory, onOpenMemoryReview, compactNavigation = false, showNavigation = true }: Props) {
  const tabs = [{ key: 'work' as const, label: '作品', icon: BookCopy }, { key: 'context' as const, label: '上下文', icon: ScrollText }, { key: 'changes' as const, label: '变更', icon: GitCompareArrows }, { key: 'memory' as const, label: '记忆', icon: BrainCircuit }]
  return <div className="flex h-full min-h-0 flex-col">
    {showNavigation ? <div className="flex h-11 shrink-0 items-end border-b border-[var(--border-subtle)] pl-10 pr-1">
      {tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" title={label} aria-label={label} onClick={() => { onTabChange(key); if (key === 'memory') onOpenMemory() }} className={cn('flex h-10 min-w-0 flex-1 items-center justify-center gap-1 border-b-2 px-1 text-[10px] transition', tab === key ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}><Icon className="h-3.5 w-3.5 shrink-0" /><span className={cn(compactNavigation && 'sr-only')}>{label}</span></button>)}
    </div> : null}
    <div className="min-h-0 flex-1 overflow-hidden">
      {tab === 'work' ? workTree : null}
      {tab === 'context' ? <div className="h-full overflow-y-auto px-4 py-5"><p className="text-[10px] uppercase tracking-[.14em] text-[var(--text-tertiary)]">当前上下文</p><h2 className="mt-3 text-sm font-medium text-[var(--text-primary)]">{novelTitle}</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{chapterTitle}</p><p className="mt-3 text-[11px] tabular-nums text-[var(--text-tertiary)]">{chapterCount} 章 · {wordCount}</p>{activeArtifactTitle ? <div className="mt-5 border-t border-[var(--border-subtle)] pt-4"><p className="text-[10px] text-[var(--text-tertiary)]">当前产物</p><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{activeArtifactTitle}</p></div> : null}</div> : null}
      {tab === 'changes' ? <div className="h-full overflow-y-auto px-4 py-5"><div className="flex items-center gap-2 text-sm text-[var(--text-primary)]"><GitCompareArrows className="h-4 w-4" />{pendingReviewCount ? `${pendingReviewCount} 项变更待审` : '没有待审变更'}</div><p className="mt-3 text-xs leading-6 text-[var(--text-secondary)]">Agent 的跨章修改、计划更新和结构操作会在这里汇总。</p></div> : null}
      {tab === 'memory' ? <div className="flex h-full flex-col items-start px-4 py-5"><BrainCircuit className="h-5 w-5 text-[var(--text-secondary)]" /><p className="mt-3 text-sm font-medium text-[var(--text-primary)]">作品记忆图谱</p><p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">关系图已在对话右侧查看器打开，并会跟随记忆更新。</p><button type="button" onClick={onOpenMemory} className="mt-4 text-xs text-[var(--text-primary)] underline underline-offset-4">打开关系图</button>{onOpenMemoryReview ? <button type="button" onClick={onOpenMemoryReview} className="mt-3 text-xs text-[var(--text-secondary)] underline underline-offset-4">查看冲突审核</button> : null}</div> : null}
    </div>
  </div>
}
