import { useCallback, useEffect, useState } from 'react'
import { Bot, Pencil, ScrollText, Trash2, X } from 'lucide-react'

import Button from '@/components/ui/Button'
import type { AgentSubtaskLogsView, AgentSubtaskRole, AgentSubtaskView } from '../../../../../shared/contracts'
import {
  cancelAgentSubtaskRequest,
  createAgentSubtaskRequest,
  deleteAgentSubtaskRequest,
  fetchAgentSubtaskLogs,
  fetchAgentSubtasks,
  updateAgentSubtaskRequest,
} from '../agentApi'

const inputClass = 'h-10 w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-sm outline-none transition-colors focus:border-[var(--border-strong)]'
const textareaClass = 'min-h-24 w-full resize-y rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-3 text-sm leading-6 outline-none transition-colors focus:border-[var(--border-strong)]'
const roleLabel: Record<AgentSubtaskRole, string> = { research: '调研', continuity: '一致性', quality: '质量', lore: '设定' }
const statusLabel: Record<string, string> = { queued: '等待执行', running: '执行中', awaiting_approval: '等待授权', succeeded: '已完成', failed: '执行失败', cancelled: '已取消' }

type Draft = { name: string; role: AgentSubtaskRole; triggerCondition: string; prompt: string; tokenBudget: number }
const emptyDraft: Draft = { name: '', role: 'research', triggerCondition: '', prompt: '', tokenBudget: 4000 }

export default function SubAgentManager({ novelId, sessionId, chapterId }: { novelId: string; sessionId: string | null; chapterId?: string | null }) {
  const [items, setItems] = useState<AgentSubtaskView[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<AgentSubtaskView | null>(null)
  const [logs, setLogs] = useState<AgentSubtaskLogsView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(() => fetchAgentSubtasks(novelId).then((data) => setItems(data.items)), [novelId])
  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : '子 Agent 加载失败。')) }, [refresh])

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请稍后再试。') } finally { setBusy(false) }
  }

  return <section>
    <div className="flex items-start gap-3"><Bot className="mt-0.5 h-4 w-4" /><div><h3 className="text-sm font-semibold">专业子 Agent</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">先命名并描述触发条件。主 Agent 与其他子 Agent 都可按条件调用；同时最多运行 4 个。</p></div></div>
    {error ? <p className="mt-3 rounded-[10px] bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
      <input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="子 Agent 名称（必填）" aria-label="子 Agent 名称" />
      <select className={inputClass} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AgentSubtaskRole })} aria-label="子 Agent 专长">{Object.entries(roleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    <input className={`${inputClass} mt-3`} value={draft.triggerCondition} onChange={(event) => setDraft({ ...draft, triggerCondition: event.target.value })} placeholder="触发条件，例如：需要核对世界观冲突或前后文矛盾时" aria-label="触发条件" />
    <textarea className={`${textareaClass} mt-3`} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder="描述它被调用后要完成的任务、输出格式和边界…" />
    <div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">Token 预算<input className="h-9 w-28 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-sm" type="number" min={500} max={32000} step={500} value={draft.tokenBudget} onChange={(event) => setDraft({ ...draft, tokenBudget: Number(event.target.value) })} /></label><Button disabled={!sessionId || !draft.name.trim() || !draft.triggerCondition.trim() || !draft.prompt.trim() || busy} onClick={() => void run(async () => { if (!sessionId) return; await createAgentSubtaskRequest({ novelId, parentSessionId: sessionId, chapterId, ...draft }); setDraft(emptyDraft); await refresh() })}>创建并启动</Button></div>

    <div className="mt-6 space-y-3">{items.map((item) => <article key={item.id} className="rounded-[14px] border border-[var(--border-subtle)] p-4">
      {editing?.id === item.id ? <div className="space-y-3"><input className={inputClass} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /><div className="grid gap-3 sm:grid-cols-[1fr_150px]"><select className={inputClass} value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value as AgentSubtaskRole })}>{Object.entries(roleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className={inputClass} type="number" min={500} max={32000} step={500} value={editing.tokenBudget} onChange={(event) => setEditing({ ...editing, tokenBudget: Number(event.target.value) })} aria-label="编辑 Token 预算" /></div><input className={inputClass} value={editing.triggerCondition} onChange={(event) => setEditing({ ...editing, triggerCondition: event.target.value })} /><textarea className={textareaClass} value={editing.prompt} onChange={(event) => setEditing({ ...editing, prompt: event.target.value })} /><div className="flex gap-2"><Button size="sm" disabled={!editing.name.trim() || !editing.triggerCondition.trim() || !editing.prompt.trim()} onClick={() => void run(async () => { await updateAgentSubtaskRequest(item.id, { name: editing.name, role: editing.role, triggerCondition: editing.triggerCondition, prompt: editing.prompt, tokenBudget: editing.tokenBudget }); setEditing(null); await refresh() })}>保存</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>取消</Button></div></div> : <>
        <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{item.name}</p><span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{roleLabel[item.role]}</span><span className="text-[10px] text-[var(--text-tertiary)]">{statusLabel[item.status] ?? item.status}</span></div><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]"><span className="text-[var(--text-primary)]">触发：</span>{item.triggerCondition}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{item.prompt}</p><p className="mt-2 text-[10px] text-[var(--text-tertiary)]">主 Agent 与子 Agent 均可调用 · 预算 {item.tokenBudget.toLocaleString()} tokens</p></div></div>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => void run(async () => setLogs(await fetchAgentSubtaskLogs(item.id)))}><ScrollText className="mr-1 h-3.5 w-3.5" />查看使用日志</Button><Button size="sm" variant="ghost" onClick={() => setEditing(item)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button>{['running', 'queued', 'awaiting_approval'].includes(item.status) ? <Button size="sm" variant="ghost" onClick={() => void run(async () => { await cancelAgentSubtaskRequest(item.id); await refresh() })}>取消运行</Button> : null}<Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { if (window.confirm(`确定删除“${item.name}”及其运行记录吗？`)) void run(async () => { await deleteAgentSubtaskRequest(item.id); await refresh() }) }}><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button></div>
      </>}
    </article>)}{items.length === 0 ? <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">还没有子 Agent。请先为它命名，再定义触发条件。</p> : null}</div>

    {logs ? <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setLogs(null) }}><section role="dialog" aria-modal="true" aria-label={`${logs.name} 使用日志`} className="flex max-h-[78dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-2xl"><header className="flex items-center border-b border-[var(--border-subtle)] px-5 py-4"><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{logs.name} · 使用日志</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{statusLabel[logs.status] ?? logs.status} · 已转换为可读中文</p></div><button type="button" className="h-8 w-8 rounded-full hover:bg-[var(--surface-muted)]" onClick={() => setLogs(null)} aria-label="关闭使用日志"><X className="m-auto h-4 w-4" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-5"><ol className="space-y-4">{logs.entries.map((entry) => <li key={entry.id} className="relative border-l border-[var(--border-subtle)] pl-4"><span className={`absolute -left-1 top-1.5 h-2 w-2 rounded-full ${entry.tone === 'success' ? 'bg-emerald-500' : entry.tone === 'danger' ? 'bg-rose-500' : entry.tone === 'warning' ? 'bg-amber-500' : 'bg-slate-400'}`} /><div className="flex items-baseline justify-between gap-4"><p className="text-xs font-medium">{entry.title}</p><time className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{new Date(entry.time).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-secondary)]">{entry.detail}</p></li>)}</ol></div></section></div> : null}
  </section>
}
