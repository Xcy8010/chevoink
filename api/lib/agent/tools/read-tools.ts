import { z } from 'zod'

import { prisma } from '../../prisma.js'
import { recordChapterBaseline } from '../baseline.js'
import { defineTool } from './types.js'

const READ_PERMISSION = { plan: 'allow', build: 'allow', review: 'allow' } as const

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

const CN_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function parseChapterNumber(raw: string): number | null {
  if (/^[0-9０-９]+$/.test(raw)) {
    const normalized = raw.replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    return Number(normalized)
  }
  // 中文数字支持到千位，章节序号场景够用
  let total = 0
  let current = 0
  for (const ch of raw) {
    if (ch in CN_DIGITS) {
      current = CN_DIGITS[ch]
    } else if (ch === '十') {
      total += (current || 1) * 10
      current = 0
    } else if (ch === '百') {
      total += (current || 1) * 100
      current = 0
    } else if (ch === '千') {
      total += (current || 1) * 1000
      current = 0
    } else {
      return null
    }
  }
  const value = total + current
  return value > 0 ? value : null
}

/** 从章节标题提取作者自带的「第N章」序号，用于和实际排位比对，
 * 揭示「作者删过章导致排位与标题错位」的情况 */
function extractTitleChapterNumber(title: string): number | null {
  const match = /^第\s*([0-9０-９零一二两三四五六七八九十百千]+)\s*[章回节]/.exec(title.trim())
  return match ? parseChapterNumber(match[1]) : null
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

    const chapterLines = chapters.map((chapter) => {
      const titleNumber = extractTitleChapterNumber(chapter.title)
      const mismatched = titleNumber !== null && titleNumber !== chapter.orderIndex
      return `- [${chapter.id}] 第${chapter.orderIndex}章《${chapter.title}》 ${chapter.wordCount}字 ${chapter.status === 'published' ? '已发布' : '草稿'}${chapter.summary ? ' 有摘要' : ''}${chapter.id === ctx.chapterId ? '（当前章节）' : ''}${mismatched ? ` 【注意：标题自称第${titleNumber}章，但实际排在第${chapter.orderIndex}位】` : ''}`
    })
    const hasMismatch = chapters.some((chapter) => {
      const titleNumber = extractTitleChapterNumber(chapter.title)
      return titleNumber !== null && titleNumber !== chapter.orderIndex
    })

    const output = [
      `作品：《${novel.displayTitle ?? novel.title}》 状态：${novel.status} 总字数：${novel.wordCount} 章节数：${novel.chapterCount}`,
      `简介：${clip(novel.summary, 400)}`,
      novel.tagNames.length ? `标签：${novel.tagNames.join('、')}${novel.categoryName ? ` 分类：${novel.categoryName}` : ''}` : '',
      novel.coverPrompt ? `封面提示词：${clip(novel.coverPrompt, 160)}` : '',
      chapters.length ? `章节列表：\n${chapterLines.join('\n')}` : '章节列表：暂无章节。',
      hasMismatch
        ? '提醒：存在标题序号与实际排位不一致的章节（通常是作者删过中间章节导致错位）。作者要求写「第N章」时，先确认目标到底是哪一章：要补写被删掉的章节时用 chapter_create 传 position 在正确位置插入（后续章节编号会自动后移），不要直接覆盖错位的其他章节；处理完后用 chapter_rename 把序号对不上的标题一并修正。'
        : '',
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
    chapterId: z.string().optional().describe('章节 ID，可从 novel_get_context 的章节列表获取；缺省时默认读当前正在编辑的章节'),
    offset: z.number().int().min(0).optional().describe('起始字符位置，默认 0'),
    limit: z.number().int().min(1).max(12000).optional().describe('读取字符数，默认 6000'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    // 缺省兜底：模型漏传 chapterId 时默认读作者当前打开的章节，避免白白打回一轮
    const chapterId = args.chapterId?.trim() || ctx.chapterId
    if (!chapterId) {
      return { output: '未传 chapterId 且当前没有正在编辑的章节。请先用 novel_get_context 查看章节列表拿到 chapterId。' }
    }
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId: ctx.novelId, authorId: ctx.userId },
      select: { id: true, title: true, content: true, wordCount: true, summary: true, updatedAt: true },
    })

    if (!chapter) {
      return { output: `章节 ${chapterId} 不存在或不属于当前作品。` }
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

/** 读取计划正文：回顾/修订既有计划前必须先读，禁止用 plan_save 凭记忆重写来“对齐” */
export const planReadTool = defineTool({
  name: 'plan_read',
  title: '读取计划',
  description:
    '只读查看「计划」文件夹里某份既有计划的完整正文。回顾整体规划、确认某章定位、修订计划前，都必须先用本工具读取；绝对禁止用 plan_save 重写一遍来代替读取。不传 planId 时返回最近更新的一份计划。',
  parameters: z.object({
    planId: z.string().optional().describe('计划 id（上下文的计划清单提供）；缺省返回最近更新的一份'),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    const plan = await prisma.agentArtifact.findFirst({
      where: {
        artifactType: 'chapterPlan',
        metadata: { path: ['savedAsPlan'], equals: true },
        run: { userId: ctx.userId, novelId: ctx.novelId },
        ...(args.planId ? { id: args.planId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, content: true, updatedAt: true },
    })

    if (!plan) {
      return {
        output: args.planId
          ? `未找到 planId=${args.planId} 对应的计划，请核对上下文里的计划清单。`
          : '计划文件夹目前是空的，还没有任何计划。',
      }
    }

    return {
      output: `《${plan.title}》（planId=${plan.id}，${plan.content.length} 字）：\n${clip(plan.content, 8000)}`,
      summary: `读取计划《${plan.title}》`,
    }
  },
})
