import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrainCircuit, LoaderCircle, Minus, Plus, RotateCcw } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { MemoryGraphNode } from '../../../../shared/contracts/index.js'
import { getNovelMemoryGraph } from '../api'

const NODE_COLORS: Record<string, string> = {
  character: '#60a5fa',
  location: '#34d399',
  organization: '#a78bfa',
  item: '#f59e0b',
  event: '#fb7185',
}

function nodeColor(type: string): string {
  return NODE_COLORS[type] ?? '#94a3b8'
}

function graphPositions(nodes: MemoryGraphNode[]) {
  const centerX = 450
  const centerY = 310
  const rings = [118, 210, 278]
  return new Map(nodes.map((node, index) => {
    const ringIndex = Math.min(rings.length - 1, Math.floor(index / 10))
    const ringStart = ringIndex * 10
    const ringSize = Math.min(10, nodes.length - ringStart)
    const angle = ((index - ringStart) / Math.max(1, ringSize)) * Math.PI * 2 - Math.PI / 2
    const radius = nodes.length === 1 ? 0 : rings[ringIndex]
    return [node.id, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }]
  }))
}

export default function MemoryGraph({ novelId, active = false, className }: { novelId: string; active?: boolean; className?: string }) {
  const [scale, setScale] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const graphQuery = useQuery({
    queryKey: ['studio', novelId, 'memory-graph'],
    queryFn: () => getNovelMemoryGraph(novelId),
    refetchInterval: active ? 5_000 : false,
    staleTime: 10_000,
  })
  const graph = graphQuery.data
  const visibleNodes = useMemo(() => (graph?.nodes ?? []).slice(0, 30), [graph?.nodes])
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const positions = useMemo(() => graphPositions(visibleNodes), [visibleNodes])
  const selected = visibleNodes.find((node) => node.id === selectedId) ?? null

  if (graphQuery.isLoading) {
    return <div className={cn('flex h-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]', className)}><LoaderCircle className="h-4 w-4 animate-spin" />正在整理作品记忆图谱…</div>
  }

  if (graphQuery.isError) {
    return <div className={cn('flex h-full flex-col items-center justify-center gap-3 px-6 text-center', className)}><BrainCircuit className="h-8 w-8 text-[var(--text-tertiary)]" /><p className="text-sm text-[var(--text-secondary)]">记忆图谱暂时无法载入。</p><button type="button" onClick={() => void graphQuery.refetch()} className="text-xs text-[var(--text-primary)] underline underline-offset-4">重新加载</button></div>
  }

  if (!graph || graph.nodes.length === 0) {
    return <div className={cn('flex h-full flex-col items-center justify-center px-8 text-center', className)}><BrainCircuit className="h-9 w-9 text-[var(--text-tertiary)]" /><h3 className="mt-3 text-sm font-medium text-[var(--text-primary)]">关系图还没有内容</h3><p className="mt-2 max-w-sm text-xs leading-6 text-[var(--text-secondary)]">让 Agent 分析人物关系、保存故事事件，或继续编辑章节后，这里会随记忆更新。</p></div>
  }

  return (
    <section className={cn('relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-default)]', className)} aria-label="作品记忆关系图">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
        <BrainCircuit className="h-4 w-4 text-[var(--text-secondary)]" />
        <span className="text-xs font-medium text-[var(--text-primary)]">作品记忆</span>
        <span className="text-[10px] text-[var(--text-tertiary)]">{graph.nodes.length} 个实体 · {graph.edges.length} 条关系</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setScale((value) => Math.max(.7, value - .1))} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="缩小关系图"><Minus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setScale(1)} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="重置关系图"><RotateCcw className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setScale((value) => Math.min(1.5, value + .1))} className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="放大关系图"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--text-tertiary)_10%,transparent)_1px,transparent_1px)] [background-size:22px_22px]">
        <svg viewBox="0 0 900 620" className="h-full min-h-[460px] w-full min-w-[680px]" role="img" aria-label="人物、地点与其他故事实体之间的关系">
          <g transform={`translate(${450 - 450 * scale} ${310 - 310 * scale}) scale(${scale})`}>
            {graph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)).map((edge) => {
              const source = positions.get(edge.source)
              const target = positions.get(edge.target)
              if (!source || !target) return null
              const midX = (source.x + target.x) / 2
              const midY = (source.y + target.y) / 2
              return <g key={edge.id}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="var(--border-strong)" strokeWidth={1 + edge.confidence} opacity=".72" /><text x={midX} y={midY - 5} textAnchor="middle" fill="var(--text-tertiary)" fontSize="10">{edge.type}</text></g>
            })}
            {visibleNodes.map((node) => {
              const point = positions.get(node.id)
              if (!point) return null
              const selectedNode = selectedId === node.id
              return <g key={node.id} role="button" tabIndex={0} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(node.id) }} className="cursor-pointer outline-none"><circle cx={point.x} cy={point.y} r={selectedNode ? 29 : 25} fill="var(--surface-default)" stroke={nodeColor(node.type)} strokeWidth={selectedNode ? 3 : 2} /><circle cx={point.x} cy={point.y - 8} r="4" fill={nodeColor(node.type)} /><text x={point.x} y={point.y + 8} textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontWeight="600">{node.label.slice(0, 8)}</text></g>
            })}
          </g>
        </svg>
        {selected ? <div className="absolute bottom-3 left-3 right-3 max-w-sm border border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 p-3 shadow-lg backdrop-blur"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: nodeColor(selected.type) }} /><p className="text-sm font-medium text-[var(--text-primary)]">{selected.label}</p><span className="text-[10px] text-[var(--text-tertiary)]">{selected.type}</span></div>{selected.description ? <p className="mt-2 line-clamp-4 text-xs leading-5 text-[var(--text-secondary)]">{selected.description}</p> : null}{selected.aliases.length ? <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">别名：{selected.aliases.join('、')}</p> : null}</div> : null}
      </div>
      <details className="shrink-0 border-t border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]"><summary className="cursor-pointer">以列表查看关系图</summary><ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">{visibleNodes.map((node) => <li key={node.id}>{node.label} · {node.type}</li>)}</ul></details>
    </section>
  )
}
