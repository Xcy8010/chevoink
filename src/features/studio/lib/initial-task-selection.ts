/** Explicit navigation must never briefly activate a different remembered task. */
export function initialTaskWindows<T>(tasks: T[], requestedId: string | null, create: () => T): T[] {
  // A cold WebView profile has no snapshots: opening an existing deep link is not creation.
  return tasks.length || requestedId ? tasks : [create()]
}

export function selectInitialTask<T extends { id: string; sessionId: string | null }>(
  tasks: T[], activeId: string | null | undefined, requestedId: string | null,
): T | null {
  if (requestedId) return tasks.find(task => task.id === requestedId || task.sessionId === requestedId) ?? null
  return tasks.find(task => task.id === activeId) ?? tasks[0] ?? null
}
