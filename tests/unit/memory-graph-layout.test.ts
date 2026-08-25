import { describe, expect, it } from 'vitest'

import type { MemoryGraphEdge } from '../../shared/contracts/index.js'
import { buildReadableMemoryGraphEdges } from '../../src/features/studio/lib/memory-graph-layout.js'

function edge(id: string, source: string, target: string, type = '同章出现'): MemoryGraphEdge {
  return { id, source, target, type, state: null, confidence: 0.55, sourceId: id }
}

describe('记忆图谱可读性投影', () => {
  it('聚合同一人物对在多个章节的重复共现边', () => {
    const result = buildReadableMemoryGraphEdges([
      edge('1', 'a', 'b'), edge('2', 'b', 'a'), edge('3', 'a', 'b'),
    ], new Set(['a', 'b']), 2)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ source: 'a', target: 'b', occurrences: 3 })
  })

  it('保留语义关系，同时限制单节点共现边不超过四条', () => {
    const edges = [edge('semantic-1', 'a', 'z', '师徒'), edge('semantic-2', 'a', 'z', '师徒'), ...['b', 'c', 'd', 'e', 'f', 'g'].map((target, index) => edge(String(index), 'a', target))]
    const result = buildReadableMemoryGraphEdges(edges, new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'z']), 8)
    expect(result.filter((item) => item.type === '师徒')).toEqual([expect.objectContaining({ occurrences: 2 })])
    expect(result.filter((item) => item.type === '同章出现' && (item.source === 'a' || item.target === 'a'))).toHaveLength(4)
  })
})
