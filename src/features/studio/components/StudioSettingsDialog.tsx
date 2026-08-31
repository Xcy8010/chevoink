import { BrainCircuit, Check, Settings2, Sparkles, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

import { CustomModelSettingsContent } from '@/features/account/CustomModelSettingsDialog'
import { cn } from '@/lib/utils'

export type StudioSettingsSection = 'general' | 'models'

type Props = {
  open: boolean
  section: StudioSettingsSection
  onSectionChange: (section: StudioSettingsSection) => void
  onClose: () => void
  perspective: 'work' | 'ide'
  onPerspectiveChange: (perspective: 'work' | 'ide') => void
  autoFollow: boolean
  onAutoFollowChange: (enabled: boolean) => void
}

function SettingChoice({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('flex h-10 min-w-28 items-center justify-between gap-3 rounded-[10px] border px-3 text-sm transition-colors', active ? 'border-[var(--text-primary)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'border-[var(--border-subtle)] bg-[var(--surface-default)] hover:border-[var(--border-strong)]')}>{children}{active ? <Check className="h-3.5 w-3.5" /> : null}</button>
}

export default function StudioSettingsDialog(props: Props) {
  if (!props.open) return null
  const nav = [{ id: 'general' as const, label: '通用', icon: Settings2 }, { id: 'models' as const, label: '模型', icon: BrainCircuit }]
  return createPortal(<div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/30 backdrop-blur-[3px] sm:items-center sm:p-6"><section role="dialog" aria-modal="true" aria-label="创作区设置" className="flex h-[min(760px,94dvh)] w-full max-w-5xl overflow-hidden border border-[#ded7cc] bg-[#fbf8f2] text-[#1b2230] shadow-[0_28px_90px_rgba(27,34,48,0.22)] sm:rounded-[22px]">
    <aside className="hidden w-52 shrink-0 border-r border-[#e7e0d5] bg-[#f5f0e8] p-4 sm:block"><div className="mb-5 flex items-center gap-2 px-2"><Sparkles className="h-4 w-4" /><span className="text-sm font-semibold">创作区设置</span></div><nav className="space-y-1">{nav.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => props.onSectionChange(id)} className={cn('flex h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-sm transition-colors', props.section === id ? 'bg-[#ded8ce] font-medium' : 'text-[#667085] hover:bg-[#ebe5dc] hover:text-[#1b2230]')}><Icon className="h-4 w-4" />{label}</button>)}</nav></aside>
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 shrink-0 items-center gap-2 border-b border-[#e7e0d5] px-5"><div className="flex gap-1 sm:hidden">{nav.map(({ id, label }) => <button key={id} type="button" onClick={() => props.onSectionChange(id)} className={cn('rounded-full px-3 py-1.5 text-xs', props.section === id ? 'bg-[#1b2230] text-white' : 'bg-[#eee8df]')}>{label}</button>)}</div><div className="hidden sm:block"><h2 className="text-lg font-semibold">{props.section === 'general' ? '通用' : '模型'}</h2><p className="mt-0.5 text-xs text-[#7b8494]">只影响当前浏览器中的创作工作区。</p></div><button type="button" onClick={props.onClose} className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#eee8df]" aria-label="关闭设置"><X className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">{props.section === 'general' ? <div className="mx-auto max-w-2xl space-y-8"><section><h3 className="text-sm font-semibold">默认工作模式</h3><p className="mt-1 text-xs leading-5 text-[#7b8494]">Work 适合与 Agent 协作，IDE 适合集中编辑作品结构与正文。</p><div className="mt-4 flex flex-wrap gap-2"><SettingChoice active={props.perspective === 'work'} onClick={() => props.onPerspectiveChange('work')}>Work</SettingChoice><SettingChoice active={props.perspective === 'ide'} onClick={() => props.onPerspectiveChange('ide')}>IDE</SettingChoice></div></section><section className="border-t border-[#e7e0d5] pt-6"><div className="flex items-start justify-between gap-6"><div><h3 className="text-sm font-semibold">正文自动追踪</h3><p className="mt-1 text-xs leading-5 text-[#7b8494]">Agent 写入或打开章节时，让查看器自动定位到对应内容。</p></div><button type="button" role="switch" aria-checked={props.autoFollow} onClick={() => props.onAutoFollowChange(!props.autoFollow)} className={cn('relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors', props.autoFollow ? 'bg-emerald-600' : 'bg-[#d5cfc6]')}><span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', props.autoFollow ? 'translate-x-[22px]' : 'translate-x-[3px]')} /></button></div></section></div> : <div className="mx-auto max-w-2xl"><CustomModelSettingsContent active={props.open && props.section === 'models'} /></div>}</div>
    </div>
  </section></div>, document.body)
}
