import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import type { TaskAuthorization } from '../../shared/contracts/task-authorization.js'
import { taskSpecSchema } from '../../shared/contracts/task-spec-contracts.js'
const execution = vi.hoisted(() => vi.fn())
vi.mock('../../api/lib/agent/loop.js', () => ({ executeAgentRun: execution }))
vi.mock('../../api/lib/credits.js', () => ({ assertCreditAccess: vi.fn(), getModelTierRuntime: vi.fn() }))
import { prisma } from '../../api/lib/prisma.js'
import { continueLoopRun } from '../../api/lib/agent/run-service.js'
import { buildTaskSpec } from '../../api/lib/agent/task-spec.js'
import { readStoredTaskAuthorization } from '../../api/lib/agent/task-authorization.js'
import { handleTestDatabaseUnavailable } from '../support/database-availability.js'

const dbAvailable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(handleTestDatabaseUnavailable)

describe.skipIf(!dbAvailable)('task authorization JSON persistence and resume expansion fence (isolated PG)', () => {
  let userId = '', novelId = '', sessionId = '', chapterId = ''
  const rootId = randomUUID()
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { nickname: 'authorization-test', passwordHash: 'not-a-real-password' } })
    userId = user.id
    const novel = await prisma.novel.create({ data: { authorId: userId, title: '授权测试', slug: randomUUID(), summary: '' } })
    novelId = novel.id
    const session = await prisma.agentSession.create({ data: { userId, novelId, title: '测试任务' } })
    sessionId = session.id
    const volume = await prisma.volume.create({ data: { novelId, title: '测试卷', orderIndex: 1 } })
    const chapter = await prisma.chapter.create({ data: { authorId: userId, novelId, volumeId: volume.id, title: '不得改写', orderIndex: 1, orderInVolume: 1, content: '原正文', wordCount: 3 } })
    chapterId = chapter.id
  })
  afterAll(async () => {
    try {
      if (userId) {
        await prisma.agentRun.deleteMany({ where: { userId } })
        await prisma.agentSession.deleteMany({ where: { userId } })
        await prisma.chapter.deleteMany({ where: { authorId: userId } })
        await prisma.novel.deleteMany({ where: { authorId: userId } })
        await prisma.user.delete({ where: { id: userId } })
      }
    } finally { await prisma.$disconnect() }
  })

  function authorization(): TaskAuthorization {
    return {
      version: 1, id: 'auth-policy', revision: 1,
      binding: { userId, novelId, sessionId, taskRootId: rootId },
      provenance: { kind: 'explicit_user_request', userMessageId: 'fixture-user-message', requestSha256: 'a'.repeat(64) },
      status: 'active', activePhaseId: 'read', completedPhases: [],
      phases: [{ id: 'read', purpose: 'research_analysis', grants: [{ effect: 'read_workspace', target: { kind: 'novel', id: novelId } }] }],
    }
  }
  async function store(rawAuthorization: unknown, targetSession = sessionId) {
    const spec = { ...buildTaskSpec({ runId: 'fixture', novelId, chapterId, prompt: '仅分析，不改正文' }), id: rootId, authorization: rawAuthorization }
    return prisma.agentRun.create({ data: {
      userId, novelId, sessionId: targetSession, chapterId, status: 'paused', engine: 'loop',
      mode: 'act', action: 'workspaceAgent', agentType: 'writingOrchestrator', modelTier: 'speed',
      taskSpec: spec as unknown as Prisma.InputJsonValue,
    } })
  }

  it('round-trips the complete contract without silently stripping it, but does not enable unimplemented issuance/phase execution', async () => {
    const policy = authorization()
    const stored = await store(policy)
    const restored = await prisma.agentRun.findUniqueOrThrow({ where: { id: stored.id } })
    expect(taskSpecSchema.parse(restored.taskSpec).authorization).toEqual(policy)
    expect(readStoredTaskAuthorization(restored.taskSpec, { userId, novelId, sessionId })).toEqual({ kind: 'authorized', authorization: policy })
    await expect(continueLoopRun(userId, stored.id)).rejects.toMatchObject({ code: 'TASK_AUTHORIZATION_NOT_ACTIVATED' })
    expect(execution).not.toHaveBeenCalled()
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: stored.id } })).status).toBe('paused')
  })

  it.each([null, { version: 99 }])('rejects a corrupt persisted authorization without rewriting user content: %j', async invalid => {
    const stored = await store(invalid)
    await expect(continueLoopRun(userId, stored.id)).rejects.toMatchObject({ code: 'TASK_AUTHORIZATION_INVALID' })
    expect(execution).not.toHaveBeenCalled()
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } })).content).toBe('原正文')
    expect(await prisma.agentMessage.count({ where: { runId: stored.id } })).toBe(0)
  })

  it('does not treat a historical grant copied to a fork as authority for that fork', async () => {
    const fork = await prisma.agentSession.create({ data: { userId, novelId, title: '分支' } })
    const stored = await store(authorization(), fork.id)
    await expect(continueLoopRun(userId, stored.id)).rejects.toMatchObject({ code: 'TASK_AUTHORIZATION_INVALID' })
    expect(execution).not.toHaveBeenCalled()
  })
})
