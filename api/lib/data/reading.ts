/**
 * 阅读进度与段划线域数据访问
 * 由 data-access.ts 按域拆分而来（声明顺序与原文件一致）；
 * 本文件为 api/lib/data-access.ts 桶文件的重导出源，禁止绕过桶文件新增消费者。
 */
import type { ReadingProgressItem, SaveReadingProgressRequest } from '../../../shared/contracts/index.js'
import { prisma } from '../prisma.js'
import { clampPercent, ensureUserExists, nowIso, toIso } from './internal.js'



// ---- 云端书架 + 阅读进度（多设备同步） ----

type ReadingProgressRow = {
  novelId: string
  novelTitle: string
  coverUrl: string | null
  chapterId: string | null
  chapterTitle: string | null
  chapterOrder: number
  totalChapters: number
  scrollPercent: number
  addedAt: Date
  updatedAt: Date
}



function toReadingProgressItem(row: ReadingProgressRow): ReadingProgressItem {
  return {
    novelId: row.novelId,
    novelTitle: row.novelTitle,
    coverUrl: row.coverUrl,
    chapterId: row.chapterId,
    chapterTitle: row.chapterTitle,
    chapterOrder: row.chapterOrder,
    totalChapters: row.totalChapters,
    scrollPercent: row.scrollPercent,
    addedAt: toIso(row.addedAt) ?? nowIso(),
    updatedAt: toIso(row.updatedAt) ?? nowIso(),
  }
}



/** 我的书架 + 阅读进度列表（按最近更新倒序） */
export async function listReadingProgressData(userId: string): Promise<ReadingProgressItem[]> {
  const rows = await prisma.readingProgress.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
  return rows.map(toReadingProgressItem)
}



/**
 * 保存书架/阅读进度（按 userId+novelId upsert）。
 * - scrollOnly：仅更新章内滚动位置，章节不匹配或无记录则忽略；
 * - shelfOnly：仅加入书架，已存在则保留原有进度不重置；
 * - 否则完整写入章节信息：同章重写保留章内进度，切换新章则从头（与本地语义一致）。
 * 作品不存在返回 null（路由据此回 404）。
 */
export async function saveReadingProgressData(
  userId: string,
  input: SaveReadingProgressRequest,
): Promise<ReadingProgressItem | null> {
  await ensureUserExists(userId)
  const novel = await prisma.novel.findUnique({ where: { id: input.novelId }, select: { id: true } })
  if (!novel) {
    return null
  }

  const existing = await prisma.readingProgress.findUnique({
    where: { userId_novelId: { userId, novelId: input.novelId } },
  })

  if (input.scrollOnly) {
    if (!existing || !input.chapterId || existing.chapterId !== input.chapterId) {
      return existing ? toReadingProgressItem(existing) : null
    }
    const updated = await prisma.readingProgress.update({
      where: { userId_novelId: { userId, novelId: input.novelId } },
      data: { scrollPercent: clampPercent(input.scrollPercent ?? existing.scrollPercent) },
    })
    return toReadingProgressItem(updated)
  }

  if (input.shelfOnly) {
    const saved = await prisma.readingProgress.upsert({
      where: { userId_novelId: { userId, novelId: input.novelId } },
      create: {
        userId,
        novelId: input.novelId,
        novelTitle: input.novelTitle,
        coverUrl: input.coverUrl ?? null,
      },
      update: {
        novelTitle: input.novelTitle,
        ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
      },
    })
    return toReadingProgressItem(saved)
  }

  const sameChapter = Boolean(existing && input.chapterId && existing.chapterId === input.chapterId)
  const nextScroll =
    input.scrollPercent !== undefined
      ? clampPercent(input.scrollPercent)
      : sameChapter
        ? existing?.scrollPercent ?? 0
        : 0

  const saved = await prisma.readingProgress.upsert({
    where: { userId_novelId: { userId, novelId: input.novelId } },
    create: {
      userId,
      novelId: input.novelId,
      novelTitle: input.novelTitle,
      coverUrl: input.coverUrl ?? null,
      chapterId: input.chapterId ?? null,
      chapterTitle: input.chapterTitle ?? null,
      chapterOrder: input.chapterOrder ?? 0,
      totalChapters: input.totalChapters ?? 0,
      scrollPercent: nextScroll,
    },
    update: {
      novelTitle: input.novelTitle,
      ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
      chapterId: input.chapterId ?? null,
      chapterTitle: input.chapterTitle ?? null,
      chapterOrder: input.chapterOrder ?? 0,
      totalChapters: input.totalChapters ?? 0,
      scrollPercent: nextScroll,
    },
  })
  return toReadingProgressItem(saved)
}



/** 从书架移除（删除该书的进度行） */
export async function removeReadingProgressData(userId: string, novelId: string): Promise<boolean> {
  const deleted = await prisma.readingProgress.deleteMany({ where: { userId, novelId } })
  return deleted.count > 0
}



// ── 阅读器段落划线（方案 20 §2.7） ────────────────────────────────────

/** 本章已划线的段落序号列表 */
export async function listParagraphUnderlinesData(userId: string, chapterId: string): Promise<number[]> {
  const rows = await prisma.paragraphUnderline.findMany({
    where: { userId, chapterId },
    select: { paragraphIndex: true },
    orderBy: { paragraphIndex: 'asc' },
  })
  return rows.map((row) => row.paragraphIndex)
}



/** 新增划线（幂等：已存在时直接返回成功） */
export async function saveParagraphUnderlineData(
  userId: string,
  input: { novelId: string; chapterId: string; paragraphIndex: number },
): Promise<boolean> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    select: { id: true, novelId: true },
  })
  if (!chapter || chapter.novelId !== input.novelId) {
    return false
  }

  await prisma.paragraphUnderline.upsert({
    where: {
      userId_chapterId_paragraphIndex: {
        userId,
        chapterId: input.chapterId,
        paragraphIndex: input.paragraphIndex,
      },
    },
    create: {
      userId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      paragraphIndex: input.paragraphIndex,
    },
    update: {},
  })
  return true
}



/** 取消划线（幂等） */
export async function removeParagraphUnderlineData(
  userId: string,
  chapterId: string,
  paragraphIndex: number,
): Promise<boolean> {
  const deleted = await prisma.paragraphUnderline.deleteMany({
    where: { userId, chapterId, paragraphIndex },
  })
  return deleted.count > 0
}
