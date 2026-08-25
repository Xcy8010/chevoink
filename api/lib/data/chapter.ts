/**
 * 章节与创作/阅读视图域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import type { Prisma } from '@prisma/client'
import type { Chapter, CreateChapterRequest, ReaderPayload, StudioPayload, UpdateChapterRequest, Visibility } from '../../../shared/contracts/index.js'
import { DataAccessError, prisma } from '../prisma.js'
import { CHAPTER_REVISION_CONFLICT_CODE, CHAPTER_REVISION_CONFLICT_MESSAGE, isChapterRevisionCurrent } from './chapter-revision.js'
import { PLACEHOLDER_NOVEL_TITLES, chapterListItemSelect, ensureNonEmptyText, ensureNovelOwner, recalculateNovelStats, resolveEffectiveNovelTitle, toChapter, toChapterListItem, toCoverAsset, toNovel, toVolumeListItem, volumeListItemInclude } from './internal.js'
import { normalizeCoverImageUrl } from './novel.js'
import { normalizeNovelStructure, placeCreatedChapter, resolveChapterPlacement } from './volume.js'
import { resolveAgent2FeatureFlags } from '../agent2-feature-flags.js'



export async function getStudioPayloadData(userId: string, novelId: string): Promise<StudioPayload | null> {
  const novel = await ensureNovelOwner(userId, novelId)

  // 历史脏数据自愈：title 被回滚成占位默认值而 displayTitle 保留真实书名时，把真实书名写回 title
  const trimmedDisplayTitle = novel.displayTitle?.trim()
  if (trimmedDisplayTitle && PLACEHOLDER_NOVEL_TITLES.has(novel.title.trim())) {
    await prisma.novel.update({ where: { id: novelId }, data: { title: trimmedDisplayTitle } })
    novel.title = trimmedDisplayTitle
  }

  const [chapters, volumes, coverAssetRecords] = await prisma.$transaction([
    prisma.chapter.findMany({
      where: { novelId },
      select: chapterListItemSelect,
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.volume.findMany({
      where: { novelId },
      include: volumeListItemInclude,
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.coverAsset.findMany({
      where: { novelId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    }),
  ])

  // 存量 base64 封面懒迁移：读到即落盘转静态文件路径，避免巨型 data URL 拖垮 studio 首屏 payload
  const coverAssets = await Promise.all(
    coverAssetRecords.map(async (asset) => {
      if (!asset.imageUrl.startsWith('data:image/')) {
        return asset
      }
      const nextUrl = await normalizeCoverImageUrl(asset.imageUrl)
      if (nextUrl === asset.imageUrl) {
        return asset
      }
      await prisma.coverAsset.update({ where: { id: asset.id }, data: { imageUrl: nextUrl } })
      return { ...asset, imageUrl: nextUrl }
    }),
  )

  // 草稿章需要完整正文，单独按 id 补查一次，避免列表查询携带全部章节正文
  const draftChapterMeta = chapters.find((chapter) => chapter.status === 'draft') ?? null
  const draftChapter = draftChapterMeta
    ? await prisma.chapter.findUnique({ where: { id: draftChapterMeta.id } })
    : null

  return {
    novel: toNovel(novel, userId),
    volumes: volumes.map(toVolumeListItem),
    chapters: chapters.map(toChapterListItem),
    draftChapter: draftChapter ? toChapter(draftChapter) : null,
    coverAssets: coverAssets.map(toCoverAsset),
    featureFlags: resolveAgent2FeatureFlags(userId),
  }
}



export async function getReaderPayloadData(
  novelId: string,
  chapterId: string,
  userId: string | null,
): Promise<ReaderPayload | null> {
  const [novel, currentChapter, chapterRecords, volumeRecords] = await prisma.$transaction([
    prisma.novel.findUnique({
      where: { id: novelId },
      include: { coverAsset: true },
    }),
    prisma.chapter.findUnique({
      where: { id: chapterId },
    }),
    prisma.chapter.findMany({
      where: { novelId },
      select: chapterListItemSelect,
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.volume.findMany({
      where: { novelId },
      include: {
        chapters: {
          where: { status: { not: 'draft' } },
          select: { wordCount: true },
        },
      },
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  if (!novel || !currentChapter || currentChapter.novelId !== novelId) {
    return null
  }

  // 阅读数 UV 口径：登录用户首次阅读该作品写入 novel_reads 去重表并 +1，重读不累加；
  // 匿名阅读不计入读者数（与微信读书登录态口径一致），草稿章不计。
  if (currentChapter.status !== 'draft' && userId) {
    await prisma.$transaction(async (tx) => {
      const created = await tx.novelRead.createMany({
        data: [{ userId, novelId }],
        skipDuplicates: true,
      })
      if (created.count > 0) {
        await tx.novel.update({
          where: { id: novelId },
          data: { viewCount: { increment: 1 } },
        })
      }
    })
  }

  const visibleChapters = chapterRecords.filter((chapter) => chapter.status !== 'draft')
  const currentIndex = visibleChapters.findIndex((chapter) => chapter.id === currentChapter.id)

  return {
    novel: {
      id: novel.id,
      title: resolveEffectiveNovelTitle(novel.title, novel.displayTitle),
      displayTitle: novel.displayTitle ?? null,
      slug: novel.slug,
      coverUrl: novel.coverAsset?.imageUrl ?? null,
    },
    currentChapter: toChapter(currentChapter),
    volumes: volumeRecords.map(toVolumeListItem),
    chapterList: visibleChapters.map(toChapterListItem),
    previousChapterId: currentIndex > 0 ? visibleChapters[currentIndex - 1].id : null,
    nextChapterId:
      currentIndex >= 0 && currentIndex < visibleChapters.length - 1
        ? visibleChapters[currentIndex + 1].id
        : null,
  }
}



export async function createChapterData(
  userId: string,
  novelId: string,
  input: CreateChapterRequest,
  defaultVisibility: Visibility,
): Promise<Chapter | null> {
  await ensureNovelOwner(userId, novelId)

  const chapter = await prisma.$transaction(async (tx) => {
    const placement = await resolveChapterPlacement(tx, novelId, input.volumeId, input.orderInVolume)
    const chapterCount = await tx.chapter.count({ where: { novelId } })
    const created = await tx.chapter.create({
      data: {
        novelId,
        authorId: userId,
        title: ensureNonEmptyText(input.title, 'title'),
        summary: input.summary?.trim() || null,
        content: input.content,
        volumeId: placement.volume.id,
        orderInVolume: -(placement.count + 1),
        orderIndex: -(chapterCount + 1),
        wordCount: input.content.length,
        status: input.status,
        visibility: input.visibility ?? defaultVisibility,
        publishedAt: input.status === 'published' ? new Date() : null,
      },
    })

    await placeCreatedChapter(tx, novelId, created, placement.volume.id, placement.position)
    await recalculateNovelStats(tx, novelId)
    return tx.chapter.findUniqueOrThrow({ where: { id: created.id } })
  })

  return toChapter(chapter)
}



export async function getChapterData(userId: string, novelId: string, chapterId: string): Promise<Chapter | null> {
  await ensureNovelOwner(userId, novelId)

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
  })

  if (!chapter || chapter.novelId !== novelId) {
    return null
  }

  return toChapter(chapter)
}



export async function updateChapterData(
  userId: string,
  novelId: string,
  chapterId: string,
  input: UpdateChapterRequest,
): Promise<Chapter | null> {
  await ensureNovelOwner(userId, novelId)

  const existing = await prisma.chapter.findUnique({
    where: { id: chapterId },
  })

  if (!existing || existing.novelId !== novelId) {
    return null
  }

  if (!isChapterRevisionCurrent(input.expectedRevision, existing.revision)) {
    throw new DataAccessError(409, CHAPTER_REVISION_CONFLICT_CODE, CHAPTER_REVISION_CONFLICT_MESSAGE)
  }

  const nextStatus = input.status ?? existing.status

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.ChapterUpdateManyMutationInput = {
      title: input.title === undefined ? undefined : ensureNonEmptyText(input.title, 'title'),
      summary: input.summary === undefined ? undefined : input.summary,
      content: input.content ?? undefined,
      status: input.status ?? undefined,
      visibility: input.visibility ?? undefined,
      wordCount: input.content === undefined ? undefined : input.content.length,
      revision: { increment: 1 },
      publishedAt:
        input.status === undefined
          ? undefined
          : nextStatus === 'published'
            ? existing.publishedAt ?? new Date()
            : nextStatus === 'draft'
              ? null
              : existing.publishedAt,
    }

    if (input.expectedRevision === undefined) {
      await tx.chapter.update({ where: { id: chapterId }, data })
    } else {
      const result = await tx.chapter.updateMany({
        where: { id: chapterId, revision: input.expectedRevision },
        data,
      })
      if (result.count === 0) {
        throw new DataAccessError(409, CHAPTER_REVISION_CONFLICT_CODE, CHAPTER_REVISION_CONFLICT_MESSAGE)
      }
    }

    const record = await tx.chapter.findUnique({ where: { id: chapterId } })
    if (!record) {
      throw new DataAccessError(404, 'CHAPTER_NOT_FOUND', '章节不存在或已被删除。')
    }

    await recalculateNovelStats(tx, novelId)
    return record
  })

  return toChapter(updated)
}



/** 删除后同时压缩卷内序与全书序，兼容既有调用点。 */
async function compactChapterOrder(tx: Prisma.TransactionClient, novelId: string) {
  await normalizeNovelStructure(tx, novelId)
}



export async function deleteChapterData(
  userId: string,
  novelId: string,
  chapterId: string,
  expectedRevision?: number,
): Promise<boolean> {
  await ensureNovelOwner(userId, novelId)

  const existing = await prisma.chapter.findUnique({
    where: { id: chapterId },
  })

  if (!existing || existing.novelId !== novelId) {
    return false
  }

  if (!isChapterRevisionCurrent(expectedRevision, existing.revision)) {
    throw new DataAccessError(409, CHAPTER_REVISION_CONFLICT_CODE, CHAPTER_REVISION_CONFLICT_MESSAGE)
  }

  await prisma.$transaction(async (tx) => {
    if (expectedRevision === undefined) {
      await tx.chapter.delete({ where: { id: chapterId } })
    } else {
      const deleted = await tx.chapter.deleteMany({ where: { id: chapterId, revision: expectedRevision } })
      if (deleted.count === 0) {
        throw new DataAccessError(409, CHAPTER_REVISION_CONFLICT_CODE, CHAPTER_REVISION_CONFLICT_MESSAGE)
      }
    }
    await compactChapterOrder(tx, novelId)
    await recalculateNovelStats(tx, novelId)
  })

  return true
}



/** 对读者可见的公开章节条件：已发布且公开 */
export const publicChapterWhere = {
  status: 'published',
  visibility: 'public',
} satisfies Prisma.ChapterWhereInput



/** 后台删除单章：复用普通删除的排序压缩与统计回算 */
export async function adminDeleteChapterData(chapterId: string): Promise<{ title: string; novelId: string } | null> {
  const existing = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, title: true, novelId: true },
  })
  if (!existing) {
    return null
  }

  await prisma.$transaction(async (tx) => {
    await tx.chapter.delete({ where: { id: chapterId } })
    await compactChapterOrder(tx, existing.novelId)
    await recalculateNovelStats(tx, existing.novelId)
  })
  return { title: existing.title, novelId: existing.novelId }
}
