import { z } from 'zod'

import type { Prisma } from '@prisma/client'

import { prisma } from '../../prisma.js'
import { ALL_NOVEL_TAGS, MAX_NOVEL_TAGS } from '../../../../shared/contracts/novel-tags.js'
import { getChapterBaseline, recordChapterBaseline } from '../baseline.js'
import { defineTool, type ToolContext, type ToolResult } from './types.js'

const WRITE_PERMISSION = { plan: 'deny', build: 'allow', review: 'deny' } as const
const DANGEROUS_PERMISSION = { plan: 'deny', build: 'ask', review: 'deny' } as const

async function findOwnedChapter(ctx: ToolContext, chapterId: string) {
  return prisma.chapter.findFirst({
    where: { id: chapterId, novelId: ctx.novelId, authorId: ctx.userId },
  })
}

async function recalcNovelStats(novelId: string) {
  const chapters = await prisma.chapter.findMany({
    where: { novelId },
    orderBy: { orderIndex: 'asc' },
    select: { wordCount: true, title: true, status: true, publishedAt: true },
  })

  const wordCount = chapters.reduce((total, chapter) => total + (chapter.wordCount ?? 0), 0)
  const lastChapter = chapters[chapters.length - 1] ?? null
  // 与 data-access 的 recalculateNovelStats 口径一致：取序号最大的已发布章节的发布时间
  const latestPublished = [...chapters]
    .reverse()
    .find((chapter) => chapter.status === 'published' && chapter.publishedAt)

  await prisma.novel.update({
    where: { id: novelId },
    data: {
      wordCount,
      chapterCount: chapters.length,
      lastChapterTitle: lastChapter?.title ?? null,
      lastPublishedAt: latestPublished?.publishedAt ?? null,
    },
  })
}

/** 基线冲突检测：用户在 Agent 运行期间手动改过正文时不盲写 */
function buildConflictResult(chapterTitle: string): ToolResult {
  return {
    output: `冲突：章节《${chapterTitle}》的正文在你上次读取后已被用户手动修改。请先用 chapter_read 重新读取最新内容，再决定如何写入，避免覆盖用户的修改。`,
    summary: `《${chapterTitle}》存在编辑冲突，已阻止写入`,
  }
}

async function writeChapterContent(
  ctx: ToolContext,
  chapterId: string,
  buildNextContent: (current: string) => string,
  actionLabel: string,
): Promise<ToolResult> {
  const chapter = await findOwnedChapter(ctx, chapterId)

  if (!chapter) {
    return { output: `章节 ${chapterId} 不存在或不属于当前作品。请先用 novel_get_context 查看章节列表。` }
  }

  const baseline = getChapterBaseline(ctx.runId, chapter.id)
  if (baseline && baseline !== chapter.updatedAt.toISOString()) {
    return buildConflictResult(chapter.title)
  }

  const before = chapter.content
  const after = buildNextContent(before)

  const updated = await prisma.chapter.update({
    where: { id: chapter.id },
    data: { content: after, wordCount: after.length },
  })
  await recalcNovelStats(ctx.novelId)
  recordChapterBaseline(ctx.runId, chapter.id, updated.updatedAt)

  return {
    output: `已${actionLabel}章节《${chapter.title}》，当前正文 ${after.length} 字。`,
    summary: `${actionLabel}《${chapter.title}》 · ${after.length} 字`,
    display: {
      kind: 'chapterDiff',
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      before,
      after,
      appliedDirectly: true,
    },
    snapshot: { target: 'chapter', targetId: chapter.id, field: 'content', previousValue: before },
  }
}

export const chapterCreateTool = defineTool({
  name: 'chapter_create',
  title: '新建章节',
  description:
    '在当前作品末尾创建一个新章节。推荐两步流程：先只传 title 创建空章节（作者立刻能在章节树看到新章），再用 chapter_write 写入正文；也可以带 content 一次性创建。返回新章节的 chapterId。',
  parameters: z.object({
    title: z.string().min(1).max(120).describe('章节标题'),
    content: z.string().optional().describe('章节正文，可留空'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const count = await prisma.chapter.count({ where: { novelId: ctx.novelId } })
    const content = args.content ?? ''

    const chapter = await prisma.chapter.create({
      data: {
        novelId: ctx.novelId,
        authorId: ctx.userId,
        title: args.title.trim(),
        content,
        orderIndex: count + 1,
        wordCount: content.length,
        status: 'draft',
        visibility: 'public',
      },
    })
    await recalcNovelStats(ctx.novelId)
    recordChapterBaseline(ctx.runId, chapter.id, chapter.updatedAt)

    return {
      output: `已创建第 ${chapter.orderIndex} 章《${chapter.title}》，chapterId=${chapter.id}${content ? `，写入 ${content.length} 字` : '（暂无正文）'}。`,
      summary: `新建第 ${chapter.orderIndex} 章《${chapter.title}》`,
      // 带正文创建时返回 chapterDiff（空基线→全绿新增），前端才能挂上绿增红减的审查条；空章节仍用 chapterRef
      display: content
        ? {
            kind: 'chapterDiff',
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            before: '',
            after: content,
            appliedDirectly: true,
          }
        : { kind: 'chapterRef', chapterId: chapter.id, title: chapter.title, wordCount: 0 },
      ...(content
        ? { snapshot: { target: 'chapter' as const, targetId: chapter.id, field: 'content', previousValue: '' } }
        : {}),
    }
  },
})

export const chapterWriteTool = defineTool({
  name: 'chapter_write',
  title: '写入章节正文',
  description:
    '用新内容整体覆盖指定章节的正文。需要已存在的 chapterId（新章节请先 chapter_create）。覆盖前建议先 chapter_read 了解现有内容；如只是接着写请用 chapter_append。',
  parameters: z.object({
    chapterId: z.string().describe('目标章节 ID'),
    content: z.string().min(1).describe('完整的新正文'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    return writeChapterContent(ctx, args.chapterId, () => args.content, '覆盖写入')
  },
})

export const chapterAppendTool = defineTool({
  name: 'chapter_append',
  title: '追加章节正文',
  description: '把生成的内容追加到指定章节正文末尾（自动补一个空行分隔），用于续写场景。',
  parameters: z.object({
    chapterId: z.string().describe('目标章节 ID'),
    content: z.string().min(1).describe('要追加的内容'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    return writeChapterContent(
      ctx,
      args.chapterId,
      (current) => (current.trim() ? `${current.replace(/\s+$/, '')}\n\n${args.content}` : args.content),
      '追加',
    )
  },
})

export const chapterEditRangeTool = defineTool({
  name: 'chapter_edit_range',
  title: '改写章节片段',
  description:
    '按字符区间替换章节正文的一个片段（选区级改写/润色），避免整章覆盖。start/end 为字符下标（含头不含尾），与用户选中文本或 chapter_read 返回的定位一致。',
  parameters: z.object({
    chapterId: z.string().describe('目标章节 ID'),
    start: z.number().int().min(0).describe('片段起始字符位置'),
    end: z.number().int().min(0).describe('片段结束字符位置（不含）'),
    newText: z.string().describe('替换后的新文本'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const chapter = await findOwnedChapter(ctx, args.chapterId)

    if (!chapter) {
      return { output: `章节 ${args.chapterId} 不存在或不属于当前作品。` }
    }

    if (args.end < args.start || args.start > chapter.content.length) {
      return { output: `区间 [${args.start}, ${args.end}) 无效：章节正文总长 ${chapter.content.length} 字。请先 chapter_read 确认定位。` }
    }

    const baseline = getChapterBaseline(ctx.runId, chapter.id)
    if (baseline && baseline !== chapter.updatedAt.toISOString()) {
      return buildConflictResult(chapter.title)
    }

    const before = chapter.content
    const end = Math.min(args.end, before.length)
    const after = before.slice(0, args.start) + args.newText + before.slice(end)

    const updated = await prisma.chapter.update({
      where: { id: chapter.id },
      data: { content: after, wordCount: after.length },
    })
    await recalcNovelStats(ctx.novelId)
    recordChapterBaseline(ctx.runId, chapter.id, updated.updatedAt)

    return {
      output: `已改写《${chapter.title}》第 ${args.start}-${end} 字的片段（原 ${end - args.start} 字 → 新 ${args.newText.length} 字）。`,
      summary: `改写《${chapter.title}》片段 · ${args.newText.length} 字`,
      display: {
        kind: 'chapterDiff',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        before: before.slice(Math.max(0, args.start - 200), Math.min(before.length, end + 200)),
        after:
          after.slice(Math.max(0, args.start - 200), Math.min(after.length, args.start + args.newText.length + 200)),
        appliedDirectly: true,
      },
      snapshot: { target: 'chapter', targetId: chapter.id, field: 'content', previousValue: before },
    }
  },
})

export const chapterRenameTool = defineTool({
  name: 'chapter_rename',
  title: '重命名章节',
  description: '修改指定章节的标题。',
  parameters: z.object({
    chapterId: z.string().describe('目标章节 ID'),
    title: z.string().min(1).max(120).describe('新的章节标题'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const chapter = await findOwnedChapter(ctx, args.chapterId)

    if (!chapter) {
      return { output: `章节 ${args.chapterId} 不存在或不属于当前作品。` }
    }

    const previousTitle = chapter.title
    await prisma.chapter.update({ where: { id: chapter.id }, data: { title: args.title.trim() } })
    await recalcNovelStats(ctx.novelId)

    return {
      output: `已把章节《${previousTitle}》重命名为《${args.title.trim()}》。`,
      summary: `章节改名《${args.title.trim()}》`,
      snapshot: { target: 'chapter', targetId: chapter.id, field: 'title', previousValue: previousTitle },
    }
  },
})

export const novelRenameTool = defineTool({
  name: 'novel_rename',
  title: '重命名作品',
  description: '修改当前作品的标题（书名）。',
  parameters: z.object({
    title: z.string().min(1).max(120).describe('新书名'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { title: true },
    })

    if (!novel) {
      return { output: '未找到当前作品。' }
    }

    await prisma.novel.update({
      where: { id: ctx.novelId },
      data: { title: args.title.trim(), displayTitle: args.title.trim() },
    })

    return {
      output: `已把作品《${novel.title}》改名为《${args.title.trim()}》。`,
      summary: `作品改名《${args.title.trim()}》`,
      snapshot: { target: 'novel', targetId: ctx.novelId, field: 'title', previousValue: novel.title },
    }
  },
})

export const novelUpdateMetaTool = defineTool({
  name: 'novel_update_meta',
  title: '更新作品设置',
  description: `更新作品的简介和标签。仅传入需要修改的字段。标签必须从站内统一标签库中选择（上下文里已给出完整标签库），最多 ${MAX_NOVEL_TAGS} 个；请结合作品简介与正文内容挑选最贴切的分类、题材与风格标签。`,
  parameters: z.object({
    summary: z.string().min(1).max(1000).optional().describe('新的作品简介'),
    tags: z.array(z.string().min(1).max(24)).max(10).optional().describe(`新的标签列表（整体替换，必须来自站内标签库，最多 ${MAX_NOVEL_TAGS} 个）`),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { summary: true, tagNames: true },
    })

    if (!novel) {
      return { output: '未找到当前作品。' }
    }

    if (args.summary === undefined && args.tags === undefined) {
      return { output: '没有提供任何要修改的字段（summary / tags）。' }
    }

    // 标签合法性校验：只接受站内标签库里的标签，越界的挑出来提示模型改用库内标签
    let nextTags: string[] | undefined
    let rejectedTags: string[] = []
    if (args.tags !== undefined) {
      const deduped = [...new Set(args.tags.map((tag) => tag.trim()).filter(Boolean))]
      nextTags = deduped.filter((tag) => ALL_NOVEL_TAGS.includes(tag)).slice(0, MAX_NOVEL_TAGS)
      rejectedTags = deduped.filter((tag) => !ALL_NOVEL_TAGS.includes(tag))

      if (nextTags.length === 0 && rejectedTags.length > 0) {
        return {
          output: `标签未保存：「${rejectedTags.join('、')}」不在站内标签库中。请从上下文给出的标签库里重新选择（如：玄幻、都市、系统、重生、爽文……）。`,
        }
      }
    }

    await prisma.novel.update({
      where: { id: ctx.novelId },
      data: {
        summary: args.summary?.trim() || undefined,
        tagNames: nextTags ?? undefined,
      },
    })

    const changed = [args.summary !== undefined ? '简介' : '', nextTags !== undefined ? `标签（${nextTags.join('、')}）` : '']
      .filter(Boolean)
      .join('、')
    const rejectedNote = rejectedTags.length > 0 ? `已忽略库外标签：${rejectedTags.join('、')}。` : ''

    return {
      output: `已更新作品${changed}。${rejectedNote}`,
      summary: `更新作品${args.summary !== undefined ? '简介' : ''}${args.summary !== undefined && nextTags !== undefined ? '与' : ''}${nextTags !== undefined ? '标签' : ''}`,
      snapshot: { target: 'novel', targetId: ctx.novelId, field: 'summary', previousValue: novel.summary },
    }
  },
})

export const coverPromptSetTool = defineTool({
  name: 'cover_prompt_set',
  title: '设置封面提示词',
  description: '把设计好的封面提示词写入当前作品，供后续生成封面使用。提示词需适配 3:4 竖版书封构图。',
  parameters: z.object({
    prompt: z.string().min(4).max(2000).describe('封面提示词（中文，含主体/氛围/构图/风格关键词）'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { coverPrompt: true },
    })

    if (!novel) {
      return { output: '未找到当前作品。' }
    }

    await prisma.novel.update({ where: { id: ctx.novelId }, data: { coverPrompt: args.prompt.trim() } })

    return {
      output: '封面提示词已保存到作品设置。',
      summary: '保存封面提示词',
      display: { kind: 'markdown', markdown: `**封面提示词**\n\n${args.prompt.trim()}` },
      snapshot: { target: 'novel', targetId: ctx.novelId, field: 'coverPrompt', previousValue: novel.coverPrompt },
    }
  },
})

export const novelPublishTool = defineTool({
  name: 'novel_publish',
  title: '发布作品',
  description: '把作品切换到公开发布状态。高危操作，需要用户确认。',
  parameters: z.object({
    confirmTitle: z.string().describe('复述当前书名以确认操作对象'),
  }),
  permission: DANGEROUS_PERMISSION,
  readOnly: false,
  dangerous: true,
  async execute(ctx) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { title: true, status: true },
    })

    if (!novel) {
      return { output: '未找到当前作品。' }
    }

    await prisma.novel.update({
      where: { id: ctx.novelId },
      data: { status: 'published', publishedAt: new Date() },
    })

    return {
      output: `作品《${novel.title}》已发布。`,
      summary: `发布《${novel.title}》`,
      snapshot: { target: 'novel', targetId: ctx.novelId, field: 'status', previousValue: novel.status },
    }
  },
})

export const novelArchiveTool = defineTool({
  name: 'novel_archive',
  title: '下架作品',
  description: '把作品切换到已下架（归档）状态。高危操作，需要用户确认。',
  parameters: z.object({
    confirmTitle: z.string().describe('复述当前书名以确认操作对象'),
  }),
  permission: DANGEROUS_PERMISSION,
  readOnly: false,
  dangerous: true,
  async execute(ctx) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { title: true, status: true },
    })

    if (!novel) {
      return { output: '未找到当前作品。' }
    }

    await prisma.novel.update({ where: { id: ctx.novelId }, data: { status: 'archived' } })

    return {
      output: `作品《${novel.title}》已下架。`,
      summary: `下架《${novel.title}》`,
      snapshot: { target: 'novel', targetId: ctx.novelId, field: 'status', previousValue: novel.status },
    }
  },
})

export const novelDeleteTool = defineTool({
  name: 'novel_delete',
  title: '删除作品',
  description: '永久删除当前作品及其全部章节、封面与记忆，不可恢复。高危操作，需要用户确认。',
  parameters: z.object({
    confirmTitle: z.string().describe('复述当前书名以确认操作对象'),
  }),
  permission: DANGEROUS_PERMISSION,
  readOnly: false,
  dangerous: true,
  async execute(ctx) {
    const novel = await prisma.novel.findFirst({
      where: { id: ctx.novelId, authorId: ctx.userId },
      select: { title: true },
    })

    if (!novel) {
      return { output: '未找到当前作品，可能已被删除。' }
    }

    const { deleteNovelData } = await import('../../data-access.js')
    await deleteNovelData(ctx.userId, ctx.novelId)

    return {
      output: `作品《${novel.title}》已永久删除。本次任务到此结束，请告知用户结果，不要再调用其他工具。`,
      summary: `删除《${novel.title}》`,
    }
  },
})

export const memorySaveTool = defineTool({
  name: 'memory_save',
  title: '沉淀创作记忆',
  description:
    '把重要的设定、角色卡、章节摘要、伏笔或时间线事件保存为长期记忆，供后续 memory_search 检索。只沉淀已被确认的事实，试写内容不要沉淀。',
  parameters: z.object({
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
      .describe('记忆类型'),
    title: z.string().min(1).max(120).describe('记忆标题（如角色名、章节名、设定名）'),
    content: z.string().min(1).max(4000).describe('记忆内容，事实化、结构化表述'),
    importance: z.number().int().min(1).max(100).describe('重要性 1-100：核心主角/主线设定 80+，一般设定 50-70'),
    sourceChapterId: z.string().optional().describe('来源章节 ID（章节摘要必填）'),
  }),
  permission: { plan: 'allow', build: 'allow', review: 'allow' },
  readOnly: false,
  async execute(ctx, args) {
    // 同名同类型记忆直接更新，避免重复沉淀
    const existing = await prisma.projectMemoryEntry.findFirst({
      where: { novelId: ctx.novelId, memoryType: args.memoryType, title: args.title.trim() },
    })

    if (existing) {
      await prisma.projectMemoryEntry.update({
        where: { id: existing.id },
        data: { content: args.content.trim(), importance: args.importance, runId: ctx.runId },
      })
      return {
        output: `已更新记忆 [${args.memoryType}] ${args.title}。`,
        summary: `更新记忆「${args.title}」`,
      }
    }

    await prisma.projectMemoryEntry.create({
      data: {
        novelId: ctx.novelId,
        runId: ctx.runId,
        sourceChapterId: args.sourceChapterId ?? null,
        memoryType: args.memoryType,
        title: args.title.trim(),
        content: args.content.trim(),
        importance: args.importance,
      },
    })

    return {
      output: `已保存记忆 [${args.memoryType}] ${args.title}（重要性 ${args.importance}）。`,
      summary: `沉淀记忆「${args.title}」`,
    }
  },
})

export const planSaveTool = defineTool({
  name: 'plan_save',
  title: '写入计划',
  description:
    '把完整的创作计划/规划文档写入作品树的「计划」文件夹。规划类诉求（如"帮我规划第六章"）完成分析后必须调用本工具落盘完整计划。修订已有计划必须传 planId 就地更新，禁止另存一份同名计划；不传 planId 时若存在同名计划也会自动转为更新。同一次任务里同一份计划只落盘一次，后续都是修订。本工具只用于写入/修订，查看既有计划内容请用只读的 plan_read，禁止用本工具重写一遍来代替读取。不要把计划内容粘贴在回复正文里。',
  parameters: z.object({
    title: z.string().min(2).max(60).describe('计划标题，如"第六章规划"'),
    content: z.string().min(1).describe('完整的计划正文（Markdown）。必须一次传入全文，禁止传 placeholder/待补充等占位文本，否则会被拦截'),
    planId: z
      .string()
      .optional()
      .describe('要修订的既有计划 id（工具返回或上下文提供）。修订已有计划时必传；新建计划时不传'),
  }),
  permission: { plan: 'allow', build: 'allow', review: 'deny' },
  readOnly: false,
  async execute(ctx, args) {
    const title = args.title.trim()

    // 优先 planId 精确定位；不传时按同作品同标题兜底去重，防止模型忘传 planId 导致重复落盘
    const existing = args.planId
      ? await prisma.agentArtifact.findFirst({
          where: {
            id: args.planId,
            artifactType: 'chapterPlan',
            run: { userId: ctx.userId, novelId: ctx.novelId },
          },
        })
      : await prisma.agentArtifact.findFirst({
          where: {
            artifactType: 'chapterPlan',
            title,
            metadata: { path: ['savedAsPlan'], equals: true },
            run: { userId: ctx.userId, novelId: ctx.novelId },
          },
          orderBy: { updatedAt: 'desc' },
        })

    if (args.planId && !existing) {
      return {
        output: `未找到 planId=${args.planId} 对应的计划，本次未执行任何写入。请核对 planId，或不传 planId 重试（同名计划会自动就地更新）。`,
        summary: '计划更新失败：planId 不存在',
      }
    }

    // 防误清空护栏：模型偶发把占位文本当正文传入（如 "placeholder"），或把长计划覆盖成几句话，
    // 这里直接拦截不落库，并要求携带完整正文重试，避免既有计划被意外摧毁
    const nextContent = args.content.trim()
    const looksPlaceholder = /^(placeholder|todo|tbd|n\/a|待补充|待填充|待完善|占位|暂无|略)[\s.。…]*$/i.test(nextContent)
    const beforeLength = existing?.content.trim().length ?? 0
    const shrunkTooMuch =
      Boolean(existing) && beforeLength >= 200 && nextContent.length < Math.min(80, Math.ceil(beforeLength * 0.1))
    if (looksPlaceholder || shrunkTooMuch) {
      return {
        output: existing
          ? `已拦截本次计划更新：传入内容疑似占位或不完整（${nextContent.length} 字，原计划 ${beforeLength} 字），计划《${existing.title}》保持原样未被修改。plan_save 必须一次传入完整的计划正文（Markdown 全文），请带上 planId=${existing.id} 和完整内容重新调用；如确需删除计划请改用 plan_delete。`
          : `已拦截本次计划写入：传入内容疑似占位文本（「${nextContent.slice(0, 20)}」），未创建任何计划。请携带完整的计划正文（Markdown 全文）重新调用 plan_save。`,
        summary: '计划写入已拦截：疑似占位/不完整内容',
      }
    }

    if (existing) {
      const beforeTitle = existing.title
      const before = existing.content
      const metadata = {
        ...((existing.metadata as Record<string, unknown> | null) ?? {}),
        savedAsPlan: true,
      }
      const updated = await prisma.agentArtifact.update({
        where: { id: existing.id },
        data: { title, content: args.content, metadata: metadata as Prisma.InputJsonValue },
      })

      return {
        output: `已就地更新既有计划《${beforeTitle}》（planId=${updated.id}，${args.content.length} 字），没有新建副本，作者会看到变更审查条。回复正文只允许一句话：「已更新计划《${title}》，可在左侧作品树查看。」禁止粘贴计划内容或罗列问题。`,
        summary: `更新计划《${title}》 · ${args.content.length} 字`,
        display: {
          kind: 'planDiff',
          artifactId: updated.id,
          title,
          beforeTitle,
          before,
          after: args.content,
        },
      }
    }

    const artifact = await prisma.agentArtifact.create({
      data: {
        runId: ctx.runId,
        artifactType: 'chapterPlan',
        title,
        content: args.content,
        metadata: { savedAsPlan: true },
      },
    })

    return {
      output: `已把《${title}》写入计划文件夹（planId=${artifact.id}，${args.content.length} 字），作者已能看到并可直接编辑。后续修订请带 planId=${artifact.id} 就地更新。回复正文只允许一句话：「已把《${title}》写入计划文件夹，可在左侧作品树查看和编辑。」禁止粘贴计划内容或罗列问题；如需作者决策请用 ask_user。`,
      summary: `写入计划《${title}》 · ${args.content.length} 字`,
      display: { kind: 'planFile', artifactId: artifact.id, title, content: args.content },
    }
  },
})

export const planRenameTool = defineTool({
  name: 'plan_rename',
  title: '重命名计划',
  description:
    '就地重命名「计划」文件夹里的一份既有计划（只改标题，不动正文）。作者要求改计划名字时必须用本工具，禁止用 plan_save 另存一份新计划。',
  parameters: z.object({
    planId: z.string().min(1).describe('要重命名的计划 id（plan_save 返回或上下文提供）'),
    title: z.string().min(2).max(60).describe('新的计划标题'),
  }),
  permission: { plan: 'allow', build: 'allow', review: 'deny' },
  readOnly: false,
  async execute(ctx, args) {
    const existing = await prisma.agentArtifact.findFirst({
      where: {
        id: args.planId,
        artifactType: 'chapterPlan',
        run: { userId: ctx.userId, novelId: ctx.novelId },
      },
    })

    if (!existing) {
      return {
        output: `未找到 planId=${args.planId} 对应的计划，未执行重命名。请核对 planId。`,
        summary: '计划重命名失败：planId 不存在',
      }
    }

    const beforeTitle = existing.title
    const title = args.title.trim()
    await prisma.agentArtifact.update({
      where: { id: existing.id },
      data: { title },
    })

    return {
      output: `已把计划《${beforeTitle}》重命名为《${title}》（planId=${existing.id}），没有新建副本。回复正文只允许一句话确认。`,
      summary: `重命名计划《${beforeTitle}》→《${title}》`,
      display: { kind: 'planRename', artifactId: existing.id, beforeTitle, title },
    }
  },
})

export const planDeleteTool = defineTool({
  name: 'plan_delete',
  title: '删除计划',
  description:
    '把一份既有计划从「计划」文件夹移除（不影响对话记录）。仅在作者明确要求删除/移除某份计划时调用。',
  parameters: z.object({
    planId: z.string().min(1).describe('要删除的计划 id'),
  }),
  permission: { plan: 'allow', build: 'ask', review: 'deny' },
  readOnly: false,
  async execute(ctx, args) {
    const existing = await prisma.agentArtifact.findFirst({
      where: {
        id: args.planId,
        artifactType: 'chapterPlan',
        run: { userId: ctx.userId, novelId: ctx.novelId },
      },
    })

    if (!existing) {
      return {
        output: `未找到 planId=${args.planId} 对应的计划，未执行删除。请核对 planId。`,
        summary: '计划删除失败：planId 不存在',
      }
    }

    const metadata = {
      ...((existing.metadata as Record<string, unknown> | null) ?? {}),
      savedAsPlan: false,
    }
    await prisma.agentArtifact.update({
      where: { id: existing.id },
      data: { metadata: metadata as Prisma.InputJsonValue },
    })

    return {
      output: `已把计划《${existing.title}》从计划文件夹移除（planId=${existing.id}）。回复正文只允许一句话确认。`,
      summary: `删除计划《${existing.title}》`,
      display: { kind: 'planDelete', artifactId: existing.id, title: existing.title },
    }
  },
})

export const planExitTool = defineTool({
  name: 'plan_exit',
  title: '提交计划',
  description:
    'Plan 模式专用：完成分析后调用此工具提交结构化计划并请求切换到 Build 执行。summary 是一句话总结，steps 是按执行顺序排列的步骤。',
  parameters: z.object({
    summary: z.string().min(1).max(300).describe('计划的一句话总结'),
    steps: z
      .array(
        z.object({
          title: z.string().min(1).max(120).describe('步骤标题'),
          detail: z.string().max(600).optional().describe('步骤说明'),
        }),
      )
      .min(1)
      .max(12)
      .describe('执行步骤列表'),
  }),
  permission: { plan: 'allow', build: 'deny', review: 'deny' },
  readOnly: true,
  async execute(_ctx, args) {
    return {
      output: '计划已提交给用户确认。请停止输出更多内容，等待用户决定是否执行。',
      summary: `提交计划 · ${args.steps.length} 步`,
      display: { kind: 'plan', summary: args.summary, steps: args.steps },
    }
  },
})
