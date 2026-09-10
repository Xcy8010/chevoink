import { expect, it, vi } from 'vitest'
import { initialTaskWindows, selectInitialTask, selectTaskFallback } from '../../src/features/studio/lib/initial-task-selection'

it('never creates a blank task for an uncached existing deep link', () => {
  const create = vi.fn(() => ({ id: 'blank', sessionId: null }))
  const tasks = initialTaskWindows([], 'target-b', create)
  expect(tasks).toEqual([])
  expect(create).not.toHaveBeenCalled()
  expect(selectInitialTask(tasks, 'old-a', 'target-b')).toBeNull()
  const loaded = [{ id: 'other', sessionId: 'other' }, { id: 'target-b', sessionId: 'target-b' }]
  expect(selectInitialTask(loaded, 'other', 'target-b')?.id).toBe('target-b')
  expect(selectInitialTask(loaded, 'other', 'deleted')).toBeNull()
})
it('keeps explicit new creation separate from existing-task navigation', () => {
  const create = vi.fn(() => ({ id: 'blank', sessionId: null }))
  expect(initialTaskWindows([], null, create)).toHaveLength(1)
  expect(initialTaskWindows([], 'new', create)).toEqual([])
  expect(create).toHaveBeenCalledOnce()
})

it.each([{ snapshot: [] }, { snapshot: [{ id: 'cached-other', sessionId: 'cached-other' }] }])('does not let fallback steal focus before the server resolves an uncached task: %j', ({ snapshot }) => {
  const create = vi.fn(() => ({ id: 'blank', sessionId: null as string | null }))
  const tasks = initialTaskWindows(snapshot, 'target-b', create)
  let active = selectInitialTask(tasks, 'cached-other', 'target-b')
  const originalSelection = active
  // This effect used to activate tasks[0], making the late-request guard discard B.
  active = selectTaskFallback(tasks, active?.id ?? null, 'target-b', false, true) ?? active
  expect(active).toBe(originalSelection)
  active = selectInitialTask([...tasks, { id: 'target-b', sessionId: 'target-b' }], null, 'target-b')
  expect(active?.id).toBe('target-b')
  expect(create).not.toHaveBeenCalled()
})

it('limits fallback to settled same-novel navigation without an explicit target', () => {
  const tasks = [{ id: 'existing' }]
  expect(selectTaskFallback(tasks, null, null, true, true)).toBeNull()
  expect(selectTaskFallback(tasks, null, null, false, false)).toBeNull()
  expect(selectTaskFallback(tasks, 'chosen', null, false, true)).toBeNull()
  expect(selectTaskFallback(tasks, null, null, false, true)).toBe(tasks[0])
})
