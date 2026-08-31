import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Bot, BrainCircuit, Check, RotateCcw, Settings2, SlidersHorizontal, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

import { CustomModelSettingsContent } from '@/features/account/CustomModelSettingsDialog'
import { cn } from '@/lib/utils'
import type { Novel } from '../../../../shared/contracts/index.js'
import { updateNovelMeta } from '../api'
import { fetchAgentSessions, updateAgentSessionSettings } from '../agent/agentApi'
import AgentOperationsCenter from '../agent/components/AgentOperationsCenter'

export type StudioSettingsSection = 'general' | 'models' | 'operations' | 'archives'

type Props = {
  open: boolean
  section: StudioSettingsSection
  onSectionChange: (section: StudioSettingsSection) => void
  onClose: () => void
  perspective: 'work' | 'ide'
  onPerspectiveChange: (perspective: 'work' | 'ide') => void
  autoFollow: boolean
  onAutoFollowChange: (enabled: boolean) => void
  novelId: string
  novels: Novel[]
  sessionId: string | null
  chapterId?: string | null
  runIds?: string[]
  onSelectSession?: (sessionId: string) => void
}

function SettingChoice({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('flex h-10 min-w-28 items-center justify-between gap-3 rounded-[10px] border px-3 text-sm transition-[background-color,border-color,transform] duration-200 active:scale-[.98]', active ? 'border-[var(--text-primary)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'border-[var(--border-subtle)] bg-[var(--surface-default)] hover:border-[var(--border-strong)]')}>{children}{active ? <Check className="h-3.5 w-3.5" /> : null}</button>
}

function ArchivesPanel({ novels }: { novels: Novel[] }) {
  const queryClient = useQueryClient()
  const tasksQuery = useQuery({
    queryKey: ['agent', 'sessions', 'archives'],
    queryFn: () => fetchAgentSessions(undefined, { includeArchived: true }),
    staleTime: 10_000,
  })
  const archivedNovels = novels.filter((novel) => novel.status === 'archived')
  const archivedTasks = (tasksQuery.data?.items ?? []).filter((task) => task.status === 'archived')

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] }),
      queryClient.invalidateQueries({ queryKey: ['agent', 'sessions'] }),
    ])
  }

  return <div className="mx-auto max-w-3xl space-y-8">
    <section><h3 className="text-sm font-semibold">已归档作品</h3><p className="mt-1 text-xs text-[var(--text-tertiary)]">恢复后会重新出现在创作区项目列表。</p><div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">{archivedNovels.map((novel) => <div key={novel.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{novel.displayTitle?.trim() || novel.title || '未命名作品'}</p><p className="mt-1 text-xs text-[var(--text-tertiary)]">{novel.chapterCount} 章</p></div><button type="button" onClick={() => void updateNovelMeta(novel.id, { status: 'draft' }).then(refresh)} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--border-subtle)] px-2.5 text-xs hover:bg-[var(--surface-muted)]"><RotateCcw className="h-3.5 w-3.5" />恢复</button></div>)}{archivedNovels.length === 0 ? <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">没有已归档作品</p> : null}</div></section>
    <section><h3 className="text-sm font-semibold">已归档任务</h3><p className="mt-1 text-xs text-[var(--text-tertiary)]">恢复任务不会改变所属作品或历史消息。</p><div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">{archivedTasks.map((task) => <div key={task.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{task.novelTitle ?? '所属作品'}</p></div><button type="button" onClick={() => void updateAgentSessionSettings(task.id, { status: 'active' }).then(refresh)} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--border-subtle)] px-2.5 text-xs hover:bg-[var(--surface-muted)]"><RotateCcw className="h-3.5 w-3.5" />恢复</button></div>)}{archivedTasks.length === 0 ? <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">没有已归档任务</p> : null}</div></section>
  </div>
}

export default function StudioSettingsDialog(props: Props) {
  if (!props.open) return null
  const nav = [
    { id: 'general' as const, label: '通用', icon: Settings2 },
    { id: 'models' as const, label: '模型', icon: BrainCircuit },
    { id: 'operations' as const, label: 'Agent 操作', icon: Bot },
    { id: 'archives' as const, label: '归档', icon: Archive },
  ]
  const title = nav.find((item) => item.id === props.section)?.label ?? '创作区设置'

  return createPortal(<div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/30 backdrop-blur-[3px] sm:items-center sm:p-6"><section role="dialog" aria-modal="true" aria-label="创作区设置" className="flex h-[min(820px,94dvh)] w-full max-w-6xl overflow-hidden border border-[var(--border-subtle)] bg-white text-[var(--text-primary)] shadow-[0_28px_90px_rgba(15,23,42,.22)] sm:rounded-[22px] dark:bg-[var(--surface-default)]">
    <aside className="hidden w-52 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--app-bg)] p-4 sm:block"><div className="mb-5 flex items-center gap-2 px-2"><SlidersHorizontal className="h-4 w-4" /><span className="text-sm font-semibold">创作区设置</span></div><nav className="space-y-1">{nav.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => props.onSectionChange(id)} className={cn('flex h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-sm transition-colors', props.section === id ? 'bg-[var(--surface-muted)] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]')}><Icon className="h-4 w-4" />{label}</button>)}</nav></aside>
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-5"><div className="flex gap-1 overflow-x-auto sm:hidden">{nav.map(({ id, label }) => <button key={id} type="button" onClick={() => props.onSectionChange(id)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs', props.section === id ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'bg-[var(--surface-muted)]')}>{label}</button>)}</div><div className="hidden sm:block"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-0.5 text-xs text-[var(--text-tertiary)]">当前创作区的工作模式、模型、Agent 与归档内容。</p></div><button type="button" onClick={props.onClose} className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]" aria-label="关闭设置"><X className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto">{props.section === 'general' ? <div className="mx-auto max-w-2xl space-y-8 px-5 py-7 sm:px-8"><section><h3 className="text-sm font-semibold">默认工作模式</h3><p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">Work 适合与 Agent 协作，IDE 适合集中编辑作品结构与正文。</p><div className="mt-4 flex flex-wrap gap-2"><SettingChoice active={props.perspective === 'work'} onClick={() => props.onPerspectiveChange('work')}>Work</SettingChoice><SettingChoice active={props.perspective === 'ide'} onClick={() => props.onPerspectiveChange('ide')}>IDE</SettingChoice></div></section><section className="border-t border-[var(--border-subtle)] pt-6"><div className="flex items-start justify-between gap-6"><div><h3 className="text-sm font-semibold">正文自动追踪</h3><p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">Agent 写入或打开章节时，查看器自动定位到对应内容。</p></div><button type="button" role="switch" aria-checked={props.autoFollow} onClick={() => props.onAutoFollowChange(!props.autoFollow)} className={cn('relative mt-1 h-6 w-11 shrink-0 rounded-full transition-[background-color,box-shadow] duration-200 ease-out active:scale-95', props.autoFollow ? 'bg-emerald-600 shadow-[0_0_0_3px_rgba(5,150,105,.12)]' : 'bg-[var(--border-strong)]')}><span className={cn('absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)]', props.autoFollow ? 'translate-x-[22px]' : 'translate-x-[3px]')} /></button></div></section></div> : null}
        {props.section === 'models' ? <div className="mx-auto max-w-3xl px-5 py-7 sm:px-8"><CustomModelSettingsContent active /></div> : null}
        {props.section === 'operations' ? <AgentOperationsCenter embedded open onClose={props.onClose} novelId={props.novelId} sessionId={props.sessionId} chapterId={props.chapterId} runIds={props.runIds ?? []} onSelectSession={props.onSelectSession} /> : null}
        {props.section === 'archives' ? <div className="px-5 py-7 sm:px-8"><ArchivesPanel novels={props.novels} /></div> : null}
      </div>
    </div>
  </section></div>, document.body)
}
