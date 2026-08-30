import { createHash } from 'node:crypto'

import type { ProjectMemoryType, StoryMemoryLayer, StoryMemoryStatus } from '@prisma/client'
import { z } from 'zod'

import type { MemoryEvidence, MemoryGraph, MemorySearchHit } from '../../../shared/contracts/index.js'
import { generateTextCompletion } from '../ai-service.js'
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

const memoryProjectionInFlight = new Map<string, Promise<Awaited<ReturnType<typeof syncNovelMemoryProjectionOnce>>>>()
const MEMORY_GRAPH_REFRESH_COOLDOWN_MS = 10 * 60 * 1000
const AI_GRAPH_DESCRIPTION_PREFIX = '[AI关系网] '

const aiGraphEnvelopeSchema = z.object({
  entities: z.array(z.object({
    type: z.enum(['character', 'location', 'organization', 'item', 'event', 'concept']),
    name: z.string().min(1).max(128),
    aliases: z.array(z.string().min(1).max(128)).max(12).default([]),
    description: z.string().max(1200).default(''),
  })).max(80),
  relations: z.array(z.object({
    from: z.string().min(1).max(128),
    to: z.string().min(1).max(128),
    type: z.string().min(1).max(64),
    state: z.string().max(800).default(''),
    confidence: z.number().min(0).max(1).default(0.8),
  })).max(180),
})

function parseJsonObject(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1] ?? raw
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  return JSON.parse(start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced)
}

function normalizedEntityKey(value: string) {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s·•._—-]+/g, '').replace(/[「」“”'‘’（）()]/g, '')
}

function isUsefulEntityName(type: string, value: string) {
  const name = value.trim()
  if (!name || name.length > 128) return false
  if (type === 'character' && /^(他|她|它|那人|此人|有人|男人|女人|少年|少女|老人|老者|主角|配角|路人|众人|对方|自己|我|你|您|他们|她们)$/.test(name)) return false
  return !/^(这里|那里|此处|某处|东西|物品|事件|地点|组织|未知|暂无|无)$/.test(name)
}

/**
 * 用低推理模型从正文建立“整部小说关系网”。只在图谱为空时自动执行；手动刷新受服务端冷却限制。
 * 关系网覆盖人物、地点、组织、物件、事件与概念，模型同时负责别名归一，避免规则抽取把代词/残句当人物。
 */
async function syncNovelMemoryProjectionOnce(userId: string, novelId: string, force = false) {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, authorId: userId },
    select: { id: true, title: true, summary: true, categoryName: true, tagNames: true },
  })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或无权更新关系网。')

  const existingEntityCount = await prisma.storyEntity.count({ where: { novelId } })
  if (!force && existingEntityCount > 0) {
    return { chapterCount: 0, jobCount: 0, entityCount: existingEntityCount, relationCount: await prisma.entityRelation.count({ where: { fromEntity: { novelId } } }), reused: true }
  }
  if (force) {
    const latest = await prisma.aiUsageLog.findFirst({
      where: { userId, novelId, action: 'agentMemoryGraphBuild' },
      orderBy: { createdAt: 'desc' }, select: { createdAt: true },
    })
    if (latest && Date.now() - latest.createdAt.getTime() < MEMORY_GRAPH_REFRESH_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((MEMORY_GRAPH_REFRESH_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime())) / 1000)
      throw new DataAccessError(429, 'MEMORY_GRAPH_RATE_LIMITED', `关系网刚刚更新过，请 ${Math.ceil(waitSeconds / 60)} 分钟后再试。`)
    }
  }

  const chapters = await prisma.chapter.findMany({
    where: { novelId, content: { not: '' } }, orderBy: { orderIndex: 'asc' },
    select: { id: true, title: true, content: true, revision: true, orderIndex: true }, take: 120,
  })
  if (chapters.length === 0) return { chapterCount: 0, jobCount: 0, entityCount: existingEntityCount, relationCount: 0, reused: true }

  const chapterContext = chapters.map((chapter) =>
    `【第${chapter.orderIndex}章 ${chapter.title}】\n${chapter.content.slice(0, 2600)}`,
  ).join('\n\n')
  const response = await generateTextCompletion(
    `你是中文长篇小说的关系网编辑。请从正文建立全书级知识关系网，不只抽人物。实体类型只能是 character/location/organization/item/event/concept。\n严格规则：\n1. 合并同一实体的全名、简称、称谓和错别字到 aliases，禁止把“他/她/那人/众人/主角”等代词或泛称建成实体；禁止把残句、动作和形容词当名字。\n2. 关系必须有正文依据，使用具体中文关系词（亲属、同盟、敌对、隶属、位于、持有、参与、导致、知晓、追求等），不要用“同章出现”。\n3. description/state 只写已发生或明确设定，不推测后续剧情。\n4. 控制密度：保留影响主线、人物行动、世界规则和伏笔的实体，最多 60 个实体、140 条关系。\n只输出 JSON：{"entities":[{"type":"character|location|organization|item|event|concept","name":"规范名","aliases":["别名"],"description":"简洁事实"}],"relations":[{"from":"规范名或别名","to":"规范名或别名","type":"关系","state":"当前状态/依据","confidence":0.0}]}`,
    `作品：${novel.title}\n简介：${novel.summary || '无'}\n分类：${novel.categoryName || '未设置'}\n标签：${novel.tagNames.join('、') || '无'}\n\n${chapterContext}`,
    { userId, novelId, action: 'agentMemoryGraphBuild', targetType: 'novel', targetId: novelId, temperature: 0.1, reasoningEffort: 'low' },
  )
  const parsed = aiGraphEnvelopeSchema.parse(parseJsonObject(response))
  const selectedEntities = parsed.entities.filter((entity) => isUsefulEntityName(entity.type, entity.name))
  const sourceId = `ai-graph:${createHash('sha256').update(chapters.map((chapter) => `${chapter.id}:${chapter.revision}`).join('|')).digest('hex').slice(0, 24)}`

  const stale = await prisma.storyEntity.findMany({
    where: { novelId, status: 'inferred', OR: [{ description: { startsWith: AI_GRAPH_DESCRIPTION_PREFIX } }, { description: { startsWith: '从正文中自动识别' } }] },
    select: { id: true },
  })
  if (stale.length > 0) await prisma.storyEntity.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } })
  await prisma.entityRelation.deleteMany({ where: { fromEntity: { novelId }, sourceId: { startsWith: 'ai-graph:' } } })

  const entityByKey = new Map<string, { id: string; canonicalName: string }>()
  for (const item of selectedEntities) {
    const canonicalName = item.name.trim()
    const entity = await prisma.storyEntity.upsert({
      where: { novelId_entityType_canonicalName: { novelId, entityType: item.type, canonicalName } },
      create: { novelId, entityType: item.type, canonicalName, description: `${AI_GRAPH_DESCRIPTION_PREFIX}${item.description}`.trim(), status: 'inferred' },
      update: { description: `${AI_GRAPH_DESCRIPTION_PREFIX}${item.description}`.trim() },
      select: { id: true, canonicalName: true },
    })
    entityByKey.set(normalizedEntityKey(canonicalName), entity)
    for (const alias of [...new Set([canonicalName, ...item.aliases.map((value) => value.trim())])].filter(Boolean)) {
      entityByKey.set(normalizedEntityKey(alias), entity)
      await prisma.entityAlias.upsert({ where: { entityId_alias: { entityId: entity.id, alias } }, create: { entityId: entity.id, alias, sourceId }, update: { sourceId } })
    }
  }

  let relationCount = 0
  for (const relation of parsed.relations) {
    const from = entityByKey.get(normalizedEntityKey(relation.from))
    const to = entityByKey.get(normalizedEntityKey(relation.to))
    if (!from || !to || from.id === to.id) continue
    const relationType = relation.type.trim()
    const existing = await prisma.entityRelation.findFirst({
      where: { fromEntityId: from.id, toEntityId: to.id, relationType, validFrom: null },
      select: { id: true },
    })
    if (existing) {
      await prisma.entityRelation.update({
        where: { id: existing.id },
        data: { state: relation.state.trim(), confidence: relation.confidence, sourceId },
      })
    } else {
      await prisma.entityRelation.create({
        data: { fromEntityId: from.id, toEntityId: to.id, relationType, state: relation.state.trim(), confidence: relation.confidence, sourceId },
      })
    }
    relationCount += 1
  }
  return { chapterCount: chapters.length, jobCount: 0, entityCount: new Set([...entityByKey.values()].map((item) => item.id)).size, relationCount, reused: false }
}

/** 同一作品的桌面/手机隐藏视图可能同时请求同步；服务端合并为一条事务链，避免重复重建关系。 */
export function syncNovelMemoryProjection(userId: string, novelId: string, options: { force?: boolean } = {}) {
  const key = `${userId}:${novelId}:${options.force ? 'force' : 'auto'}`
  const running = memoryProjectionInFlight.get(key)
  if (running) return running
  const task = syncNovelMemoryProjectionOnce(userId, novelId, options.force === true)
  memoryProjectionInFlight.set(key, task)
  const release = () => {
    if (memoryProjectionInFlight.get(key) === task) memoryProjectionInFlight.delete(key)
  }
  void task.then(release, release)
  return task
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
