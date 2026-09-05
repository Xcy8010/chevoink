import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ recover: vi.fn(), listen: vi.fn((_port: number, _host: string, ready: () => void) => { ready(); return { close: vi.fn() } }), schedules: vi.fn(), queue: vi.fn() }))
vi.mock('../../api/app.js', () => ({ default: { listen: mocks.listen } }))
vi.mock('../../api/config/env.js', () => ({ env: { port: 3001, serverUrl: 'test' } }))
vi.mock('../../api/lib/agent/run-service.js', () => ({ recoverOrphanLoopRuns: mocks.recover }))
vi.mock('../../api/lib/agent/productivity.js', () => ({ runDueAgentSchedules: mocks.schedules }))
vi.mock('../../api/lib/agent/request-queue.js', () => ({ dispatchQueuedRequests: mocks.queue }))
it('finishes orphan recovery before listening or launching scheduled/queued runs', async () => {
  let finish!: () => void
  mocks.recover.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
  const starting = import('../../api/server.js')
  await vi.waitFor(() => expect(mocks.recover).toHaveBeenCalledTimes(1))
  expect(mocks.listen).not.toHaveBeenCalled()
  expect(mocks.schedules).not.toHaveBeenCalled()
  expect(mocks.queue).not.toHaveBeenCalled()
  finish()
  await starting
  expect(mocks.listen).toHaveBeenCalledTimes(1)
  expect(mocks.schedules).toHaveBeenCalledTimes(1)
})
