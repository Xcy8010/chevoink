import { lazy, Suspense, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BrainCircuit, LoaderCircle } from 'lucide-react'

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
    mutationFn: () => syncNovelMemoryGraph(novelId),
    onSuccess: (nextGraph) => queryClient.setQueryData(['studio', novelId, 'memory-graph'], nextGraph),
  })

  // 每次进入作品只做一次无模型投影：既能为旧正文初始化图谱，也会清理早期抽取器留下的伪人物。
  useEffect(() => {
    if (!graph || syncMutation.isPending || syncAttemptedRef.current.has(novelId)) return
    syncAttemptedRef.current.add(novelId)
    syncMutation.mutate()
  }, [graph, novelId, syncMutation])

  if (graphQuery.isLoading) {
    return <div className={cn('flex h-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]', className)}><LoaderCircle className="h-4 w-4 animate-spin" />正在整理作品记忆图谱…</div>
  }

  if (graphQuery.isError) {
    return <div className={cn('flex h-full flex-col items-center justify-center gap-3 px-6 text-center', className)}><BrainCircuit className="h-8 w-8 text-[var(--text-tertiary)]" /><p className="text-sm text-[var(--text-secondary)]">记忆图谱暂时无法载入。</p><button type="button" onClick={() => void graphQuery.refetch()} className="text-xs text-[var(--text-primary)] underline underline-offset-4">重新加载</button></div>
  }

  if ((!graph || graph.nodes.length === 0) && syncMutation.isPending) {
    return <div className={cn('flex h-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]', className)}><LoaderCircle className="h-4 w-4 animate-spin" />正在从已有正文生成作品记忆…</div>
  }

  if (!graph || graph.nodes.length === 0) {
    return <div className={cn('flex h-full flex-col items-center justify-center px-8 text-center', className)}><BrainCircuit className="h-9 w-9 text-[var(--text-tertiary)]" /><h3 className="mt-3 text-sm font-medium text-[var(--text-primary)]">关系图还没有内容</h3><p className="mt-2 max-w-sm text-xs leading-6 text-[var(--text-secondary)]">已有正文会自动生成基础人物关系；每轮 Agent 工作结束后再按变化增量更新。</p></div>
  }

  return <section className={cn('relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-default)]', className)} aria-label="作品记忆关系图">
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
      <BrainCircuit className="h-4 w-4 text-[var(--text-secondary)]" />
      <span className="text-xs font-medium text-[var(--text-primary)]">作品记忆</span>
      <span className="truncate text-[10px] text-[var(--text-tertiary)]">{graph.nodes.length} 个实体 · {graph.edges.length} 条关系</span>
      {syncMutation.isPending ? <LoaderCircle className="ml-auto h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" aria-label="正在更新记忆" /> : null}
    </div>
    <div className="min-h-0 flex-1">
      <Suspense fallback={<div className="flex h-full items-center justify-center"><LoaderCircle className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" /></div>}>
        <MemoryGraphCanvas graph={graph} />
      </Suspense>
    </div>
  </section>
}
