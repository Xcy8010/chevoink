import { randomInt } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../api/app.js'
import { prisma } from '../../api/lib/prisma.js'

const dbAvailable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)

afterAll(async () => {
  await prisma.$disconnect().catch(() => {})
})

describe.skipIf(!dbAvailable)('Agent 3.0 作品技能目录（需 DB）', () => {
  let cookie = ''
  let novelId = ''

  beforeAll(async () => {
    const unique = randomInt(0, 10_000_000).toString().padStart(7, '0')
    const register = await request(app)
      .post('/api/auth/register')
      .send({ phone: `+861386${unique}`, nickname: `技能目录测试${unique}`, password: 'Skill-Test-123!' })
    expect(register.status).toBe(201)
    const cookies = Array.isArray(register.headers['set-cookie']) ? register.headers['set-cookie'] : [register.headers['set-cookie']]
    cookie = cookies.find((item: string) => item?.startsWith('chevoink_session=')) as string
    const novel = await request(app)
      .post('/api/novels')
      .set('Cookie', cookie)
      .send({ title: '技能目录作品', summary: '验证技能安装与路由状态。', tags: [] })
    expect(novel.status).toBe(201)
    novelId = novel.body.data.novel.id as string
  })

  it('首次读取同步内置目录并创建作品级安装状态', async () => {
    const response = await request(app).get(`/api/agent/novels/${novelId}/skills`).set('Cookie', cookie)
    expect(response.status).toBe(200)
    expect(response.body.data.totalCount).toBeGreaterThanOrEqual(10)
    expect(response.body.data.enabledCount).toBe(response.body.data.totalCount)
    expect(response.body.data.items[0]).toMatchObject({ source: 'builtin', enabled: true, activeVersion: '3.0.0' })
    expect(response.body.data.items[0].versions).toHaveLength(1)
  })

  it('关闭技能后持久化到作品安装状态，非法版本不会污染当前版本', async () => {
    const disabled = await request(app)
      .patch(`/api/agent/novels/${novelId}/skills/cn-webfiction-draft.v3`)
      .set('Cookie', cookie)
      .send({ enabled: false })
    expect(disabled.status).toBe(200)
    expect(disabled.body.data.items.find((item: { id: string }) => item.id === 'cn-webfiction-draft.v3').enabled).toBe(false)

    const invalid = await request(app)
      .patch(`/api/agent/novels/${novelId}/skills/cn-webfiction-draft.v3`)
      .set('Cookie', cookie)
      .send({ lockedVersion: '99.0.0' })
    expect(invalid.status).toBe(409)

    const stored = await prisma.agentSkillInstallation.findUnique({
      where: { skillId_userId_scope_scopeId: {
        skillId: 'cn-webfiction-draft.v3',
        userId: (await prisma.novel.findUniqueOrThrow({ where: { id: novelId }, select: { authorId: true } })).authorId,
        scope: 'novel',
        scopeId: novelId,
      } },
    })
    expect(stored).toMatchObject({ enabled: false, lockedVersion: '3.0.0' })
  })
})
