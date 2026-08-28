import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, History, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getNovelSkills, updateNovelSkill } from '../api'

const phaseNames: Record<string, string> = {
  research: '调研', plan: '规划', scene: '场景', draft: '正文', critique: '审阅', revision: '修订', commit: '落库',
}

function lastUsedLabel(value: string | null): string {
  if (!value) return '尚未调用'
  return `最近调用 ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value))}`
}

export default function SkillsPanel({ novelId, className }: { novelId: string; className?: string }) {
  const queryClient = useQueryClient()
  const queryKey = ['studio', novelId, 'skills'] as const
  const skillsQuery = useQuery({
    queryKey,
    queryFn: () => getNovelSkills(novelId),
    staleTime: 30_000,
  })
  const updateMutation = useMutation({
    mutationFn: ({ skillId, enabled }: { skillId: string; enabled: boolean }) => updateNovelSkill(novelId, skillId, { enabled }),
    onSuccess: (payload) => queryClient.setQueryData(queryKey, payload),
  })

  if (skillsQuery.isLoading) {
    return <div className={cn('flex h-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]', className)}><LoaderCircle className="h-4 w-4 animate-spin" />正在载入作品技能…</div>
  }

  if (skillsQuery.isError || !skillsQuery.data) {
    return <div className={cn('flex h-full flex-col items-center justify-center gap-3 px-6 text-center', className)}><Sparkles className="h-8 w-8 text-[var(--text-tertiary)]" /><p className="text-sm text-[var(--text-secondary)]">技能目录暂时无法载入。</p><button type="button" onClick={() => void skillsQuery.refetch()} className="text-xs text-[var(--text-primary)] underline underline-offset-4">重新加载</button></div>
  }

  const payload = skillsQuery.data
  return <section className={cn('flex h-full min-h-0 flex-col bg-[var(--surface-default)]', className)} aria-label="作品技能">
    <header className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-500" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">技能</h2>
        <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{payload.enabledCount}/{payload.totalCount} 已启用</span>
        <button type="button" onClick={() => void skillsQuery.refetch()} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label="刷新技能" title="刷新技能"><RefreshCw className={cn('h-3.5 w-3.5', skillsQuery.isFetching && 'animate-spin')} /></button>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">Agent 会按任务自动召回已启用技能；关闭后从下一轮开始生效。</p>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      <div className="space-y-2">
        {payload.items.map((skill) => {
          const pending = updateMutation.isPending && updateMutation.variables?.skillId === skill.id
          return <article key={skill.id} className={cn('rounded-[12px] border p-3 transition-colors', skill.enabled ? 'border-[var(--border-subtle)] bg-[var(--surface-muted)]/35' : 'border-[var(--border-subtle)] bg-transparent opacity-70')}>
            <div className="flex items-start gap-3">
              <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]', skill.enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--surface-muted)] text-[var(--text-tertiary)]')}><Sparkles className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-xs font-medium text-[var(--text-primary)]">{skill.name}</h3><span className="shrink-0 font-mono text-[9px] text-[var(--text-tertiary)]">v{skill.activeVersion}</span></div>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{skill.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={skill.enabled}
                aria-label={`${skill.enabled ? '关闭' : '启用'}${skill.name}`}
                disabled={pending}
                onClick={() => updateMutation.mutate({ skillId: skill.id, enabled: !skill.enabled })}
                className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60', skill.enabled ? 'bg-emerald-500' : 'bg-[var(--border-strong)]')}
              >
                <span className={cn('absolute top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm transition-transform', skill.enabled ? 'translate-x-5' : 'translate-x-1')}>{pending ? <LoaderCircle className="h-2.5 w-2.5 animate-spin" /> : skill.enabled ? <Check className="h-2.5 w-2.5" /> : null}</span>
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {skill.phases.map((phase) => <span key={phase} className="rounded-[5px] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-secondary)]">{phaseNames[phase] ?? phase}</span>)}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{skill.source === 'builtin' ? 'Chevoink 内置' : '自定义'} · {skill.license}</span>
              <span className="inline-flex items-center gap-1"><History className="h-3 w-3" />{lastUsedLabel(skill.lastUsedAt)}{skill.usageCount > 0 ? ` · ${skill.usageCount} 次` : ''}</span>
            </div>
          </article>
        })}
      </div>
      {payload.recentRuns.length > 0 ? <div className="mt-4 border-t border-[var(--border-subtle)] pt-3"><p className="px-1 text-[10px] font-medium text-[var(--text-secondary)]">最近路由</p>{payload.recentRuns.slice(0, 3).map((run) => <div key={run.runId} className="mt-2 rounded-[9px] border border-[var(--border-subtle)] px-2.5 py-2 text-[10px] text-[var(--text-secondary)]"><div className="flex items-center gap-2"><span>{phaseNames[run.phase] ?? run.phase}</span><span className="ml-auto tabular-nums text-[var(--text-tertiary)]">置信度 {Math.round(run.confidence * 100)}%</span></div><p className="mt-1 truncate text-[var(--text-tertiary)]">{run.selected.map((item) => item.name).join('、') || '本轮未加载技能'}</p></div>)}</div> : null}
    </div>
  </section>
}
