import { expect, it, vi } from 'vitest'
import { initialTaskWindows, selectInitialTask } from '../../src/features/studio/lib/initial-task-selection'

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
