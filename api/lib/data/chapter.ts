/**
 * 章节与创作/阅读视图域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import type { Prisma } from '@prisma/client'
import type { Chapter, CreateChapterRequest, ReaderPayload, StudioPayload, UpdateChapterRequest, Visibility } from '../../../shared/contracts/index.js'
import { prisma } from '../prisma.js'
import { PLACEHOLDER_NOVEL_TITLES, chapterListItemSelect, ensureNonEmptyText, ensureNovelOwner, recalculateNovelStats, resolveEffectiveNovelTitle, toChapter, toChapterListItem, toCoverAsset, toNovel } from './internal.js'
import { normalizeCoverImageUrl } from './novel.js'



export async function getStudioPayloadData(userId: string, novelId: string): Promise<StudioPayload | null> {
  const novel = await ensureNovelOwner(userId, novelId)

  // 历史脏数据自愈：title 被回滚成占位默认值而 displayTitle 保留真实书名时，把真实书名写回 title
  const trimmedDisplayTitle = novel.displayTitle?.trim()
  if (trimmedDisplayTitle && PLACEHOLDER_NOVEL_TITLES.has(novel.title.trim())) {
    await prisma.novel.update({ where: { id: novelId }, data: { title: trimmedDisplayTitle } })
    novel.title = trimmedDisplayTitle
  }

  const [chapters, coverAssetRecords] = await prisma.$transaction([
    prisma.chapter.findMany({
      where: { novelId },
      select: chapterListItemSelect,
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
    chapters: chapters.map(toChapterListItem),
    draftChapter: draftChapter ? toChapter(draftChapter) : null,
    coverAssets: coverAssets.map(toCoverAsset),
  }
}



export async function getReaderPayloadData(novelId: string, chapterId: string): Promise<ReaderPayload | null> {
  const [novel, currentChapter, chapterRecords] = await prisma.$transaction([
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
  ])

  if (!novel || !currentChapter || currentChapter.novelId !== novelId) {
    return null
  }

  // 阅读正文计入作品阅读量，作为热度榜的核心互动信号
  if (currentChapter.status !== 'draft') {
    await prisma.novel.update({
      where: { id: novelId },
      data: { viewCount: { increment: 1 } },
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

  // 用「最大编号+1」而不是「总数+1」：删过中间章节后总数会小于最大编号，
  // 总数+1 会撞 novelId+orderIndex 唯一约束导致建章直接报错
  const lastChapter = await prisma.chapter.findFirst({
    where: { novelId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  })

  const chapter = await prisma.$transaction(async (tx) => {
    const created = await tx.chapter.create({
      data: {
        novelId,
        authorId: userId,
        title: ensureNonEmptyText(input.title, 'title'),
        summary: input.summary?.trim() || null,
        content: input.content,
        orderIndex: (lastChapter?.orderIndex ?? 0) + 1,
        wordCount: input.content.length,
        status: input.status,
        visibility: input.visibility ?? defaultVisibility,
        publishedAt: input.status === 'published' ? new Date() : null,
      },
    })

    await recalculateNovelStats(tx, novelId)
    return created
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

  const nextStatus = input.status ?? existing.status
  const nextContent = input.content ?? existing.content

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.chapter.update({
      where: { id: chapterId },
      data: {
        title: input.title === undefined ? undefined : ensureNonEmptyText(input.title, 'title'),
        summary: input.summary === undefined ? undefined : input.summary,
        content: input.content ?? undefined,
        status: input.status ?? undefined,
        visibility: input.visibility ?? undefined,
        wordCount: nextContent.length,
        publishedAt:
          nextStatus === 'published'
            ? existing.publishedAt ?? new Date()
            : nextStatus === 'draft'
              ? null
              : existing.publishedAt,
      },
    })

    await recalculateNovelStats(tx, novelId)
    return record
  })

  return toChapter(updated)
}



/** 删除章节后把剩余章节编号压缩为连续的 1..N，避免章节树出现「第1/第4/第5章」跳号。
 * 按 orderIndex 升序逐个更新：目标编号恒 ≤ 当前编号且此前已被腾空，不会撞 novelId+orderIndex 唯一约束 */
async function compactChapterOrder(tx: Prisma.TransactionClient, novelId: string) {
  const chapters = await tx.chapter.findMany({
    where: { novelId },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, orderIndex: true },
  })

  for (let index = 0; index < chapters.length; index += 1) {
    const expected = index + 1
    if (chapters[index].orderIndex !== expected) {
      await tx.chapter.update({
        where: { id: chapters[index].id },
        data: { orderIndex: expected },
      })
    }
  }
}



export async function deleteChapterData(userId: string, novelId: string, chapterId: string): Promise<boolean> {
  await ensureNovelOwner(userId, novelId)

  const existing = await prisma.chapter.findUnique({
    where: { id: chapterId },
  })

  if (!existing || existing.novelId !== novelId) {
    return false
  }

  await prisma.$transaction(async (tx) => {
    await tx.chapter.delete({
      where: { id: chapterId },
    })
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
