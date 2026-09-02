import { z } from 'zod'

import type { AgentMessagePart } from '../../../../shared/contracts/index.js'
import { prisma } from '../../prisma.js'
import { defineTool } from './types.js'

/**
 * 跨任务跨作品的上下文读取工具。
 * 与 session-history-tools 的区别：那两个工具锁死当前会话，这里允许作者把别的任务 ID
 * （侧栏右键「复制任务 ID」得到）交给 Agent，让 Agent 去读那个任务谈过什么。
 * 归属只按 userId 校验，因此可以跨作品，但绝不会读到别人的任务。
 */

const READ_PERMISSION = { plan: 'allow', build: 'allow', review: 'allow' } as const
/** 关键词检索的扫描上限：够覆盖长任务，又不至于把整库消息读进内存 */
const KEYWORD_SCAN_LIMIT = 600
/** 单条片段回填给模型的字符上限：避免一次读爆上下文 */
const EXCERPT_CHARS = 600

function visibleTranscript(parts: AgentMessagePart[]): string {
  return parts
    .flatMap((part) => {
      if (part.type === 'text') return [part.text]
      if (part.type === 'attachment') return [`[附件：${part.name}]`]
      if (part.type === 'tool-call') return [`[工具：${part.title || part.toolName}${part.summary ? `；${part.summary}` : ''}]`]
      // reasoning 是内部思考，不属于跨任务可引用的事实
      return []
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function roleLabel(role: string): string {
  return role === 'user' ? '作者' : 'Agent'
}

function novelTitleOf(novel: { title: string; displayTitle: string | null } | null | undefined): string {
  return novel?.displayTitle?.trim() || novel?.title?.trim() || '未命名作品'
}

function clip(text: string): string {
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}…` : text
}

export const taskContextListTool = defineTool({
  name: 'task_context_list',
  title: '列出历史任务',
  description:
    '列出作者名下的 Agent 任务窗口（可跨作品），返回任务 ID、所属作品与最近活跃时间，用于定位「之前那个任务」。仅在作者提到别的任务/别的作品的讨论但没给出任务 ID 时调用；作者已给出任务 ID 时直接用 task_context_read。',
  parameters: z.object({
    /** 只看当前作品还是全部作品：作者说“别的作品”时用 all */
    scope: z.enum(['current_novel', 'all']).default('current_novel'),
    query: z.string().trim().max(80).optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    const records = await prisma.agentSession.findMany({
      where: {
        userId: ctx.userId,
        ...(args.scope === 'current_novel' ? { novelId: ctx.novelId } : {}),
        ...(args.query ? { title: { contains: args.query, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: args.limit,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        lastRunAt: true,
        forkedFromSessionId: true,
        novel: { select: { title: true, displayTitle: true } },
      },
    })

    if (records.length === 0) {
      return { output: args.query ? `没有标题包含“${args.query}”的任务。` : '当前范围内还没有其它任务。' }
    }

    // AgentMessage 只挂在 run 上，没有 session 关系，对话数只能按 sessionId 单独聚合
    const counted = await prisma.agentMessage.groupBy({
      by: ['sessionId'],
      where: { sessionId: { in: records.map((record) => record.id) } },
      _count: { _all: true },
    })
    const countBySession = new Map(counted.map((item) => [item.sessionId, item._count._all]))

    const tasks = records.map((record) => ({
      sessionId: record.id,
      title: record.title,
      novelTitle: novelTitleOf(record.novel),
      lastActiveAt: (record.lastRunAt ?? record.updatedAt).toISOString(),
      messageCount: countBySession.get(record.id) ?? 0,
      isBranch: Boolean(record.forkedFromSessionId),
    }))

    return {
      output: tasks
        .map((task, index) =>
          `${index + 1}. ${task.title}${task.isBranch ? '（分支）' : ''}\n   sessionId=${task.sessionId}\n   作品=${task.novelTitle}；对话数=${task.messageCount}；最近活跃=${task.lastActiveAt}`,
        )
        .join('\n'),
      display: { kind: 'taskContext', mode: 'list', tasks, excerpts: [] },
      summary: `列出 ${tasks.length} 个历史任务`,
    }
  },
})

export const taskContextReadTool = defineTool({
  name: 'task_context_read',
  title: '读取任务上下文',
  description:
    '按任务 ID 读取另一个任务窗口的对话上下文（可跨作品，只能读作者本人的任务）。作者贴出任务 ID 或要求「参考某个任务里的讨论」时调用。overview 先看任务概览与首尾对话；recent 读最近若干轮；keyword 在该任务里检索关键词。禁止为了“以防万一”反复整任务拉取。',
  parameters: z.object({
    sessionId: z.string().trim().min(1),
    mode: z.enum(['overview', 'recent', 'keyword']).default('overview'),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(20).default(8),
  }).superRefine((value, ctx) => {
    if (value.mode === 'keyword' && !value.query) {
      ctx.addIssue({ code: 'custom', path: ['query'], message: '关键词检索必须提供 query。' })
    }
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    const session = await prisma.agentSession.findFirst({
      where: { id: args.sessionId, userId: ctx.userId },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastRunAt: true,
        novelId: true,
        forkedFromSessionId: true,
        novel: { select: { title: true, displayTitle: true } },
        _count: { select: { runs: true } },
      },
    })
    if (!session) {
      return { output: `未找到任务 ${args.sessionId}，请确认任务 ID 正确且属于当前作者（任务 ID 可在侧栏右键任务「复制任务 ID」获得）。` }
    }

    const messageCount = await prisma.agentMessage.count({ where: { sessionId: session.id } })
    const taskCard = {
      sessionId: session.id,
      title: session.title,
      novelTitle: novelTitleOf(session.novel),
      lastActiveAt: (session.lastRunAt ?? session.updatedAt).toISOString(),
      messageCount,
      isBranch: Boolean(session.forkedFromSessionId),
    }
    const header = [
      `任务=${session.title}${taskCard.isBranch ? '（分支副本）' : ''}`,
      `sessionId=${session.id}`,
      `作品=${taskCard.novelTitle}${session.novelId === ctx.novelId ? '（当前作品）' : '（其它作品）'}`,
      `状态=${session.status}；对话数=${messageCount}；执行轮数=${session._count.runs}`,
      `创建=${session.createdAt.toISOString()}；最近活跃=${taskCard.lastActiveAt}`,
    ].join('\n')

    if (args.mode === 'keyword') {
      const scanned = await prisma.agentMessage.findMany({
        where: { sessionId: session.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: KEYWORD_SCAN_LIMIT,
        select: { id: true, role: true, parts: true, createdAt: true },
      })
      const needle = args.query!.toLocaleLowerCase('zh-CN')
      const matches = scanned
        .map((record) => ({ ...record, text: visibleTranscript(record.parts as unknown as AgentMessagePart[]) }))
        .filter((record) => record.text.toLocaleLowerCase('zh-CN').includes(needle))
        .slice(0, args.limit)
        .reverse()

      if (matches.length === 0) {
        return {
          output: `${header}\n\n该任务中未找到关键词“${args.query}”。`,
          display: { kind: 'taskContext', mode: 'read', tasks: [taskCard], excerpts: [] },
          summary: `任务「${session.title}」中未命中关键词`,
        }
      }
      const excerpts = matches.map((record) => ({ role: record.role, createdAt: record.createdAt.toISOString(), text: clip(record.text) }))
      return {
        output: `${header}\n\n关键词“${args.query}”命中 ${excerpts.length} 条：\n\n${excerpts
          .map((item) => `${roleLabel(item.role)} · ${item.createdAt}\n${item.text}`)
          .join('\n\n')}`,
        display: { kind: 'taskContext', mode: 'read', tasks: [taskCard], excerpts },
        summary: `在任务「${session.title}」中命中 ${excerpts.length} 条`,
      }
    }

    if (args.mode === 'recent') {
      const records = await prisma.agentMessage.findMany({
        where: { sessionId: session.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: args.limit,
        select: { id: true, role: true, parts: true, createdAt: true },
      })
      records.reverse()
      const excerpts = records
        .map((record) => ({ role: record.role, createdAt: record.createdAt.toISOString(), text: clip(visibleTranscript(record.parts as unknown as AgentMessagePart[])) }))
        .filter((item) => item.text.length > 0)
      if (excerpts.length === 0) {
        return {
          output: `${header}\n\n该任务还没有对话记录。`,
          display: { kind: 'taskContext', mode: 'read', tasks: [taskCard], excerpts: [] },
          summary: `任务「${session.title}」暂无对话`,
        }
      }
      return {
        output: `${header}\n\n最近 ${excerpts.length} 条对话：\n\n${excerpts
          .map((item) => `${roleLabel(item.role)} · ${item.createdAt}\n${item.text}`)
          .join('\n\n')}`,
        display: { kind: 'taskContext', mode: 'read', tasks: [taskCard], excerpts },
        summary: `读取任务「${session.title}」最近 ${excerpts.length} 条对话`,
      }
    }

    // overview：首条作者诉求 + 最近几条往来，一次给出“这个任务在干什么”的全貌
    const first = await prisma.agentMessage.findFirst({
      where: { sessionId: session.id, role: 'user' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { role: true, parts: true, createdAt: true },
    })
    const latest = await prisma.agentMessage.findMany({
      where: { sessionId: session.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(args.limit, 6),
      select: { role: true, parts: true, createdAt: true },
    })
    latest.reverse()

    const excerpts = [
      ...(first ? [{ role: first.role, createdAt: first.createdAt.toISOString(), text: clip(visibleTranscript(first.parts as unknown as AgentMessagePart[])) }] : []),
      ...latest.map((record) => ({ role: record.role, createdAt: record.createdAt.toISOString(), text: clip(visibleTranscript(record.parts as unknown as AgentMessagePart[])) })),
    ].filter((item, index, list) => item.text.length > 0 && list.findIndex((other) => other.createdAt === item.createdAt && other.text === item.text) === index)

    return {
      output: excerpts.length === 0
        ? `${header}\n\n该任务还没有对话记录。`
        : `${header}\n\n任务上下文（首条诉求 + 最近往来）：\n\n${excerpts
            .map((item) => `${roleLabel(item.role)} · ${item.createdAt}\n${item.text}`)
            .join('\n\n')}\n\n需要更细的内容用 mode=recent 或 mode=keyword 继续读同一个 sessionId。`,
      display: { kind: 'taskContext', mode: 'read', tasks: [taskCard], excerpts },
      summary: `读取任务「${session.title}」上下文概览`,
    }
  },
})
