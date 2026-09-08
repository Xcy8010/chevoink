import { useCallback, useEffect, useRef } from 'react'
import { updateNovelPlanFile } from '../api'
import { registerDesktopSave } from '@/lib/desktop-lifecycle'

/** Batches one document's latest edit; changing documents flushes the previous payload. */
export function usePlanSync() {
  const timer = useRef<number | null>(null)
  const pending = useRef<{ artifactId: string; title: string; content: string } | null>(null)
  const inflight = useRef(new Set<Promise<void>>())
  const failed = useRef(new Set<string>())
  const flushPlanServerSync = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const payload = pending.current
    pending.current = null
    if (payload) {
      const request = updateNovelPlanFile(payload.artifactId, { title: payload.title, content: payload.content }).then(() => {
        failed.current.delete(payload.artifactId)
      }).catch(() => {
        failed.current.add(payload.artifactId)
        // Preserve the existing retry-on-next-edit behavior.
      }).finally(() => { inflight.current.delete(request) })
      inflight.current.add(request)
    }
  }, [])
  const schedulePlanServerSync = useCallback((artifactId: string, title: string, content: string) => {
    if (pending.current && pending.current.artifactId !== artifactId) flushPlanServerSync()
    pending.current = { artifactId, title, content }
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      flushPlanServerSync()
    }, 800)
  }, [flushPlanServerSync])
  useEffect(() => registerDesktopSave(async () => {
    flushPlanServerSync()
    await Promise.all([...inflight.current])
    return !pending.current && inflight.current.size === 0 && failed.current.size === 0
  }), [flushPlanServerSync])
  return { flushPlanServerSync, schedulePlanServerSync }
}
