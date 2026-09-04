import { createHash } from 'node:crypto'

import type {
  ChapterQualityReport,
  Prisma,
  QualityFindingDisposition,
  QualityFindingFeedback,
  StoryCompilerMode,
} from '@prisma/client'

import type {
  CharacterVoiceProfileInput,
  CriticQualityFinding,
  ExperienceAnchorInput,
  HumanityQualitySignal,
} from '../../../shared/contracts/index.js'
import { DataAccessError, prisma } from '../prisma.js'
import { isAgent2FeatureEnabled } from '../agent2-feature-flags.js'
import { assertCraftOutputSafe } from './craft-library.js'

export const HUMANITY_CRITIC_VERSION = 'humanity-critic.v2'
export const MAX_QUALITY_REPAIR_ROUNDS = 1

export type LocatedQualityFinding = {
  signal: HumanityQualitySignal
  source: 'deterministic' | 'critic'
  severity: 'advisory' | 'warning' | 'error'
  start: number
  end: number
  evidence: string
  explanation: string
  suggestion: string
  confidence: number
}

type Paragraph = { text: string; start: number; end: number }
type Sentence = { text: string; start: number; end: number }

const hashText = (value: string): string => createHash('sha256').update(value).digest('hex')
const clip = (value: string, max: number): string => value.length <= max ? value : `${value.slice(0, max - 1)}…`
const asStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function splitParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const matcher = /[^\n]+/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(content))) {
    const raw = match[0]
    const leading = raw.length - raw.trimStart().length
    const text = raw.trim()
    if (!text) continue
    const start = match.index + leading
    paragraphs.push({ text, start, end: start + text.length })
  }
  return paragraphs
}

function splitSentences(content: string): Sentence[] {
  const sentences: Sentence[] = []
  const matcher = /[^。！？!?…\n]+(?:[。！？!?…]+|$)/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(content))) {
    const raw = match[0]
    const leading = raw.length - raw.trimStart().length
    const text = raw.trim()
    if (text.length < 2) continue
    const start = match.index + leading
    sentences.push({ text, start, end: start + text.length })
  }
  return sentences
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function chineseBigrams(value: string): Set<string> {
  const compact = value.replace(/[\s，。！？!?、：“”‘’（）()—…]/g, '')
  const result = new Set<string>()
  for (let index = 0; index < compact.length - 1; index += 1) result.add(compact.slice(index, index + 2))
  return result
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const item of left) if (right.has(item)) intersection += 1
  return intersection / (left.size + right.size - intersection)
}

function evidenceFinding(input: Omit<LocatedQualityFinding, 'evidence'> & { content: string }): LocatedQualityFinding {
  const { content, ...finding } = input
  const end = Math.min(input.end, input.start + 360)
  return { ...finding, end, evidence: content.slice(input.start, end) }
}

export function analyzeDeterministicQuality(content: string, recentChapterTexts: string[] = []): {
  metrics: Record<string, number | string[]>
  findings: LocatedQualityFinding[]
} {
  const paragraphs = splitParagraphs(content)
  const sentences = splitSentences(content)
  const sentenceLengths = sentences.map((item) => item.text.replace(/\s/g, '').length)
  const findings: LocatedQualityFinding[] = []
  const medianSentenceChars = median(sentenceLengths)
  const dialogueChars = paragraphs
    .filter((item) => /^[“「『"]/.test(item.text) || /[”」』"]\s*$/.test(item.text))
    .reduce((sum, item) => sum + item.text.length, 0)

  for (let index = 1; index < paragraphs.length; index += 1) {
    const previous = splitSentences(paragraphs[index - 1].text).map((item) => item.text.length)
    const current = splitSentences(paragraphs[index].text).map((item) => item.text.length)
    const previousMedian = median(previous)
    const currentMedian = median(current)
    const ratio = Math.max(previousMedian, currentMedian) / Math.max(1, Math.min(previousMedian, currentMedian))
    if (ratio >= 2.8 && paragraphs[index].text.length >= 70 && paragraphs[index - 1].text.length >= 40) {
      findings.push(evidenceFinding({
        signal: 'style_drift', source: 'deterministic', severity: 'advisory', confidence: 0.72,
        start: paragraphs[index].start, end: paragraphs[index].end, content,
        explanation: `相邻段落句长中位数从 ${Math.round(previousMedian)} 变为 ${Math.round(currentMedian)}，变化达到 ${ratio.toFixed(1)} 倍；这里只提示漂移，不判定长句或短句本身错误。`,
        suggestion: '核对该变化是否来自视角、场景节奏或作者有意处理；若不是，只调整这一段的句群节奏。',
      }))
    }
  }

  for (let index = 1; index < sentences.length; index += 1) {
    const similarity = jaccard(chineseBigrams(sentences[index - 1].text), chineseBigrams(sentences[index].text))
    if (similarity >= 0.58 && Math.min(sentences[index - 1].text.length, sentences[index].text.length) >= 12) {
      findings.push(evidenceFinding({
        signal: 'explanation_echo', source: 'deterministic', severity: 'warning', confidence: Math.min(0.95, similarity),
        start: sentences[index].start, end: sentences[index].end, content,
        explanation: `本句与前句词组重合度为 ${similarity.toFixed(2)}，可能在动作或对白后再次解释同一信息。`,
        suggestion: '优先删除重复解释；若承担新信息，只保留新增部分。',
      }))
    }
  }

  for (let index = 0; index <= sentences.length - 3; index += 1) {
    const group = sentences.slice(index, index + 3)
    const openings = group.map((item) => item.text.replace(/^[“「『"'‘’\s]+/, '').slice(0, 3))
    const lengths = group.map((item) => item.text.length)
    const closeLengths = Math.max(...lengths) - Math.min(...lengths) <= Math.max(5, median(lengths) * 0.18)
    if (openings.every((item) => item && item === openings[0]) || closeLengths && group.every((item) => /[，,]/.test(item.text))) {
      findings.push(evidenceFinding({
        signal: 'sentence_homology', source: 'deterministic', severity: 'advisory', confidence: 0.68,
        start: group[0].start, end: group[2].end, content,
        explanation: '连续三句具有相同起句或近似长度与停顿结构，可能形成机械排比；有意排比则可保留。',
        suggestion: '仅在非刻意修辞时打散其中一句的观察角度或信息落点，不做同义词轮换。',
      }))
      index += 2
    }
  }

  const allReference = recentChapterTexts.join('\n')
  const imageMatcher = /(像|仿佛|如同|好似)[^，。！？!?\n]{2,28}/g
  const seen = new Map<string, number>()
  let image: RegExpExecArray | null
  while ((image = imageMatcher.exec(content))) {
    const normalized = image[0].replace(/\s/g, '')
    const priorCount = seen.get(normalized) ?? 0
    const repeatedRecently = allReference.includes(normalized)
    if (priorCount > 0 || repeatedRecently) {
      findings.push(evidenceFinding({
        signal: 'image_repetition', source: 'deterministic', severity: 'advisory', confidence: repeatedRecently ? 0.78 : 0.7,
        start: image.index, end: image.index + image[0].length, content,
        explanation: repeatedRecently ? '这个完整意象在近期章节已经出现。' : '这个完整意象在本章重复出现。',
        suggestion: '若不是主题回声，保留最有效的一处，其余改为人物动作、物件变化或直接叙述。',
      }))
    }
    seen.set(normalized, priorCount + 1)
  }

  // 「」在本站正文里只承担人物话语或逐字引文标记。模型偶尔把它当成
  // “圈重点”符号包住转场、画面或叙述过程；这类长片段可确定性定位，交给
  // 局部修订器只去掉误用符号，不改正文事实与句子骨架。
  const cornerQuoteMatcher = /「([^」\n]{18,360})」/g
  let cornerQuote: RegExpExecArray | null
  while ((cornerQuote = cornerQuoteMatcher.exec(content))) {
    const inner = cornerQuote[1]
    const narrationCue = /[（）()]|(?:镜头|画面|转场|那段|过程|一路|拐进|挤着|穿过|进入|走到|来到|门内|屋里)/.test(inner)
    if (!narrationCue) continue
    findings.push(evidenceFinding({
      signal: 'punctuation_misuse', source: 'deterministic', severity: 'warning', confidence: 0.9,
      start: cornerQuote.index, end: cornerQuote.index + cornerQuote[0].length, content,
      explanation: '这段包含转场、画面或动作过程，却被「」整体包裹；「」不能作为叙述段落的视觉强调符号。',
      suggestion: '保留原叙述内容，只移除误用的「」；人物直接说出或逐字引用的内容不改。',
    }))
  }

  const deduplicated = findings.filter((finding, index, all) =>
    all.findIndex((item) => item.signal === finding.signal && item.start === finding.start && item.end === finding.end) === index)
  return {
    metrics: {
      paragraphCount: paragraphs.length,
      sentenceCount: sentences.length,
      medianSentenceChars: Math.round(medianSentenceChars * 10) / 10,
      maxSentenceChars: sentenceLengths.length ? Math.max(...sentenceLengths) : 0,
      dialogueRatio: content.length ? Math.round((dialogueChars / content.length) * 1_000) / 1_000 : 0,
      deterministicSignalCount: deduplicated.length,
      deterministicSignals: [...new Set(deduplicated.map((item) => item.signal))],
    },
    findings: deduplicated.slice(0, 20),
  }
}

export async function getOwnedQualityChapter(userId: string, novelId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId, authorId: userId },
    include: { novel: { select: { title: true, categoryName: true, tagNames: true } } },
  })
  if (!chapter) throw new DataAccessError(404, 'CHAPTER_NOT_FOUND', '章节不存在或不属于当前作品。')
  return chapter
}

export async function buildHumanityQualityContext(userId: string, novelId: string, chapterId: string) {
  const chapter = await getOwnedQualityChapter(userId, novelId, chapterId)
  const [charter, compilation, profiles, anchors, recentChapters, feedback, dataControl] = await Promise.all([
    prisma.storyCharter.findUnique({ where: { novelId } }),
    prisma.storyCompilation.findFirst({
      where: { userId, novelId, chapterId, status: 'active' },
      include: { bridge: true, sceneTasks: { orderBy: { ordinal: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.characterVoiceProfile.findMany({ where: { userId, novelId, status: 'confirmed' }, orderBy: { updatedAt: 'desc' }, take: 12 }),
    prisma.experienceAnchor.findMany({ where: { userId, novelId, status: 'confirmed' }, orderBy: { updatedAt: 'desc' }, take: 30 }),
    prisma.chapter.findMany({
      where: { novelId, orderIndex: { lt: chapter.orderIndex } },
      select: { title: true, content: true, orderIndex: true }, orderBy: { orderIndex: 'desc' }, take: 3,
    }),
    prisma.qualityFinding.groupBy({
      by: ['signal', 'authorFeedback'], where: { userId, novelId, authorFeedback: { not: null } }, _count: { _all: true },
    }),
    prisma.agentDataControl.findUnique({ where: { userId_novelId: { userId, novelId } }, select: { qualityTelemetryEnabled: true } }),
  ])

  const mentionedProfiles = profiles.filter((profile) => chapter.content.includes(profile.characterName)).slice(0, 6)
  const mentionedNames = new Set(mentionedProfiles.map((profile) => profile.characterName))
  const relevantAnchors = anchors
    .filter((anchor) => mentionedNames.has(anchor.characterName) || chapter.content.includes(anchor.characterName))
    .sort((left, right) => {
      const leftScore = Number(chapter.content.includes(left.triggerEvent.slice(0, 12))) + Number(chapter.content.includes(left.sensoryCue.slice(0, 8)))
      const rightScore = Number(chapter.content.includes(right.triggerEvent.slice(0, 12))) + Number(chapter.content.includes(right.sensoryCue.slice(0, 8)))
      return rightScore - leftScore
    })
    .slice(0, 3)

  return { chapter, charter, compilation, profiles: mentionedProfiles, anchors: relevantAnchors, recentChapters, feedback: dataControl?.qualityTelemetryEnabled === false ? [] : feedback }
}

function locateCriticFindings(content: string, findings: CriticQualityFinding[]): LocatedQualityFinding[] {
  const located: LocatedQualityFinding[] = []
  const occupied = new Set<string>()
  for (const finding of findings) {
    const quote = finding.quote.trim()
    let start = content.indexOf(quote)
    while (start >= 0 && occupied.has(`${finding.signal}:${start}`)) start = content.indexOf(quote, start + 1)
    if (start < 0) continue
    occupied.add(`${finding.signal}:${start}`)
    located.push({
      signal: finding.signal,
      source: 'critic',
      severity: finding.severity,
      start,
      end: start + quote.length,
      evidence: clip(quote, 360),
      explanation: finding.explanation,
      suggestion: finding.suggestion,
      confidence: finding.confidence,
    })
  }
  return located
}

export async function persistHumanityQualityReport(input: {
  userId: string
  novelId: string
  runId?: string
  compilationId?: string
  chapterId: string
  chapterRevision: number
  mode: StoryCompilerMode
  deterministicMetrics: Record<string, number | string[]>
  deterministicFindings: LocatedQualityFinding[]
  criticFindings: CriticQualityFinding[]
}): Promise<ChapterQualityReport & { findings: Array<{ id: string; signal: string; source: string; severity: string; startOffset: number; endOffset: number; evidenceExcerpt: string; explanation: string; suggestion: string; disposition: QualityFindingDisposition }> }> {
  const chapter = await getOwnedQualityChapter(input.userId, input.novelId, input.chapterId)
  if (chapter.revision !== input.chapterRevision) throw new DataAccessError(409, 'QUALITY_SOURCE_STALE', '章节在质量检查期间已被修改，请基于最新版本重新检查。')

  const findings = [...input.deterministicFindings, ...locateCriticFindings(chapter.content, input.criticFindings)]
    .filter((finding, index, all) => all.findIndex((item) => item.signal === finding.signal && item.start === finding.start && item.end === finding.end) === index)
    .slice(0, 36)
  const actionableCount = findings.filter((finding) => finding.severity !== 'advisory').length
  const report = await prisma.$transaction(async (tx) => {
    await tx.chapterQualityReport.updateMany({
      where: { userId: input.userId, novelId: input.novelId, chapterId: input.chapterId, chapterRevision: { not: chapter.revision }, status: { not: 'stale' } },
      data: { status: 'stale' },
    })
    return tx.chapterQualityReport.create({
      data: {
        userId: input.userId, novelId: input.novelId, runId: input.runId, compilationId: input.compilationId,
        chapterId: input.chapterId, chapterRevision: chapter.revision, mode: input.mode,
        status: actionableCount > 0 ? 'needs_repair' : 'passed', repairRound: 0,
        deterministicMetrics: input.deterministicMetrics as Prisma.InputJsonValue,
        criticVersion: HUMANITY_CRITIC_VERSION, checkedAt: new Date(),
        findings: {
          create: findings.map((finding) => ({
            userId: input.userId, novelId: input.novelId, signal: finding.signal, source: finding.source,
            severity: finding.severity, startOffset: finding.start, endOffset: finding.end,
            evidenceExcerpt: finding.evidence, evidenceHash: hashText(chapter.content.slice(finding.start, finding.end)),
            explanation: finding.explanation, suggestion: finding.suggestion, confidence: finding.confidence,
          })),
        },
      },
      include: { findings: { orderBy: [{ severity: 'desc' }, { startOffset: 'asc' }] } },
    })
  })
  return report
}

export async function getQualityReport(userId: string, novelId: string, reportId: string) {
  const report = await prisma.chapterQualityReport.findFirst({
    where: { id: reportId, userId, novelId },
    include: { chapter: true, findings: { orderBy: [{ startOffset: 'asc' }] } },
  })
  if (!report) throw new DataAccessError(404, 'QUALITY_REPORT_NOT_FOUND', '质量报告不存在或不属于当前作品。')
  return report
}

export async function getLatestQualityReport(userId: string, novelId: string, chapterId: string) {
  return prisma.chapterQualityReport.findFirst({
    where: { userId, novelId, chapterId }, include: { findings: { orderBy: { startOffset: 'asc' } } }, orderBy: { createdAt: 'desc' },
  })
}

export async function selectQualityFindings(userId: string, novelId: string, reportId: string, selectedIds: string[]) {
  const report = await getQualityReport(userId, novelId, reportId)
  if (report.chapter.revision !== report.chapterRevision) throw new DataAccessError(409, 'QUALITY_REPORT_STALE', '章节已变化，请重新检查后再选择修订项。')
  const allowed = new Set(report.findings.map((finding) => finding.id))
  if (selectedIds.some((id) => !allowed.has(id))) throw new DataAccessError(400, 'QUALITY_FINDING_SCOPE_INVALID', '存在不属于该报告的质量问题。')
  await prisma.$transaction([
    prisma.qualityFinding.updateMany({ where: { reportId, id: { in: selectedIds } }, data: { disposition: 'selected' } }),
    prisma.qualityFinding.updateMany({ where: { reportId, id: { notIn: selectedIds }, disposition: { in: ['pending', 'selected'] } }, data: { disposition: 'pending' } }),
  ])
  return getQualityReport(userId, novelId, reportId)
}

export async function applyQualityRepair(input: {
  userId: string
  novelId: string
  runId?: string | null
  reportId: string
  replacements: Array<{ findingId: string; replacement: string }>
}) {
  const report = await getQualityReport(input.userId, input.novelId, input.reportId)
  if (report.repairRound >= MAX_QUALITY_REPAIR_ROUNDS) throw new DataAccessError(409, 'QUALITY_REPAIR_LIMIT', '单次质量检查只允许一次自动局部修订；请交由作者审阅。')
  if (report.chapter.revision !== report.chapterRevision) throw new DataAccessError(409, 'QUALITY_REPORT_STALE', '章节已变化，请重新检查后再修订。')
  const findingById = new Map(report.findings.map((finding) => [finding.id, finding]))
  const patches = input.replacements.map((replacement) => {
    const finding = findingById.get(replacement.findingId)
    if (!finding) throw new DataAccessError(400, 'QUALITY_FINDING_SCOPE_INVALID', '修订项不属于该报告。')
    const before = report.chapter.content.slice(finding.startOffset, finding.endOffset)
    if (hashText(before) !== finding.evidenceHash) throw new DataAccessError(409, 'QUALITY_EVIDENCE_STALE', '质量证据已变化，请重新检查。')
    return { finding, before, replacement: replacement.replacement }
  }).sort((left, right) => right.finding.startOffset - left.finding.startOffset)
  for (let index = 1; index < patches.length; index += 1) {
    if (patches[index - 1].finding.startOffset < patches[index].finding.endOffset) {
      throw new DataAccessError(400, 'QUALITY_PATCH_OVERLAP', '选中的证据范围重叠，请分两次修订。')
    }
  }
  let after = report.chapter.content
  for (const patch of patches) {
    after = `${after.slice(0, patch.finding.startOffset)}${patch.replacement}${after.slice(patch.finding.endOffset)}`
  }
  const leakageCandidate = patches.map((patch) => patch.replacement).join('\n')
  if (isAgent2FeatureEnabled('craftLibrary', input.userId) && leakageCandidate.trim().length >= 80) {
    await assertCraftOutputSafe({
      userId: input.userId, novelId: input.novelId, runId: input.runId, chapterId: report.chapterId, content: leakageCandidate,
    })
  }
  const updated = await prisma.$transaction(async (tx) => {
    const write = await tx.chapter.updateMany({
      where: { id: report.chapter.id, novelId: input.novelId, authorId: input.userId, revision: report.chapterRevision },
      data: { content: after, wordCount: after.length, revision: { increment: 1 } },
    })
    if (write.count !== 1) throw new DataAccessError(409, 'QUALITY_REPORT_STALE', '章节在修订期间已变化，请重新检查。')
    await tx.qualityFinding.updateMany({ where: { reportId: report.id, id: { in: patches.map((patch) => patch.finding.id) } }, data: { disposition: 'repaired' } })
    const updatedChapter = await tx.chapter.findUniqueOrThrow({ where: { id: report.chapter.id } })
    await tx.chapterQualityReport.update({
      where: { id: report.id },
      data: { status: 'repaired', chapterRevision: updatedChapter.revision, repairRound: { increment: 1 }, checkedAt: new Date() },
    })
    if (report.compilationId) {
      const compilation = await tx.storyCompilation.findFirst({
        where: { id: report.compilationId, userId: input.userId, novelId: input.novelId, status: 'active' },
        select: { validation: true },
      })
      const validation = compilation?.validation as { checkedRevision?: number; errorCount?: number; [key: string]: unknown } | null
      if (compilation && validation?.checkedRevision === report.chapterRevision && (validation.errorCount ?? 0) === 0) {
        await tx.storyCompilation.update({
          where: { id: report.compilationId },
          data: { validation: { ...validation, checkedRevision: updatedChapter.revision, checkedAt: new Date().toISOString(), advancedBy: 'bounded_quality_repair' } as Prisma.InputJsonValue },
        })
      }
    }
    return updatedChapter
  })
  const { recordWritingSignal } = await import('./writing-experiments.js')
  await recordWritingSignal(input.userId, input.novelId, 'quality_revision_round')
  return { report, updated, before: report.chapter.content, after, repairedFindingIds: patches.map((patch) => patch.finding.id) }
}

export async function recordQualityFindingFeedback(input: {
  userId: string
  findingId: string
  accepted: boolean
  reason?: string
}) {
  const finding = await prisma.qualityFinding.findFirst({ where: { id: input.findingId, userId: input.userId } })
  if (!finding) throw new DataAccessError(404, 'QUALITY_FINDING_NOT_FOUND', '质量问题不存在或不属于当前用户。')
  const updated = await prisma.qualityFinding.update({
    where: { id: finding.id },
    data: { authorFeedback: input.accepted ? 'accepted' : 'rejected', feedbackReason: input.reason?.trim() || null },
  })
  const { recordWritingSignal } = await import('./writing-experiments.js')
  await recordWritingSignal(input.userId, finding.novelId, input.accepted ? 'quality_feedback_accepted' : 'quality_feedback_rejected')
  return updated
}

export async function saveCharacterVoiceProfile(userId: string, novelId: string, input: CharacterVoiceProfileInput) {
  const novel = await prisma.novel.findFirst({ where: { id: novelId, authorId: userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或不属于当前用户。')
  if (input.confirmed) {
    if (input.voiceSamples.length < 3) throw new DataAccessError(400, 'VOICE_SAMPLE_COUNT_REQUIRED', '确认版 Voice DNA 至少需要 3 条逐字声口样本。')
    if (new Set(input.voiceSamples.map((sample) => sample.text)).size !== input.voiceSamples.length) throw new DataAccessError(400, 'VOICE_SAMPLE_DUPLICATED', '确认版声口样本不能重复。')
    for (const sample of input.voiceSamples) {
      if (!sample.sourceChapterId || !sample.sourceRevision) throw new DataAccessError(400, 'VOICE_SAMPLE_EVIDENCE_REQUIRED', '确认版声口样本必须提供章节与 revision 证据。')
      const chapter = await prisma.chapter.findFirst({ where: { id: sample.sourceChapterId, novelId, authorId: userId, revision: sample.sourceRevision }, select: { content: true } })
      if (!chapter || !chapter.content.includes(sample.text)) throw new DataAccessError(400, 'VOICE_SAMPLE_EVIDENCE_INVALID', '声口样本必须逐字存在于指定章节 revision。')
    }
  }
  const data = {
    userId, vocabularyLevel: input.vocabularyLevel, sentenceLength: input.sentenceLength,
    addressSystem: input.addressSystem, pressureResponse: input.pressureResponse, avoidedTopics: input.avoidedTopics,
    attentionBias: input.attentionBias, voiceSamples: input.voiceSamples, forbiddenKnowledge: input.forbiddenKnowledge,
    evolutionNotes: input.evolutionNotes, status: input.confirmed ? 'confirmed' as const : 'draft' as const,
  }
  return prisma.characterVoiceProfile.upsert({
    where: { novelId_characterName: { novelId, characterName: input.characterName } },
    create: { novelId, characterName: input.characterName, ...data },
    update: { ...data, revision: { increment: 1 } },
  })
}

export async function listCharacterVoiceProfiles(userId: string, novelId: string) {
  return prisma.characterVoiceProfile.findMany({ where: { userId, novelId, status: { not: 'archived' } }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] })
}

export async function saveExperienceAnchor(userId: string, novelId: string, input: ExperienceAnchorInput) {
  const novel = await prisma.novel.findFirst({ where: { id: novelId, authorId: userId }, select: { id: true } })
  if (!novel) throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '作品不存在或不属于当前用户。')
  if (input.sourceType === 'chapter') {
    if (!input.sourceRevision) throw new DataAccessError(400, 'ANCHOR_REVISION_REQUIRED', '章节经历锚点必须携带 revision。')
    const chapter = await prisma.chapter.findFirst({ where: { id: input.sourceId, novelId, authorId: userId, revision: input.sourceRevision }, select: { content: true } })
    if (!chapter || !chapter.content.includes(input.concreteDetail)) throw new DataAccessError(400, 'ANCHOR_EVIDENCE_INVALID', '经历锚点的具体细节必须存在于指定章节 revision。')
  }
  return prisma.experienceAnchor.upsert({
    where: { novelId_characterName_title_sourceId: { novelId, characterName: input.characterName, title: input.title, sourceId: input.sourceId } },
    create: { userId, novelId, ...input },
    update: input,
  })
}

export async function listExperienceAnchors(userId: string, novelId: string, characterName?: string) {
  return prisma.experienceAnchor.findMany({
    where: { userId, novelId, status: 'confirmed', ...(characterName ? { characterName } : {}) },
    orderBy: { updatedAt: 'desc' }, take: 30,
  })
}

export function renderQualityLearning(feedback: Array<{ signal: string; authorFeedback: QualityFindingFeedback | null; _count: { _all: number } }>): string {
  const bySignal = new Map<string, { accepted: number; rejected: number }>()
  for (const item of feedback) {
    const value = bySignal.get(item.signal) ?? { accepted: 0, rejected: 0 }
    if (item.authorFeedback === 'accepted') value.accepted += item._count._all
    if (item.authorFeedback === 'rejected') value.rejected += item._count._all
    bySignal.set(item.signal, value)
  }
  const lines = [...bySignal.entries()].map(([signal, counts]) => `${signal}: 接受 ${counts.accepted} / 拒绝 ${counts.rejected}`)
  return lines.length ? `作者历史反馈（只调整置信度，不覆盖本次正文证据）：${lines.join('；')}` : '作者尚无质量 finding 反馈。'
}

export function calibrateCriticFindings(
  findings: CriticQualityFinding[],
  feedback: Array<{ signal: string; authorFeedback: QualityFindingFeedback | null; _count: { _all: number } }>,
): CriticQualityFinding[] {
  const counts = new Map<string, { accepted: number; rejected: number }>()
  for (const item of feedback) {
    const current = counts.get(item.signal) ?? { accepted: 0, rejected: 0 }
    if (item.authorFeedback === 'accepted') current.accepted += item._count._all
    if (item.authorFeedback === 'rejected') current.rejected += item._count._all
    counts.set(item.signal, current)
  }
  return findings.map((finding) => {
    const signal = counts.get(finding.signal)
    const total = (signal?.accepted ?? 0) + (signal?.rejected ?? 0)
    if (!signal || total < 3) return finding
    const acceptanceRate = signal.accepted / total
    const delta = acceptanceRate >= 0.7 ? 0.1 : acceptanceRate <= 0.3 ? -0.25 : 0
    return { ...finding, confidence: Math.max(0, Math.min(1, finding.confidence + delta)) }
  })
}

export function renderVoiceAndAnchorContext(input: Awaited<ReturnType<typeof buildHumanityQualityContext>>): string {
  const profiles = input.profiles.map((profile) => {
    const samples = Array.isArray(profile.voiceSamples) ? profile.voiceSamples as Array<{ text?: unknown }> : []
    return `${profile.characterName}：词汇=${profile.vocabularyLevel}；压力反应=${clip(profile.pressureResponse, 180)}；关注=${asStrings(profile.attentionBias).slice(0, 4).join('、') || '未记'}；禁知=${asStrings(profile.forbiddenKnowledge).slice(0, 4).join('、') || '无'}；确认声口=${samples.map((sample) => typeof sample.text === 'string' ? `「${clip(sample.text, 80)}」` : '').filter(Boolean).slice(0, 3).join(' / ')}`
  })
  const anchors = input.anchors.map((anchor) => `${anchor.characterName}/${anchor.title}：${clip(anchor.concreteDetail, 180)}；触发=${clip(anchor.triggerEvent, 100)}；习惯反应=${clip(anchor.habitualResponse, 100)}`)
  return `确认版 Character Voice DNA：\n${profiles.join('\n') || '无（不得凭空编造声口规则）'}\n相关 Experience Anchors（最多 3 条）：\n${anchors.join('\n') || '无（不得用模板身体反应代替）'}`
}
