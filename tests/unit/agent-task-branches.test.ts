import { describe, expect, it } from 'vitest'

import type { AgentSession } from '../../shared/contracts/index.js'
import { buildAgentTaskBranchRows } from '../../src/features/studio/agent/lib/task-branches.js'

function session(id: string, parentId: string | null, updatedAt: string): AgentSession {
  return {
    id,
    userId: 'user-1',
    novelId: 'novel-1',
    title: id,
    status: 'active',
    pinnedAt: null,
    toolPolicy: null,
    sandboxMode: 'workspace',
    lastRunAt: null,
    forkedFromSessionId: parentId,
    forkedFromMessageId: null,
    forkedAt: parentId ? updatedAt : null,
    createdAt: updatedAt,
    updatedAt,
  }
}

describe('Agent 任务分支视图', () => {
  it('按真实 fork 关系展示主任务、分支和二级分支', () => {
    const rows = buildAgentTaskBranchRows([
      session('root', null, '2026-09-01T00:00:00.000Z'),
      session('branch-a', 'root', '2026-09-03T00:00:00.000Z'),
      session('branch-b', 'branch-a', '2026-09-04T00:00:00.000Z'),
    ])

    expect(rows.map((row) => [row.session.id, row.depth, row.childCount])).toEqual([
      ['root', 0, 1],
      ['branch-a', 1, 1],
      ['branch-b', 2, 0],
    ])
  })

  it('孤儿父节点与循环数据会安全回落，不丢任务也不递归溢出', () => {
    const rows = buildAgentTaskBranchRows([
      session('orphan', 'missing', '2026-09-05T00:00:00.000Z'),
      session('cycle-a', 'cycle-b', '2026-09-04T00:00:00.000Z'),
      session('cycle-b', 'cycle-a', '2026-09-03T00:00:00.000Z'),
    ])

    expect(new Set(rows.map((row) => row.session.id))).toEqual(new Set(['orphan', 'cycle-a', 'cycle-b']))
    expect(rows).toHaveLength(3)
  })
})
