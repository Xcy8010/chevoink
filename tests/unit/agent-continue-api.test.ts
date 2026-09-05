import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), message: vi.fn(), execute: vi.fn(), active: vi.fn(() => false) }))
vi.mock('../../api/lib/prisma.js', () => ({
  DataAccessError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
  prisma: { agentRun: { findFirst: mocks.find }, agentMessage: { findFirst: mocks.message }, agentQueuedRequest: { findFirst: vi.fn(async () => null) } },
}))
vi.mock('../../api/lib/credits.js', () => ({ assertCreditAccess: vi.fn(), getModelTierRuntime: vi.fn() }))
vi.mock('../../api/lib/agent/loop.js', () => ({ executeAgentRun: mocks.execute }))
vi.mock('../../api/lib/agent/active-runs.js', () => ({ getActiveRun: () => undefined, hasActiveRunInSession: mocks.active, countActiveRunsByUser: () => 0 }))
import { continueLoopRun } from '../../api/lib/agent/run-service.js'
const run = { id: 'run19', sessionId: 's', userId: 'u', novelId: 'n', chapterId: 'c19', status: 'paused', engine: 'loop', mode: 'build', inputSummary: 'truncated', modelTier: 'speed', reasoningEffort: 'high', customModelId: null }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.active.mockReturnValue(false)
  mocks.find.mockResolvedValueOnce(run).mockResolvedValue({ id: 'run19' })
  mocks.message.mockResolvedValue({ parts: [{ type: 'text', text: '写第19章。' + '完整原始要求'.repeat(100) }] })
})
describe('continue API exact target', () => {
  it('resumes the requested run with full original input, not the 300-char summary', async () => {
    expect(await continueLoopRun('u', 'run19')).toMatchObject({ runId: 'run19' })
    expect(mocks.execute.mock.calls[0][0]).toMatchObject({ runId: 'run19', chapterId: 'c19', resume: true })
    expect(mocks.execute.mock.calls[0][0].prompt.length).toBeGreaterThan(300)
  })
  it('rejects stale resume after a newer task exists and never starts it', async () => {
    mocks.find.mockReset().mockResolvedValueOnce(run).mockResolvedValueOnce({ id: 'run20' })
    await expect(continueLoopRun('u', 'run19')).rejects.toMatchObject({ code: 'STALE_RESUME_TARGET', status: 409 })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('cannot use the resume API to start a completed run or overlap live work', async () => {
    mocks.find.mockReset().mockResolvedValue({ ...run, status: 'completed' })
    await expect(continueLoopRun('u', 'run19')).rejects.toMatchObject({ code: 'RUN_NOT_PAUSED' })
    mocks.find.mockResolvedValue(run)
    mocks.active.mockReturnValue(true)
    await expect(continueLoopRun('u', 'run19')).rejects.toMatchObject({ code: 'RUN_IN_PROGRESS' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
