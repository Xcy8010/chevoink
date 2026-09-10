// Store only UI coordinates, never document text. Scope includes user, novel and task.
export function readPlanPosition(key: string | undefined): number {
  if (!key) return 0
  try {
    const value = Number(sessionStorage.getItem(`chevoink:plan-position:${key}`))
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch { return 0 }
}

export function savePlanPosition(key: string | undefined, node: HTMLElement | null) {
  if (!key || !node) return
  try { sessionStorage.setItem(`chevoink:plan-position:${key}`, String(node.scrollTop)) } catch { /* Optional UI state. */ }
}
