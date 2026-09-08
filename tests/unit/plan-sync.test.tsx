// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePlanSync } from '../../src/features/studio/components/use-plan-sync'

const update = vi.hoisted(() => vi.fn())
vi.mock('../../src/features/studio/api', () => ({ updateNovelPlanFile: update }))
beforeEach(() => { vi.useFakeTimers(); update.mockResolvedValue(undefined) })
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

it('sends only the latest pending text after 800ms', async () => {
  const { result } = renderHook(usePlanSync)
  act(() => { result.current.schedulePlanServerSync('a', 'Title', 'old'); result.current.schedulePlanServerSync('a', 'Title', 'new') })
  await act(async () => { await vi.advanceTimersByTimeAsync(799) })
  expect(update).not.toHaveBeenCalled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(update).toHaveBeenCalledExactlyOnceWith('a', { title: 'Title', content: 'new' })
})

it('flushes the previous document before switching pending targets', async () => {
  const { result } = renderHook(usePlanSync)
  act(() => { result.current.schedulePlanServerSync('a', 'A', 'first'); result.current.schedulePlanServerSync('b', 'B', 'second') })
  expect(update).toHaveBeenCalledExactlyOnceWith('a', { title: 'A', content: 'first' })
  act(() => result.current.flushPlanServerSync())
  expect(update).toHaveBeenLastCalledWith('b', { title: 'B', content: 'second' })
  await act(async () => { await vi.advanceTimersByTimeAsync(800) })
  expect(update).toHaveBeenCalledTimes(2)
})

it('keeps empty flushes idempotent and allows a later edit after failure', async () => {
  update.mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(usePlanSync)
  act(() => { result.current.flushPlanServerSync(); result.current.schedulePlanServerSync('a', 'A', 'first'); result.current.flushPlanServerSync() })
  await act(async () => { await Promise.resolve() })
  act(() => { result.current.schedulePlanServerSync('a', 'A', 'retry'); result.current.flushPlanServerSync() })
  expect(update).toHaveBeenCalledTimes(2)
  expect(update).toHaveBeenLastCalledWith('a', { title: 'A', content: 'retry' })
})
