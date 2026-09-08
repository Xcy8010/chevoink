import { z } from 'zod'

import { listMemoryReviewInbox, saveEntityRelation, saveStoryEvent } from '../story-memory.js'
import { defineTool, type ToolContext } from './types.js'
import { DataAccessError, prisma } from '../../prisma.js'

async function memorySource(ctx: ToolContext, args: { sourceChapterId?: string; revision?: number }) {
  if (!args.sourceChapterId) {
    if (args.revision !== undefined) throw new DataAccessError(400, 'MEMORY_SOURCE_REQUIRED', '章节版本必须同时指定来源章节，未写入记忆。')
    return { sourceId: ctx.runId }
  }
  const chapter = await (ctx.transaction ?? prisma).chapter.findFirst({ where: { id: args.sourceChapterId, novelId: ctx.novelId, authorId: ctx.userId }, select: { id: true, revision: true } })
  if (!chapter || (args.revision !== undefined && args.revision !== chapter.revision)) throw new DataAccessError(409, 'MEMORY_SOURCE_REQUIRED', '来源章节不存在或版本已变化，请重新读取。')
  return { sourceId: chapter.id, revision: chapter.revision }
}

export const memoryReviewListTool = defineTool({
  name: 'memory_review_list', title: '查看记忆冲突',
  description: '查看等待作者处理的推断或冲突记忆。只能汇报证据和差异，不能替作者选择哪个事实为真。',
  parameters: z.object({}), permission: { plan: 'allow', build: 'allow', review: 'allow' }, readOnly: true,
  async execute(ctx) {
    const items = await listMemoryReviewInbox(ctx.userId, ctx.novelId, ctx.transaction)
    return {
      output: items.length ? items.map((item) => `- memoryId=${item.id} [${item.status}] ${item.title}：${item.content}`).join('\n') : '记忆审核箱为空。',
      summary: `记忆审核箱 · ${items.length} 项`,
    }
  },
})

export const memoryRelationSaveTool = defineTool({
  name: 'memory_relation_save', title: '保存人物关系',
  description: '保存有来源的人物关系及其剧情阶段。关系随剧情变化时传 validFrom/validTo，禁止把无证据推测标成确定事实。',
  parameters: z.object({
    fromName: z.string().min(1).max(128), toName: z.string().min(1).max(128), relationType: z.string().min(1).max(64),
    state: z.string().max(1000).optional(), validFrom: z.number().int().positive().optional(), validTo: z.number().int().positive().optional(),
    sourceChapterId: z.string().optional(), revision: z.number().int().positive().optional(), confidence: z.number().min(0).max(1).default(1),
  }),
  permission: { plan: 'allow', build: 'allow', review: 'allow' }, readOnly: false,
  async execute(ctx, args) {
    const source = await memorySource(ctx, args)
    const relation = await saveEntityRelation({
      userId: ctx.userId, novelId: ctx.novelId, ...args, ...source,
    }, ctx.transaction)
    return { savedMemoryId: relation.savedMemoryId, output: `已保存人物关系 relationId=${relation.id}：${args.fromName} → ${args.toName}（${args.relationType}）。`, summary: `关系 ${args.fromName}→${args.toName}` }
  },
})

export const memoryEventSaveTool = defineTool({
  name: 'memory_event_save', title: '保存故事事件',
  description: '把关键事件按时间、地点、参与者、因果和来源保存到时间线。无章节来源的内容必须来自作者明确输入。',
  parameters: z.object({
    title: z.string().min(1).max(160), description: z.string().min(1).max(4000), storyTime: z.string().max(160).optional(),
    location: z.string().max(160).optional(), participants: z.array(z.string()).max(30).default([]), causes: z.array(z.string()).max(20).default([]),
    effects: z.array(z.string()).max(20).default([]), sourceChapterId: z.string().optional(), revision: z.number().int().positive().optional(), confidence: z.number().min(0).max(1).default(1),
  }),
  permission: { plan: 'allow', build: 'allow', review: 'allow' }, readOnly: false,
  async execute(ctx, args) {
    const source = await memorySource(ctx, args)
    const event = await saveStoryEvent({ userId: ctx.userId, novelId: ctx.novelId, ...args, ...source }, ctx.transaction)
    return { savedMemoryId: event.savedMemoryId, output: `已保存故事事件 eventId=${event.id}：${args.title}。`, summary: `时间线事件「${args.title}」` }
  },
})
