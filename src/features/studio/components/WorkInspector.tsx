import { useMemo, useState, type ReactNode } from 'react'
import { BookCopy, BrainCircuit, ChevronDown, ChevronRight, FileText, FolderTree, GitCompareArrows, MessageSquareText, NotebookText, ScrollText, Sparkles, Target, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { StudioPayload } from '../../../../shared/contracts/index.js'
import type { WorkspaceActivity } from '../agent/agentStore'
import type { ProjectNotesState, WorkspacePlanFile } from '../types'

export type WorkInspectorTab = 'work' | 'context' | 'changes' | 'memory'

type Props = {
  tab: WorkInspectorTab
  onTabChange: (tab: WorkInspectorTab) => void
  workTree: ReactNode
  novelTitle: string
  volumeTitle?: string | null
  chapterTitle: string
  chapterCount: number
  wordCount: string
  pendingReviewCount: number
  activeArtifactTitle?: string | null
  selectedTextLength?: number
  activities?: WorkspaceActivity[]
  memoryGraph?: ReactNode
  compactNavigation?: boolean
  showNavigation?: boolean
  volumes?: StudioPayload['volumes']
  chapters?: StudioPayload['chapters']
  plans?: WorkspacePlanFile[]
  projectNotes?: ProjectNotesState | null
  activeTaskTitle?: string | null
  taskCount?: number
}

function activityDelta(activity: WorkspaceActivity) {
  if (typeof activity.before !== 'string' || typeof activity.after !== 'string') {
    const delta = activity.deltaChars ?? 0
    return { added: Math.max(0, delta), removed: Math.max(0, -delta) }
  }
  const before = activity.before
  const after = activity.after
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1
  return { added: Math.max(0, after.length - prefix - suffix), removed: Math.max(0, before.length - prefix - suffix) }
}

function Delta({ added, removed }: { added: number; removed: number }) {
  return <span className="flex shrink-0 gap-1.5 text-[10px] tabular-nums"><span className="text-emerald-600">+{added}</span><span className="text-rose-500">-{removed}</span></span>
}

function ContextSection({ title, icon, children, open = false }: { title: string; icon: ReactNode; children: ReactNode; open?: boolean }) {
  return <details open={open} className="group/context overflow-hidden rounded-[12px]">
    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[10px] px-2 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform group-open/context:rotate-90" />
      {icon}
      <span>{title}</span>
    </summary>
    <div className="ml-4 border-l border-[var(--border-subtle)] pl-2">{children}</div>
  </details>
}

function ContextTree({ novelTitle, volumeTitle, chapterTitle, chapterCount, wordCount, activeArtifactTitle, selectedTextLength = 0, volumes = [], chapters = [], plans = [], projectNotes, activeTaskTitle, taskCount = 0 }: Pick<Props, 'novelTitle' | 'volumeTitle' | 'chapterTitle' | 'chapterCount' | 'wordCount' | 'activeArtifactTitle' | 'selectedTextLength' | 'volumes' | 'chapters' | 'plans' | 'projectNotes' | 'activeTaskTitle' | 'taskCount'>) {
  const [expanded, setExpanded] = useState(true)
  return <div className="h-full overflow-y-auto px-3 py-4">
    <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<FolderTree className="h-4 w-4 text-[var(--text-secondary)]" /><span className="min-w-0 flex-1 truncate">{novelTitle}</span><span className="text-[10px] text-[var(--text-tertiary)]">{chapterCount} 章</span>
    </button>
    {expanded ? <div className="ml-4 space-y-1 border-l border-[var(--border-subtle)] pl-2">
      <ContextSection title="当前焦点" icon={<Target className="h-3.5 w-3.5 text-[var(--text-secondary)]" />} open>
        <div className="space-y-1 px-2 py-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">
          <p><span className="text-[var(--text-tertiary)]">卷：</span>{volumeTitle || '未指定'}</p>
          <p><span className="text-[var(--text-tertiary)]">章：</span>{chapterTitle || '未选择章节'} · {wordCount}</p>
          <p><span className="text-[var(--text-tertiary)]">选区：</span>{selectedTextLength > 0 ? `${selectedTextLength} 字已加入当前上下文` : '未选择正文'}</p>
          {activeArtifactTitle ? <p><span className="text-[var(--text-tertiary)]">产物：</span>{activeArtifactTitle}</p> : null}
        </div>
      </ContextSection>

      <ContextSection title={`作品结构 · ${volumes.length} 卷 ${chapters.length} 章`} icon={<BookCopy className="h-3.5 w-3.5 text-[var(--text-secondary)]" />} open>
        <div className="space-y-0.5 py-1">
          {volumes.map((volume) => {
            const volumeChapters = chapters.filter((chapter) => chapter.volumeId === volume.id)
            return <details key={volume.id} open={volume.title === volumeTitle} className="group/volume rounded-[8px]">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[8px] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
                <ChevronRight className="h-3 w-3 transition-transform group-open/volume:rotate-90" /><NotebookText className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">第 {volume.orderIndex} 卷 · {volume.title}</span><span className="text-[10px] text-[var(--text-tertiary)]">{volumeChapters.length} 章</span>
              </summary>
              <div className="ml-5 border-l border-[var(--border-subtle)] pl-2">
                {volumeChapters.map((chapter) => <div key={chapter.id} className={cn('flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[11px]', chapter.title === chapterTitle ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}><FileText className="h-3 w-3 shrink-0" /><span className="min-w-0 flex-1 truncate">第 {chapter.orderInVolume} 章 · {chapter.title}</span><span className="shrink-0 text-[9px] text-[var(--text-tertiary)]">{chapter.wordCount} 字</span></div>)}
                {volumeChapters.length === 0 ? <p className="px-2 py-1.5 text-[10px] text-[var(--text-tertiary)]">空卷</p> : null}
              </div>
            </details>
          })}
          {volumes.length === 0 ? <p className="px-2 py-1.5 text-[10px] text-[var(--text-tertiary)]">尚未建立卷结构</p> : null}
        </div>
      </ContextSection>

      <ContextSection title={`计划与资料 · ${plans.length}`} icon={<NotebookText className="h-3.5 w-3.5 text-[var(--text-secondary)]" />}>
        <div className="space-y-0.5 py-1">{plans.map((plan) => <div key={plan.id} className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-[11px] text-[var(--text-secondary)]"><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{plan.title}</span></div>)}{plans.length === 0 ? <p className="px-2 py-1.5 text-[10px] text-[var(--text-tertiary)]">暂无计划文件</p> : null}</div>
      </ContextSection>

      <ContextSection title="创作设定" icon={<Sparkles className="h-3.5 w-3.5 text-[var(--text-secondary)]" />}>
        <div className="space-y-1 px-2 py-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">
          <p><span className="text-[var(--text-tertiary)]">类型：</span>{projectNotes?.genre || '未设置'}</p>
          <p className="flex gap-1"><Users className="mt-1 h-3 w-3 shrink-0" /><span>{projectNotes?.protagonist || '主角未设置'}</span></p>
          <p><span className="text-[var(--text-tertiary)]">基调：</span>{projectNotes?.tone || '未设置'}</p>
          <p><span className="text-[var(--text-tertiary)]">风格：</span>{projectNotes?.stylePreference || '未设置'}</p>
        </div>
      </ContextSection>

      <ContextSection title={`当前会话 · ${taskCount} 个任务`} icon={<MessageSquareText className="h-3.5 w-3.5 text-[var(--text-secondary)]" />}>
        <p className="px-2 py-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">{activeTaskTitle || '新任务'}</p>
      </ContextSection>
    </div> : null}
  </div>
}

function ChangesTree({ activities, pendingReviewCount }: { activities: WorkspaceActivity[]; pendingReviewCount: number }) {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(() => new Set())
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: WorkspaceActivity[] }>()
    for (const activity of activities) {
      const key = activity.chapterId ?? `tool:${activity.label}`
      const current = map.get(key) ?? { label: activity.label, items: [] }
      current.items.push(activity)
      map.set(key, current)
    }
    return Array.from(map.entries())
  }, [activities])

  if (activities.length === 0) return <div className="px-4 py-5"><p className="text-sm text-[var(--text-primary)]">没有工作区变更</p><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">Agent 的写入、结构和计划操作会按目标形成变更树。</p></div>

  return <div className="h-full overflow-y-auto px-3 py-4">
    <div className="mb-3 flex items-center gap-2 px-2 text-sm text-[var(--text-primary)]"><GitCompareArrows className="h-4 w-4" /><span>{activities.length} 项变更</span>{pendingReviewCount > 0 ? <span className="text-[10px] text-amber-500">{pendingReviewCount} 项待审</span> : null}</div>
    <div className="space-y-1">
      {groups.map(([key, group]) => {
        const totals = group.items.reduce((sum, item) => { const delta = activityDelta(item); return { added: sum.added + delta.added, removed: sum.removed + delta.removed } }, { added: 0, removed: 0 })
        return <details key={key} open className="group overflow-hidden rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" /><FolderTree className="h-3.5 w-3.5 text-[var(--text-secondary)]" /><span className="min-w-0 flex-1 truncate">{group.label}</span><Delta {...totals} /></summary>
          <div className="border-t border-[var(--border-subtle)]">
            {group.items.map((activity) => {
              const delta = activityDelta(activity)
              const open = expandedCalls.has(activity.callId)
              return <div key={activity.callId} className="border-b border-[var(--border-subtle)] last:border-b-0">
                <button type="button" onClick={() => setExpandedCalls((current) => { const next = new Set(current); if (next.has(activity.callId)) next.delete(activity.callId); else next.add(activity.callId); return next })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] hover:bg-[var(--surface-muted)]"><FileText className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /><span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{activity.toolName}</span><Delta {...delta} /><span className={cn('text-[10px]', activity.status === 'failed' ? 'text-rose-500' : activity.accepted ? 'text-emerald-600' : 'text-[var(--text-tertiary)]')}>{activity.status === 'running' ? '执行中' : activity.status === 'failed' ? '失败' : activity.accepted ? '已接受' : '已完成'}</span>{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</button>
                {open ? <div className="bg-[var(--surface-muted)]/45 px-4 py-2 text-[10px] leading-5 text-[var(--text-secondary)]"><p>{activity.summary || activity.label}</p>{typeof activity.before === 'string' && typeof activity.after === 'string' ? <div className="mt-2 grid gap-2"><div className="rounded-[6px] border border-rose-500/20 bg-rose-500/5 p-2"><p className="mb-1 font-medium text-rose-500">修改前</p><pre className="max-h-24 overflow-auto whitespace-pre-wrap font-sans">{activity.before || '（空）'}</pre></div><div className="rounded-[6px] border border-emerald-500/20 bg-emerald-500/5 p-2"><p className="mb-1 font-medium text-emerald-600">修改后</p><pre className="max-h-24 overflow-auto whitespace-pre-wrap font-sans">{activity.after || '（空）'}</pre></div></div> : null}<p className="mt-2 font-mono text-[var(--text-tertiary)]">call {activity.callId}</p></div> : null}
              </div>
            })}
          </div>
        </details>
      })}
    </div>
  </div>
}

export default function WorkInspector({ tab, onTabChange, workTree, novelTitle, volumeTitle, chapterTitle, chapterCount, wordCount, pendingReviewCount, activeArtifactTitle, selectedTextLength, activities = [], memoryGraph, compactNavigation = false, showNavigation = true, volumes = [], chapters = [], plans = [], projectNotes, activeTaskTitle, taskCount = 0 }: Props) {
  const tabs = [{ key: 'work' as const, label: '作品', icon: BookCopy }, { key: 'context' as const, label: '上下文', icon: ScrollText }, { key: 'changes' as const, label: '变更', icon: GitCompareArrows }, { key: 'memory' as const, label: '记忆', icon: BrainCircuit }]
  return <div className="flex h-full min-h-0 flex-col">
    {showNavigation ? <div className="flex h-11 shrink-0 items-end border-b border-[var(--border-subtle)] pl-10 pr-1">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" title={label} aria-label={label} onClick={() => onTabChange(key)} className={cn('flex h-10 min-w-0 flex-1 items-center justify-center gap-1 border-b-2 px-1 text-[10px] transition', tab === key ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}><Icon className="h-3.5 w-3.5 shrink-0" /><span className={cn(compactNavigation && 'sr-only')}>{label}</span></button>)}</div> : null}
    <div className="min-h-0 flex-1 overflow-hidden">
      {tab === 'work' ? workTree : null}
      {tab === 'context' ? <ContextTree novelTitle={novelTitle} volumeTitle={volumeTitle} chapterTitle={chapterTitle} chapterCount={chapterCount} wordCount={wordCount} activeArtifactTitle={activeArtifactTitle} selectedTextLength={selectedTextLength} volumes={volumes} chapters={chapters} plans={plans} projectNotes={projectNotes} activeTaskTitle={activeTaskTitle} taskCount={taskCount} /> : null}
      {tab === 'changes' ? <ChangesTree activities={activities} pendingReviewCount={pendingReviewCount} /> : null}
      {tab === 'memory' ? <div className="h-full min-h-0 overflow-hidden">{memoryGraph}</div> : null}
    </div>
  </div>
}
