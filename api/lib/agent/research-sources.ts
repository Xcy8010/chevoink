import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { taskSpecSchema } from '../../../shared/contracts/task-spec-contracts.js'
import { DataAccessError, prisma } from '../prisma.js'
import { parsePublicHttpUrl } from '../public-http.js'
import { assessReaderText } from '../web-reader-quality.js'
import type { WebReadResult } from '../web-reader-service.js'
import { countReportChineseCharacters } from '../../../shared/agent-output.js'

type Scope = { userId: string; sessionId: string; novelId: string; runId: string }

const savedLinksSchema = z.array(z.object({ url: z.string().min(1).max(8192), title: z.string().min(1).max(160) }).strict()).max(4096)
function checkedSavedLinks(value: unknown, finalUrl: string) {
  const origin = new URL(finalUrl).origin
  return savedLinksSchema.parse(value ?? []).map(link => {
    const url = canonicalResearchUrl(link.url)
    if (new URL(url).origin !== origin) throw new DataAccessError(422, 'RESEARCH_LINK_INVALID', '保存链接不是来源页面的同源链接。')
    return { ...link, url }
  })
}

const reportCitationSchema = z.object({ contentRef: z.string().min(1).max(64), revision: z.string().regex(/^[a-f0-9]{64}$/),
  start: z.number().int().nonnegative(), end: z.number().int().positive(), excerptHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const reportSectionSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), order: z.number().int().min(0).max(100),
  content: z.string().min(1).max(60_000), citations: z.array(reportCitationSchema).max(100) }).strict()
const reportStateSchema = z.object({ kind: z.literal('researchReport'), taskKey: z.string(), revision: z.number().int().positive(),
  sections: z.array(reportSectionSchema).max(100) }).strict()
export const researchReportSaveParameters = z.object({ reportId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).default('main'),
  title: z.string().trim().min(1).max(160), expectedRevision: z.number().int().nonnegative(), section: reportSectionSchema }).strict()

/** Save only the addressed section. A replay cannot append it twice, and a
 * stale revision cannot overwrite a newer report. No chapter/plan writes. */
export async function saveResearchReportSection(scope: Scope, input: {
  reportId: string; title: string; expectedRevision: number; section: z.infer<typeof reportSectionSchema>;
}) {
  const parsed = researchReportSaveParameters.parse(input)
  return prisma.$transaction(async tx => {
    // Share the legacy run's row lock with pause/stop. A committed stop cannot
    // be followed by a late report write from that execution.
    await tx.$queryRaw`SELECT id FROM agent_runs WHERE id = ${scope.runId} AND user_id = ${scope.userId} FOR UPDATE`
    const { taskKey, run } = await ownedTask(tx, scope)
    const spec = taskSpecSchema.parse(run.taskSpec)
    if (spec.intent !== 'research_analysis' || spec.authorization || run.runtimeProtocolVersion !== 0) {
      throw new DataAccessError(403, 'RESEARCH_REPORT_NOT_AUTHORIZED', '当前执行入口没有研究报告保存权限。')
    }
    if (run.status !== 'running') throw new DataAccessError(409, 'RESEARCH_RUN_NOT_ACTIVE', '任务已停止，报告未被修改。')
    const id = hash(JSON.stringify(['research-report', scope.userId, scope.sessionId, taskKey, parsed.reportId]))
    const previous = await tx.agentArtifact.findUnique({ where: { id } })
    const state = previous ? reportStateSchema.parse(previous.metadata) : null
    if (previous && (previous.artifactType !== 'researchReport' || state?.taskKey !== taskKey
      || !(await tx.agentRun.findFirst({ where: { id: previous.runId, userId: scope.userId, sessionId: scope.sessionId, novelId: scope.novelId } })))) return denied()
    if (previous && state!.sections.map(section => section.content).join('\n\n') !== previous.content) {
      throw new DataAccessError(409, 'RESEARCH_REPORT_INVALID', '报告内容与区块版本不一致，未覆盖原报告。')
    }
    const priorSection = state?.sections.find(section => section.id === parsed.section.id)
    if (previous && previous.title === parsed.title && JSON.stringify(priorSection) === JSON.stringify(parsed.section)) {
      return { artifactId: id, revision: state!.revision, chineseCharacters: countReportChineseCharacters(previous.content), replayed: true }
    }
    if ((state?.revision ?? 0) !== parsed.expectedRevision) throw new DataAccessError(409, 'RESEARCH_REPORT_CONFLICT', '报告已更新，请读取当前版本后仅修订目标区块。')
    for (const citation of parsed.section.citations) {
      const content = await tx.agentResearchContent.findUnique({ where: { id: citation.contentRef } })
      if (!content) return denied()
      await ownedSource(tx, scope, content.sourceId)
      if (content.revision !== citation.revision || hash(content.text) !== content.contentHash || citation.end <= citation.start
        || citation.end > content.text.length || citation.end - citation.start > 6000
        || hash(content.text.slice(citation.start, citation.end)) !== citation.excerptHash) {
        throw new DataAccessError(409, 'RESEARCH_CITATION_INVALID', '引用与保存的原文版本或范围不一致。')
      }
    }
    const sections = [...(state?.sections.filter(section => section.id !== parsed.section.id) ?? []), parsed.section]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    if (sections.length > 100 || new Set(sections.map(section => section.order)).size !== sections.length) {
      throw new DataAccessError(400, 'RESEARCH_REPORT_SECTION_INVALID', '报告区块顺序重复或区块数量超限。')
    }
    const content = sections.map(section => section.content).join('\n\n')
    if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) throw new DataAccessError(413, 'RESEARCH_REPORT_TOO_LARGE', '报告超过保存上限。')
    const revision = (state?.revision ?? 0) + 1
    const metadata = { kind: 'researchReport', taskKey, revision, sections }
    if (previous) await tx.agentArtifact.update({ where: { id }, data: { title: parsed.title, content, metadata } })
    else await tx.agentArtifact.create({ data: { id, runId: scope.runId, artifactType: 'researchReport', title: parsed.title, content, metadata } })
    return { artifactId: id, revision, chineseCharacters: countReportChineseCharacters(content), replayed: false }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

type ReportReadInput = { reportId?: string; offset?: number; limit?: number; expectedRevision?: number }

export function readResearchReport(scope: Scope, input: ReportReadInput) {
  return loadResearchReport(scope, input, false)
}

/** Server-only final delivery: one owned, consistent snapshot, not hundreds of
 * model reads or a second paid generation. The saved report already has a 2MiB cap. */
export function readResearchReportForDelivery(scope: Scope) {
  return loadResearchReport(scope, {}, true)
}

async function loadResearchReport(scope: Scope, input: ReportReadInput, complete: boolean) {
  const parsed = z.object({ reportId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).default('main'),
    offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(6000).default(6000),
    expectedRevision: z.number().int().nonnegative().optional() }).parse(input)
  return prisma.$transaction(async tx => {
    const { taskKey } = await ownedTask(tx, scope)
    const id = hash(JSON.stringify(['research-report', scope.userId, scope.sessionId, taskKey, parsed.reportId]))
    const report = await tx.agentArtifact.findFirst({ where: { id, artifactType: 'researchReport',
      run: { userId: scope.userId, sessionId: scope.sessionId, novelId: scope.novelId } } })
    if (!report) {
      if (parsed.expectedRevision !== undefined && parsed.expectedRevision !== 0) {
        throw new DataAccessError(409, 'RESEARCH_REPORT_CONFLICT', '报告版本已失效，请重新读取区块清单。')
      }
      return { reportId: parsed.reportId, revision: 0, sections: [], content: '', chineseCharacters: 0, nextOffset: null }
    }
    const state = reportStateSchema.parse(report.metadata)
    if (parsed.expectedRevision !== undefined && parsed.expectedRevision !== state.revision) {
      throw new DataAccessError(409, 'RESEARCH_REPORT_CONFLICT', '报告已更新，请从当前版本重新读取，不能拼接不同版本的正文。')
    }
    if (state.taskKey !== taskKey || state.sections.map(section => section.content).join('\n\n') !== report.content) {
      throw new DataAccessError(409, 'RESEARCH_REPORT_INVALID', '报告内容与区块版本不一致。')
    }
    if (parsed.offset > report.content.length) throw new DataAccessError(400, 'RESEARCH_REPORT_OFFSET_INVALID', '报告读取位置超出正文范围。')
    const end = complete ? report.content.length : Math.min(report.content.length, parsed.offset + parsed.limit)
    const sourceScope = { taskKey, ownerRun: { userId: scope.userId, sessionId: scope.sessionId, novelId: scope.novelId } }
    const evidence = complete ? await Promise.all([
      tx.agentResearchSource.count({ where: sourceScope }),
      tx.agentResearchSource.count({ where: { ...sourceScope, versions: { some: { contentKind: 'article' } } } }),
      tx.agentResearchSource.count({ where: { ...sourceScope, versions: { some: { contentKind: 'metadata' } } } }),
      tx.agentResearchSource.count({ where: { ...sourceScope, readFailure: { not: Prisma.DbNull } } }),
    ]).then(([discoveredPages, readablePages, metadataPages, failedSources]) => ({ discoveredPages, readablePages, metadataPages, failedSources,
      citedVersions: new Set(state.sections.flatMap(section => section.citations.map(citation => `${citation.contentRef}:${citation.revision}`))).size })) : undefined
    return { reportId: parsed.reportId, artifactId: report.id, title: report.title, revision: state.revision,
      sections: state.sections.map(section => ({ id: section.id, order: section.order })),
      content: report.content.slice(parsed.offset, end), offset: parsed.offset, totalChars: report.content.length,
      chineseCharacters: countReportChineseCharacters(report.content), nextOffset: end < report.content.length ? end : null, evidence }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const denied = (): never => { throw new DataAccessError(404, 'RESEARCH_SOURCE_NOT_FOUND', '来源不存在或不属于当前任务。') }

/** Never merge chapter/page/signature parameters or expose credential hashes. */
export function canonicalResearchUrl(value: string): string {
  let url: URL
  try { url = parsePublicHttpUrl(value, true) }
  catch { throw new DataAccessError(422, 'WEB_READ_UNSAFE_URL', '来源地址未通过公开网页校验。') }
  const signed = [...url.searchParams.keys()].some(key => /token|signature|credential|authorization|^sig$|^x-amz-/i.test(key))
  if (!signed) for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_source|utm_medium|utm_campaign|utm_term|utm_content|gclid|fbclid)$/i.test(key)) url.searchParams.delete(key)
  }
  return url.href
}

async function ownedTask(tx: Prisma.TransactionClient, scope: Scope) {
  const run = await tx.agentRun.findFirst({ where: { id: scope.runId, userId: scope.userId,
    sessionId: scope.sessionId, novelId: scope.novelId, novel: { authorId: scope.userId } } })
  if (!run) return denied()
  const spec = run.taskSpec == null ? null : taskSpecSchema.safeParse(run.taskSpec)
  if (spec && (!spec.success || spec.data.scope.novelId !== scope.novelId)) return denied()
  return { taskKey: run.taskRootId ?? (spec?.success ? spec.data.id : run.id), run }
}

async function ownedSource(tx: Prisma.TransactionClient, scope: Scope, sourceId: string) {
  const { taskKey } = await ownedTask(tx, scope)
  const source = await tx.agentResearchSource.findFirst({ where: { id: sourceId, taskKey,
    ownerRun: { userId: scope.userId, sessionId: scope.sessionId, novelId: scope.novelId } } })
  if (!source || hash(source.canonicalUrl) !== source.urlHash) return denied()
  return source
}

/** Web reads may follow discovered links or a URL explicitly supplied by the
 * author, never invent a chapter ID. This is provenance, not proof of content. */
export async function assertResearchUrlProvenance(scope: Scope, value: string) {
  const url = canonicalResearchUrl(value)
  return prisma.$transaction(async tx => {
    const { taskKey, run } = await ownedTask(tx, scope)
    const spec = taskSpecSchema.safeParse(run.taskSpec)
    const source = await tx.agentResearchSource.findFirst({ where: { taskKey, canonicalUrl: url,
      ownerRun: { userId: scope.userId, sessionId: scope.sessionId, novelId: scope.novelId } } })
    if (source) return
    const messages = await tx.agentMessage.findMany({ where: { sessionId: scope.sessionId, role: 'user',
      run: { userId: scope.userId, novelId: scope.novelId, ...(spec.success
        ? { taskSpec: { path: ['id'], equals: spec.data.id } } : { id: scope.runId }) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 32, select: { parts: true } })
    for (const message of messages) for (const part of Array.isArray(message.parts) ? message.parts : []) {
      if (!part || typeof part !== 'object' || Array.isArray(part) || part.type !== 'text' || typeof part.text !== 'string') continue
      for (const match of part.text.matchAll(/https?:\/\/[^\s<>"'）】。，；！]+/gu)) {
        for (const candidate of [match[0], match[0].replace(/[)\],.!?]+$/u, '')]) {
          try { if (canonicalResearchUrl(candidate) === url) return } catch { /* Not an eligible public URL. */ }
        }
      }
    }
    throw new DataAccessError(422, 'WEB_READ_UNDISCOVERED_URL', '该地址不在本任务的搜索结果、已读取页面链接或用户提供的链接中。本次未联网；请搜索真实链接，不要猜测书籍或章节编号。')
  })
}

/** URL registration is discovery only, not a claim that its body was fetched. */
export async function registerResearchSource(scope: Scope, url: string, title = '') {
  return (await registerResearchSources(scope, [{ url, title }]))[0]
}

/** A bounded discovery batch shares one ownership check and transaction. */
export async function registerResearchSources(scope: Scope, entries: ReadonlyArray<{ url: string; title: string }>) {
  if (entries.length < 1 || entries.length > 8) throw new DataAccessError(400, 'RESEARCH_SOURCE_BATCH_INVALID', '来源批次必须为1至8项。')
  const sources = entries.map(entry => ({ canonicalUrl: canonicalResearchUrl(entry.url), title: entry.title.slice(0, 300) }))
  return prisma.$transaction(async tx => {
    const { taskKey } = await ownedTask(tx, scope)
    return Promise.all(sources.map(({ canonicalUrl, title }) => {
      const urlHash = hash(canonicalUrl)
      const id = hash(JSON.stringify([scope.userId, scope.sessionId, scope.novelId, taskKey, urlHash]))
      return tx.agentResearchSource.upsert({ where: { id }, update: {}, create: {
        id, ownerRunId: scope.runId, taskKey, urlHash, canonicalUrl, title,
      } })
    }))
  })
}

export async function resolveResearchSource(scope: Scope, sourceId: string) {
  return prisma.$transaction(tx => ownedSource(tx, scope, sourceId))
}

/** A continuation reads its saved snapshot unless an explicit refresh is
 * requested. No network request, quota reset, or cross-task content cache. */
export async function findSavedResearchContent(scope: Scope, sourceId: string) {
  return prisma.$transaction(async tx => {
    await ownedSource(tx, scope, sourceId)
    return tx.agentResearchContent.findFirst({ where: { sourceId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, revision: true } })
  })
}

/** Look up before reserving a new fetch: an existing negative cache is not a request. */
export async function findResearchSource(scope: Scope, value: string) {
  const canonicalUrl = canonicalResearchUrl(value)
  return prisma.$transaction(async tx => {
    const { taskKey } = await ownedTask(tx, scope)
    const id = hash(JSON.stringify([scope.userId, scope.sessionId, scope.novelId, taskKey, hash(canonicalUrl)]))
    const source = await tx.agentResearchSource.findUnique({ where: { id } })
    return source ? ownedSource(tx, scope, id) : null
  })
}

const failureSchema = z.object({
  code: z.enum(['WEB_READ_NOT_FOUND', 'WEB_READ_BLOCKED', 'WEB_READ_GARBLED', 'WEB_READ_RATE_LIMITED',
    'WEB_READ_INSUFFICIENT', 'WEB_READ_UNAVAILABLE', 'WEB_READ_HOSTED_UNAVAILABLE',
    'WEB_READ_TOO_LARGE', 'WEB_READ_UNSAFE_URL', 'WEB_READ_UNSUPPORTED_TYPE', 'WEB_READ_HTTP_ERROR',
    'WEB_READ_SOURCE_ERROR', 'WEB_READ_PROTOCOL_ERROR', 'WEB_READ_PARSE_ERROR',
    'WEB_READ_COMPLEX_DOCUMENT', 'WEB_READ_HOSTED_TARGET_RESTRICTED']),
  retryAt: z.string().datetime(),
}).strict()

export async function getResearchReadFailure(scope: Scope, sourceId: string) {
  return prisma.$transaction(async tx => {
    const source = await ownedSource(tx, scope, sourceId)
    if (source.readFailure === null) return null
    const parsed = failureSchema.safeParse(source.readFailure)
    if (!parsed.success) throw new DataAccessError(409, 'RESEARCH_SOURCE_STATE_INVALID', '来源读取状态异常，未重新访问网站。')
    return Date.parse(parsed.data.retryAt) > Date.now() ? parsed.data : null
  })
}

/** Preserve access denials across resume without storing raw provider responses.
 * 429 Retry-After is a lower bound, not a delay the model may choose to ignore. */
export async function recordResearchReadFailure(scope: Scope, sourceId: string, result: WebReadResult) {
  if (result.status === 'ok' || !failureSchema.shape.code.safeParse(result.code).success) return
  const now = Date.now()
  let retryAt = now + (result.retryable ? 60_000 : 5 * 60_000)
  if (result.code === 'WEB_READ_RATE_LIMITED') {
    const header = result.retryAfter?.trim() ?? ''
    const seconds = /^\d+$/.test(header) ? Number(header) : NaN
    const requested = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(header)
    retryAt = Number.isFinite(requested) && requested > now && requested <= 8.64e15 ? requested : now + 60_000
  }
  await prisma.$transaction(async tx => {
    await ownedSource(tx, scope, sourceId)
    await tx.$queryRaw`SELECT id FROM agent_research_sources WHERE id = ${sourceId} FOR UPDATE`
    const source = await ownedSource(tx, scope, sourceId)
    const previous = failureSchema.safeParse(source.readFailure)
    // A late timeout must not shorten a Retry-After already received by another attempt.
    if (previous.success && Date.parse(previous.data.retryAt) > retryAt) return
    await tx.agentResearchSource.update({ where: { id: sourceId }, data: { readFailure: { code: result.code, retryAt: new Date(retryAt).toISOString() } } })
  })
}

/** Immutable successful extraction, not an analysis/coverage receipt. Failed,
 * restricted or garbled pages cannot enter the readable content store. */
export async function saveResearchContent(scope: Scope, sourceId: string, result: WebReadResult) {
  const checked = assessReaderText(result.text, result.title)
  if (result.status !== 'ok' || !result.quality.readable || checked.status !== 'ok'
    || !['article', 'metadata'].includes(result.contentKind)) {
    throw new DataAccessError(422, 'RESEARCH_CONTENT_UNREADABLE', '未取得合格正文，不能保存为已获取内容。')
  }
  if (Buffer.byteLength(result.text, 'utf8') > 2 * 1024 * 1024) throw new DataAccessError(413, 'RESEARCH_CONTENT_TOO_LARGE', '提取内容超过保存上限。')
  const finalUrl = canonicalResearchUrl(result.finalUrl)
  const links = checkedSavedLinks(result.links, finalUrl)
  const contentHash = hash(result.text)
  const revision = hash(JSON.stringify([contentHash, finalUrl, result.contentKind]))
  return prisma.$transaction(async tx => {
    await ownedSource(tx, scope, sourceId)
    await tx.agentResearchSource.update({ where: { id: sourceId }, data: { readFailure: Prisma.DbNull } })
    return tx.agentResearchContent.upsert({ where: { sourceId_revision: { sourceId, revision } }, update: {}, create: {
      id: randomUUID(), sourceId, revision, contentHash, finalUrl, provider: result.provider,
      contentKind: result.contentKind, text: result.text, quality: { ...checked.quality, links },
    } })
  })
}

/** Saved windows make no network calls and consume no document-fetch quota.
 * Offsets use JS UTF-16 indices consistently with the existing attachment tools. */
export async function readResearchContent(scope: Scope, input: { contentRef: string; revision: string; offset?: number; limit?: number; find?: string; linksOffset?: number }) {
  const offset = input.offset ?? 0, limit = input.limit ?? 6000
  const linksOffset = input.linksOffset ?? 0
  if (!Number.isSafeInteger(linksOffset) || linksOffset < 0) throw new DataAccessError(400, 'RESEARCH_RANGE_INVALID', '链接分页位置无效。')
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 6000) {
    throw new DataAccessError(400, 'RESEARCH_RANGE_INVALID', '正文窗口位置或大小无效。')
  }
  if (input.find !== undefined && (typeof input.find !== 'string' || !input.find.trim() || input.find.length > 200 || input.find.length > limit)) {
    throw new DataAccessError(400, 'RESEARCH_QUERY_INVALID', '检索词应为1–200字符的非空文本。')
  }
  return prisma.$transaction(async tx => {
    const content = await tx.agentResearchContent.findUnique({ where: { id: input.contentRef } })
    if (!content) return denied()
    const source = await ownedSource(tx, scope, content.sourceId)
    if (input.revision !== content.revision || hash(content.text) !== content.contentHash
      || hash(JSON.stringify([content.contentHash, content.finalUrl, content.contentKind])) !== content.revision) {
      throw new DataAccessError(409, 'RESEARCH_REVISION_MISMATCH', '正文版本不一致，不能用其他版本替换引用。')
    }
    if (offset > content.text.length) throw new DataAccessError(400, 'RESEARCH_RANGE_INVALID', '正文窗口超出保存范围。')
    const matchAt = input.find === undefined ? null : content.text.indexOf(input.find, offset)
    if (matchAt === -1) throw new DataAccessError(404, 'RESEARCH_MATCH_NOT_FOUND', '当前保存版本的指定位置之后没有匹配文本；未联网，也不代表其他版本或来源没有该信息。')
    const start = matchAt === null ? offset : Math.max(offset, matchAt - Math.min(200, Math.floor(limit / 4), limit - input.find!.length))
    const end = Math.min(content.text.length, start + limit)
    const quality = content.quality
    const links = checkedSavedLinks(quality && typeof quality === 'object' && !Array.isArray(quality) ? quality.links : undefined, content.finalUrl)
    if (linksOffset > links.length) throw new DataAccessError(400, 'RESEARCH_RANGE_INVALID', '链接分页超出保存范围。')
    return { sourceId: source.id, contentRef: content.id, revision: content.revision, contentHash: content.contentHash,
      links: links.slice(linksOffset, linksOffset + 8), linksTotal: links.length,
      linksNextOffset: linksOffset + 8 < links.length ? linksOffset + 8 : null,
      excerptHash: hash(content.text.slice(start, end)),
      finalUrl: content.finalUrl, contentKind: content.contentKind, provider: content.provider,
      text: content.text.slice(start, end), returnedRange: { start, end, total: content.text.length },
      match: matchAt === null ? null : { start: matchAt, end: matchAt + input.find!.length },
      rangeUnit: 'utf16' as const, truncated: end < content.text.length, nextCursor: end < content.text.length ? String(end) : null }
  })
}
