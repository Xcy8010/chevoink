import { DataAccessError, prisma } from './prisma.js'
import { generatePublishAdviceData } from './ai-service.js'
import type { PublishAdvice } from '../../shared/contracts/index.js'
import { listNovelPlanArtifacts } from './agent/plan-artifacts.js'
import { readNovelCoverBuffer } from './novel-cover-storage.js'
import { buildZipBuffer, type ZipEntry } from './zip-writer.js'

/** 一键导出选项：四类内容可勾选，章节支持全量或按 ID 子集 */
export type NovelExportOptions = {
  includePlans?: boolean
  includeCatalog?: boolean
  includeInfo?: boolean
  includeChapters?: boolean
  chapterIds?: string[]
}

export type NovelExportResult = {
  buffer: Buffer
  fileName: string
  /** 人类可读的导出摘要（toast / Agent 回填共用） */
  summary: string
}

/** zip 内目录/文件名清洗：去掉路径与 Windows 非法字符，限长防膨胀 */
function sanitizePathComponent(input: string, fallback: string): string {
  const cleaned = input
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

  return cleaned || fallback
}

function formatDateTime(value: Date): string {
  const pad = (num: number) => String(num).padStart(2, '0')

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`
}

/** 发布建议缓存：作品未变化（书名/简介/标签/首章）时直接复用上次 AI 结果，重复导出零等待 */
const publishAdviceCache = new Map<string, { fingerprint: string; advice: PublishAdvice }>()

type AdviceNovelInput = {
  id: string
  title: string
  displayTitle: string | null
  summary: string
  categoryName: string | null
  tagNames: string[]
  updatedAt: Date
}

type AdviceChapterInput = { id: string; content: string; wordCount: number; updatedAt: Date }

function buildAdviceFingerprint(
  novel: AdviceNovelInput,
  firstChapter: AdviceChapterInput | undefined,
): string {
  return [
    novel.updatedAt.getTime(),
    novel.title,
    novel.displayTitle ?? '',
    novel.summary,
    novel.categoryName ?? '',
    novel.tagNames.join('、'),
    firstChapter ? `${firstChapter.id}:${firstChapter.updatedAt.getTime()}:${firstChapter.wordCount}` : 'no-chapter',
  ].join('|')
}

async function resolvePublishAdvice(
  userId: string,
  novel: AdviceNovelInput,
  firstChapter: AdviceChapterInput | undefined,
): Promise<PublishAdvice> {
  const fingerprint = buildAdviceFingerprint(novel, firstChapter)
  const cached = publishAdviceCache.get(novel.id)
  if (cached && cached.fingerprint === fingerprint) {
    return cached.advice
  }

  const advice = await generatePublishAdviceData(userId, {
    novelId: novel.id,
    title: novel.displayTitle?.trim() || novel.title,
    summary: novel.summary,
    genre: novel.categoryName ?? '未分类',
    tags: novel.tagNames,
    sampleText: firstChapter?.content ?? '',
  })

  if (publishAdviceCache.size > 200) {
    publishAdviceCache.clear()
  }
  publishAdviceCache.set(novel.id, { fingerprint, advice })

  return advice
}

/**
 * 组装一键导出 zip：作品名 > 规划 / 目录 / 章节 / 作品信息以及发布建议 四个文件夹。
 * 发布建议走 AI 生成并钳制到番茄词表；AI 不可用时降级为提示文案，不阻断导出。
 */
export async function buildNovelExportZip(
  userId: string,
  novelId: string,
  options: NovelExportOptions,
): Promise<NovelExportResult> {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, authorId: userId },
    select: {
      id: true,
      title: true,
      displayTitle: true,
      summary: true,
      categoryName: true,
      tagNames: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { nickname: true } },
      coverAsset: { select: { imageUrl: true } },
    },
  })

  if (!novel) {
    throw new DataAccessError(404, 'NOT_FOUND', '作品不存在或无权访问。')
  }

  const includePlans = options.includePlans !== false
  const includeCatalog = options.includeCatalog !== false
  const includeInfo = options.includeInfo !== false
  const includeChapters = options.includeChapters !== false

  if (!includePlans && !includeCatalog && !includeInfo && !includeChapters) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '请至少勾选一项导出内容。')
  }

  const allChapters = await prisma.chapter.findMany({
    where: { novelId },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, title: true, content: true, wordCount: true, status: true, updatedAt: true },
  })

  const wantedIds = options.chapterIds?.length ? new Set(options.chapterIds) : null
  const chapters = wantedIds ? allChapters.filter((chapter) => wantedIds.has(chapter.id)) : allChapters

  if (includeChapters && wantedIds && chapters.length === 0) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '勾选的章节不存在，请重新选择。')
  }

  // 发布建议是导出唯一慢步骤（AI 调用）：缓存未命中时尽早发请求，与后续装配并行隐藏延迟
  const advicePromise = includeInfo ? resolvePublishAdvice(userId, novel, allChapters[0]) : null

  const root = sanitizePathComponent(novel.displayTitle?.trim() || novel.title, '未命名作品')
  const entries: ZipEntry[] = []
  const text = (value: string) => Buffer.from(value, 'utf8')
  const summaryParts: string[] = []

  if (includePlans) {
    const { items } = await listNovelPlanArtifacts(userId, novelId)

    for (const plan of items) {
      entries.push({
        path: `${root}/规划/${sanitizePathComponent(plan.title, '未命名计划')}.txt`,
        data: text(plan.content || '（空白计划）'),
      })
    }

    summaryParts.push(`${items.length} 份规划`)
  }

  if (includeCatalog) {
    const lines = allChapters.map(
      (chapter, index) => `第${index + 1}章 ${chapter.title}（${chapter.wordCount} 字 · ${chapter.status === 'published' ? '已发布' : '草稿'}）`,
    )

    entries.push({
      path: `${root}/目录/目录.txt`,
      data: text(`《${novel.displayTitle?.trim() || novel.title}》目录（共 ${allChapters.length} 章）\n\n${lines.join('\n')}\n`),
    })
    summaryParts.push('目录')
  }

  if (includeChapters && chapters.length > 0) {
    chapters.forEach((chapter) => {
      const order = String(allChapters.findIndex((item) => item.id === chapter.id) + 1).padStart(4, '0')

      entries.push({
        path: `${root}/章节/第${order}章 ${sanitizePathComponent(chapter.title, '未命名章节')}.txt`,
        data: text(`${chapter.title}\n\n${chapter.content}`),
      })
    })

    summaryParts.push(`${chapters.length} 个章节`)
  }

  if (includeInfo) {
    const cover = await readNovelCoverBuffer(novel.coverAsset?.imageUrl ?? null)
    const infoLines = [
      `作品名称：${novel.displayTitle?.trim() || novel.title}`,
      `简介：${novel.summary || '（暂无简介）'}`,
      `作者：${novel.author.nickname}`,
      `封面图片：${cover ? `封面.${cover.extension}（见同目录图片文件）` : novel.coverAsset?.imageUrl ?? '（暂无封面）'}`,
      `作品标签：${[novel.categoryName, ...novel.tagNames].filter(Boolean).join('、') || '（暂无标签）'}`,
      `作品创建时间：${formatDateTime(novel.createdAt)}`,
      `上一次更新时间：${formatDateTime(novel.updatedAt)}`,
    ]

    entries.push({ path: `${root}/作品信息以及发布建议/作品信息.txt`, data: text(`${infoLines.join('\n')}\n`) })

    if (cover) {
      entries.push({ path: `${root}/作品信息以及发布建议/封面.${cover.extension}`, data: cover.buffer })
    }

    let adviceText = '发布建议本次未生成（AI 服务暂不可用），可稍后重新导出。'

    try {
      const advice = advicePromise ? await advicePromise : null

      if (advice) {
        adviceText = [
          `《${novel.displayTitle?.trim() || novel.title}》番茄小说发布建议`,
          '',
          `频道：${advice.channel}`,
          `主分类：${advice.mainCategory || '（建议在番茄作者端结合主分类清单人工确认）'}`,
          `阅读标签·作品：${advice.themeTags.join('、') || '（无）'}`,
          `阅读标签·角色：${advice.roleTags.join('、') || '（无）'}`,
          `阅读标签·情节：${advice.plotTags.join('、') || '（无）'}`,
          `内容标签·情节：${advice.contentPlotTags.join('、') || '（无）'}`,
          `内容标签·人设：${advice.contentRoleTags.join('、') || '（无）'}`,
          `内容标签·情感：${advice.contentEmotionTags.join('、') || '（无）'}`,
          `内容标签·世界观：${advice.contentWorldviewTags.join('、') || '（无）'}`,
          `主角名字：${advice.protagonists.join('、') || '（无）'}`,
          '',
          '作品简介：',
          advice.summary || '（无）',
        ].join('\n')
      }
    } catch {
      // AI 不可用不阻断导出，降级文案已就位
    }

    entries.push({ path: `${root}/作品信息以及发布建议/发布建议.txt`, data: text(`${adviceText}\n`) })
    summaryParts.push('作品信息与发布建议')
  }

  if (entries.length === 0) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '当前作品没有可导出的内容。')
  }

  const buffer = buildZipBuffer(entries)
  const fileName = `${root}-一键导出.zip`

  return { buffer, fileName, summary: summaryParts.join('、') }
}
