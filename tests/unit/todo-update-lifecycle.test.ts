import { beforeEach, expect, it, vi } from 'vitest'
import type { AgentTodoItem } from '../../shared/contracts'
import type { ToolContext } from '../../api/lib/agent/tools/types'
const db = vi.hoisted(() => ({ messages: vi.fn(), artifact: vi.fn(), create: vi.fn(), update: vi.fn() }))
vi.mock('../../api/lib/prisma.js', () => ({ prisma: { agentMessage: { findMany: db.messages }, agentArtifact: { findFirst: db.artifact, create: db.create, update: db.update } } }))
vi.mock('../../api/lib/agent/task-lineage.js', () => ({ getTaskRunIds: async () => ['current-task-run'] }))
import { prepareTodoUpdate, todoWriteTool } from '../../api/lib/agent/tools/todo-tools'
const previous: AgentTodoItem[] = [{ content: '写第一章', status: 'completed' }, { content: '写第二章', status: 'in_progress' }]
const ctx = { sessionId: 's', runId: 'current-task-run' } as ToolContext
beforeEach(() => { vi.resetAllMocks(); db.messages.mockResolvedValue([]); db.artifact.mockResolvedValue(null) })
it('does not create retrospective completion lists or single-step checklists', () => {
  for (const items of [[], [{ content: '已写完第22章', status: 'completed' }], [{ content: '改标题', status: 'pending' }], [{ content: '已写', status: 'completed' }, { content: '已审', status: 'completed' }]] as AgentTodoItem[][]) {
    expect(prepareTodoUpdate([], items)).toEqual({ items: [], changed: false })
  }
})
it('permits a multi-step plan before execution, then real completion of existing items', () => {
  const items: AgentTodoItem[] = [{ content: '一', status: 'in_progress' }, { content: '二', status: 'pending' }]
  expect(prepareTodoUpdate([], items)).toEqual({ items, changed: true })
  expect(prepareTodoUpdate(items, items.map(item => ({ ...item, status: 'completed' })))).toMatchObject({ changed: true, items: [{ status: 'completed' }, { status: 'completed' }] })
})
it('preserves omitted completed and pending work instead of replacing it with a summary', () => {
  expect(prepareTodoUpdate(previous, [{ content: '本轮全部完成', status: 'completed' }])).toEqual({ items: previous, changed: false })
  expect(prepareTodoUpdate(previous, [])).toEqual({ items: previous, changed: false })
  const update = prepareTodoUpdate(previous, [{ content: '写第二章', status: 'completed' }])
  expect(update.items).toEqual([{ content: '写第二章', status: 'completed' }, previous[0]])
  expect(prepareTodoUpdate(previous, [previous[0]]).items).toEqual(previous)
})
it('keeps completed status and skips identical snapshots', () => {
  expect(prepareTodoUpdate(previous, previous).changed).toBe(false)
  expect(prepareTodoUpdate(previous, [{ ...previous[0], status: 'pending' }, previous[1]])).toEqual({ items: previous, changed: false })
})
it('empty and completed-only tool calls neither persist nor emit a replacement todo display', async () => {
  for (const items of [[], [{ content: '写第22章已完成', status: 'completed' }]] as AgentTodoItem[][]) {
    const args = todoWriteTool.parameters.parse({ items })
    const result = await todoWriteTool.execute(ctx, args)
    expect(result.display).toBeUndefined()
    expect(result.summary).toBe('待办清单未变更')
  }
  expect(db.create).not.toHaveBeenCalled()
  expect(db.update).not.toHaveBeenCalled()
  expect(db.artifact.mock.calls[0][0].where.runId).toEqual({ in: ['current-task-run'] })
})
it('does not overwrite an already-completed artifact with a new completed summary', async () => {
  const old = previous.map(item => ({ ...item, status: 'completed' as const }))
  db.artifact.mockResolvedValue({ id: 'old', content: JSON.stringify(old), metadata: { todoList: true } })
  const result = await todoWriteTool.execute(ctx, { items: [{ content: '收尾全部完成', status: 'completed' }] })
  expect(result.display).toBeUndefined()
  expect(db.update).not.toHaveBeenCalled()
})
