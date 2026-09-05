import { prisma } from '../prisma.js'

/** A conversation contains many unrelated tasks. Only explicit continuation retains TaskSpec.id. */
export async function getTaskRunIds(sessionId: string, runId: string): Promise<string[]> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, sessionId }, select: { taskSpec: true } })
  const spec = run?.taskSpec
  const taskId = spec && typeof spec === 'object' && !Array.isArray(spec) && typeof spec.id === 'string' ? spec.id : null
  // Legacy records without identity fail closed: never infer ownership from session membership.
  if (!taskId) return [runId]
  const runs = await prisma.agentRun.findMany({
    where: { sessionId, engine: 'loop', taskSpec: { path: ['id'], equals: taskId } },
    select: { id: true },
  })
  return [...new Set([runId, ...runs.map(item => item.id)])]
}
