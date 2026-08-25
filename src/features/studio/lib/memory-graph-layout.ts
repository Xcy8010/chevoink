import type { MemoryGraphEdge } from '../../../../shared/contracts/index.js'

export type ReadableMemoryGraphEdge = MemoryGraphEdge & { occurrences: number }

/**
 * 图谱可读性投影：语义关系完整保留；“同章出现”按无向人物对聚合，并限制单节点连接数。
 * 后端事实不丢失，只减少可视层重复线和标签噪声。
 */
export function buildReadableMemoryGraphEdges(
  edges: MemoryGraphEdge[],
  visibleIds: Set<string>,
  visibleNodeCount: number,
): ReadableMemoryGraphEdge[] {
  const semantic = new Map<string, ReadableMemoryGraphEdge>()
  const coOccurrences = new Map<string, ReadableMemoryGraphEdge>()

  for (const edge of edges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target) || edge.source === edge.target) continue
    if (edge.type !== '同章出现') {
      const key = `${edge.source}:${edge.target}:${edge.type}:${edge.state ?? ''}`
      const current = semantic.get(key)
      if (current) {
        current.occurrences += 1
        current.confidence = Math.max(current.confidence, edge.confidence)
      } else {
        semantic.set(key, { ...edge, id: `semantic:${key}`, occurrences: 1 })
      }
      continue
    }
    const [source, target] = [edge.source, edge.target].sort()
    const key = `${source}:${target}`
    const current = coOccurrences.get(key)
    if (current) {
      current.occurrences += 1
      current.confidence = Math.max(current.confidence, edge.confidence)
    } else {
      coOccurrences.set(key, { ...edge, id: `co-occurrence:${key}`, source, target, occurrences: 1 })
    }
  }

  const degree = new Map<string, number>()
  const selectedCoOccurrences: ReadableMemoryGraphEdge[] = []
  const coOccurrenceLimit = Math.max(12, visibleNodeCount * 2)
  for (const edge of [...coOccurrences.values()].sort((left, right) => right.occurrences - left.occurrences || right.confidence - left.confidence)) {
    if ((degree.get(edge.source) ?? 0) >= 4 || (degree.get(edge.target) ?? 0) >= 4) continue
    selectedCoOccurrences.push(edge)
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    if (selectedCoOccurrences.length >= coOccurrenceLimit) break
  }

  return [...semantic.values()].slice(0, 100).concat(selectedCoOccurrences).slice(0, 180)
}
