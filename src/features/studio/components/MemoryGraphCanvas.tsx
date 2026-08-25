import { useMemo, useState, type CSSProperties } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import { X } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import type { MemoryGraph, MemoryGraphNode } from '../../../../shared/contracts/index.js'
import { buildReadableMemoryGraphEdges } from '../lib/memory-graph-layout'

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

function graphPosition(index: number, total: number) {
  if (total === 1) return { x: 0, y: 0 }
  const columns = Math.max(2, Math.ceil(Math.sqrt(total * 1.6)))
  const row = Math.floor(index / columns)
  const column = index % columns
  return { x: column * 190 + (row % 2) * 44, y: row * 132 }
}

type FlowNode = Node<{ memory: MemoryGraphNode; label: string }>

export default function MemoryGraphCanvas({ graph }: { graph: MemoryGraph }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const visibleNodes = useMemo(() => graph.nodes.slice(0, 80), [graph.nodes])
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const nodes = useMemo<FlowNode[]>(() => visibleNodes.map((memory, index) => ({
    id: memory.id,
    position: graphPosition(index, visibleNodes.length),
    data: { memory, label: memory.label },
    className: 'memory-flow-node',
    style: { '--memory-node-color': nodeColor(memory.type) } as CSSProperties,
    draggable: false,
  })), [visibleNodes])
  const readableEdges = useMemo(
    () => buildReadableMemoryGraphEdges(graph.edges, visibleIds, visibleNodes.length),
    [graph.edges, visibleIds, visibleNodes.length],
  )
  const edges = useMemo<Edge[]>(() => readableEdges.map((edge) => {
    const coOccurrence = edge.type === '同章出现'
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: coOccurrence ? undefined : edge.type,
      type: coOccurrence ? 'default' : 'smoothstep',
      markerEnd: coOccurrence ? undefined : { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      style: {
        strokeWidth: coOccurrence ? Math.min(1.8, 0.75 + edge.occurrences * 0.16) : Math.max(1, Math.min(2.4, 1 + edge.confidence)),
        opacity: coOccurrence ? 0.34 : 0.78,
      },
      labelStyle: { fontSize: 10, fontWeight: 500 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 6,
    }
  }), [readableEdges])
  const selected = visibleNodes.find((node) => node.id === selectedId) ?? null

  return <div className="memory-flow relative h-full min-h-[300px] w-full overflow-hidden">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.24, maxZoom: 1.15 }}
      minZoom={0.18}
      maxZoom={1.8}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      preventScrolling
      onlyRenderVisibleElements
      onNodeClick={(_, node) => setSelectedId(node.id)}
      onPaneClick={() => setSelectedId(null)}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
      <Controls showInteractive={false} position="top-right" />
      <MiniMap pannable zoomable position="bottom-right" className="hidden sm:block" nodeColor={(node) => nodeColor(String((node.data as { memory?: MemoryGraphNode } | undefined)?.memory?.type ?? ''))} />
    </ReactFlow>

    {selected ? <aside className="absolute bottom-3 left-3 z-10 max-h-[42%] w-[min(23rem,calc(100%-1.5rem))] overflow-y-auto rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-3 shadow-[var(--shadow-elevated)]">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: nodeColor(selected.type) }} />
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-[var(--text-primary)]">{selected.label}</p><p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{selected.type}</p></div>
        <button type="button" onClick={() => setSelectedId(null)} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label="关闭实体详情"><X className="h-3.5 w-3.5" /></button>
      </div>
      {selected.description ? <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-secondary)]">{selected.description}</p> : null}
      {selected.aliases.length ? <p className="mt-2 break-words text-[10px] leading-5 text-[var(--text-tertiary)]">别名：{selected.aliases.join('、')}</p> : null}
    </aside> : null}
  </div>
}
