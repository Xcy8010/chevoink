import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../api/lib/prisma'
import { getSkillUsage, recordSkillLoads } from '../../api/lib/agent/skills/receipts'
import { skillCatalog } from '../../api/lib/agent/skills/index'
import { handleTestDatabaseUnavailable } from '../support/database-availability'

const available = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(handleTestDatabaseUnavailable)
describe.skipIf(!available)('skill load receipts (real PostgreSQL)', () => {
  let userId = '', novelId = '', runId = ''
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { nickname: '技能回执夹具', passwordHash: 'not-a-login-hash' } })).id
    novelId = (await prisma.novel.create({ data: { authorId: userId, title: '技能回执', summary: '', slug: randomUUID() } })).id
    const sessionId = (await prisma.agentSession.create({ data: { userId, novelId, title: 'fixture' } })).id
    runId = (await prisma.agentRun.create({ data: { userId, novelId, sessionId, mode: 'act', action: 'workspaceAgent', agentType: 'writingOrchestrator' } })).id
    await prisma.agentSkillRun.create({ data: { runId, userId, novelId, phase: 'plan', routerVersion: '3.1.0', candidates: [], selected: [], loaded: [], reasonCodes: [], confidence: 1 } })
  })
  afterAll(async () => {
    if (userId) {
      await prisma.agentRun.deleteMany({ where: { userId } })
      await prisma.agentSession.deleteMany({ where: { userId } })
      await prisma.novel.deleteMany({ where: { authorId: userId } })
      await prisma.user.delete({ where: { id: userId } })
    }
    await prisma.$disconnect()
  })
  it('atomically merges parallel phase/tool loads and deduplicates task usage', async () => {
    const scope = { runId, userId, novelId }
    await Promise.all([
      recordSkillLoads(scope, [skillCatalog[0]], 'plan', 'route'),
      recordSkillLoads(scope, [skillCatalog[3]], 'draft', 'phase'),
      recordSkillLoads(scope, [skillCatalog[3]], 'draft', 'tool'),
      recordSkillLoads(scope, [skillCatalog[0]], 'plan', 'route'),
    ])
    const row = await prisma.agentSkillRun.findUniqueOrThrow({ where: { runId } })
    expect(row.loaded).toHaveLength(3)
    const usage = await getSkillUsage(userId, novelId)
    expect(usage.get(skillCatalog[0].id)?.count).toBe(1)
    expect(usage.get(skillCatalog[3].id)?.count).toBe(1)
  })
  it('does not read or update a receipt through a different user/novel scope', async () => {
    await recordSkillLoads({ runId, userId: 'other', novelId }, [skillCatalog[1]], 'plan', 'tool')
    await recordSkillLoads({ runId, userId, novelId: 'other' }, [skillCatalog[1]], 'plan', 'tool')
    expect((await getSkillUsage(userId, novelId)).has(skillCatalog[1].id)).toBe(false)
    expect((await getSkillUsage('other', novelId)).size).toBe(0)
    expect((await getSkillUsage(userId, 'other')).size).toBe(0)
  })
  it('includes retained historical selected-only records beyond the latest 30 runs', async () => {
    const row = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } })
    for (let i = 0; i < 31; i++) {
      const run = await prisma.agentRun.create({ data: { userId, novelId, sessionId: row.sessionId, mode: 'act', action: 'workspaceAgent', agentType: 'writingOrchestrator' } })
      await prisma.agentSkillRun.create({ data: { runId: run.id, userId, novelId, phase: 'plan', routerVersion: '3.0.0', candidates: [], selected: [{ id: skillCatalog[0].id, name: skillCatalog[0].name, version: '3.0.0' }], loaded: [], reasonCodes: [], confidence: 1 } })
    }
    expect((await getSkillUsage(userId, novelId)).get(skillCatalog[0].id)?.count).toBe(32)
  })
})
