import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
const execution = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../api/lib/agent/loop.js', () => ({ executeAgentRun: execution }))
vi.mock('../../api/lib/credits.js', () => ({ assertCreditAccess: vi.fn(async () => {}), getModelTierRuntime: vi.fn(async () => ({ reasoningEffort: 'high' })) }))
vi.mock('../../api/lib/agent/writing-experiments.js', () => ({ recordSevenDayContinuation: vi.fn(async () => {}) }))
import { prisma } from '../../api/lib/prisma.js'
import { actOnQueuedRequest, dispatchQueuedRequests, enqueueRequest, listQueuedRequests } from '../../api/lib/agent/request-queue.js'
import { continueLoopRun, startLoopRun } from '../../api/lib/agent/run-service.js'
const dbAvailable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)
afterAll(async () => { await prisma.$disconnect() })

describe.skipIf(!dbAvailable)('queue database transactions (isolated test DB)', () => {
  let userId = '', novelId = '', sessionId = ''
  beforeEach(async () => {
    execution.mockClear()
    const user = await prisma.user.create({ data: { nickname: 'queue-test', passwordHash: 'not-a-real-password' } })
    userId = user.id
    const novel = await prisma.novel.create({ data: { authorId: userId, title: '队列测试', slug: randomUUID(), summary: '' } })
    novelId = novel.id
    const session = await prisma.agentSession.create({ data: { userId, novelId, title: '源会话' } })
    sessionId = session.id
  })
  const enqueue = async (prompt = '第20章完整要求') => {
    const id = randomUUID()
    await enqueueRequest(userId, id, { sessionId, novelId, mode: 'build', prompt, creativeFreedom: 'bold', qualityMode: 'premium', pinnedSkillIds: ['skill-a'] })
    return id
  }
  it('parallel duplicate admission and dispatch create exactly one run, with atomic linkage', async () => {
    const id = randomUUID(), input = { sessionId, novelId, mode: 'build' as const, prompt: '写第20章' }
    await Promise.all([enqueueRequest(userId, id, input), enqueueRequest(userId, id, input)])
    await Promise.all([dispatchQueuedRequests(), dispatchQueuedRequests()])
    const row = await prisma.agentQueuedRequest.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('dispatched')
    expect(row.runId).toBeTruthy()
    expect(await prisma.agentRun.count({ where: { sessionId } })).toBe(1)
    await dispatchQueuedRequests()
    expect(await prisma.agentRun.count({ where: { sessionId } })).toBe(1)
  })
  it('FIFO waits for terminal completion; paused work requires explicit steer', async () => {
    const first = await enqueue('先完成第20章')
    const second = await enqueue('再完成第21章')
    await dispatchQueuedRequests()
    const runId = (await prisma.agentQueuedRequest.findUniqueOrThrow({ where: { id: first } })).runId!
    await prisma.agentRun.update({ where: { id: runId }, data: { status: 'paused' } })
    await dispatchQueuedRequests()
    expect((await listQueuedRequests(userId, sessionId)).items[0].id).toBe(second)
    await actOnQueuedRequest(userId, sessionId, second, 'steer', 0)
    await dispatchQueuedRequests()
    expect((await prisma.agentQueuedRequest.findUniqueOrThrow({ where: { id: second } })).status).toBe('dispatched')
    expect(await prisma.agentRun.count({ where: { sessionId } })).toBe(2)
  })
  it.each(['new', 'fork'] as const)('moves to %s window atomically and stale retries cannot create extra windows', async action => {
    const id = await enqueue()
    const result = await actOnQueuedRequest(userId, sessionId, id, action, 0)
    expect(result.session?.id).not.toBe(sessionId)
    const row = await prisma.agentQueuedRequest.findUniqueOrThrow({ where: { id } })
    expect(row.sessionId).toBe(result.session?.id)
    expect((row.payload as { sessionId: string }).sessionId).toBe(row.sessionId)
    await expect(actOnQueuedRequest(userId, sessionId, id, action, 0)).rejects.toMatchObject({ code: 'QUEUE_CHANGED' })
    expect(await prisma.agentSession.count({ where: { userId } })).toBe(2)
  })
  it('a stale queue claim rolls back run creation, and delete cascades pending entries', async () => {
    const id = await enqueue()
    await actOnQueuedRequest(userId, sessionId, id, 'edit', 0, '修改后的要求')
    await expect(startLoopRun(userId, { sessionId, novelId, mode: 'build', prompt: '旧要求' }, { queuedRequest: { id, revision: 0 } })).rejects.toMatchObject({ code: 'QUEUE_CHANGED' })
    expect(await prisma.agentRun.count({ where: { sessionId } })).toBe(0)
    await prisma.agentSession.delete({ where: { id: sessionId } })
    expect(await prisma.agentQueuedRequest.count({ where: { id } })).toBe(0)
  })
  it('resumes full queued input even if a crash preceded the first user message', async () => {
    const prompt = '原始完整要求'.repeat(120)
    const id = await enqueue(prompt)
    await dispatchQueuedRequests()
    const runId = (await prisma.agentQueuedRequest.findUniqueOrThrow({ where: { id } })).runId!
    await prisma.agentRun.update({ where: { id: runId }, data: { status: 'failed' } })
    await continueLoopRun(userId, runId)
    expect(execution).toHaveBeenLastCalledWith(expect.objectContaining({ prompt, creativeFreedom: 'bold', qualityMode: 'premium', pinnedSkillIds: ['skill-a'], resume: true }))
  })
})
