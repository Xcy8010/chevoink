import { randomInt, randomUUID } from 'node:crypto'

import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../api/app.js'
import {
  enqueueChapterMemoryExtraction,
  getMemoryGraph,
  listMemoryReviewInbox,
  saveEntityRelation,
  saveStoryMemory,
  searchStoryMemory,
} from '../../api/lib/agent/story-memory.js'
import { prisma } from '../../api/lib/prisma.js'

const dbAvailable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)

afterAll(async () => {
  await prisma.$disconnect().catch(() => {})
})

describe.skipIf(!dbAvailable)('Agent 2.0 P4 故事记忆与混合召回（需 DB）', () => {
  let userId = ''
  let novelId = ''
  let volumeId = ''
  const chapterIds: string[] = []

  beforeAll(async () => {
    const unique = randomInt(0, 10_000_000).toString().padStart(7, '0')
    const phone = `+861392${unique}`
    const register = await request(app).post('/api/auth/register')
      .send({ phone, nickname: `记忆评测${unique}`, password: 'Memory-Test-123!' })
    const cookies = Array.isArray(register.headers['set-cookie']) ? register.headers['set-cookie'] : [register.headers['set-cookie']]
    const cookie = cookies.find((item: string) => item?.startsWith('chevoink_session=')) as string
    userId = (await prisma.user.findUniqueOrThrow({ where: { phone }, select: { id: true } })).id
    const novel = await request(app).post('/api/novels').set('Cookie', cookie)
      .send({ title: '百章记忆评测', summary: '验证来源、召回与冲突。', tags: [] })
    novelId = novel.body.data.novel.id as string
    volumeId = (await prisma.volume.findFirstOrThrow({ where: { novelId }, select: { id: true } })).id
    for (let index = 1; index <= 100; index += 1) chapterIds.push(randomUUID())
    await prisma.chapter.createMany({ data: chapterIds.map((id, offset) => ({
      id, novelId, authorId: userId, volumeId, orderIndex: offset + 1, orderInVolume: offset + 1,
      title: `第${offset + 1}章`, summary: null,
      content: offset === 72 ? '林舟在钟楼下找到紫晶钥匙，并把它藏进旧怀表。' : `第${offset + 1}章发生了独立事件标记 FACT-${offset + 1}。`,
      wordCount: 30, status: 'draft', visibility: 'private', revision: 1,
    })) })
    for (let index = 0; index < 100; index += 1) {
      const fact = index === 72 ? '林舟在钟楼下找到紫晶钥匙，并把它藏进旧怀表。' : `第${index + 1}章事实 FACT-${index + 1}`
      await saveStoryMemory({
        userId, novelId, sourceChapterId: chapterIds[index], memoryType: 'chapterSummary', layer: 'L2',
        title: `章节:${chapterIds[index]}`, content: fact, importance: 60, confidence: 1, status: 'confirmed',
        evidence: { sourceType: 'chapter', sourceId: chapterIds[index], revision: 1, span: { start: 0, end: fact.length }, confidence: 1 },
      })
    }
  }, 30_000)

  it('100 章关键事实由词法+向量+图谱 RRF 召回，且来源章节和 revision 精确', async () => {
    const hits = await searchStoryMemory({ userId, novelId, query: '紫晶钥匙藏在哪里', limit: 5 })
    const target = hits.find((item) => item.content.includes('旧怀表'))
    expect(target).toBeDefined()
    expect(target?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'chapter', sourceId: chapterIds[72], revision: 1 }),
    ]))
    expect(target?.lexicalScore).toBeGreaterThan(0)
  })

  it('确定事实冲突不静默覆盖，而是生成 conflicted 候选进入作者审核箱', async () => {
    await saveStoryMemory({
      userId, novelId, memoryType: 'characterCard', layer: 'L1', title: '林舟',
      content: '林舟的母亲在故事开始前已经去世。', importance: 90, confidence: 1, status: 'confirmed',
      evidence: { sourceType: 'author_input', sourceId: 'author-fact-1', confidence: 1 },
    })
    const conflict = await saveStoryMemory({
      userId, novelId, memoryType: 'characterCard', layer: 'L1', title: '林舟',
      content: '林舟的母亲在第八十章来到钟楼探望他。', importance: 90, confidence: 1, status: 'confirmed',
      evidence: { sourceType: 'chapter', sourceId: chapterIds[79], revision: 1, confidence: 1 },
    })
    expect(conflict.action).toBe('conflict')
    const inbox = await listMemoryReviewInbox(userId, novelId)
    expect(inbox).toEqual(expect.arrayContaining([expect.objectContaining({ id: conflict.id, status: 'conflicted', reviewStatus: 'pending' })]))
    const canonical = await prisma.projectMemoryEntry.findFirstOrThrow({
      where: { novelId, memoryType: 'characterCard', title: '林舟', status: 'confirmed' },
    })
    expect(canonical.content).toContain('已经去世')
  })

  it('关系图只读投影返回实体、关系和稳定版本', async () => {
    await saveEntityRelation({
      userId, novelId, fromName: '林舟', toName: '顾棠', relationType: '共同调查',
      state: '暂时结盟', validFrom: 73, sourceId: chapterIds[72], revision: 1, confidence: 0.96,
    })
    const graph = await getMemoryGraph(userId, novelId)
    const labels = graph.nodes.map((node) => node.label)
    expect(labels).toEqual(expect.arrayContaining(['林舟', '顾棠']))
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: '共同调查', state: '暂时结盟', confidence: 0.96 }),
    ]))
    expect(graph.version).toMatch(/^[a-f0-9]{16}$/)
    expect(graph.updatedAt).toMatch(/T/)
  })

  it('章节变更按 revision 幂等抽取并增量生成章摘要与卷摘要', async () => {
    const chapter = await prisma.chapter.update({
      where: { id: chapterIds[0] }, data: { content: '雨夜里，林舟第一次抵达白塔。', revision: { increment: 1 } },
    })
    const jobId = await enqueueChapterMemoryExtraction({
      novelId, chapterId: chapter.id, chapterRevision: chapter.revision, before: '旧内容', after: chapter.content,
    })
    await new Promise((resolve) => setTimeout(resolve, 250))
    const job = await prisma.memoryExtractionJob.findUniqueOrThrow({ where: { id: jobId } })
    expect(job.status).toBe('completed')
    expect(await prisma.projectMemoryEntry.findFirst({ where: { novelId, memoryType: 'volumeSummary', title: `卷:${volumeId}` } })).not.toBeNull()
  })
})
