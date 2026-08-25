import { createHash } from 'node:crypto'

import type { ProjectMemoryType, StoryMemoryLayer, StoryMemoryStatus } from '@prisma/client'

import type { MemoryEvidence, MemoryGraph, MemorySearchHit } from '../../../shared/contracts/index.js'
import { DataAccessError, prisma } from '../prisma.js'

type EvidenceInput = {
  sourceType: MemoryEvidence['sourceType']
  sourceId: string
  revision?: number
  span?: { start: number; end: number; quoteHash?: string }
  confidence: number
}

type SaveMemoryInput = {
  userId: string
  novelId: string
  runId?: string | null
  sourceChapterId?: string | null
  memoryType: ProjectMemoryType
  layer: StoryMemoryLayer
  title: string
  content: string
  importance: number
  confidence: number
  status: StoryMemoryStatus
  evidence: EvidenceInput
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/\s+/g, '')
}

function tokens(value: string): string[] {
  const text = normalize(value)
  const result = new Set<string>()
  for (const word of value.toLocaleLowerCase('zh-CN').match(/[a-z0-9_]+|[\u4e00-\u9fff]{1,6}/g) ?? []) result.add(word)
  for (let index = 0; index < text.length - 1; index += 1) result.add(text.slice(index, index + 2))
  return [...result]
}

function hashVector(value: string, size = 64): number[] {
  const vector = Array<number>(size).fill(0)
  for (const token of tokens(value)) {
    const digest = createHash('sha256').update(token).digest()
    const index = digest.readUInt16BE(0) % size
    vector[index] += digest[2] % 2 === 0 ? 1 : -1
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1
  return vector.map((item) => item / norm)
}

function cosine(left: number[], right: number[]): number {
  return left.reduce((sum, item, index) => sum + item * (right[index] ?? 0), 0)
}

function lexicalScore(query: string, text: string): number {
  const queryTokens = tokens(query)
  const target = new Set(tokens(text))
  if (!queryTokens.length) return 0
  const overlap = queryTokens.filter((token) => target.has(token)).length / queryTokens.length
  const exact = normalize(text).includes(normalize(query)) ? 1 : 0
  return overlap * 0.65 + exact * 0.35
}

function evidenceRecord(record: {
  id: string; memoryId: string; sourceType: string; sourceId: string; revision: number | null
  spanStart: number | null; spanEnd: number | null; quoteHash: string | null; confidence: number; createdAt: Date
}): MemoryEvidence {
  return {
    id: record.id, memoryId: record.memoryId, sourceType: record.sourceType as MemoryEvidence['sourceType'],
    sourceId: record.sourceId, ...(record.revision ? { revision: record.revision } : {}),
    ...(record.spanStart !== null && record.spanEnd !== null
      ? { span: { start: record.spanStart, end: record.spanEnd, ...(record.quoteHash ? { quoteHash: record.quoteHash } : {}) } }
      : {}),
    confidence: record.confidence, createdAt: record.createdAt.toISOString(),
  }
}

async function addEvidence(memoryId: string, evidence: EvidenceInput) {
  const exists = await prisma.memoryEvidence.findFirst({
    where: { memoryId, sourceType: evidence.sourceType, sourceId: evidence.sourceId, revision: evidence.revision ?? null },
  })
  if (exists) return
  await prisma.memoryEvidence.create({
    data: {
      memoryId, sourceType: evidence.sourceType, sourceId: evidence.sourceId, revision: evidence.revision,
      spanStart: evidence.span?.start, spanEnd: evidence.span?.end, quoteHash: evidence.span?.quoteHash,
      confidence: evidence.confidence,
    },
  })
}

export async function saveStoryMemory(input: SaveMemoryInput): Promise<{ id: string; action: 'created' | 'updated' | 'conflict'; status: StoryMemoryStatus }> {
  const novel = await prisma.novel.findFirst({ where: { id: input.novelId, authorId: input.userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权写入记忆。')
  const title = input.title.trim()
  const content = input.content.trim()
  const existing = await prisma.projectMemoryEntry.findFirst({
    where: { novelId: input.novelId, memoryType: input.memoryType, title, status: { notIn: ['superseded', 'invalid'] } },
    orderBy: { updatedAt: 'desc' },
    include: { evidence: { where: { sourceType: input.evidence.sourceType, sourceId: input.evidence.sourceId }, take: 1 } },
  })

  if (!existing) {
    const created = await prisma.projectMemoryEntry.create({
      data: {
        novelId: input.novelId, runId: input.runId, sourceChapterId: input.sourceChapterId,
        memoryType: input.memoryType, layer: input.layer, title, content, importance: input.importance,
        confidence: input.confidence, status: input.status,
        reviewStatus: input.status === 'conflicted' ? 'pending' : 'none', embedding: hashVector(`${title}\n${content}`),
      },
    })
    await addEvidence(created.id, input.evidence)
    if (input.memoryType === 'characterCard') {
      const entity = await prisma.storyEntity.upsert({
        where: { novelId_entityType_canonicalName: { novelId: input.novelId, entityType: 'character', canonicalName: title } },
        create: { novelId: input.novelId, entityType: 'character', canonicalName: title, description: content, status: input.status },
        update: { description: content, status: input.status },
      })
      await prisma.entityAlias.upsert({
        where: { entityId_alias: { entityId: entity.id, alias: title } },
        create: { entityId: entity.id, alias: title, sourceId: input.evidence.sourceId }, update: {},
      })
    }
    return { id: created.id, action: 'created', status: created.status }
  }

  if (normalize(existing.content) === normalize(content)) {
    await addEvidence(existing.id, input.evidence)
    return { id: existing.id, action: 'updated', status: existing.status }
  }

  const sameVersionedSource = existing.evidence.length > 0
  const canReplace = sameVersionedSource || existing.status === 'inferred' && input.status === 'confirmed'
  if (canReplace) {
    await prisma.$transaction([
      prisma.memoryRevision.create({ data: { memoryId: existing.id, before: existing.content, after: content, reason: sameVersionedSource ? 'source_revision_advanced' : 'author_confirmation' } }),
      prisma.projectMemoryEntry.update({
        where: { id: existing.id },
        data: {
          content, importance: input.importance, confidence: input.confidence, status: input.status,
          reviewStatus: 'none', runId: input.runId, sourceChapterId: input.sourceChapterId,
          version: { increment: 1 }, embedding: hashVector(`${title}\n${content}`),
        },
      }),
    ])
    await addEvidence(existing.id, input.evidence)
    return { id: existing.id, action: 'updated', status: input.status }
  }

  const conflict = await prisma.projectMemoryEntry.create({
    data: {
      novelId: input.novelId, runId: input.runId, sourceChapterId: input.sourceChapterId,
      memoryType: input.memoryType, layer: input.layer, title, content, importance: input.importance,
      confidence: input.confidence, status: 'conflicted', reviewStatus: 'pending', embedding: hashVector(`${title}\n${content}`),
    },
  })
  await Promise.all([
    addEvidence(conflict.id, input.evidence),
    prisma.memoryRevision.create({ data: { memoryId: existing.id, before: existing.content, after: content, reason: `conflict_candidate:${conflict.id}` } }),
  ])
  return { id: conflict.id, action: 'conflict', status: 'conflicted' }
}

export async function searchStoryMemory(input: {
  userId: string; novelId: string; query: string; memoryType?: ProjectMemoryType; limit?: number
}): Promise<MemorySearchHit[]> {
  const novel = await prisma.novel.findFirst({ where: { id: input.novelId, authorId: input.userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权检索记忆。')
  const [entries, graphEntities] = await Promise.all([
    prisma.projectMemoryEntry.findMany({
      where: {
        novelId: input.novelId, status: { in: ['confirmed', 'inferred'] }, reviewStatus: { not: 'rejected' },
        ...(input.memoryType ? { memoryType: input.memoryType } : {}),
      },
      include: { evidence: { orderBy: { createdAt: 'desc' }, take: 8 } },
      orderBy: { updatedAt: 'desc' }, take: 2000,
    }),
    prisma.storyEntity.findMany({
      where: {
        novelId: input.novelId,
        OR: [{ canonicalName: { contains: input.query, mode: 'insensitive' } }, { aliases: { some: { alias: { contains: input.query, mode: 'insensitive' } } } }],
      },
      include: { aliases: true, relationsFrom: { include: { toEntity: true } }, relationsTo: { include: { fromEntity: true } } },
      take: 20,
    }),
  ])
  const queryVector = hashVector(input.query)
  const graphTerms = new Set(graphEntities.flatMap((entity) => [
    entity.canonicalName, ...entity.aliases.map((item) => item.alias),
    ...entity.relationsFrom.map((item) => item.toEntity.canonicalName),
    ...entity.relationsTo.map((item) => item.fromEntity.canonicalName),
  ]))
  const raw = entries.map((entry) => {
    const text = `${entry.title}\n${entry.content}`
    const stored = Array.isArray(entry.embedding) ? entry.embedding.filter((item): item is number => typeof item === 'number') : []
    const semantic = Math.max(0, cosine(queryVector, stored.length ? stored : hashVector(text)))
    const lexical = lexicalScore(input.query, text)
    const graph = [...graphTerms].some((term) => normalize(text).includes(normalize(term))) ? 1 : 0
    return { entry, lexical, semantic, graph, importance: entry.importance / 100 }
  })
  const ranks = (selector: (item: typeof raw[number]) => number) => new Map(
    [...raw].sort((left, right) => selector(right) - selector(left)).map((item, index) => [item.entry.id, index + 1]),
  )
  const lexicalRanks = ranks((item) => item.lexical)
  const semanticRanks = ranks((item) => item.semantic)
  const graphRanks = ranks((item) => item.graph)
  const importanceRanks = ranks((item) => item.importance)
  return raw
    .map((item) => ({
      id: item.entry.id, memoryType: item.entry.memoryType, layer: item.entry.layer, status: item.entry.status,
      title: item.entry.title, content: item.entry.content,
      score:
        0.4 / (60 + lexicalRanks.get(item.entry.id)!) +
        0.35 / (60 + semanticRanks.get(item.entry.id)!) +
        0.15 / (60 + graphRanks.get(item.entry.id)!) +
        0.1 / (60 + importanceRanks.get(item.entry.id)!) +
        // RRF 保证多路稳定融合；原始相关度作为强精确命中的破平项，避免百章同权重时被时间顺序淹没。
        item.lexical * 0.02 + item.semantic * 0.005 + item.graph * 0.01,
      lexicalScore: item.lexical, semanticScore: item.semantic, graphScore: item.graph,
      evidence: item.entry.evidence.map(evidenceRecord),
    }))
    .filter((item) => item.lexicalScore > 0 || item.semanticScore > 0.15 || item.graphScore > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit ?? 8)
}

export async function enqueueChapterMemoryExtraction(input: {
  novelId: string; chapterId: string; chapterRevision: number; before: string; after: string
}) {
  const job = await prisma.memoryExtractionJob.upsert({
    where: { idempotencyKey: `${input.chapterId}:${input.chapterRevision}` },
    create: {
      novelId: input.novelId, chapterId: input.chapterId, chapterRevision: input.chapterRevision,
      idempotencyKey: `${input.chapterId}:${input.chapterRevision}`,
      diff: { beforeHash: createHash('sha256').update(input.before).digest('hex'), after: input.after },
    },
    update: {},
  })
  queueMicrotask(() => void processMemoryExtractionJob(job.id).catch(() => {}))
  return job.id
}

export async function processMemoryExtractionJob(jobId: string): Promise<void> {
  const lease = new Date(Date.now() + 60_000)
  const claimed = await prisma.memoryExtractionJob.updateMany({
    where: { id: jobId, OR: [{ status: 'pending' }, { status: 'failed', leaseUntil: { lt: new Date() } }] },
    data: { status: 'processing', leaseUntil: lease, attempts: { increment: 1 }, errorMessage: null },
  })
  if (!claimed.count) return
  try {
    const job = await prisma.memoryExtractionJob.findUniqueOrThrow({ where: { id: jobId } })
    const chapter = await prisma.chapter.findUnique({
      where: { id: job.chapterId }, include: { novel: { select: { authorId: true } }, volume: { select: { id: true, title: true, revision: true } } },
    })
    if (!chapter || chapter.revision !== job.chapterRevision) {
      await prisma.memoryExtractionJob.update({ where: { id: jobId }, data: { status: 'completed', errorMessage: 'stale_revision_skipped', leaseUntil: null } })
      return
    }
    const clean = chapter.content.replace(/\s+/g, ' ').trim()
    const summary = clean.length <= 360 ? clean : `${clean.slice(0, 240)}……${clean.slice(-100)}`
    const chapterMemory = await saveStoryMemory({
      userId: chapter.novel.authorId, novelId: chapter.novelId, sourceChapterId: chapter.id,
      memoryType: 'chapterSummary', layer: 'L2', title: `章节:${chapter.id}`, content: `${chapter.title}：${summary || '暂无正文'}`,
      importance: 65, confidence: 0.98, status: 'inferred',
      evidence: { sourceType: 'chapter', sourceId: chapter.id, revision: chapter.revision, span: { start: 0, end: chapter.content.length, quoteHash: createHash('sha256').update(chapter.content).digest('hex') }, confidence: 1 },
    })
    const volumeMemories = await prisma.projectMemoryEntry.findMany({
      where: { novelId: chapter.novelId, memoryType: 'chapterSummary', status: { in: ['confirmed', 'inferred'] }, sourceChapter: { volumeId: chapter.volumeId } },
      orderBy: { sourceChapter: { orderInVolume: 'asc' } }, take: 100, select: { content: true },
    })
    await saveStoryMemory({
      userId: chapter.novel.authorId, novelId: chapter.novelId, memoryType: 'volumeSummary', layer: 'L2',
      title: `卷:${chapter.volumeId}`, content: `${chapter.volume.title}：${volumeMemories.map((item) => item.content).join('；').slice(0, 4000)}`,
      importance: 75, confidence: 0.9, status: 'inferred',
      evidence: { sourceType: 'volume', sourceId: chapter.volumeId, revision: chapter.volume.revision, confidence: 0.9 },
    })
    const coreMemories = await prisma.projectMemoryEntry.findMany({
      where: {
        novelId: chapter.novelId, status: 'confirmed',
        memoryType: { in: ['worldbuilding', 'characterCard', 'timelineEvent', 'foreshadowing', 'continuityRule', 'relationshipState'] },
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }], take: 40,
      select: { memoryType: true, title: true, content: true },
    })
    if (coreMemories.length > 0) {
      await saveStoryMemory({
        userId: chapter.novel.authorId, novelId: chapter.novelId, memoryType: 'storyBible', layer: 'L3',
        title: '故事圣经（系统增量）',
        content: coreMemories.map((item) => `[${item.memoryType}] ${item.title}：${item.content}`).join('\n').slice(0, 12000),
        importance: 95, confidence: 1, status: 'confirmed',
        evidence: { sourceType: 'artifact', sourceId: `story-bible:${chapter.novelId}`, confidence: 1 },
      })
    }
    await prisma.memoryExtractionJob.update({ where: { id: jobId }, data: { status: 'completed', leaseUntil: null, errorMessage: `memory:${chapterMemory.id}` } })
  } catch (error) {
    await prisma.memoryExtractionJob.update({
      where: { id: jobId }, data: { status: 'failed', leaseUntil: new Date(Date.now() + 30_000), errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'unknown_error' },
    }).catch(() => {})
    throw error
  }
}

const CHARACTER_NAME_BOUNDARY = String.raw`(?:^|[\s，。！？；：、“”‘’（）—])`
const CHARACTER_ACTION = String.raw`(?:说|问|答|道|看|望|笑|哭|走|跑|站|坐|来|回|发现|觉得|知道|点头|摇头|皱眉|抬头|转身|开口|沉默|握住|拿起)`
const COMMON_SURNAMES = new Set('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季贾路娄江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万柯管卢莫房裘缪解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊甄曲封芮储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白蒲台鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧沃利蔚越隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公'.split(''))
const CHARACTER_NAME_STOPWORDS = new Set([
  '他们', '她们', '我们', '你们', '自己', '有人', '没人', '众人', '所有人', '年轻人', '老人', '男人', '女人',
  '今天', '昨天', '明天', '此刻', '这时', '那时', '这里', '那里', '外面', '里面', '随后', '忽然', '终于',
])
const memoryProjectionVersionCache = new Map<string, string>()
const MEMORY_PROJECTION_CACHE_LIMIT = 500

function rememberMemoryProjectionVersion(novelId: string, version: string) {
  memoryProjectionVersionCache.delete(novelId)
  memoryProjectionVersionCache.set(novelId, version)
  while (memoryProjectionVersionCache.size > MEMORY_PROJECTION_CACHE_LIMIT) {
    const oldest = memoryProjectionVersionCache.keys().next().value
    if (!oldest) break
    memoryProjectionVersionCache.delete(oldest)
  }
}

function extractCharacterNames(content: string): string[] {
  const candidates = new Set<string>()
  const patterns = [
    new RegExp(`${CHARACTER_NAME_BOUNDARY}([\\u3400-\\u9fff]{2,4})(?=${CHARACTER_ACTION})`, 'gmu'),
    new RegExp(`${CHARACTER_NAME_BOUNDARY}([\\u3400-\\u9fff]{2,4})(?=[：:]?[“\u201c])`, 'gmu'),
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const name = match[1]?.trim()
      if (!name || CHARACTER_NAME_STOPWORDS.has(name) || !COMMON_SURNAMES.has(name[0])) continue
      candidates.add(name)
    }
  }
  return [...candidates]
}

/**
 * 将已有正文投影为可视化记忆图谱，并为尚未抽取的章节补建幂等任务。
 * 全程只做本地规则抽取与数据库 upsert，不调用模型、不额外消耗 token。
 */
export async function syncNovelMemoryProjection(userId: string, novelId: string) {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, authorId: userId },
    select: { id: true },
  })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权更新记忆。')

  const [chapters, characterCards] = await Promise.all([
    prisma.chapter.findMany({
      where: { novelId, content: { not: '' } },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, content: true, revision: true, orderIndex: true },
      take: 500,
    }),
    prisma.projectMemoryEntry.findMany({
      where: { novelId, memoryType: 'characterCard', status: { in: ['confirmed', 'inferred'] } },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      select: { title: true, content: true, status: true, updatedAt: true },
      take: 80,
    }),
  ])

  const idempotencyKeys = chapters.map((chapter) => `${chapter.id}:${chapter.revision}`)
  const existingJobs = await prisma.memoryExtractionJob.findMany({
    where: { novelId, idempotencyKey: { in: idempotencyKeys } },
    select: { id: true, idempotencyKey: true, status: true, leaseUntil: true },
  })
  const jobsByKey = new Map(existingJobs.map((job) => [job.idempotencyKey, job]))
  const queuedJobIds: string[] = []
  for (const chapter of chapters) {
    const key = `${chapter.id}:${chapter.revision}`
    const existing = jobsByKey.get(key)
    if (!existing) {
      queuedJobIds.push(await enqueueChapterMemoryExtraction({
        novelId, chapterId: chapter.id, chapterRevision: chapter.revision, before: '', after: chapter.content,
      }))
    } else if (existing.status === 'pending' || existing.status === 'failed' && (!existing.leaseUntil || existing.leaseUntil < new Date())) {
      queuedJobIds.push(existing.id)
      queueMicrotask(() => void processMemoryExtractionJob(existing.id).catch(() => {}))
    }
  }

  const projectionVersion = createHash('sha256').update([
    ...chapters.map((chapter) => `${chapter.id}:${chapter.revision}`),
    ...characterCards.map((card) => `${card.title}:${card.status}:${card.updatedAt.toISOString()}`),
  ].join('|')).digest('hex').slice(0, 20)
  const currentEntityCount = await prisma.storyEntity.count({ where: { novelId } })
  if (currentEntityCount > 0 && memoryProjectionVersionCache.get(novelId) === projectionVersion) {
    return { chapterCount: chapters.length, jobCount: queuedJobIds.length, entityCount: currentEntityCount, relationCount: 0 }
  }

  const mentions = new Map<string, { count: number; chapterIds: Set<string>; description?: string; status: StoryMemoryStatus }>()
  for (const card of characterCards) {
    const name = card.title.trim()
    if (!name || name.length > 32) continue
    mentions.set(name, { count: 10, chapterIds: new Set(), description: card.content, status: card.status })
  }
  const chapterNames = new Map<string, string[]>()
  for (const chapter of chapters) {
    const names = extractCharacterNames(chapter.content)
    chapterNames.set(chapter.id, names)
    for (const name of names) {
      const current = mentions.get(name) ?? { count: 0, chapterIds: new Set<string>(), status: 'inferred' as StoryMemoryStatus }
      current.count += 1
      current.chapterIds.add(chapter.id)
      mentions.set(name, current)
    }
  }

  const selectedNames = [...mentions.entries()]
    .filter(([, item]) => item.description || item.count >= 2 || item.chapterIds.size >= 2)
    .sort((left, right) => right[1].count - left[1].count || right[1].chapterIds.size - left[1].chapterIds.size)
    .slice(0, 36)
  const entities = new Map<string, { id: string }>()
  for (const [name, item] of selectedNames) {
    const entity = await prisma.storyEntity.upsert({
      where: { novelId_entityType_canonicalName: { novelId, entityType: 'character', canonicalName: name } },
      create: {
        novelId, entityType: 'character', canonicalName: name,
        description: item.description ?? `从正文中自动识别，出现于 ${item.chapterIds.size} 个章节。`,
        status: item.status,
      },
      update: item.description ? { description: item.description, status: item.status } : {},
      select: { id: true },
    })
    entities.set(name, entity)
  }

  await prisma.entityRelation.deleteMany({
    where: {
      relationType: '同章出现',
      state: '正文共现（待 Agent 进一步确认关系）',
      fromEntity: { novelId },
    },
  })

  let relationCount = 0
  for (const chapter of chapters) {
    const names = (chapterNames.get(chapter.id) ?? []).filter((name) => entities.has(name)).slice(0, 8)
    for (let left = 0; left < names.length && relationCount < 160; left += 1) {
      for (let right = left + 1; right < names.length && relationCount < 160; right += 1) {
        const from = entities.get(names[left])!
        const to = entities.get(names[right])!
        const existing = await prisma.entityRelation.findFirst({
          where: { fromEntityId: from.id, toEntityId: to.id, relationType: '同章出现', validFrom: chapter.orderIndex },
          select: { id: true },
        })
        const data = {
          state: '正文共现（待 Agent 进一步确认关系）', validTo: chapter.orderIndex,
          confidence: 0.55, sourceId: chapter.id, revision: chapter.revision,
        }
        if (existing) await prisma.entityRelation.update({ where: { id: existing.id }, data })
        else await prisma.entityRelation.create({
          data: {
            fromEntityId: from.id, toEntityId: to.id, relationType: '同章出现', validFrom: chapter.orderIndex, ...data,
          },
        })
        relationCount += 1
      }
    }
  }

  rememberMemoryProjectionVersion(novelId, projectionVersion)
  return { chapterCount: chapters.length, jobCount: queuedJobIds.length, entityCount: entities.size, relationCount }
}

export async function listMemoryReviewInbox(userId: string, novelId: string) {
  const novel = await prisma.novel.findFirst({ where: { id: novelId, authorId: userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权查看记忆。')
  return prisma.projectMemoryEntry.findMany({
    where: { novelId, OR: [{ reviewStatus: 'pending' }, { status: 'conflicted' }] },
    include: { evidence: true }, orderBy: { updatedAt: 'desc' },
  })
}

export async function getMemoryGraph(userId: string, novelId: string): Promise<MemoryGraph> {
  const novel = await prisma.novel.findFirst({ where: { id: novelId, authorId: userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权查看记忆。')

  const entities = await prisma.storyEntity.findMany({
    where: { novelId, status: { in: ['confirmed', 'inferred', 'conflicted'] } },
    include: { aliases: { orderBy: { alias: 'asc' } }, relationsFrom: true },
    orderBy: [{ updatedAt: 'desc' }, { canonicalName: 'asc' }],
    take: 240,
  })
  const nodeIds = new Set(entities.map((entity) => entity.id))
  const edges = entities
    .flatMap((entity) => entity.relationsFrom)
    .filter((relation) => nodeIds.has(relation.toEntityId))
    .slice(0, 600)
  const latestEntityAt = entities[0]?.updatedAt ?? new Date(0)
  const version = createHash('sha256')
    .update([
      ...entities.map((entity) => `${entity.id}:${entity.updatedAt.toISOString()}`),
      ...edges.map((edge) => `${edge.id}:${edge.state ?? ''}:${edge.confidence}`),
    ].join('|'))
    .digest('hex')
    .slice(0, 16)

  return {
    novelId,
    version: version || 'empty',
    updatedAt: latestEntityAt.toISOString(),
    nodes: entities.map((entity) => ({
      id: entity.id,
      type: entity.entityType,
      label: entity.canonicalName,
      description: entity.description,
      status: entity.status,
      aliases: entity.aliases.map((alias) => alias.alias),
      updatedAt: entity.updatedAt.toISOString(),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.fromEntityId,
      target: edge.toEntityId,
      type: edge.relationType,
      state: edge.state,
      confidence: edge.confidence,
      sourceId: edge.sourceId,
    })),
  }
}

export async function resolveMemoryReview(userId: string, memoryId: string, accepted: boolean) {
  const memory = await prisma.projectMemoryEntry.findFirst({ where: { id: memoryId, novel: { authorId: userId } } })
  if (!memory) throw new DataAccessError(404, 'MEMORY_NOT_FOUND', '记忆候选不存在。')
  return prisma.projectMemoryEntry.update({
    where: { id: memory.id },
    data: { reviewStatus: accepted ? 'accepted' : 'rejected', status: accepted ? 'confirmed' : 'invalid', confidence: accepted ? 1 : memory.confidence },
  })
}

export async function saveEntityRelation(input: {
  userId: string; novelId: string; fromName: string; toName: string; relationType: string; state?: string
  validFrom?: number; validTo?: number; sourceId: string; revision?: number; confidence: number
}) {
  const novel = await prisma.novel.findFirst({ where: { id: input.novelId, authorId: input.userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权写入关系。')
  const [from, to] = await prisma.$transaction([
    prisma.storyEntity.upsert({
      where: { novelId_entityType_canonicalName: { novelId: input.novelId, entityType: 'character', canonicalName: input.fromName.trim() } },
      create: { novelId: input.novelId, entityType: 'character', canonicalName: input.fromName.trim(), status: 'inferred' }, update: {},
    }),
    prisma.storyEntity.upsert({
      where: { novelId_entityType_canonicalName: { novelId: input.novelId, entityType: 'character', canonicalName: input.toName.trim() } },
      create: { novelId: input.novelId, entityType: 'character', canonicalName: input.toName.trim(), status: 'inferred' }, update: {},
    }),
  ])
  const existing = await prisma.entityRelation.findFirst({
    where: { fromEntityId: from.id, toEntityId: to.id, relationType: input.relationType, validFrom: input.validFrom ?? null },
  })
  const relation = existing
    ? await prisma.entityRelation.update({
        where: { id: existing.id },
        data: { state: input.state, validTo: input.validTo, confidence: input.confidence, sourceId: input.sourceId, revision: input.revision },
      })
    : await prisma.entityRelation.create({
        data: {
          fromEntityId: from.id, toEntityId: to.id, relationType: input.relationType,
          state: input.state, validFrom: input.validFrom, validTo: input.validTo,
          confidence: input.confidence, sourceId: input.sourceId, revision: input.revision,
        },
      })
  await saveStoryMemory({
    userId: input.userId, novelId: input.novelId, memoryType: 'relationshipState', layer: 'L2',
    title: `${input.fromName}→${input.toName}:${input.relationType}`,
    content: `${input.fromName}与${input.toName}的关系为${input.relationType}${input.state ? `，当前状态：${input.state}` : ''}`,
    importance: 75, confidence: input.confidence, status: input.confidence >= 0.95 ? 'confirmed' : 'inferred',
    evidence: { sourceType: input.revision ? 'chapter' : 'author_input', sourceId: input.sourceId, revision: input.revision, confidence: input.confidence },
  })
  return relation
}

export async function saveStoryEvent(input: {
  userId: string; novelId: string; title: string; description: string; storyTime?: string; location?: string
  participants: string[]; causes: string[]; effects: string[]; sourceId: string; revision?: number; confidence: number
}) {
  const novel = await prisma.novel.findFirst({ where: { id: input.novelId, authorId: input.userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权写入事件。')
  const event = await prisma.storyEvent.create({
    data: {
      novelId: input.novelId, title: input.title.trim(), description: input.description.trim(),
      storyTime: input.storyTime, location: input.location, participants: input.participants,
      causes: input.causes, effects: input.effects, sourceId: input.sourceId, revision: input.revision,
      status: input.confidence >= 0.95 ? 'confirmed' : 'inferred',
    },
  })
  await saveStoryMemory({
    userId: input.userId, novelId: input.novelId, memoryType: 'timelineEvent', layer: 'L1',
    title: input.title, content: `${input.storyTime ? `时间：${input.storyTime}；` : ''}${input.location ? `地点：${input.location}；` : ''}${input.description}`,
    importance: 75, confidence: input.confidence, status: input.confidence >= 0.95 ? 'confirmed' : 'inferred',
    evidence: { sourceType: input.revision ? 'chapter' : 'author_input', sourceId: input.sourceId, revision: input.revision, confidence: input.confidence },
  })
  return event
}
