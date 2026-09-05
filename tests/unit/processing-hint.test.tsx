// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProcessingHint } from '../../src/features/studio/agent/components/ProcessingHint'
afterEach(() => { cleanup(); vi.useRealTimers() })
it('shows animated waiting feedback and removes it even without animationend', () => {
  vi.useFakeTimers()
  const view = render(<ProcessingHint visible />)
  expect(screen.getByRole('status').textContent).toBe('正在处理...')
  expect(view.container.querySelector('.agent-processing-shimmer')).not.toBeNull()
  view.rerender(<ProcessingHint visible={false} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(view.container.querySelector('.agent-processing-shimmer')).toBeNull()
  act(() => vi.advanceTimersByTime(250))
  expect(view.container.textContent).toBe('')
})
it('can reappear mid-fade without the previous timer removing the new hint', () => {
  vi.useFakeTimers()
  const view = render(<ProcessingHint visible />)
  view.rerender(<ProcessingHint visible={false} />)
  act(() => vi.advanceTimersByTime(100))
  view.rerender(<ProcessingHint visible />)
  act(() => vi.advanceTimersByTime(400))
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(view.container.querySelector('.agent-processing-shimmer')).not.toBeNull()
})
it('does not mount a placeholder when initially idle and cleans up timers on unmount', () => {
  vi.useFakeTimers()
  const view = render(<ProcessingHint visible={false} />)
  expect(view.container.textContent).toBe('')
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
