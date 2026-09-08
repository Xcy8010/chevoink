import { renewRunLease, withRunLease, type RunLeaseToken } from './runtime-lease.js'

/** One in-flight renewal, DB-clock expiry, and no detached renewal after work completes. */
export async function withLeaseHeartbeat<T>(token: RunLeaseToken, parentSignal: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const captured = { ...token }
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  if (parentSignal?.aborted) abortFromParent()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void> | undefined
  const schedule = () => {
    if (stopped || controller.signal.aborted) return
    timer = setTimeout(() => {
      timer = undefined
      pending = renewRunLease(captured).catch(error => { controller.abort(error) }).finally(() => {
        pending = undefined
        schedule()
      })
    }, 10000)
    timer.unref?.()
  }
  try {
    controller.signal.throwIfAborted()
    await renewRunLease(captured)
    controller.signal.throwIfAborted()
    schedule()
    const result = await work(controller.signal)
    controller.signal.throwIfAborted()
    await withRunLease(captured, async () => {})
    controller.signal.throwIfAborted()
    return result
  } finally {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    parentSignal?.removeEventListener('abort', abortFromParent)
    // Renewal catches and propagates via abort, so cleanup cannot create an unhandled rejection.
    await pending
    parentSignal?.throwIfAborted()
    controller.signal.throwIfAborted()
  }
}
