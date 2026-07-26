import { z } from 'zod'

import { prisma } from '../../prisma.js'
import { recordChapterBaseline } from '../baseline.js'
import { defineTool } from './types.js'

const READ_PERMISSION = { plan: 'allow', build: 'allow', review: 'allow' } as const

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

/** 小说全局上下文：信息/章节列表/状态 */
export const novelGetContextTool = defineTool({
  name: 'novel_get_context',
  title: '读取作品上下文',
  description:
    '获取当前作品的整体信息：标题、简介、题材标签、状态、章节列表（含每章标题/字数/状态/是否有摘要）。在规划或写作前先调用它了解全局。',
  parameters: z.object({}),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: {
        title: true,
        displayTitle: true,
        summary: true,
        tagNames: true,
        categoryName: true,
        status: true,
        wordCount: true,
        chapterCount: true,
        coverPrompt: true,
      },
    })

    if (!novel) {
      return { output: '未找到当前作品，可能已被删除。' }
    }

    const chapters = await prisma.chapter.findMany({
      where: { novelId: ctx.novelId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, title: true, orderIndex: true, wordCount: true, status: true, summary: true },
    })

    const chapterLines = chapters.map(
      (chapter) =>
        `- [${chapter.id}] 第${chapter.orderIndex}章《${chapter.title}》 ${chapter.wordCount}字 ${chapter.status === 'published' ? '已发布' : '草稿'}${chapter.summary ? ' 有摘要' : ''}${chapter.id === ctx.chapterId ? '（当前章节）' : ''}`,
    )

    const output = [
      `作品：《${novel.displayTitle ?? novel.title}》 状态：${novel.status} 总字数：${novel.wordCount} 章节数：${novel.chapterCount}`,
      `简介：${clip(novel.summary, 400)}`,
      novel.tagNames.length ? `标签：${novel.tagNames.join('、')}${novel.categoryName ? ` 分类：${novel.categoryName}` : ''}` : '',
      novel.coverPrompt ? `封面提示词：${clip(novel.coverPrompt, 160)}` : '',
      chapters.length ? `章节列表：\n${chapterLines.join('\n')}` : '章节列表：暂无章节。',
    ]
      .filter(Boolean)
      .join('\n')

    return { output, summary: `读取《${novel.displayTitle ?? novel.title}》上下文 · ${chapters.length} 章` }
  },
})

/** 读章节正文（支持 range 防爆上下文） */
export const chapterReadTool = defineTool({
  name: 'chapter_read',
  title: '读取章节正文',
  description:
    '读取指定章节的正文。支持 offset/limit 按字符分段读取（正文超过 6000 字时建议分段）。写作或改写前先读相关章节，禁止盲写。',
  parameters: z.object({
    chapterId: z.string().describe('章节 ID，可从 novel_get_context 的章节列表获取'),
    offset: z.number().int().min(0).optional().describe('起始字符位置，默认 0'),
    limit: z.number().int().min(1).max(12000).optional().describe('读取字符数，默认 6000'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: args.chapterId, novelId: ctx.novelId, authorId: ctx.userId },
      select: { id: true, title: true, content: true, wordCount: true, summary: true, updatedAt: true },
    })

    if (!chapter) {
      return { output: `章节 ${args.chapterId} 不存在或不属于当前作品。` }
    }

    // 读取即记录写入基线：后续写入前校验 updatedAt，防止覆盖用户手动修改
    recordChapterBaseline(ctx.runId, chapter.id, chapter.updatedAt)

    const offset = args.offset ?? 0
    const limit = args.limit ?? 6000
    const slice = chapter.content.slice(offset, offset + limit)
    const hasMore = offset + limit < chapter.content.length

    const output = [
      `《${chapter.title}》 总长 ${chapter.content.length} 字，当前返回 [${offset}, ${offset + slice.length})${hasMore ? '，后续还有内容，可继续用 offset 分段读取' : '（已到结尾）'}`,
      chapter.summary ? `本章摘要：${chapter.summary}` : '',
      '正文：',
      slice || '（本章暂无正文）',
    ]
      .filter(Boolean)
      .join('\n')

    return {
      output,
      summary: `读取《${chapter.title}》 ${offset}-${offset + slice.length} 字`,
    }
  },
})

/** 邻近章节摘要批量读取 */
export const chapterListSummariesTool = defineTool({
  name: 'chapter_list_summaries',
  title: '读取章节摘要',
  description: '批量读取章节摘要（无摘要的章节返回开头片段），用于快速了解前情脉络，比逐章读正文省得多。',
  parameters: z.object({
    aroundChapterId: z.string().optional().describe('以该章节为中心取邻近章节；缺省则取最近的章节'),
    count: z.number().int().min(1).max(20).optional().describe('返回章节数，默认 6'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    const chapters = await prisma.chapter.findMany({
      where: { novelId: ctx.novelId, authorId: ctx.userId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, title: true, orderIndex: true, summary: true, content: true },
    })

    if (chapters.length === 0) {
      return { output: '当前作品还没有章节。' }
    }

    const count = args.count ?? 6
    const centerIndex = args.aroundChapterId
      ? Math.max(0, chapters.findIndex((chapter) => chapter.id === args.aroundChapterId))
      : chapters.length - 1
    const start = Math.max(0, centerIndex - Math.floor(count / 2))
    const picked = chapters.slice(start, start + count)

    const lines = picked.map((chapter) => {
      const digest = chapter.summary?.trim() || `（无摘要，开头：${clip(chapter.content.replace(/\s+/g, ' '), 120)}）`
      return `第${chapter.orderIndex}章《${chapter.title}》[${chapter.id}]：${clip(digest, 300)}`
    })

    return {
      output: lines.join('\n'),
      summary: `读取 ${picked.length} 章摘要`,
    }
  },
})

/** 检索项目记忆（角色/设定/时间线/伏笔/章节摘要） */
export const memorySearchTool = defineTool({
  name: 'memory_search',
  title: '检索创作记忆',
  description:
    '按关键词检索本作品沉淀的创作记忆：角色卡、世界观设定、时间线事件、伏笔、章节摘要、风格偏好等。写作前校对人名/设定时使用。',
  parameters: z.object({
    query: z.string().min(1).describe('检索关键词（人名、地名、设定名等）'),
    memoryType: z
      .enum([
        'novelSummary',
        'worldbuilding',
        'characterCard',
        'chapterSummary',
        'timelineEvent',
        'foreshadowing',
        'stylePreference',
        'continuityRule',
      ])
      .optional()
      .describe('限定记忆类型，缺省为全部'),
    limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 8'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    const entries = await prisma.projectMemoryEntry.findMany({
      where: {
        novelId: ctx.novelId,
        ...(args.memoryType ? { memoryType: args.memoryType } : {}),
        OR: [
          { title: { contains: args.query, mode: 'insensitive' } },
          { content: { contains: args.query, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: args.limit ?? 8,
      select: { memoryType: true, title: true, content: true, importance: true },
    })

    if (entries.length === 0) {
      return { output: `没有找到与"${args.query}"相关的记忆条目。` }
    }

    const lines = entries.map(
      (entry) => `[${entry.memoryType}] ${entry.title}（重要性 ${entry.importance}）：${clip(entry.content, 400)}`,
    )

    return {
      output: lines.join('\n'),
      summary: `检索"${args.query}" · 命中 ${entries.length} 条`,
    }
  },
})
