import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArchiveRestore, CheckCircle2, LoaderCircle, MessageSquareText, RefreshCw, ShieldCheck } from 'lucide-react'

import { compactAgentContext, fetchAgentContextState } from '../agentApi'
import { formatContextTokenCount } from '../lib/context-format'
import type { ContextState } from '../../../../../shared/contracts/index.js'

type Props = {
  sessionId: string | null
  active?: boolean
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return <section className="space-y-1.5">
    <h4 className="text-[11px] font-medium text-[var(--text-tertiary)]">{title}</h4>
    <ul className="space-y-1 text-[11px] leading-5 text-[var(--text-secondary)]">
      {items.slice(-6).map((item, index) => <li key={`${title}-${index}`} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--text-tertiary)]" /><span>{item}</span></li>)}
    </ul>
  </section>
}

/** 当前用户与 Agent 会话的真实上下文窗口，不混入作品树或编辑器选区。 */
export default function AgentContextPanel({ sessionId, active = false }: Props) {
  const [state, setState] = useState<ContextState | null>(null)
  const [loading, setLoading] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const wasActiveRef = useRef(active)
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  const load = useCallback(async (quiet = false) => {
    const targetSessionId = sessionId
    if (!targetSessionId) {
      setState(null)
      return
    }
    if (!quiet) setLoading(true)
    try {
      const nextState = await fetchAgentContextState(targetSessionId)
      if (sessionRef.current !== targetSessionId) return
      setState(nextState)
      setMessage(null)
    } catch (error) {
      if (sessionRef.current !== targetSessionId) return
      setMessage(error instanceof Error ? error.message : '上下文状态读取失败。')
    } finally {
      if (!quiet && sessionRef.current === targetSessionId) setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    setState(null)
    setMessage(null)
    void load()
  }, [load])

  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = active
    if (wasActive && !active && sessionId) void load(true)
    if (!sessionId || !active) return
    const timer = window.setInterval(() => void load(true), 5000)
    return () => window.clearInterval(timer)
  }, [sessionId, active, load])

  const percent = useMemo(() => Math.max(0, Math.round((state?.usageRatio ?? 0) * 100)), [state?.usageRatio])
  const cappedPercent = Math.min(100, percent)
  const checkpoint = state?.checkpoint ?? null

  const compact = async () => {
    if (!sessionId || compacting) return
    setCompacting(true)
    setMessage(null)
    try {
      const result = await compactAgentContext(sessionId)
      setState(result.state)
      setMessage(result.checkpoint ? `已生成第 ${result.checkpoint.version} 版上下文检查点。` : '当前有效对话较短，暂时无需压缩。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上下文压缩失败。')
    } finally {
      setCompacting(false)
    }
  }

  if (!sessionId) return <div className="flex h-full items-center justify-center px-6 text-center text-xs leading-6 text-[var(--text-secondary)]">发送第一条消息后，这里会显示当前任务的对话上下文与压缩进度。</div>

  return <div className="h-full overflow-y-auto px-4 py-4">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-muted)] text-[var(--text-secondary)]"><MessageSquareText className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">会话上下文</h3>
        <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">仅统计当前任务中用户与 Agent 的对话、工具回执及压缩检查点。</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-40" aria-label="刷新上下文状态"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>

    {loading && !state ? <div className="flex items-center justify-center gap-2 py-12 text-xs text-[var(--text-secondary)]"><LoaderCircle className="h-4 w-4 animate-spin" />读取上下文状态…</div> : state ? <>
      <section className="mt-5 rounded-[14px] bg-[var(--surface-muted)] p-3.5">
        <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] text-[var(--text-secondary)]">上下文占用</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{percent}%</p></div><p className="pb-1 text-right text-[10px] tabular-nums text-[var(--text-tertiary)]">{formatContextTokenCount(state.estimatedTokens)} / {formatContextTokenCount(state.contextWindowTokens)}</p></div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-default)]">
          <div className={`h-full rounded-full transition-[width] duration-500 ${state.usageRatio >= state.compactionThreshold ? 'bg-rose-500' : state.usageRatio >= state.warningThreshold ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${cappedPercent}%` }} />
          <span className="absolute inset-y-0 w-px bg-[var(--text-tertiary)]/70" style={{ left: `${Math.min(100, state.compactionThreshold * 100)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[9px] text-[var(--text-tertiary)]"><span>当前会话</span><span>自动压缩阈值 {Math.round(state.compactionThreshold * 100)}%</span></div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-[10px] border border-[var(--border-subtle)] px-3 py-2.5"><p className="text-[var(--text-tertiary)]">有效要求</p><p className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">{state.activeDirectiveCount}</p></div>
        <div className="rounded-[10px] border border-[var(--border-subtle)] px-3 py-2.5"><p className="text-[var(--text-tertiary)]">压缩版本</p><p className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">{checkpoint ? `v${checkpoint.version}` : '未压缩'}</p></div>
      </div>

      <button type="button" onClick={() => void compact()} disabled={compacting || active} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--surface-contrast)] px-3 text-xs font-medium text-[var(--text-contrast)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40" title={active ? 'Agent 运行结束后可手动压缩' : '压缩当前会话'}>{compacting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}{compacting ? '正在压缩…' : '手动压缩当前会话'}</button>
      {active ? <p className="mt-1.5 text-center text-[9px] text-[var(--text-tertiary)]">为保证本轮事件完整，运行结束后开放手动压缩。</p> : null}

      {message ? <p className="mt-3 rounded-[9px] bg-[var(--surface-muted)] px-3 py-2 text-[10px] leading-5 text-[var(--text-secondary)]">{message}</p> : null}

      {checkpoint ? <section className="mt-5 space-y-4 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><div><p className="text-xs font-medium text-[var(--text-primary)]">已验证检查点 v{checkpoint.version}</p><p className="mt-0.5 text-[9px] text-[var(--text-tertiary)]">{checkpoint.sourceMessageCount} 条历史消息 · {formatContextTokenCount(checkpoint.sourceTokens)} → {formatContextTokenCount(checkpoint.summaryTokens)}</p></div></div>
        <SummaryList title="目标" items={checkpoint.summary.goals} />
        <SummaryList title="约束" items={checkpoint.summary.constraints} />
        <SummaryList title="关键决策" items={checkpoint.summary.decisions} />
        <SummaryList title="已完成" items={checkpoint.summary.completed} />
        <SummaryList title="待处理" items={checkpoint.summary.pending} />
        <p className="flex items-center gap-1.5 text-[9px] text-emerald-600"><CheckCircle2 className="h-3 w-3" />硬约束保留率 {Math.round(checkpoint.validation.hardConstraintRetention * 100)}%</p>
      </section> : <p className="mt-5 border-t border-[var(--border-subtle)] pt-4 text-[10px] leading-5 text-[var(--text-secondary)]">当前尚未生成压缩检查点。系统达到阈值时会自动整理；你也可以在任务空闲时手动压缩。</p>}
    </> : null}
  </div>
}
