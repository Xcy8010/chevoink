import { randomInt, randomUUID } from 'node:crypto'

import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../api/app.js'
import {
  captureUserDirectives,
  compactSessionContext,
  getContextState,
  listActiveDirectives,
  renderCheckpointDigest,
  renderDirectiveDigest,
  supersedeDirective,
} from '../../api/lib/agent/context-engine.js'
import { buildTaskSpec } from '../../api/lib/agent/task-spec.js'
import { prisma } from '../../api/lib/prisma.js'

const dbAvailable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)

afterAll(async () => {
  await prisma.$disconnect().catch(() => {})
})

describe.skipIf(!dbAvailable)('Agent 2.0 P3 上下文引擎（需 DB）', () => {
  let cookie = ''
  let userId = ''
  let novelId = ''
  let sessionId = ''

  beforeAll(async () => {
    const unique = randomInt(0, 10_000_000).toString().padStart(7, '0')
    const phone = `+861393${unique}`
    const register = await request(app)
      .post('/api/auth/register')
      .send({ phone, nickname: `上下文评测${unique}`, password: 'Context-Test-123!' })
    expect(register.status).toBe(201)
    const cookies = Array.isArray(register.headers['set-cookie']) ? register.headers['set-cookie'] : [register.headers['set-cookie']]
    cookie = cookies.find((item: string) => item?.startsWith('chevoink_session=')) as string
    userId = (await prisma.user.findUniqueOrThrow({ where: { phone }, select: { id: true } })).id

    const novel = await request(app).post('/api/novels').set('Cookie', cookie)
      .send({ title: '二百轮上下文评测', summary: '验证检查点和指令账本。', tags: [] })
    novelId = novel.body.data.novel.id as string
    const session = await request(app).post('/api/agent/sessions').set('Cookie', cookie)
      .send({ novelId, title: '长会话评测' })
    expect(session.status).toBe(201)
    sessionId = session.body.data.session.id as string
  })

  async function addRounds(start: number, end: number) {
    const base = Date.now() + start * 10_000
    for (let index = start; index <= end; index += 1) {
      const runId = randomUUID()
      await prisma.agentRun.create({
        data: {
          id: runId, sessionId, userId, novelId, mode: 'act', action: 'continueChapter',
          agentType: 'writingOrchestrator', status: 'completed', engine: 'loop',
          inputSummary: `第 ${index} 轮目标`, outputSummary: `第 ${index} 轮已完成`, finishedAt: new Date(base + index * 10),
        },
      })
      await prisma.agentMessage.createMany({ data: [
        { id: randomUUID(), runId, sessionId, role: 'user', parts: [{ type: 'text', text: `第 ${index} 轮：继续创作，但必须服从长期指令。${'情节上下文'.repeat(20)}` }], createdAt: new Date(base + index * 10) },
        { id: randomUUID(), runId, sessionId, role: 'assistant', parts: [{ type: 'text', text: `第 ${index} 轮已完成并核验。${'执行摘要'.repeat(20)}` }], createdAt: new Date(base + index * 10 + 1) },
      ] })
    }
  }

  it('200 轮中完成两次压缩，硬约束保留率 100%，被替代指令不再注入', async () => {
    const taskSpec = buildTaskSpec({
      runId: randomUUID(), novelId, chapterId: null,
      prompt: '以后必须保持第一人称。禁止让主角突然获得读心术。',
    })
    const directives = await captureUserDirectives({
      userId, novelId, sessionId, chapterId: null, sourceMessageId: randomUUID(), taskSpec,
      prompt: '以后必须保持第一人称。禁止让主角突然获得读心术。',
    })
    expect(directives).toHaveLength(2)

    await addRounds(1, 100)
    const first = await compactSessionContext(userId, sessionId, true)
    expect(first?.version).toBe(1)
    expect(first?.validation).toMatchObject({ hardConstraintRetention: 1, missingDirectiveIds: [], valid: true })

    const firstPerson = directives.find((item) => item.text.includes('第一人称'))!
    await supersedeDirective(userId, novelId, firstPerson.id, '以后必须保持第三人称限知视角')
    await addRounds(101, 200)
    const second = await compactSessionContext(userId, sessionId, true)
    expect(second?.version).toBe(2)
    expect(second?.validation.hardConstraintRetention).toBe(1)
    const digest = renderCheckpointDigest(second!)
    expect(digest).toContain('第三人称限知视角')
    expect(digest).not.toContain('第一人称')

    const active = await listActiveDirectives(userId, novelId)
    const directiveDigest = renderDirectiveDigest(active)!
    expect(directiveDigest).toContain('第三人称限知视角')
    expect(directiveDigest).not.toContain('第一人称')
  }, 45_000)

  it('可从最新检查点恢复上下文状态，接口与数据库真相一致', async () => {
    const state = await getContextState(userId, sessionId)
    expect(state.checkpoint?.version).toBe(2)
    expect(state.checkpoint?.validation.valid).toBe(true)
    expect(state.activeDirectiveCount).toBe(2)

    const response = await request(app).get(`/api/agent/sessions/${sessionId}/context-state`).set('Cookie', cookie)
    expect(response.status).toBe(200)
    expect(response.body.data.checkpoint.version).toBe(2)
    expect(response.body.data.activeDirectiveCount).toBe(2)
  })
})
