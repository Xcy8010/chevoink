import { createHash, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../api/lib/prisma.js'
import { buildTaskSpec } from '../../api/lib/agent/task-spec.js'
import { canonicalResearchUrl, registerResearchSource, resolveResearchSource, saveResearchContent, readResearchContent,
  findResearchSource, getResearchReadFailure, recordResearchReadFailure,
  saveResearchReportSection, readResearchReport, readResearchReportForDelivery, assertResearchUrlProvenance, findSavedResearchContent } from '../../api/lib/agent/research-sources.js'
import { assessReaderText } from '../../api/lib/web-reader-quality.js'
import { handleTestDatabaseUnavailable } from '../support/database-availability.js'

const available = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(handleTestDatabaseUnavailable)
afterAll(async () => { await prisma.$disconnect() })

describe.skipIf(!available)('J4 private versioned research sources', () => {
  it('recovers report sections in the same task, rejects stale/foreign writes, and stops without modifying creative content', async () => {
    const user = await prisma.user.create({ data: { nickname: 'report-fixture', passwordHash: 'test-only' } })
    try {
      const novel = await prisma.novel.create({ data: { authorId: user.id, title: '只读研究', slug: randomUUID(), summary: '' } })
      const session = await prisma.agentSession.create({ data: { userId: user.id, novelId: novel.id, title: '报告' } })
      const runId = randomUUID()
      const spec = buildTaskSpec({ runId, novelId: novel.id, prompt: '拆解这本小说' })
      const base = { userId: user.id, novelId: novel.id, sessionId: session.id, mode: 'act' as const,
        action: 'workspaceAgent' as const, agentType: 'writingOrchestrator' as const, engine: 'loop', status: 'running' as const }
      await prisma.agentRun.create({ data: { ...base, id: runId, taskSpec: JSON.parse(JSON.stringify(spec)) } })
      const scope = { userId: user.id, novelId: novel.id, sessionId: session.id, runId }
      await expect(assertResearchUrlProvenance(scope, 'https://www.xs599.com/novel/12345.html'))
        .rejects.toMatchObject({ code: 'WEB_READ_UNDISCOVERED_URL' })
      await prisma.agentMessage.create({ data: { runId, sessionId: session.id, role: 'user',
        parts: [{ type: 'text', text: '请阅读 https://example.com/authorized 。' }] } })
      await expect(assertResearchUrlProvenance(scope, 'https://example.com/authorized')).resolves.toBeUndefined()
      await registerResearchSource(scope, 'https://example.com/discovered')
      await expect(assertResearchUrlProvenance(scope, 'https://example.com/discovered')).resolves.toBeUndefined()
      const input = { reportId: 'main', title: '研究报告', expectedRevision: 0,
        section: { id: 'structure', order: 0, content: '人物选择推动故事转折。', citations: [] } }
      expect(await readResearchReport(scope, {})).toMatchObject({ revision: 0, sections: [] })
      const saved = await saveResearchReportSection(scope, input)
      expect(saved.revision).toBe(1)
      expect(await saveResearchReportSection(scope, input)).toMatchObject({ revision: 1, replayed: true })
      await expect(saveResearchReportSection(scope, { ...input, section: { ...input.section, content: '过时覆盖。' } }))
        .rejects.toMatchObject({ code: 'RESEARCH_REPORT_CONFLICT' })
      const resumedId = randomUUID()
      await prisma.agentRun.update({ where: { id: runId }, data: { status: 'paused' } })
      await prisma.agentRun.create({ data: { ...base, id: resumedId, taskSpec: JSON.parse(JSON.stringify({ ...spec, runId: resumedId })) } })
      const resumed = { ...scope, runId: resumedId }
      const source = await registerResearchSource(resumed, 'https://example.com/evidence')
      const text = '人物在村庄修建水渠，合作解决了道路与水流冲突。'.repeat(100)
      const evidence = await saveResearchContent(resumed, source.id, { ...assessReaderText(text, '材料'), finalUrl: source.canonicalUrl,
        provider: 'direct', retryable: false, contentKind: 'article' })
      expect(await findSavedResearchContent(resumed, source.id)).toEqual({ id: evidence.id, revision: evidence.revision })
      const citation = { contentRef: evidence.id, revision: evidence.revision, start: 0, end: 20,
        excerptHash: createHash('sha256').update(text.slice(0, 20)).digest('hex') }
      const second = { ...input, expectedRevision: 1, section: { id: 'characters', order: 1, content: '人物关系随冲突逐步变化。', citations: [citation] } }
      await expect(saveResearchReportSection(resumed, { ...second, section: { ...second.section,
        citations: [{ ...citation, excerptHash: '0'.repeat(64) }] } })).rejects.toMatchObject({ code: 'RESEARCH_CITATION_INVALID' })
      await expect(saveResearchReportSection(scope, second)).rejects.toMatchObject({ code: 'RESEARCH_RUN_NOT_ACTIVE' })
      expect(await saveResearchReportSection(resumed, second)).toMatchObject({ artifactId: saved.artifactId, revision: 2 })
      const report = await readResearchReport(resumed, { limit: 5 })
      expect(report).toMatchObject({ revision: 2, nextOffset: 5, content: input.section.content.slice(0, 5) })
      expect(report.sections).toHaveLength(2)
      expect(await readResearchReportForDelivery(resumed)).toMatchObject({
        revision: 2, content: input.section.content + '\n\n' + second.section.content, nextOffset: null,
        evidence: { discoveredPages: 2, readablePages: 1, metadataPages: 0, failedSources: 0, citedVersions: 1 },
      })
      expect((await readResearchReport(resumed, { offset: 5, expectedRevision: report.revision })).content).toBe((input.section.content + '\n\n' + second.section.content).slice(5))
      await saveResearchReportSection(resumed, { ...second, expectedRevision: 2,
        section: { ...second.section, content: '修订后的角色分析，不应与旧版拼接。' } })
      await expect(readResearchReport(resumed, { offset: 5, expectedRevision: report.revision }))
        .rejects.toMatchObject({ code: 'RESEARCH_REPORT_CONFLICT' })
      expect(await readResearchReport(resumed, { expectedRevision: 3 })).toMatchObject({ revision: 3 })
      const otherId = randomUUID()
      const other = buildTaskSpec({ runId: otherId, novelId: novel.id, prompt: '写下一章' })
      await prisma.agentRun.create({ data: { ...base, id: otherId, taskSpec: JSON.parse(JSON.stringify(other)) } })
      expect(await readResearchReport({ ...scope, runId: otherId }, {})).toMatchObject({ revision: 0 })
      await expect(saveResearchReportSection({ ...scope, runId: otherId }, input)).rejects.toMatchObject({ code: 'RESEARCH_REPORT_NOT_AUTHORIZED' })
      await expect(readResearchReport({ ...scope, userId: randomUUID() }, {})).rejects.toMatchObject({ code: 'RESEARCH_SOURCE_NOT_FOUND' })
      expect(await prisma.chapter.count({ where: { novelId: novel.id } })).toBe(0)
      expect(await prisma.agentArtifact.count({ where: { run: { userId: user.id } } })).toBe(1)
    } finally {
      await prisma.agentArtifact.deleteMany({ where: { run: { userId: user.id } } })
      await prisma.agentRun.deleteMany({ where: { userId: user.id } })
      await prisma.agentSession.deleteMany({ where: { userId: user.id } })
      await prisma.novel.deleteMany({ where: { authorId: user.id } })
      await prisma.user.delete({ where: { id: user.id } })
    }
  })
  it('preserves meaningful query parameters and does not rewrite signed URLs', () => {
    expect(canonicalResearchUrl('https://example.com/chapter?id=19&page=2&utm_source=test')).toBe('https://example.com/chapter?id=19&page=2')
    const signed = 'https://example.com/chapter?id=19&signature=abc%2B123&utm_source=test'
    expect(canonicalResearchUrl(signed)).toBe(signed)
  })
  it('persists full text, resumes exact windows, isolates new tasks, and deletes private evidence with its owner', async () => {
    const user = await prisma.user.create({ data: { nickname: 'research-fixture', passwordHash: 'test-only' } })
    try {
      const novel = await prisma.novel.create({ data: { authorId: user.id, title: '研究测试', slug: randomUUID(), summary: '' } })
      const session = await prisma.agentSession.create({ data: { userId: user.id, novelId: novel.id, title: '分析' } })
      const runId = randomUUID()
      const spec = buildTaskSpec({ runId, novelId: novel.id, prompt: '分析指定资料' })
      const runData = { userId: user.id, novelId: novel.id, sessionId: session.id, mode: 'act' as const,
        action: 'workspaceAgent' as const, agentType: 'writingOrchestrator' as const, engine: 'loop' }
      await prisma.agentRun.create({ data: { ...runData, id: runId, taskSpec: JSON.parse(JSON.stringify(spec)) } })
      const scope = { userId: user.id, novelId: novel.id, sessionId: session.id, runId }
      expect(await findResearchSource(scope, 'https://example.com/book?id=19')).toBeNull()
      const source = await registerResearchSource(scope, 'https://example.com/book?id=19', '指定资料')
      expect(await prisma.agentResearchContent.count({ where: { sourceId: source.id } })).toBe(0)
      const text = '这份材料描述了村庄兴建水渠的过程，工匠与村民合作解决道路和水流的问题。'.repeat(500)
      const page = { ...assessReaderText(text, '水渠'), finalUrl: source.canonicalUrl, provider: 'direct' as const, retryable: false, contentKind: 'article' as const,
        links: [{ url: 'https://example.com/chapter?id=20', title: '第20章' }] }
      const saved = await saveResearchContent(scope, source.id, page)
      expect((await saveResearchContent(scope, source.id, page)).id).toBe(saved.id)
      const first = await readResearchContent(scope, { contentRef: saved.id, revision: saved.revision })
      expect(first).toMatchObject({ text: text.slice(0, 6000), truncated: true, nextCursor: '6000' })
      expect(first.links).toEqual(page.links)
      const located = await readResearchContent(scope, { contentRef: saved.id, revision: saved.revision, find: '村庄', offset: 6500, limit: 200 })
      const matchAt = text.indexOf('村庄', 6500)
      expect(located.match).toEqual({ start: matchAt, end: matchAt + 2 })
      expect(located.text).toBe(text.slice(located.returnedRange.start, located.returnedRange.end))
      expect(located.text).toContain('村庄')
      expect(located.text.length).toBeLessThanOrEqual(200)
      expect(located.revision).toBe(saved.revision)
      expect(located.excerptHash).toBe(createHash('sha256').update(located.text).digest('hex'))
      await expect(readResearchContent(scope, { contentRef: saved.id, revision: saved.revision, find: '不存在的证据' })).rejects.toMatchObject({ code: 'RESEARCH_MATCH_NOT_FOUND' })
      await expect(readResearchContent(scope, { contentRef: saved.id, revision: saved.revision, find: '  ' })).rejects.toMatchObject({ code: 'RESEARCH_QUERY_INVALID' })
      const resumedId = randomUUID()
      await prisma.agentRun.create({ data: { ...runData, id: resumedId, taskSpec: JSON.parse(JSON.stringify({ ...spec, runId: resumedId })) } })
      const resumedScope = { ...scope, runId: resumedId }
      expect((await registerResearchSource(resumedScope, source.canonicalUrl)).id).toBe(source.id)
      expect((await findResearchSource(resumedScope, source.canonicalUrl))?.id).toBe(source.id)
      for (const code of ['WEB_READ_NOT_FOUND', 'WEB_READ_BLOCKED', 'WEB_READ_GARBLED', 'WEB_READ_INSUFFICIENT'] as const) {
        await recordResearchReadFailure(scope, source.id, { ...page, status: 'unreadable', code })
        expect(await getResearchReadFailure(resumedScope, source.id)).toMatchObject({ code })
      }
      for (const code of ['WEB_READ_UNAVAILABLE', 'WEB_READ_HOSTED_UNAVAILABLE'] as const) {
        const started = Date.now()
        await recordResearchReadFailure(scope, source.id, { ...page, status: 'transient_error', retryable: true, code })
        const failure = await getResearchReadFailure(resumedScope, source.id)
        expect(failure).toMatchObject({ code })
        expect(Date.parse(failure!.retryAt)).toBeGreaterThanOrEqual(started + 60_000)
        expect(Date.parse(failure!.retryAt)).toBeLessThanOrEqual(Date.now() + 60_000)
      }
      // Retry-After survives restart and is not shortened to the default negative TTL.
      await recordResearchReadFailure(scope, source.id, { ...page, status: 'transient_error', code: 'WEB_READ_RATE_LIMITED', retryAfter: '3600' })
      expect(Date.parse((await getResearchReadFailure(resumedScope, source.id))!.retryAt)).toBeGreaterThan(Date.now() + 3_500_000)
      const retryDate = new Date(Date.now() + 7200_000).toUTCString()
      await recordResearchReadFailure(scope, source.id, { ...page, status: 'transient_error', code: 'WEB_READ_RATE_LIMITED', retryAfter: retryDate })
      expect(Date.parse((await getResearchReadFailure(resumedScope, source.id))!.retryAt)).toBe(Date.parse(retryDate))
      // A stored window remains readable even if a subsequent network fetch was denied.
      expect((await readResearchContent(resumedScope, { contentRef: saved.id, revision: saved.revision })).text).toBe(first.text)
      await prisma.agentResearchSource.update({ where: { id: source.id }, data: { readFailure: { code: 'WEB_READ_BLOCKED', retryAt: '2000-01-01T00:00:00.000Z' } } })
      expect(await getResearchReadFailure(resumedScope, source.id)).toBeNull()
      await recordResearchReadFailure(scope, source.id, { ...page, status: 'blocked', code: 'WEB_READ_BLOCKED' })
      await saveResearchContent(scope, source.id, page)
      expect(await getResearchReadFailure(resumedScope, source.id)).toBeNull()
      let assembled = first.text, offset = 6000
      while (offset < text.length) {
        const window = await readResearchContent(resumedScope, { contentRef: saved.id, revision: saved.revision, offset })
        assembled += window.text
        offset = window.returnedRange.end
      }
      expect(assembled).toBe(text)
      await expect(readResearchContent(scope, { contentRef: saved.id, revision: '0'.repeat(64) })).rejects.toMatchObject({ code: 'RESEARCH_REVISION_MISMATCH' })
      await expect(readResearchContent(scope, { contentRef: saved.id, revision: saved.revision, offset: text.length + 1 })).rejects.toMatchObject({ code: 'RESEARCH_RANGE_INVALID' })
      const nextId = randomUUID()
      await prisma.agentRun.create({ data: { ...runData, id: nextId } })
      await expect(resolveResearchSource({ ...scope, runId: nextId }, source.id)).rejects.toMatchObject({ code: 'RESEARCH_SOURCE_NOT_FOUND' })
      expect(await findResearchSource({ ...scope, runId: nextId }, source.canonicalUrl)).toBeNull()
      await expect(recordResearchReadFailure({ ...scope, runId: nextId }, source.id, { ...page, status: 'blocked', code: 'WEB_READ_BLOCKED' })).rejects.toMatchObject({ code: 'RESEARCH_SOURCE_NOT_FOUND' })
      await expect(getResearchReadFailure({ ...scope, runId: nextId }, source.id)).rejects.toMatchObject({ code: 'RESEARCH_SOURCE_NOT_FOUND' })
      await expect(resolveResearchSource({ ...scope, userId: randomUUID() }, source.id)).rejects.toMatchObject({ code: 'RESEARCH_SOURCE_NOT_FOUND' })
      await expect(saveResearchContent(scope, source.id, { ...page, status: 'blocked' })).rejects.toMatchObject({ code: 'RESEARCH_CONTENT_UNREADABLE' })
      await prisma.agentResearchContent.update({ where: { id: saved.id }, data: { text: '被改变的内容' } })
      await expect(readResearchContent(scope, { contentRef: saved.id, revision: saved.revision })).rejects.toMatchObject({ code: 'RESEARCH_REVISION_MISMATCH' })
      await prisma.agentRun.delete({ where: { id: runId } })
      expect(await prisma.agentResearchContent.count({ where: { id: saved.id } })).toBe(0)
      expect(await prisma.chapter.count({ where: { novelId: novel.id } })).toBe(0)
      expect(await prisma.agentArtifact.count({ where: { run: { userId: user.id } } })).toBe(0)
    } finally {
      await prisma.agentRun.deleteMany({ where: { userId: user.id } })
      await prisma.agentSession.deleteMany({ where: { userId: user.id } })
      await prisma.novel.deleteMany({ where: { authorId: user.id } })
      await prisma.user.delete({ where: { id: user.id } })
    }
  })
})
