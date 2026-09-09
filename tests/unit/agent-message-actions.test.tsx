// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MessageTime, UserMessageActions } from '../../src/features/studio/agent/components/MessageActions'
import { useAgentStore } from '../../src/features/studio/agent/agentStore'

afterEach(cleanup)

it('renders all actions together with 24-hour local time and preserves callbacks', () => {
  const onCopy = vi.fn(), onRollback = vi.fn(), onDelete = vi.fn()
  render(<UserMessageActions createdAt="2026-09-09T20:30:00" visible={false} copied={false} disabled={false} {...{ onCopy, onRollback, onDelete }} />)
  expect(screen.getByText('20:30').getAttribute('datetime')).toBe('2026-09-09T20:30:00')
  expect(screen.getByRole('group').className).toContain('group-hover/message:opacity-100')
  for (const name of ['复制消息', '回退到此对话之前', '删除这轮对话']) fireEvent.click(screen.getByRole('button', { name }))
  for (const callback of [onCopy, onRollback, onDelete]) expect(callback).toHaveBeenCalledOnce()
})

it('keeps destructive actions disabled during execution and touch actions visible', () => {
  render(<UserMessageActions createdAt="2026-09-09T00:05:00" visible copied={false} disabled onCopy={vi.fn()} onRollback={vi.fn()} onDelete={vi.fn()} />)
  expect(screen.getByText('00:05')).toBeTruthy()
  expect((screen.getByRole('button', { name: '回退到此对话之前' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: '删除这轮对话' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('group').className.split(' ')).toContain('opacity-100')
})

it('does not invent missing or invalid completion times', () => {
  const { container, rerender } = render(<MessageTime label="完成时间" />)
  expect(container.textContent).toBe('')
  rerender(<MessageTime label="完成时间" value="invalid" />)
  expect(container.textContent).toBe('')
})

it('uses terminal event time only for the completed run, keeping creation time unchanged', () => {
  const createdAt = '2026-09-09T10:00:00Z', ts = '2026-09-09T10:05:00Z'
  useAgentStore.setState({ runId: 'r', lastSeq: 0, workspaceActivities: [], messages: [
    { id: 'u', runId: 'r', role: 'user', parts: [], createdAt },
    { id: 'a', runId: 'r', role: 'assistant', parts: [], createdAt },
    { id: 'old', runId: 'old', role: 'assistant', parts: [], createdAt },
  ] })
  useAgentStore.getState().applyEvent({ type: 'run.finished', runId: 'r', seq: 1, ts, status: 'succeeded', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, artifacts: [], outputSummary: '完成' })
  const messages = useAgentStore.getState().messages
  expect(messages[1]).toMatchObject({ createdAt, completedAt: ts })
  expect(messages[0].completedAt).toBeUndefined()
  expect(messages[2].completedAt).toBeUndefined()
})
