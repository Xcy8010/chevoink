// Production uses one loop executor process. Serialize account-level admission,
// including asynchronous validation, so queue/continue/manual starts share limits.
const tails = new Map<string, Promise<unknown>>()
export async function withUserRunLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(userId) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(work)
  tails.set(userId, current)
  try { return await current } finally { if (tails.get(userId) === current) tails.delete(userId) }
}
