import { z } from 'zod'
import type { Prisma } from '@prisma/client'

import { prisma } from '../../prisma.js'
import { getChapterBaseline, getLastTouchedChapter, recordChapterBaseline } from '../baseline.js'
import { recalcNovelStats } from './novel-tools.js'
import { defineTool, type ToolContext, type ToolResult } from './types.js'
import { placeCreatedChapter, resolveChapterPlacement } from '../../data/volume.js'
import { enqueueChapterMemoryExtraction } from '../story-memory.js'
import { isAgent2FeatureEnabled } from '../../agent2-feature-flags.js'
import { resolveAgentChapterVolumeId } from './chapter-placement.js'

/**
 * 章节写工具集（自 write-tools.ts 模块级拆分而来，工具定义逐字保留）：
 * 新建/覆盖/追加/区间改写/重命名，统一走基线冲突检测与作品统计重算。
 */

const WRITE_PERMISSION = { plan: 'deny', build: 'allow', review: 'deny' } as const

async function findOwnedChapter(ctx: ToolContext, chapterId: string) {
  return prisma.chapter.findFirst({
    where: { id: chapterId, novelId: ctx.novelId, authorId: ctx.userId },
  })
}

/** chapterId 兜底：模型写长正文时经常漏传 chapterId，与其打回重试（重发整章又贵又易错），
 * 不如服务端直接补：优先本 run 最近读/写过的章节，其次作者当前打开的章节 */
function resolveChapterId(ctx: ToolContext, chapterId: string | undefined): string | null {
  const trimmed = chapterId?.trim()
  if (trimmed) {
    return trimmed
  }
  return getLastTouchedChapter(ctx.runId) ?? ctx.chapterId
}

const MISSING_CHAPTER_HINT =
  '未传 chapterId 且当前没有正在编辑的章节。请先用 novel_get_context 查看章节列表拿到 chapterId，或用 chapter_create 新建章节。'

/** 章节不存在时附带当前章节提示，帮模型一次性纠错而不是盲猜 */
function buildChapterNotFound(ctx: ToolContext, chapterId: string): ToolResult {
  const hint = ctx.chapterId && ctx.chapterId !== chapterId ? `作者当前打开的章节是 chapterId=${ctx.chapterId}。` : ''
  return {
    output: `章节 ${chapterId} 不存在或不属于当前作品。${hint}请用 novel_get_context 查看章节列表确认后重试。`,
  }
}

/** 基线冲突检测：用户在 Agent 运行期间改过章节时不盲写 */
function buildConflictResult(chapterTitle: string): ToolResult {
  return {
    output: `冲突：章节《${chapterTitle}》在你上次读取后已被用户修改。请先用 chapter_read 重新读取最新内容，再决定如何写入，避免覆盖用户的修改。`,
    summary: `《${chapterTitle}》存在编辑冲突，已阻止写入`,
  }
}

/** 把“读当前版本 → 写入”收敛为单条带 revision 条件的原子更新。 */
async function updateOwnedChapterAtRevision(
  ctx: ToolContext,
  chapter: { id: string; revision: number },
  data: Prisma.ChapterUpdateManyMutationInput,
) {
  const result = await prisma.chapter.updateMany({
    where: {
      id: chapter.id,
      novelId: ctx.novelId,
      authorId: ctx.userId,
      revision: chapter.revision,
    },
    data: { ...data, revision: { increment: 1 } },
  })

  if (result.count === 0) {
    return null
  }

  return findOwnedChapter(ctx, chapter.id)
}

async function writeChapterContent(
  ctx: ToolContext,
  chapterId: string,
  buildNextContent: (current: string) => string,
  actionLabel: string,
): Promise<ToolResult> {
  const chapter = await findOwnedChapter(ctx, chapterId)

  if (!chapter) {
    return buildChapterNotFound(ctx, chapterId)
  }

  const baseline = getChapterBaseline(ctx.runId, chapter.id)
  if (baseline !== null && baseline !== chapter.revision) {
    return buildConflictResult(chapter.title)
  }

  const before = chapter.content
  const after = buildNextContent(before)

  const updated = await updateOwnedChapterAtRevision(ctx, chapter, {
    content: after,
    wordCount: after.length,
  })
  if (!updated) {
    return buildConflictResult(chapter.title)
  }
  await recalcNovelStats(ctx.novelId)
  recordChapterBaseline(ctx.runId, chapter.id, updated.revision)
  if (isAgent2FeatureEnabled('memory2', ctx.userId)) {
    await enqueueChapterMemoryExtraction({
      novelId: ctx.novelId, chapterId: chapter.id, chapterRevision: updated.revision, before, after,
    })
  }

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
      revision: updated.revision,
    },
    snapshot: { target: 'chapter', targetId: chapter.id, field: 'content', previousValue: before },
  }
}

export const chapterCreateTool = defineTool({
  name: 'chapter_create',
  title: '新建章节',
  description:
    '在当前作品创建一个新章节，默认紧接全书最后一个已有章节（不会误入后方预建的空卷）；传 position 可插入到全书指定位置（原第 position 章及之后的章节编号自动 +1），传 volumeId/positionInVolume 可精确指定卷内位置。作者说“第 N 章”时必须传 position=N。仅用于新增章节；重写已有章节必须用 chapter_write，绝不要另建重复章节。推荐先创建空章节，再用 chapter_write 写正文。返回 chapterId、实际卷和全书序。',
  parameters: z.object({
    title: z.string().min(1).max(120).describe('章节标题'),
    content: z.string().optional().describe('章节正文，可留空'),
    position: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('插入位置（第 N 章）。缺省或超过现有章节数时追加到末尾；否则插入该位置，原第 N 章及之后的章节整体后移一位'),
    volumeId: z.string().min(1).optional().describe('目标卷 ID；缺省时使用全书最后一个已有章节所在卷，而不是后方空卷'),
    positionInVolume: z.number().int().min(1).optional().describe('目标卷内位置（第 N 章）；缺省时追加'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const content = args.content ?? ''

    const chapter = await prisma.$transaction(async (tx) => {
      const globalTarget = args.position
        ? await tx.chapter.findFirst({ where: { novelId: ctx.novelId, orderIndex: args.position } })
        : null
      const lastExisting = await tx.chapter.findFirst({
        where: { novelId: ctx.novelId },
        orderBy: { orderIndex: 'desc' },
        select: { volumeId: true },
      })
      const placement = await resolveChapterPlacement(
        tx,
        ctx.novelId,
        resolveAgentChapterVolumeId({
          requestedVolumeId: args.volumeId,
          globalTargetVolumeId: globalTarget?.volumeId,
          lastExistingVolumeId: lastExisting?.volumeId,
        }),
        args.positionInVolume ?? globalTarget?.orderInVolume,
      )
      const chapterCount = await tx.chapter.count({ where: { novelId: ctx.novelId } })
      const created = await tx.chapter.create({
        data: {
          novelId: ctx.novelId,
          authorId: ctx.userId,
          title: args.title.trim(),
          content,
          volumeId: placement.volume.id,
          orderInVolume: -(placement.count + 1),
          orderIndex: -(chapterCount + 1),
          wordCount: content.length,
          status: 'draft',
          visibility: 'public',
        },
      })
      await placeCreatedChapter(tx, ctx.novelId, created, placement.volume.id, placement.position)
      return tx.chapter.findUniqueOrThrow({
        where: { id: created.id },
        include: { volume: { select: { title: true, orderIndex: true } } },
      })
    })
    await recalcNovelStats(ctx.novelId)
    recordChapterBaseline(ctx.runId, chapter.id, chapter.revision)
    if (content && isAgent2FeatureEnabled('memory2', ctx.userId)) {
      await enqueueChapterMemoryExtraction({
        novelId: ctx.novelId, chapterId: chapter.id, chapterRevision: chapter.revision, before: '', after: content,
      })
    }

    return {
      output: `已创建全书第 ${chapter.orderIndex} 章《${chapter.title}》，位于第 ${chapter.volume.orderIndex} 卷《${chapter.volume.title}》卷内第 ${chapter.orderInVolume} 章，chapterId=${chapter.id}${args.position || args.positionInVolume ? '，后续章节顺序已自动校正' : ''}${content ? `，写入 ${content.length} 字` : '（暂无正文）'}。请以这里返回的实际卷与全书序核对作者目标。`,
      summary: `新建第 ${chapter.orderIndex} 章《${chapter.title}》 · ${chapter.volume.title}`,
      // 带正文创建时返回 chapterDiff（空基线→全绿新增），前端才能挂上绿增红减的审查条；空章节仍用 chapterRef
      display: content
        ? {
            kind: 'chapterDiff',
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            before: '',
            after: content,
            appliedDirectly: true,
            revision: chapter.revision,
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
    '用新内容整体覆盖指定章节的正文。需要已存在的 chapterId（新章节请先 chapter_create）。覆盖前建议先 chapter_read 了解现有内容；如只是接着写请用 chapter_append。覆盖前必须确认该章节确实是作者所指：作者按「第N章」指称时，若该排位章节的标题序号对不上（作者删过章导致错位），不要覆盖，改用 chapter_create 传 position 在正确位置插入。',
  parameters: z.object({
    chapterId: z.string().optional().describe('目标章节 ID；缺省时默认写入最近操作/当前正在编辑的章节'),
    content: z.string().min(1).describe('完整的新正文'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const chapterId = resolveChapterId(ctx, args.chapterId)
    if (!chapterId) {
      return { output: MISSING_CHAPTER_HINT }
    }
    return writeChapterContent(ctx, chapterId, () => args.content, '覆盖写入')
  },
})

export const chapterAppendTool = defineTool({
  name: 'chapter_append',
  title: '追加章节正文',
  description: '把生成的内容追加到指定章节正文末尾（自动补一个空行分隔），用于续写场景。',
  parameters: z.object({
    chapterId: z.string().optional().describe('目标章节 ID；缺省时默认追加到最近操作/当前正在编辑的章节'),
    content: z.string().min(1).describe('要追加的内容'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const chapterId = resolveChapterId(ctx, args.chapterId)
    if (!chapterId) {
      return { output: MISSING_CHAPTER_HINT }
    }
    return writeChapterContent(
      ctx,
      chapterId,
      (current) => (current.trim() ? `${current.replace(/\s+$/, '')}\n\n${args.content}` : args.content),
      '追加',
    )
  },
})

export const chapterEditRangeTool = defineTool({
  name: 'chapter_edit_range',
  title: '改写章节片段',
  description:
    '按原文锚点或字符区间替换章节正文的一个片段（选区级改写/润色），避免整章覆盖。推荐传 oldText（逐字拷贝要替换的原文片段，系统自动定位并计算下标，严禁自己数字数算下标）；start/end 字符下标（含头不含尾）仅在作者选区提供精确坐标时使用。',
  parameters: z.object({
    chapterId: z.string().optional().describe('目标章节 ID；缺省时默认操作最近操作/当前正在编辑的章节'),
    oldText: z
      .string()
      .optional()
      .describe('要替换的原文片段（从 chapter_read 返回的正文逐字拷贝，含标点换行）；系统自动定位，须在正文中唯一，不唯一就向两侧多拷几句'),
    start: z.number().int().min(0).optional().describe('片段起始字符位置（仅作者选区给出精确坐标时传；常规改写用 oldText 定位）'),
    end: z.number().int().min(0).optional().describe('片段结束字符位置（不含）'),
    newText: z.string().describe('替换后的新文本'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const chapterId = resolveChapterId(ctx, args.chapterId)
    if (!chapterId) {
      return { output: MISSING_CHAPTER_HINT }
    }
    const chapter = await findOwnedChapter(ctx, chapterId)

    if (!chapter) {
      return buildChapterNotFound(ctx, chapterId)
    }

    const before = chapter.content

    // 定位优先级：oldText 锚点（系统算下标，模型免数数）> 选区精确坐标 start/end
    let start: number
    let end: number
    if (args.oldText) {
      const first = before.indexOf(args.oldText)
      if (first === -1) {
        return { output: `oldText 未在正文中逐字匹配到（标点、换行须完全一致）。请先 chapter_read 逐字拷贝要替换的原文再传 oldText。` }
      }
      if (before.indexOf(args.oldText, first + args.oldText.length) !== -1) {
        return { output: `oldText 在正文中出现多次，无法唯一定位。请向两侧多拷几句上下文使其在正文中唯一。` }
      }
      start = first
      end = first + args.oldText.length
    } else if (args.start !== undefined && args.end !== undefined) {
      start = args.start
      end = args.end
    } else {
      return { output: `请提供 oldText（逐字拷贝原文片段定位，推荐）或 start/end 字符下标。` }
    }

    if (end < start || start > before.length) {
      return { output: `区间 [${start}, ${end}) 无效：章节正文总长 ${before.length} 字。请先 chapter_read 确认定位。` }
    }

    const baseline = getChapterBaseline(ctx.runId, chapter.id)
    if (baseline !== null && baseline !== chapter.revision) {
      return buildConflictResult(chapter.title)
    }

    const after = before.slice(0, start) + args.newText + before.slice(end)

    const updated = await updateOwnedChapterAtRevision(ctx, chapter, {
      content: after,
      wordCount: after.length,
    })
    if (!updated) {
      return buildConflictResult(chapter.title)
    }
    await recalcNovelStats(ctx.novelId)
    recordChapterBaseline(ctx.runId, chapter.id, updated.revision)
    if (isAgent2FeatureEnabled('memory2', ctx.userId)) {
      await enqueueChapterMemoryExtraction({
        novelId: ctx.novelId, chapterId: chapter.id, chapterRevision: updated.revision, before, after,
      })
    }

    return {
      output: `已改写《${chapter.title}》第 ${start}-${end} 字的片段（原 ${end - start} 字 → 新 ${args.newText.length} 字）。`,
      summary: `改写《${chapter.title}》片段 · ${args.newText.length} 字`,
      display: {
        kind: 'chapterDiff',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        // 必须返回完整正文：前端审查态直接把 before/after 当整章内容构建 diff 视图与回滚快照，
        // 若只截片段会导致审查视图缺失未修改部分、撤销时整章被错误替换成片段
        before,
        after,
        appliedDirectly: true,
        revision: updated.revision,
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
    chapterId: z.string().optional().describe('目标章节 ID；缺省时默认操作最近操作/当前正在编辑的章节'),
    title: z.string().min(1).max(120).describe('新的章节标题'),
  }),
  permission: WRITE_PERMISSION,
  readOnly: false,
  async execute(ctx, args) {
    const chapterId = resolveChapterId(ctx, args.chapterId)
    if (!chapterId) {
      return { output: MISSING_CHAPTER_HINT }
    }
    const chapter = await findOwnedChapter(ctx, chapterId)

    if (!chapter) {
      return buildChapterNotFound(ctx, chapterId)
    }

    const previousTitle = chapter.title
    const baseline = getChapterBaseline(ctx.runId, chapter.id)
    if (baseline !== null && baseline !== chapter.revision) {
      return buildConflictResult(chapter.title)
    }

    const updated = await updateOwnedChapterAtRevision(ctx, chapter, { title: args.title.trim() })
    if (!updated) {
      return buildConflictResult(chapter.title)
    }
    await recalcNovelStats(ctx.novelId)
    recordChapterBaseline(ctx.runId, chapter.id, updated.revision)

    return {
      output: `已把章节《${previousTitle}》重命名为《${args.title.trim()}》。`,
      summary: `章节改名《${args.title.trim()}》`,
      snapshot: { target: 'chapter', targetId: chapter.id, field: 'title', previousValue: previousTitle },
    }
  },
})
