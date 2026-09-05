// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { workspaceBodyChanges } from '../../src/features/studio/agent/workspace-body-changes'
import { AgentActivityBar } from '../../src/features/studio/agent/components/AgentActivityBar'
import { useAgentStore, type WorkspaceActivity } from '../../src/features/studio/agent/agentStore'
const chapter = (id: string, before: string, after: string): WorkspaceActivity => ({ callId: id, toolName: 'chapter_write', label: '章节', chapterId: 'c', before, after, deltaChars: after.length - before.length, status: 'done', display: { kind: 'chapterDiff', chapterId: 'c', chapterTitle: '第十九章', before, after, appliedDirectly: true } })
const plan: WorkspaceActivity = { callId: 'p', toolName: 'plan_save', label: '计划', chapterId: null, deltaChars: null, status: 'done', display: { kind: 'planFile', artifactId: 'plan-id', title: '计划一', content: '计划正文' } }
const props = { activities: [chapter('c', '旧', '新正文'), plan], activitiesVersion: 1, todos: [{ content: '已完成', status: 'completed' as const }, { content: '写十九章', status: 'in_progress' as const }, { content: '校验', status: 'pending' as const }], todosVersion: 1, runActive: true, pendingReviewCount: 0, reviewBusy: false }
afterEach(cleanup)
it('centers the two matching capsules and only allows one expanded list at a time', () => {
  const { container } = render(<AgentActivityBar {...props} />)
  const row = container.querySelector('[data-agent-activity-capsules]')!
  expect(row.className).toContain('justify-center')
  expect(row.children).toHaveLength(2)
  expect(row.getAttribute('data-mobile-fused')).toBe('true')
  expect(row.className).toContain('mobile:flex-nowrap')
  fireEvent.click(screen.getByRole('button', { name: '待办进度' }))
  expect(screen.getByRole('dialog', { name: '任务待办列表' })).toBeTruthy()
  fireEvent.pointerEnter(screen.getByText('2 个工作区变更').closest('button')!.parentElement!.parentElement!)
  expect(screen.queryByRole('dialog', { name: '任务待办列表' })).toBeNull()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
})
it('groups repeated edits by document and reports additions AND removals, not net delta', () => {
  const changes = workspaceBodyChanges([chapter('1', '旧', '中间'), chapter('2', '中间', '新正文'), plan])
  expect(changes).toHaveLength(2)
  expect(changes[0]).toMatchObject({ added: 3, removed: 1, key: 'chapter:c' })
  expect(changes[1]).toMatchObject({ added: 4, removed: 0, key: 'plan:plan-id' })
})
it('omits failed calls, empty creates, non-body tools, and net reverted documents', () => {
  expect(workspaceBodyChanges([{ ...plan, status: 'failed' }, { ...plan, display: undefined, toolName: 'cover_apply' }, chapter('1', '', ''), chapter('2', '原文', '改后'), chapter('3', '改后', '原文')])).toEqual([])
})
it('does not auto-open todo updates, retains pending rows and opens only on click', () => {
  const view = render(<AgentActivityBar {...props} />)
  const button = screen.getByRole('button', { name: '待办进度' })
  expect(button.textContent).toContain('1/3写十九章')
  view.rerender(<AgentActivityBar {...props} todosVersion={2} />)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('校验')).toBeTruthy()
  expect(screen.getByText('已完成').className).toContain('line-through')
  view.rerender(<AgentActivityBar {...props} todosVersion={3} />)
  expect(button.getAttribute('aria-expanded')).toBe('true')
})
it('hover uses an unclipped portal; item and summary navigate correct document', () => {
  const view = render(<AgentActivityBar {...props} />)
  fireEvent.pointerEnter(screen.getByText('2 个工作区变更').closest('button')!.parentElement!.parentElement!)
  const popup = screen.getByRole('dialog', { name: '工作区正文变更' })
  expect(view.container.contains(popup)).toBe(false)
  fireEvent.click(screen.getByText('第十九章'))
  expect(useAgentStore.getState().toolNavigationRequest?.display).toMatchObject({ kind: 'chapterDiff', chapterId: 'c' })
  fireEvent.click(screen.getByText('2 个工作区变更'))
  expect(useAgentStore.getState().toolNavigationRequest?.display).toMatchObject({ kind: 'planFile', artifactId: 'plan-id' })
})
it('has no extra expand button, never auto-opens updates, and supports deliberate keyboard preview', () => {
  const view = render(<AgentActivityBar {...props} />)
  view.rerender(<AgentActivityBar {...props} activitiesVersion={99} />)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('button', { name: '查看工作区变更列表' })).toBeNull()
  fireEvent.keyDown(screen.getByText('2 个工作区变更').closest('button')!, { key: 'ArrowDown' })
  expect(screen.getByRole('dialog')).toBeTruthy()
  act(() => fireEvent.keyDown(window, { key: 'Escape' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
