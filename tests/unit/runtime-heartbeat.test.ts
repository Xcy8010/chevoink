import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ renew: vi.fn(), check: vi.fn() }))
vi.mock('../../api/lib/agent/runtime-lease.js', () => ({ renewRunLease: mocks.renew, withRunLease: mocks.check }))
import { withLeaseHeartbeat } from '../../api/lib/agent/runtime-heartbeat.js'

const token = { userId: 'u', runId: 'r', taskRootId: 't', ownerId: 'worker', claimId: 'claim', epoch: 1n }
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.useFakeTimers()
  mocks.renew.mockReset().mockResolvedValue(undefined)
  mocks.check.mockReset().mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers() })

describe('durable lease heartbeat lifecycle', () => {
  it('renews before starting and periodically while waiting, then removes its timer', async () => {
    const work = deferred<string>()
    const result = withLeaseHeartbeat(token, undefined, () => work.promise)
    await vi.advanceTimersByTimeAsync(25000)
    expect(mocks.renew).toHaveBeenCalledTimes(3)
    work.resolve('result')
    expect(await result).toBe('result')
    expect(mocks.check).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60000)
    expect(mocks.renew).toHaveBeenCalledTimes(3)
  })

  it('does not overlap a slow renewal or leave it detached on completion', async () => {
    const renewal = deferred(), work = deferred<string>()
    mocks.renew.mockResolvedValueOnce(undefined).mockImplementationOnce(() => renewal.promise)
    const result = withLeaseHeartbeat(token, undefined, () => work.promise)
    let completed = false
    void result.then(() => { completed = true })
    await vi.advanceTimersByTimeAsync(40000)
    expect(mocks.renew).toHaveBeenCalledTimes(2)
    work.resolve('ok')
    await vi.advanceTimersByTimeAsync(0)
    expect(completed).toBe(false)
    renewal.resolve()
    expect(await result).toBe('ok')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts upstream work on renewal failure without an unhandled rejection', async () => {
    const failure = new Error('lease revoked')
    mocks.renew.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure)
    const result = withLeaseHeartbeat(token, undefined, signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const assertion = expect(result).rejects.toBe(failure)
    await vi.advanceTimersByTimeAsync(10000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not return success if an in-flight renewal fails during cleanup', async () => {
    const renewal = deferred(), work = deferred<string>()
    mocks.renew.mockResolvedValueOnce(undefined).mockImplementationOnce(() => renewal.promise)
    const result = withLeaseHeartbeat(token, undefined, () => work.promise)
    const assertion = expect(result).rejects.toThrow('late lease failure')
    await vi.advanceTimersByTimeAsync(10000)
    work.resolve('result')
    await vi.advanceTimersByTimeAsync(0)
    renewal.reject(new Error('late lease failure'))
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('honors a user stop arriving while an in-flight renewal is being joined', async () => {
    const parent = new AbortController(), renewal = deferred(), work = deferred<string>()
    mocks.renew.mockResolvedValueOnce(undefined).mockImplementationOnce(() => renewal.promise)
    const result = withLeaseHeartbeat(token, parent.signal, () => work.promise)
    const assertion = expect(result).rejects.toThrow('stop during cleanup')
    await vi.advanceTimersByTimeAsync(10000)
    work.resolve('result')
    await vi.advanceTimersByTimeAsync(0)
    parent.abort(new Error('stop during cleanup'))
    renewal.resolve()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an already cancelled request before touching the lease or provider', async () => {
    const parent = new AbortController()
    parent.abort(new Error('stopped'))
    const work = vi.fn()
    await expect(withLeaseHeartbeat(token, parent.signal, work)).rejects.toThrow('stopped')
    expect(work).not.toHaveBeenCalled()
    expect(mocks.renew).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propagates user stop and snapshots the original lease identity', async () => {
    const parent = new AbortController(), callerToken = { ...token }
    const result = withLeaseHeartbeat(callerToken, parent.signal, signal => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const assertion = expect(result).rejects.toThrow('user stop')
    callerToken.runId = 'different-run'
    await vi.advanceTimersByTimeAsync(10000)
    parent.abort(new Error('user stop'))
    await assertion
    for (const [value] of mocks.renew.mock.calls) expect(value.runId).toBe('r')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not return generated work as executable when final lease validation fails', async () => {
    mocks.check.mockRejectedValueOnce(new Error('lease lost before return'))
    await expect(withLeaseHeartbeat(token, undefined, async () => 'saved result')).rejects.toThrow('lease lost before return')
    expect(vi.getTimerCount()).toBe(0)
  })
})
