import { createHash, randomUUID } from 'node:crypto'

import type { ChangeSet as PrismaChangeSet, ChangeSetPatch as PrismaChangeSetPatch, Prisma } from '@prisma/client'

import {
  changeSetSchema,
  type ApplyChangeSetRequest,
  type BulkReplacePreviewRequest,
  type ChangeSet,
  type ChangeSetValidation,
  type ProjectSearchMatch,
  type ProjectSearchRequest,
  type ProjectSearchResult,
} from '../../../shared/contracts/index.js'
import { DataAccessError, prisma } from '../prisma.js'
import { ensureNovelOwner, recalculateNovelStats } from './internal.js'

type ChangeSetRecord = PrismaChangeSet & { patches: PrismaChangeSetPatch[] }

function hashValue(value: string | null): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function toChangeSet(record: ChangeSetRecord): ChangeSet {
  const validations = Array.isArray(record.validations) ? record.validations : []
  return changeSetSchema.parse({
    id: record.id,
    novelId: record.novelId,
    taskSpecId: record.taskSpecId,
    status: record.status,
    baseRevision: record.baseRevision,
    patches: record.patches.map((patch) => ({
      id: patch.id,
      targetType: patch.targetType,
      targetId: patch.targetId,
      field: patch.field,
      beforeHash: patch.beforeHash,
      expectedRevision: patch.expectedRevision,
      appliedRevision: patch.appliedRevision,
      anchor: patch.anchor ?? undefined,
      before: patch.before,
      after: patch.after,
      reason: patch.reason,
      selected: patch.selected,
    })),
    validations,
    snapshotId: record.snapshotId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

function exactMatches(value: string, query: string, caseSensitive: boolean) {
  const source = caseSensitive ? value : value.toLocaleLowerCase()
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const matches: Array<{ offset: number; length: number; confidence: number }> = []
  let cursor = 0
  while (cursor <= source.length - needle.length) {
    const offset = source.indexOf(needle, cursor)
    if (offset < 0) break
    matches.push({ offset, length: query.length, confidence: 1 })
    cursor = offset + Math.max(1, needle.length)
  }
  return matches
}

function regexMatches(value: string, pattern: string, caseSensitive: boolean) {
  if (/\([^)]*[+*][^)]*\)[+*{]|(?:\+\+|\*\*|\+\*|\*\+)/u.test(pattern)) {
    throw new DataAccessError(400, 'UNSAFE_SEARCH_PATTERN', '正则表达式包含高风险嵌套量词，请简化后重试。')
  }
  let regex: RegExp
  try {
    regex = new RegExp(pattern, caseSensitive ? 'gu' : 'giu')
  } catch {
    throw new DataAccessError(400, 'INVALID_SEARCH_PATTERN', '正则表达式格式不正确。')
  }
  if (new RegExp(pattern, caseSensitive ? 'u' : 'iu').test('')) {
    throw new DataAccessError(400, 'INVALID_SEARCH_PATTERN', '正则表达式不能匹配空字符串。')
  }
  return [...value.matchAll(regex)].map((match) => ({
    offset: match.index,
    length: match[0].length,
    confidence: 1,
  }))
}

function trigrams(value: string): Set<string> {
  const normalized = `  ${value.toLocaleLowerCase()}  `
  const result = new Set<string>()
  for (let index = 0; index <= normalized.length - 3; index += 1) result.add(normalized.slice(index, index + 3))
  return result
}

function diceSimilarity(left: string, right: string): number {
  const a = trigrams(left)
  const b = trigrams(right)
  let overlap = 0
  for (const gram of a) if (b.has(gram)) overlap += 1
  return a.size + b.size === 0 ? 1 : (2 * overlap) / (a.size + b.size)
}

function fuzzyMatches(value: string, query: string) {
  const segments = value.split(/(?<=[。！？!?\n])/u)
  let cursor = 0
  return segments
    .map((segment) => {
      const offset = cursor
      cursor += segment.length
      return { offset, length: segment.length, confidence: diceSimilarity(segment.trim(), query) }
    })
    .filter((match) => match.length > 0 && match.confidence >= 0.22)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5)
}

function collectFieldMatches(
  value: string,
  query: string,
  mode: ProjectSearchRequest['mode'],
  caseSensitive: boolean,
) {
  if (mode === 'regex') return regexMatches(value, query, caseSensitive)
  if (mode === 'fuzzy') return fuzzyMatches(value, query)
  return exactMatches(value, query, caseSensitive)
}

export async function searchProjectData(
  userId: string,
  novelId: string,
  input: ProjectSearchRequest,
): Promise<ProjectSearchResult> {
  await ensureNovelOwner(userId, novelId)
  const lexicalOr: Prisma.ChapterWhereInput[] = input.mode === 'exact'
    ? input.fields.map((field) => ({
        [field]: {
          contains: input.query,
          ...(input.caseSensitive ? {} : { mode: 'insensitive' as const }),
        },
      }))
    : []
  const chapters = await prisma.chapter.findMany({
    where: {
      novelId,
      volumeId: input.volumeIds?.length ? { in: input.volumeIds } : undefined,
      id: input.chapterIds?.length ? { in: input.chapterIds } : undefined,
      OR: lexicalOr.length ? lexicalOr : undefined,
    },
    orderBy: { orderIndex: 'asc' },
    include: { volume: { select: { title: true } } },
  })

  const matches: ProjectSearchMatch[] = []
  let total = 0
  for (const chapter of chapters) {
    for (const field of input.fields) {
      const value = field === 'summary' ? chapter.summary ?? '' : chapter[field]
      for (const found of collectFieldMatches(value, input.query, input.mode, input.caseSensitive)) {
        total += 1
        if (matches.length >= input.limit) continue
        const contextRadius = 72
        matches.push({
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          volumeId: chapter.volumeId,
          volumeTitle: chapter.volume.title,
          field,
          offset: found.offset,
          length: found.length,
          contextBefore: value.slice(Math.max(0, found.offset - contextRadius), found.offset),
          match: value.slice(found.offset, found.offset + found.length),
          contextAfter: value.slice(found.offset + found.length, found.offset + found.length + contextRadius),
          revision: chapter.revision,
          confidence: Math.round(found.confidence * 1000) / 1000,
        })
      }
    }
  }

  return {
    query: input.query,
    mode: input.mode,
    total,
    truncated: total > matches.length,
    indexState: 'fresh',
    matches,
  }
}

function buildQuoteMask(value: string): boolean[] {
  const mask = Array.from({ length: value.length }, () => false)
  const pairs: Record<string, string> = { '“': '”', '‘': '’', '「': '」', '『': '』' }
  const stack: string[] = []
  let asciiQuote: '"' | "'" | null = null
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"' || character === "'") asciiQuote = asciiQuote === character ? null : character
    else if (pairs[character]) stack.push(pairs[character])
    else if (stack.at(-1) === character) stack.pop()
    mask[index] = stack.length > 0 || asciiQuote !== null || Object.prototype.hasOwnProperty.call(pairs, character)
  }
  return mask
}

function replaceExact(
  value: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
  preserveQuotedText: boolean,
) {
  const quoteMask = preserveQuotedText ? buildQuoteMask(value) : []
  const found = exactMatches(value, query, caseSensitive)
  let cursor = 0
  let after = ''
  let replaced = 0
  let excluded = 0
  let firstOffset = -1
  for (const match of found) {
    const insideQuote = preserveQuotedText && quoteMask.slice(match.offset, match.offset + match.length).some(Boolean)
    after += value.slice(cursor, match.offset)
    if (insideQuote) {
      after += value.slice(match.offset, match.offset + match.length)
      excluded += 1
    } else {
      after += replacement
      replaced += 1
      if (firstOffset < 0) firstOffset = match.offset
    }
    cursor = match.offset + match.length
  }
  after += value.slice(cursor)
  return { after, replaced, excluded, firstOffset }
}

export async function previewBulkReplaceData(
  userId: string,
  novelId: string,
  input: BulkReplacePreviewRequest,
): Promise<ChangeSet> {
  await ensureNovelOwner(userId, novelId)
  if (input.query === input.replacement) {
    throw new DataAccessError(400, 'NO_CHANGE', '替换前后的文本相同，无需创建变更集。')
  }
  const chapters = await prisma.chapter.findMany({
    where: {
      novelId,
      id: input.excludeChapterIds.length ? { notIn: input.excludeChapterIds } : undefined,
      OR: input.fields.map((field) => ({
        [field]: {
          contains: input.query,
          ...(input.caseSensitive ? {} : { mode: 'insensitive' as const }),
        },
      })),
    },
    orderBy: { orderIndex: 'asc' },
  })
  const patches: Prisma.ChangeSetPatchCreateWithoutChangeSetInput[] = []
  let excludedOccurrences = 0
  let replacedOccurrences = 0

  for (const chapter of chapters) {
    for (const field of input.fields) {
      const before = field === 'summary' ? chapter.summary : chapter[field]
      if (before === null) continue
      const result = replaceExact(before, input.query, input.replacement, input.caseSensitive, input.preserveQuotedText)
      excludedOccurrences += result.excluded
      replacedOccurrences += result.replaced
      if (result.replaced === 0) continue
      if (field === 'title' && !result.after.trim()) {
        throw new DataAccessError(400, 'INVALID_TITLE_REPLACEMENT', '替换会产生空章节标题，已停止生成预览。')
      }
      const anchorStart = Math.max(0, result.firstOffset - 36)
      patches.push({
        targetType: 'chapter',
        targetId: chapter.id,
        field,
        beforeHash: hashValue(before),
        expectedRevision: chapter.revision,
        anchor: before.slice(anchorStart, result.firstOffset + input.query.length + 36),
        before,
        after: result.after,
        reason: `${input.reason}；本字段命中 ${result.replaced} 处`,
        selected: true,
      })
    }
  }

  if (patches.length === 0) {
    throw new DataAccessError(404, 'NO_SEARCH_MATCH', '全书未找到可替换的匹配项。')
  }

  const validations: ChangeSetValidation[] = [
    {
      code: 'PREVIEW_GENERATED',
      status: 'passed',
      message: `已生成 ${patches.length} 个字段补丁，共替换 ${replacedOccurrences} 处。`,
      targetIds: patches.map((patch) => patch.targetId),
    },
    ...(excludedOccurrences > 0
      ? [{
          code: 'QUOTED_OCCURRENCES_EXCLUDED',
          status: 'warning' as const,
          message: `按策略保留了引号内 ${excludedOccurrences} 处旧文本。`,
          targetIds: [],
        }]
      : []),
  ]
  const baseRevision = chapters.reduce((maximum, chapter) => Math.max(maximum, chapter.revision), 0)
  const record = await prisma.changeSet.create({
    data: {
      novelId,
      userId,
      taskSpecId: input.taskSpecId ?? `adhoc-${randomUUID()}`,
      baseRevision,
      validations,
      patches: { create: patches },
    },
    include: { patches: { orderBy: { createdAt: 'asc' } } },
  })
  return toChangeSet(record)
}

async function loadOwnedChangeSet(userId: string, changeSetId: string): Promise<ChangeSetRecord | null> {
  return prisma.changeSet.findFirst({
    where: { id: changeSetId, userId },
    include: { patches: { orderBy: { createdAt: 'asc' } } },
  })
}

function fieldValue(chapter: { title: string; summary: string | null; content: string }, field: string): string | null {
  if (field === 'title' || field === 'summary' || field === 'content') return chapter[field]
  throw new DataAccessError(400, 'UNSUPPORTED_CHANGESET_FIELD', `暂不支持修改字段 ${field}。`)
}

export async function applyChangeSetData(
  userId: string,
  changeSetId: string,
  input: ApplyChangeSetRequest,
): Promise<ChangeSet | null> {
  const existing = await loadOwnedChangeSet(userId, changeSetId)
  if (!existing) return null
  if (existing.status === 'applied') return toChangeSet(existing)
  if (!['draft', 'approved', 'conflicted', 'failed'].includes(existing.status)) {
    throw new DataAccessError(409, 'CHANGESET_STATE_CONFLICT', `当前变更集状态 ${existing.status} 不允许应用。`)
  }
  const selectedIds = input.selectedPatchIds ? new Set(input.selectedPatchIds) : null
  const selected = existing.patches.filter((patch) => selectedIds ? selectedIds.has(patch.id) : patch.selected)
  if (selected.length === 0) throw new DataAccessError(400, 'EMPTY_CHANGESET', '至少选择一个补丁后再应用。')

  try {
    await prisma.$transaction(async (tx) => {
      await tx.changeSet.update({ where: { id: changeSetId }, data: { status: 'applying' } })
      if (selectedIds) {
        await tx.changeSetPatch.updateMany({ where: { changeSetId }, data: { selected: false } })
        await tx.changeSetPatch.updateMany({ where: { id: { in: [...selectedIds] }, changeSetId }, data: { selected: true } })
      }

      const byChapter = new Map<string, PrismaChangeSetPatch[]>()
      for (const patch of selected) {
        if (patch.targetType !== 'chapter') throw new DataAccessError(400, 'UNSUPPORTED_CHANGESET_TARGET', '当前版本仅支持章节补丁。')
        const bucket = byChapter.get(patch.targetId) ?? []
        bucket.push(patch)
        byChapter.set(patch.targetId, bucket)
      }

      for (const [chapterId, patches] of byChapter) {
        const chapter = await tx.chapter.findFirst({ where: { id: chapterId, novelId: existing.novelId } })
        if (!chapter) throw new DataAccessError(409, 'CHANGESET_TARGET_MISSING', `章节 ${chapterId} 已不存在。`)
        const expectedRevision = patches[0].expectedRevision
        if (patches.some((patch) => patch.expectedRevision !== expectedRevision) || chapter.revision !== expectedRevision) {
          throw new DataAccessError(409, 'CHANGESET_REVISION_CONFLICT', `章节《${chapter.title}》版本已变化。`)
        }
        const update: Prisma.ChapterUpdateManyMutationInput = { revision: { increment: 1 } }
        for (const patch of patches) {
          const current = fieldValue(chapter, patch.field)
          if (hashValue(current) !== patch.beforeHash) {
            throw new DataAccessError(409, 'CHANGESET_HASH_CONFLICT', `章节《${chapter.title}》的 ${patch.field} 内容已变化。`)
          }
          if (patch.field === 'title') update.title = patch.after ?? ''
          if (patch.field === 'summary') update.summary = patch.after
          if (patch.field === 'content') {
            update.content = patch.after ?? ''
            update.wordCount = (patch.after ?? '').length
          }
        }
        const updated = await tx.chapter.updateMany({
          where: { id: chapterId, revision: expectedRevision },
          data: update,
        })
        if (updated.count !== 1) throw new DataAccessError(409, 'CHANGESET_REVISION_CONFLICT', `章节《${chapter.title}》写入时发生冲突。`)
        await tx.changeSetPatch.updateMany({
          where: { id: { in: patches.map((patch) => patch.id) } },
          data: { appliedRevision: expectedRevision + 1 },
        })
      }

      await recalculateNovelStats(tx, existing.novelId)
      const validations: ChangeSetValidation[] = [
        { code: 'ALL_PATCHES_ATOMIC', status: 'passed', message: `已原子应用 ${selected.length} 个补丁。`, targetIds: [...byChapter.keys()] },
        { code: 'REVISION_AND_HASH_VERIFIED', status: 'passed', message: '所有目标版本与内容哈希校验通过。', targetIds: [...byChapter.keys()] },
      ]
      await tx.changeSet.update({
        where: { id: changeSetId },
        data: { status: 'applied', snapshotId: changeSetId, validations },
      })
    })
  } catch (error) {
    if (error instanceof DataAccessError && error.status === 409) {
      await prisma.changeSet.update({
        where: { id: changeSetId },
        data: {
          status: 'conflicted',
          validations: [{ code: error.code, status: 'failed', message: error.message, targetIds: [] }],
        },
      })
    }
    throw error
  }

  return toChangeSet((await loadOwnedChangeSet(userId, changeSetId))!)
}

export async function rollbackChangeSetData(userId: string, changeSetId: string): Promise<ChangeSet | null> {
  const existing = await loadOwnedChangeSet(userId, changeSetId)
  if (!existing) return null
  if (existing.status === 'rolled_back') return toChangeSet(existing)
  if (existing.status !== 'applied') {
    throw new DataAccessError(409, 'CHANGESET_STATE_CONFLICT', '只有已应用的变更集可以整体回滚。')
  }
  const selected = existing.patches.filter((patch) => patch.selected && patch.appliedRevision !== null)

  try {
    await prisma.$transaction(async (tx) => {
      const byChapter = new Map<string, PrismaChangeSetPatch[]>()
      for (const patch of selected) {
        const bucket = byChapter.get(patch.targetId) ?? []
        bucket.push(patch)
        byChapter.set(patch.targetId, bucket)
      }
      for (const [chapterId, patches] of byChapter) {
        const chapter = await tx.chapter.findFirst({ where: { id: chapterId, novelId: existing.novelId } })
        if (!chapter) throw new DataAccessError(409, 'CHANGESET_TARGET_MISSING', `章节 ${chapterId} 已不存在。`)
        const appliedRevision = patches[0].appliedRevision
        if (!appliedRevision || chapter.revision !== appliedRevision) {
          throw new DataAccessError(409, 'CHANGESET_ROLLBACK_CONFLICT', `章节《${chapter.title}》在应用后又被修改，不能整体回滚。`)
        }
        const update: Prisma.ChapterUpdateManyMutationInput = { revision: { increment: 1 } }
        for (const patch of patches) {
          const current = fieldValue(chapter, patch.field)
          if (hashValue(current) !== hashValue(patch.after)) {
            throw new DataAccessError(409, 'CHANGESET_ROLLBACK_CONFLICT', `章节《${chapter.title}》当前内容与变更集结果不一致。`)
          }
          if (patch.field === 'title') update.title = patch.before ?? ''
          if (patch.field === 'summary') update.summary = patch.before
          if (patch.field === 'content') {
            update.content = patch.before ?? ''
            update.wordCount = (patch.before ?? '').length
          }
        }
        const restored = await tx.chapter.updateMany({ where: { id: chapterId, revision: appliedRevision }, data: update })
        if (restored.count !== 1) throw new DataAccessError(409, 'CHANGESET_ROLLBACK_CONFLICT', `章节《${chapter.title}》回滚时发生冲突。`)
      }
      await recalculateNovelStats(tx, existing.novelId)
      await tx.changeSet.update({
        where: { id: changeSetId },
        data: {
          status: 'rolled_back',
          validations: [{ code: 'ROLLBACK_COMPLETE', status: 'passed', message: `已整体回滚 ${selected.length} 个补丁。`, targetIds: [...byChapter.keys()] }],
        },
      })
    })
  } catch (error) {
    if (error instanceof DataAccessError && error.status === 409) {
      await prisma.changeSet.update({
        where: { id: changeSetId },
        data: { validations: [{ code: error.code, status: 'failed', message: error.message, targetIds: [] }] },
      })
    }
    throw error
  }
  return toChangeSet((await loadOwnedChangeSet(userId, changeSetId))!)
}

export async function getChangeSetData(userId: string, changeSetId: string): Promise<ChangeSet | null> {
  const record = await loadOwnedChangeSet(userId, changeSetId)
  return record ? toChangeSet(record) : null
}

export async function listChangeSetsData(userId: string, novelId: string): Promise<ChangeSet[]> {
  await ensureNovelOwner(userId, novelId)
  const records = await prisma.changeSet.findMany({
    where: { userId, novelId },
    include: { patches: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return records.map(toChangeSet)
}
