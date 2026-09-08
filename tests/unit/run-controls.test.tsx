// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useRunControls } from '../../src/features/studio/agent/components/use-run-controls'

const mocks = vi.hoisted(() => ({ resume: vi.fn(), stop: vi.fn(), approval: vi.fn(), question: vi.fn(), begin: vi.fn() }))
vi.mock('../../src/features/studio/agent/agentApi', () => ({
  continueAgentLoopRun: mocks.resume, stopAgentLoopRun: mocks.stop,
  resolveAgentApproval: mocks.approval, resolveAgentQuestion: mocks.question,
}))
vi.mock('../../src/features/studio/agent/agentStore', () => ({
  isRunActive: (phase: string) => phase === 'running',
  useAgentStore: { getState: () => ({ beginRun: mocks.begin }) },
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function fixture() {
  const connect = vi.fn(), setActionError = vi.fn()
  const hook = renderHook(({ sessionId }) => useRunControls({
    sessionId, runId: 'run', resumeableRunId: null, phase: 'running',
    pendingApproval: null, pendingQuestion: null, connect, setActionError,
  }), { initialProps: { sessionId: 'a' } })
  return { ...hook, connect, setActionError }
}

it('deduplicates concurrent resume clicks and connects once', async () => {
  let finish!: (value: { runId: string }) => void
  mocks.resume.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const { result, connect } = fixture()
  let first!: Promise<void>, second!: Promise<void>
  act(() => { first = result.current.handleContinue(); second = result.current.handleContinue() })
  expect(mocks.resume).toHaveBeenCalledTimes(1)
  await act(async () => { finish({ runId: 'resumed' }); await Promise.all([first, second]) })
  expect(connect).toHaveBeenCalledExactlyOnceWith('resumed')
  expect(mocks.begin).toHaveBeenCalledExactlyOnceWith('resumed', '请继续完成之前的任务。', 'a')
})

it('does not hydrate an old resume into another window', async () => {
  let finish!: (value: { runId: string }) => void
  mocks.resume.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const { result, rerender, connect } = fixture()
  let pending!: Promise<void>
  act(() => { pending = result.current.handleContinue() })
  rerender({ sessionId: 'b' })
  await act(async () => { finish({ runId: 'old' }); await pending })
  expect(connect).not.toHaveBeenCalled()
  expect(mocks.begin).not.toHaveBeenCalled()
})

it('does not display an old stop failure in another task', async () => {
  let fail!: (error: Error) => void
  mocks.stop.mockImplementation(() => new Promise((_, reject) => { fail = reject }))
  const { result, rerender, setActionError } = fixture()
  let pending!: Promise<void>
  act(() => { pending = result.current.handleStop() })
  expect(result.current.stoppingRunId).toBe('run')
  rerender({ sessionId: 'b' })
  await act(async () => { fail(new Error('old failure')); await pending })
  expect(setActionError).not.toHaveBeenCalled()
  expect(result.current.stoppingRunId).toBeNull()
})
