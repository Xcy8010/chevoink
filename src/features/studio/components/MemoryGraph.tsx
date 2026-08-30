import { lazy, Suspense, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Network, RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getNovelMemoryGraph, syncNovelMemoryGraph } from '../api'

const MemoryGraphCanvas = lazy(() => import('./MemoryGraphCanvas'))

export default function MemoryGraph({ novelId, active = false, className }: { novelId: string; active?: boolean; className?: string }) {
  const queryClient = useQueryClient()
  const syncAttemptedRef = useRef(new Set<string>())
  const graphQuery = useQuery({
    queryKey: ['studio', novelId, 'memory-graph'],
    queryFn: () => getNovelMemoryGraph(novelId),
    refetchInterval: active ? 5_000 : false,
    staleTime: 10_000,
  })
  const graph = graphQuery.data
  const syncMutation = useMutation({
    mutationFn: (force: boolean) => syncNovelMemoryGraph(novelId, force),
    onSuccess: (nextGraph) => queryClient.setQueryData(['studio', novelId, 'memory-graph'], nextGraph),
  })

  // 仅空图自动初始化；已有关系网不因进入页面重复调用模型。
  useEffect(() => {
    if (!graph || graph.nodes.length > 0 || syncMutation.isPending || syncAttemptedRef.current.has(novelId)) return
    syncAttemptedRef.current.add(novelId)
    syncMutation.mutate(false)
  }, [graph, novelId, syncMutation])

  if (graphQuery.isLoading) {
    return <div className={cn('flex h-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]', className)}><LoaderCircle className="h-4 w-4 animate-spin" />正在载入小说关系网…</div>
  }

  if (graphQuery.isError) {
    return <div className={cn('flex h-full flex-col items-center justify-center gap-3 px-6 text-center', className)}><Network className="h-8 w-8 text-[var(--text-tertiary)]" /><p className="text-sm text-[var(--text-secondary)]">关系网暂时无法载入。</p><button type="button" onClick={() => void graphQuery.refetch()} className="text-xs text-[var(--text-primary)] underline underline-offset-4">重新加载</button></div>
  }

  if ((!graph || graph.nodes.length === 0) && syncMutation.isPending) {
    return <div className={cn('flex h-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]', className)}><LoaderCircle className="h-4 w-4 animate-spin" />AI 正在从正文建立小说关系网…</div>
  }

  if (!graph || graph.nodes.length === 0) {
    return <div className={cn('flex h-full flex-col items-center justify-center px-8 text-center', className)}><Network className="h-9 w-9 text-[var(--text-tertiary)]" /><h3 className="mt-3 text-sm font-medium text-[var(--text-primary)]">关系网还没有内容</h3><p className="mt-2 max-w-sm text-xs leading-6 text-[var(--text-secondary)]">作品有正文后会用低推理 AI 自动建立一次，覆盖人物、地点、组织、物件、事件和概念。</p></div>
  }

  return <section className={cn('relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-default)]', className)} aria-label="小说关系网">
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
      <Network className="h-4 w-4 text-[var(--text-secondary)]" />
      <span className="text-xs font-medium text-[var(--text-primary)]">关系网</span>
      <span className="truncate text-[10px] text-[var(--text-tertiary)]">{graph.nodes.length} 个实体 · {graph.edges.length} 条关系</span>
      <button type="button" disabled={syncMutation.isPending} onClick={() => syncMutation.mutate(true)} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:opacity-45" aria-label="刷新关系网" title="用低推理 AI 刷新关系网（10 分钟内限一次）">{syncMutation.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</button>
    </div>
    {syncMutation.isPending ? <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-[10px] text-[var(--text-secondary)]"><LoaderCircle className="h-3 w-3 animate-spin" />AI 正在从正文刷新关系网，请稍候…</div> : null}
    {syncMutation.isError ? <p className="border-b border-[var(--border-subtle)] px-3 py-2 text-[10px] text-rose-500">{syncMutation.error instanceof Error ? syncMutation.error.message : '关系网刷新失败，请稍后再试。'}</p> : null}
    <div className="min-h-0 flex-1">
      <Suspense fallback={<div className="flex h-full items-center justify-center"><LoaderCircle className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" /></div>}>
        <MemoryGraphCanvas graph={graph} />
      </Suspense>
    </div>
  </section>
}
