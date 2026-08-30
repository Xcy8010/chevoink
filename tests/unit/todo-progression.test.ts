import { describe, expect, it } from 'vitest'

import { validateTodoProgression } from '../../api/lib/agent/tools/todo-tools'
import { allTools } from '../../api/lib/agent/tools/registry'

describe('agent todo progression discipline', () => {
  const pendingList = [
    { content: '完成第一章', status: 'in_progress' as const },
    { content: '完成第二章', status: 'pending' as const },
    { content: '校验卷章结构', status: 'pending' as const },
  ]

  it('allows completing exactly the current item', () => {
    expect(validateTodoProgression(pendingList, [
      { content: '完成第一章', status: 'completed' },
      { content: '完成第二章', status: 'in_progress' },
      { content: '校验卷章结构', status: 'pending' },
    ])).toBeNull()
  })

  it('allows completing multiple items in one write', () => {
    expect(validateTodoProgression(pendingList, [
      { content: '完成第一章', status: 'completed' },
      { content: '完成第二章', status: 'completed' },
      { content: '校验卷章结构', status: 'completed' },
    ])).toBeNull()
  })

  it('allows completing a pending item directly', () => {
    expect(validateTodoProgression(pendingList, [
      { content: '完成第一章', status: 'in_progress' },
      { content: '完成第二章', status: 'completed' },
      { content: '校验卷章结构', status: 'pending' },
    ])).toBeNull()
  })

  it('keeps completed work immutable', () => {
    expect(validateTodoProgression([
      { content: '完成第一章', status: 'completed' },
      { content: '完成第二章', status: 'in_progress' },
    ], [
      { content: '完成第一章', status: 'pending' },
      { content: '完成第二章', status: 'in_progress' },
    ])).toContain('不能回退状态')
  })

  it('normalizes wrapped aliases and excessive in-progress states before validation', () => {
    const tool = allTools.find((item) => item.name === 'todo_write')
    const coerced = tool?.coerceArgs?.({ arguments: { tasks: [
      { title: '完成第九章', state: 'running' },
      { text: '完成结构校验', status: 'doing' },
    ] } })
    expect(tool?.parameters.safeParse(coerced).success).toBe(true)
    expect(coerced).toEqual({ items: [
      { content: '完成第九章', status: 'in_progress' },
      { content: '完成结构校验', status: 'pending' },
    ] })
  })
})
