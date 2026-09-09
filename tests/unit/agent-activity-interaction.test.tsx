// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentActivityBar } from '../../src/features/studio/agent/components/AgentActivityBar'
import { useAgentStore } from '../../src/features/studio/agent/agentStore'

afterEach(() => { cleanup(); vi.useRealTimers() })
const props = { activities: Array.from({ length: 20 }, (_, index) => ({ callId: `t${index}`, toolName: 'chapter_write', label: `章节${index}`, chapterId: `c${index}`, before: '', after: '正文', status: 'done' as const })),
  activitiesVersion: 0, todos: [], todosVersion: 0, runActive: false, pendingReviewCount: 2, reviewBusy: false }
function pointer(node: Element, type: string, pointerType: string) {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  fireEvent(node, event)
}
function openTouch() {
  const button = screen.getByRole('button', { name: /20 个工作区变更/ })
  pointer(button, 'pointerdown', 'touch'); fireEvent.click(button)
  return screen.getByRole('dialog', { name: '工作区正文变更' })
}
it('keeps a touch-opened list during scrolling, pointer cancellation and review actions', () => {
  vi.useFakeTimers()
  const onApproveAllReviews = vi.fn(), onRejectAllReviews = vi.fn()
  render(<AgentActivityBar {...props} {...{ onApproveAllReviews, onRejectAllReviews }} />)
  const popup = openTouch()
  pointer(popup, 'pointercancel', 'touch'); pointer(popup, 'pointerout', 'touch'); fireEvent.scroll(popup, { target: { scrollTop: 120 } })
  act(() => vi.advanceTimersByTime(300))
  expect(popup.getAttribute('aria-hidden')).toBe('false')
  fireEvent.click(within(popup).getByRole('button', { name: '接受全部' }))
  fireEvent.click(within(popup).getByRole('button', { name: '拒绝全部' }))
  expect(onApproveAllReviews).toHaveBeenCalledOnce(); expect(onRejectAllReviews).toHaveBeenCalledOnce()
  expect(popup.getAttribute('aria-hidden')).toBe('false')
  expect(popup.className).toContain('touch-pan-y')
})
it('preserves the card through confirmation focus and closes for a real outside tap', () => {
  vi.useFakeTimers()
  render(<AgentActivityBar {...props} />)
  const popup = openTouch()
  const confirmation = document.createElement('button')
  confirmation.setAttribute('data-workspace-confirm-dialog', '')
  document.body.append(confirmation)
  fireEvent.focusIn(confirmation); pointer(confirmation, 'pointerdown', 'touch')
  act(() => vi.advanceTimersByTime(300))
  expect(popup.getAttribute('aria-hidden')).toBe('false')
  confirmation.remove()
  pointer(document.body, 'pointerdown', 'touch')
  expect(popup.getAttribute('aria-hidden')).toBe('true')
})
it('navigates to the selected chapter rather than the latest chapter', () => {
  render(<AgentActivityBar {...props} />)
  const popup = openTouch()
  fireEvent.click(within(popup).getByTitle('章节3').closest('button')!)
  expect(useAgentStore.getState().toolNavigationRequest).toMatchObject({ toolName: 'chapter_write', args: { chapterId: 'c3' } })
})
