import { useCallback, useRef } from 'react'
import { updateNovelPlanFile } from '../api'

/** Batches one document's latest edit; changing documents flushes the previous payload. */
export function usePlanSync() {
  const timer = useRef<number | null>(null)
  const pending = useRef<{ artifactId: string; title: string; content: string } | null>(null)
  const flushPlanServerSync = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const payload = pending.current
    pending.current = null
    if (payload) {
      void updateNovelPlanFile(payload.artifactId, { title: payload.title, content: payload.content }).catch(() => {
        // Preserve the existing retry-on-next-edit behavior.
      })
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
  return { flushPlanServerSync, schedulePlanServerSync }
}
