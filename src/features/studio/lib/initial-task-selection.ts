/** Explicit navigation must never briefly activate a different remembered task. */
export function selectInitialTask<T extends { id: string; sessionId: string | null }>(
  tasks: T[], activeId: string | null | undefined, requestedId: string | null,
): T | null {
  if (requestedId) return tasks.find(task => task.id === requestedId || task.sessionId === requestedId) ?? null
  return tasks.find(task => task.id === activeId) ?? tasks[0] ?? null
}
