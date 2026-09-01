import { useEffect, useMemo, useState } from 'react'
import { Archive, Bot, CalendarClock, GitBranch, LoaderCircle, Pin, Search, ShieldCheck, SlidersHorizontal, SquareActivity, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { AgentEvalComparisonView, AgentScheduleView, AgentSession, AgentSessionToolPolicy, AgentSandboxMode, StoryBranchDiffView, StoryBranchView } from '../../../../../shared/contracts'
import {
  createAgentScheduleRequest, createEvalComparisonRequest,
  createStoryBranchRequest, fetchAgentSchedules, fetchAgentSessions, fetchEvalComparisons,
  fetchStoryBranchDiff, fetchStoryBranches, mergeStoryBranchRequest, updateAgentScheduleRequest,
  updateAgentSessionSettings, updateStoryBranchRequest,
} from '../agentApi'
import SubAgentManager from './SubAgentManager'

type Tab = 'tasks' | 'branches' | 'agents' | 'schedules' | 'permissions' | 'evals'
type Props = { open: boolean; onClose: () => void; novelId: string; sessionId: string | null; chapterId?: string | null; runIds: string[]; currentSession?: AgentSession | null; onSelectSession?: (sessionId: string) => void; embedded?: boolean }

const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
  { id: 'tasks', label: '任务', icon: Search }, { id: 'branches', label: '版本', icon: GitBranch },
  { id: 'agents', label: '子 Agent', icon: Bot }, { id: 'schedules', label: '定时', icon: CalendarClock },
  { id: 'permissions', label: '权限', icon: ShieldCheck }, { id: 'evals', label: '评测', icon: SquareActivity },
]
const defaultPolicy: AgentSessionToolPolicy = { network: 'ask', contentWrite: 'allow', bulkWrite: 'ask', publish: 'ask', destructive: 'ask' }
const inputClass = 'h-10 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-sm outline-none transition-colors focus:border-[var(--border-strong)]'
const textareaClass = 'min-h-24 w-full resize-y rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-3 text-sm leading-6 outline-none transition-colors focus:border-[var(--border-strong)]'

export default function AgentOperationsCenter({ open, onClose, novelId, sessionId, chapterId, runIds, currentSession, onSelectSession, embedded = false }: Props) {
  const [tab, setTab] = useState<Tab>('tasks')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState<AgentSession[]>([])
  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [branches, setBranches] = useState<StoryBranchView[]>([])
  const [branchName, setBranchName] = useState('新版本')
  const [editingBranch, setEditingBranch] = useState<StoryBranchView | null>(null)
  const [branchDiff, setBranchDiff] = useState<StoryBranchDiffView | null>(null)
  const [schedules, setSchedules] = useState<AgentScheduleView[]>([])
  const [scheduleName, setScheduleName] = useState('章节质量巡检')
  const [schedulePrompt, setSchedulePrompt] = useState('检查最新章节的连续性、逻辑和人类感质量，输出明确结论。')
  const [cadenceMinutes, setCadenceMinutes] = useState(1440)
  const [sandboxMode, setSandboxMode] = useState<AgentSandboxMode>('workspace')
  const [policy, setPolicy] = useState<AgentSessionToolPolicy>(defaultPolicy)
  const [selectedRuns, setSelectedRuns] = useState<string[]>([])
  const [evals, setEvals] = useState<AgentEvalComparisonView[]>([])

  const execute = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请稍后再试。') } finally { setBusy(false) }
  }
  const refreshTasks = () => fetchAgentSessions(undefined, { query, includeArchived }).then((data) => setTasks(data.items))
  const refreshBranches = () => fetchStoryBranches(novelId).then((data) => setBranches(data.items))
  const refreshSchedules = () => fetchAgentSchedules(novelId).then((data) => setSchedules(data.items))
  const refreshEvals = () => fetchEvalComparisons(novelId).then((data) => setEvals(data.items))

  useEffect(() => {
    if (!open) return
    setSandboxMode(currentSession?.sandboxMode ?? 'workspace')
    setPolicy(currentSession?.toolPolicy ?? defaultPolicy)
    void execute(async () => { await Promise.all([refreshTasks(), refreshBranches(), refreshSchedules(), refreshEvals()]) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, novelId])
  useEffect(() => {
    if (!open || tab !== 'tasks') return
    const timer = window.setTimeout(() => void execute(refreshTasks), 220)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, includeArchived, open, tab])

  const runOptions = useMemo(() => [...new Set(runIds)].slice(-12).reverse(), [runIds])
  if (!open) return null

  const content = (
    <div className={cn(embedded ? 'h-full min-h-0' : 'fixed inset-0 z-[155] flex items-end justify-center bg-black/35 backdrop-blur-[2px] sm:items-center sm:p-6')} onMouseDown={(event) => { if (!embedded && event.target === event.currentTarget) onClose() }}>
      <section role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-label="Agent 操作中心" className={cn('flex w-full flex-col overflow-hidden bg-[var(--surface-default)]', embedded ? 'h-full min-h-0' : 'h-[92dvh] max-w-5xl border border-[var(--border-subtle)] shadow-[0_28px_90px_rgba(15,23,42,0.28)] sm:h-[78dvh] sm:rounded-[24px]')}>
        <header className={cn('items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-6', embedded ? 'hidden' : 'flex')}>
          <SlidersHorizontal className="h-4 w-4" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Agent 操作中心</h2><p className="truncate text-xs text-[var(--text-secondary)]">任务、版本、专业 Agent、定时与安全策略</p></div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]" aria-label="关闭"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-subtle)] p-2 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r" aria-label="操作中心导航">
            {tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn('inline-flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-2 text-xs transition-colors', tab === item.id ? 'bg-[var(--surface-muted)] font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]/70')}><item.icon className="h-3.5 w-3.5" />{item.label}</button>)}
          </nav>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {error ? <div className="mb-4 border-l-2 border-rose-500 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
            {tab === 'tasks' ? <section><div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-[var(--text-tertiary)]" /><input className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务标题或作品名" /></label><label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />显示已归档</label></div><div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">{tasks.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><button type="button" onClick={() => { if (item.novelId === novelId) { onSelectSession?.(item.id); onClose() } else { window.location.assign(`/studio/novel/${encodeURIComponent(item.novelId)}?session=${encodeURIComponent(item.id)}`) } }} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{item.novelTitle ?? '当前作品'} · {new Date(item.updatedAt).toLocaleString()}</p></button><button type="button" className={cn('h-8 w-8 rounded-full', item.pinnedAt && 'bg-[var(--surface-muted)]')} onClick={() => void execute(async () => { await updateAgentSessionSettings(item.id, { pinned: !item.pinnedAt }); await refreshTasks() })} title={item.pinnedAt ? '取消置顶' : '置顶'}><Pin className="m-auto h-3.5 w-3.5" /></button><button type="button" className="h-8 w-8 rounded-full hover:bg-[var(--surface-muted)]" onClick={() => void execute(async () => { await updateAgentSessionSettings(item.id, { status: item.status === 'archived' ? 'active' : 'archived' }); await refreshTasks() })} title={item.status === 'archived' ? '恢复任务' : '归档任务'}><Archive className="m-auto h-3.5 w-3.5" /></button></div>)}{tasks.length === 0 ? <p className="py-10 text-center text-xs text-[var(--text-tertiary)]">没有匹配的任务</p> : null}</div></section> : null}
            {tab === 'branches' ? <section><h3 className="text-sm font-semibold">小说版本分支</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">从当前章节或运行快照建立隔离版本；合并前会检查源章节是否变化。</p><div className="mt-4 flex gap-2"><input className={inputClass} value={branchName} onChange={(event) => setBranchName(event.target.value)} /><Button disabled={!chapterId || busy} onClick={() => void execute(async () => { if (!chapterId) return; await createStoryBranchRequest({ novelId, chapterId, sourceRunId: runOptions[0] ?? null, name: branchName }); await refreshBranches() })}>Fork</Button></div>{!chapterId ? <p className="mt-2 text-xs text-amber-600">请先打开一个章节再创建分支。</p> : null}<div className="mt-5 space-y-3">{branches.map((item) => <article key={item.id} className="rounded-[14px] border border-[var(--border-subtle)] p-3"><div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p><span className="text-[10px] text-[var(--text-tertiary)]">{item.status}</span></div>{editingBranch?.id === item.id ? <textarea className={`${textareaClass} mt-3 min-h-40`} value={editingBranch.headContent} onChange={(event) => setEditingBranch({ ...editingBranch, headContent: event.target.value })} /> : null}<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => setEditingBranch(editingBranch?.id === item.id ? null : item)}>{editingBranch?.id === item.id ? '收起编辑' : '编辑分支'}</Button>{editingBranch?.id === item.id ? <Button size="sm" onClick={() => void execute(async () => { await updateStoryBranchRequest(item.id, { content: editingBranch.headContent }); setEditingBranch(null); await refreshBranches() })}>保存</Button> : null}<Button size="sm" variant="ghost" onClick={() => void execute(async () => setBranchDiff((await fetchStoryBranchDiff(item.id)).diff))}>比较</Button>{item.status === 'active' ? <Button size="sm" variant="secondary" onClick={() => void execute(async () => { await mergeStoryBranchRequest(item.id); await refreshBranches() })}>合并</Button> : null}</div>{branchDiff?.branchId === item.id ? <div className="mt-3 rounded-[10px] bg-[var(--surface-muted)] p-3 text-xs leading-5"><p>{branchDiff.conflicted ? '检测到源章节冲突，暂不可直接合并。' : '源章节未变化，可以安全合并。'}</p><p className="text-[var(--text-secondary)]">+{branchDiff.addedLines} 行 / -{branchDiff.removedLines} 行 · revision {branchDiff.baseRevision} → {branchDiff.currentRevision}</p></div> : null}</article>)}</div></section> : null}
            {tab === 'agents' ? <SubAgentManager novelId={novelId} sessionId={sessionId} chapterId={chapterId} /> : null}
            {tab === 'schedules' ? <section><h3 className="text-sm font-semibold">长期目标与定时任务</h3><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px]"><input className={inputClass} value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} /><select className={inputClass} value={cadenceMinutes} onChange={(event) => setCadenceMinutes(Number(event.target.value))}><option value={360}>每 6 小时</option><option value={1440}>每天</option><option value={10080}>每周</option></select></div><textarea className={`${textareaClass} mt-3`} value={schedulePrompt} onChange={(event) => setSchedulePrompt(event.target.value)} /><Button className="mt-3" disabled={!sessionId || busy} onClick={() => void execute(async () => { if (!sessionId) return; await createAgentScheduleRequest({ novelId, sessionId, name: scheduleName, prompt: schedulePrompt, cadenceMinutes }); await refreshSchedules() })}>创建定时任务</Button><div className="mt-5 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">{schedules.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">下次 {new Date(item.nextRunAt).toLocaleString()} · {item.status}</p></div><Button size="sm" variant="ghost" onClick={() => void execute(async () => { await updateAgentScheduleRequest(item.id, { status: item.status === 'active' ? 'paused' : 'active' }); await refreshSchedules() })}>{item.status === 'active' ? '暂停' : '启用'}</Button></div>)}</div></section> : null}
            {tab === 'permissions' ? <section><h3 className="text-sm font-semibold">工具权限与沙箱</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">权限由服务端执行；高危发布、删除和批量改写不会因前端状态而绕过确认。</p><label className="mt-4 block text-xs">沙箱档位<select className={`${inputClass} mt-1.5`} value={sandboxMode} onChange={(event) => setSandboxMode(event.target.value as AgentSandboxMode)}><option value="read_only">只读</option><option value="workspace">作品工作区</option><option value="full_access">完整工具集</option></select></label><div className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">{([['network', '联网'], ['contentWrite', '正文写入'], ['bulkWrite', '批量改写'], ['publish', '发布'], ['destructive', '删除与回滚']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-4 py-3 text-sm"><span className="flex-1">{label}</span><select className="h-9 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-xs" value={policy[key]} onChange={(event) => setPolicy({ ...policy, [key]: event.target.value as 'allow' | 'ask' | 'deny' })}><option value="allow">允许</option><option value="ask">每次询问</option><option value="deny">禁止</option></select></label>)}</div><Button className="mt-4" disabled={!sessionId || busy} onClick={() => void execute(async () => { if (sessionId) await updateAgentSessionSettings(sessionId, { sandboxMode, toolPolicy: policy }) })}>保存权限</Button></section> : null}
            {tab === 'evals' ? <section><h3 className="text-sm font-semibold">Agent 回放与评测</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">选择 2–4 次真实运行，对比模型档位、推理强度、Token 和耗时；轨迹仍由原运行事件流回放。</p><div className="mt-4 space-y-2">{runOptions.map((id) => <label key={id} className="flex items-center gap-2 rounded-[10px] border border-[var(--border-subtle)] px-3 py-2 text-xs"><input type="checkbox" checked={selectedRuns.includes(id)} disabled={!selectedRuns.includes(id) && selectedRuns.length >= 4} onChange={(event) => setSelectedRuns(event.target.checked ? [...selectedRuns, id] : selectedRuns.filter((value) => value !== id))} /><span className="truncate">{id}</span></label>)}</div><Button className="mt-3" disabled={selectedRuns.length < 2 || busy} onClick={() => void execute(async () => { await createEvalComparisonRequest({ novelId, name: `运行对比 ${new Date().toLocaleDateString()}`, runIds: selectedRuns }); setSelectedRuns([]); await refreshEvals() })}>生成对比</Button><div className="mt-5 space-y-3">{evals.map((item) => <article key={item.id} className="rounded-[14px] border border-[var(--border-subtle)] p-3"><p className="text-sm font-medium">{item.name}</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-[var(--text-secondary)]"><tr><th className="pb-2">运行</th><th>模型</th><th>推理</th><th>Token</th><th>耗时</th></tr></thead><tbody>{item.metrics.map((metric) => <tr key={metric.runId} className="border-t border-[var(--border-subtle)]"><td className="max-w-40 truncate py-2">{metric.runId}</td><td>{metric.modelTier}</td><td>{metric.reasoningEffort}</td><td>{metric.totalTokens.toLocaleString()}</td><td>{metric.durationMs === null ? '—' : `${Math.round(metric.durationMs / 1000)}s`}</td></tr>)}</tbody></table></div></article>)}</div></section> : null}
            {busy ? <div className="pointer-events-none fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-4 py-2 text-xs text-[var(--surface-default)] shadow-lg"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />正在处理</div> : null}
          </main>
        </div>
      </section>
    </div>
  )
  return embedded ? content : createPortal(content, document.body)
}
