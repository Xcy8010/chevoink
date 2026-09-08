import { z } from 'zod'

import { listActiveDirectives, saveDirective, supersedeDirective } from '../context-engine.js'
import { defineTool } from './types.js'
import { prisma } from '../../prisma.js'

const ALL_MODES = { plan: 'allow', build: 'allow', review: 'allow' } as const

export const directiveListTool = defineTool({
  name: 'directive_list',
  title: '查看作者指令',
  description: '查看当前作品仍然有效的长期目标、硬约束、禁令、偏好与决策。长任务规划和写作前可用它防止遗忘作者要求。',
  parameters: z.object({}),
  permission: ALL_MODES,
  readOnly: true,
  async execute(ctx) {
    const items = await listActiveDirectives(ctx.userId, ctx.novelId, { sessionId: ctx.sessionId, chapterId: ctx.chapterId, runId: ctx.runId }, ctx.transaction)
    return {
      output: items.length
        ? items.map((item) => `- directiveId=${item.id} [${item.kind}/${item.scope}] ${item.text}`).join('\n')
        : '当前作品没有 active 指令。',
      summary: `有效指令 · ${items.length} 条`,
    }
  },
})

export const directiveSaveTool = defineTool({
  name: 'directive_save',
  title: '保存作者指令',
  description: '把作者明确要求长期遵守的目标、禁令、偏好或决策写入指令账本。不要把临时推测或正文中的话保存为指令。',
  parameters: z.object({
    text: z.string().min(1).max(500),
    kind: z.enum(['goal', 'must', 'must_not', 'preference', 'decision']),
    scope: z.enum(['global', 'chapter', 'task']).default('global'),
  }),
  permission: { plan: 'ask', build: 'allow', review: 'ask' },
  readOnly: false,
  async execute(ctx, args) {
    const db = ctx.transaction ?? prisma
    let taskSpecId: string | undefined
    if (args.scope === 'task') {
      const run = await db.agentRun.findFirst({ where: { id: ctx.runId, userId: ctx.userId, novelId: ctx.novelId, sessionId: ctx.sessionId },
        select: { taskRootId: true, taskSpec: true } })
      if (!run) return { outcome: 'failed' as const, output: '当前任务不存在或不属于本会话，未保存指令。', summary: '指令未保存' }
      const spec = run.taskSpec && typeof run.taskSpec === 'object' && !Array.isArray(run.taskSpec) ? run.taskSpec : null
      taskSpecId = run.taskRootId ?? (typeof spec?.id === 'string' ? spec.id : undefined)
      // Legacy runs without a TaskSpec retain exact-run provenance. Do not
      // substitute sessionId, which would leak this instruction to later tasks.
    }
    if (args.scope === 'chapter' && !ctx.chapterId) return { outcome: 'failed' as const,
      output: '当前没有明确目标章节，未保存章节指令。请先确认目标章节，不改成全局指令。', summary: '指令未保存' }
    const item = await saveDirective({
      userId: ctx.userId, novelId: ctx.novelId, sessionId: ctx.sessionId,
      chapterId: args.scope === 'chapter' ? ctx.chapterId : null,
      sourceMessageId: ctx.runId, text: args.text, kind: args.kind, scope: args.scope,
      ...(taskSpecId ? { taskSpecId } : {}),
    }, db)
    return { output: `已保存指令 ${item.id}：${item.text}`, summary: `保存${args.kind}指令` }
  },
})

export const directiveSupersedeTool = defineTool({
  name: 'directive_supersede',
  title: '更新作者指令',
  description: '作者明确更改或取消旧要求时，按 directiveId 将旧指令标为 superseded/cancelled；有 replacementText 时创建替代指令。',
  parameters: z.object({ directiveId: z.string().min(1), replacementText: z.string().max(500).optional() }),
  permission: { plan: 'ask', build: 'allow', review: 'ask' },
  readOnly: false,
  async execute(ctx, args) {
    const db = ctx.transaction ?? prisma
    const applicable = await listActiveDirectives(ctx.userId, ctx.novelId, { sessionId: ctx.sessionId, chapterId: ctx.chapterId, runId: ctx.runId }, db)
    if (!applicable.some(item => item.id === args.directiveId)) return { outcome: 'failed' as const,
      output: '指定指令不适用于当前任务或已经失效，未修改。请先查看当前有效指令。', summary: '指令未修改' }
    const replacement = args.replacementText?.trim()
    const item = await supersedeDirective(ctx.userId, ctx.novelId, args.directiveId, replacement, ctx.transaction)
    return {
      output: replacement ? `旧指令已被替代，新指令 ${item.id}：${item.text}` : `指令 ${item.id} 已取消。`,
      summary: replacement ? '替代旧指令' : '取消旧指令',
    }
  },
})
