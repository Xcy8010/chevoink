import { z } from 'zod'

import type { AgentMessagePart } from '../../../../shared/contracts/index.js'
import { prisma } from '../../prisma.js'
import { defineTool } from './types.js'

const READ_PERMISSION = { plan: 'allow', build: 'allow', review: 'allow' } as const
const SEARCH_SCAN_LIMIT = 1000

function visibleTranscript(parts: AgentMessagePart[]): string {
  return parts
    .flatMap((part) => {
      if (part.type === 'text') return [part.text]
      if (part.type === 'attachment') return [`[附件：${part.name}]`]
      if (part.type === 'tool-call') {
        const status = part.status === 'success' ? '完成' : part.status === 'failed' ? '失败' : part.status === 'denied' ? '拒绝' : '运行中'
        return [`[工具：${part.title || part.toolName}；${status}${part.summary ? `；${part.summary}` : ''}]`]
      }
      // reasoning 属于内部思考，不是作者可见的 Agent 输出，也不进入精确会话审计。
      return []
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

async function assertOwnedSession(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } })
  if (!session) throw new Error('当前会话不存在或无权访问。')
}

function roleLabel(role: string): string {
  return role === 'user' ? '作者' : 'Agent'
}

export const sessionHistorySearchTool = defineTool({
  name: 'session_history_search',
  title: '检索会话原文',
  description:
    '按需检索当前任务会话的原始作者提示词与 Agent 可见输出，不受上下文压缩影响。仅在作者明确要求追溯“第一条/之前/第几轮说了什么”、核对或引用原话，或者当前上下文明示早前内容已省略且任务确实依赖该细节时调用；普通写作、续写、改稿与已有上下文足够时禁止调用。查首条提示词用 first_user_prompt；关键词定位用 keyword；近期记录用 recent。关键词结果先返回消息 ID 与预览，需要完整原文再调用 session_message_read。',
  parameters: z.object({
    mode: z.enum(['first_user_prompt', 'keyword', 'recent']),
    query: z.string().trim().max(200).optional(),
    role: z.enum(['user', 'assistant', 'all']).default('all'),
    limit: z.number().int().min(1).max(10).default(5),
  }).superRefine((value, ctx) => {
    if (value.mode === 'keyword' && !value.query) {
      ctx.addIssue({ code: 'custom', path: ['query'], message: '关键词检索必须提供 query。' })
    }
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    await assertOwnedSession(ctx.userId, ctx.sessionId)
    const roleWhere = args.mode === 'first_user_prompt'
      ? 'user'
      : args.role === 'all'
        ? undefined
        : args.role

    if (args.mode === 'first_user_prompt') {
      const record = await prisma.agentMessage.findFirst({
        where: { sessionId: ctx.sessionId, role: 'user' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, role: true, parts: true, createdAt: true },
      })
      if (!record) return { output: '当前会话还没有作者提示词。' }
      const text = visibleTranscript(record.parts as unknown as AgentMessagePart[])
      return {
        output: `当前会话第一条作者提示词（原始记录，未使用压缩摘要）：\nmessageId=${record.id}\n时间=${record.createdAt.toISOString()}\n\n${text}`,
        summary: '读取了会话首条作者提示词',
      }
    }

    const records = await prisma.agentMessage.findMany({
      where: { sessionId: ctx.sessionId, ...(roleWhere ? { role: roleWhere } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: args.mode === 'recent' ? args.limit : SEARCH_SCAN_LIMIT,
      select: { id: true, role: true, parts: true, createdAt: true },
    })
    const needle = args.query?.toLocaleLowerCase('zh-CN') ?? ''
    const matches = records
      .map((record) => ({ ...record, text: visibleTranscript(record.parts as unknown as AgentMessagePart[]) }))
      .filter((record) => args.mode === 'recent' || record.text.toLocaleLowerCase('zh-CN').includes(needle))
      .slice(0, args.limit)

    if (matches.length === 0) {
      return { output: args.mode === 'keyword' ? `当前会话原始记录中未找到关键词“${args.query}”。` : '当前会话没有符合条件的记录。' }
    }
    return {
      output: matches.map((record, index) => {
        const preview = record.text.length > 500 ? `${record.text.slice(0, 500)}…` : record.text
        return `${index + 1}. ${roleLabel(record.role)} · ${record.createdAt.toISOString()}\nmessageId=${record.id}\n${preview}`
      }).join('\n\n'),
      summary: `定位到 ${matches.length} 条会话记录`,
    }
  },
})

export const sessionMessageReadTool = defineTool({
  name: 'session_message_read',
  title: '读取会话原文',
  description:
    '读取 session_history_search 返回的某条消息原文，可用 offset 分页。只在已经定位到消息且确实需要精确原文或 Agent 完整可见输出时调用；禁止为了“以防万一”批量读取整段会话。',
  parameters: z.object({
    messageId: z.string().trim().min(1),
    offset: z.number().int().min(0).default(0),
    maxChars: z.number().int().min(500).max(16000).default(8000),
  }),
  permission: READ_PERMISSION,
  readOnly: true,
  async execute(ctx, args) {
    await assertOwnedSession(ctx.userId, ctx.sessionId)
    const record = await prisma.agentMessage.findFirst({
      where: { id: args.messageId, sessionId: ctx.sessionId },
      select: { id: true, role: true, parts: true, createdAt: true },
    })
    if (!record) return { output: '未找到该消息，可能已删除或不属于当前会话。' }
    const text = visibleTranscript(record.parts as unknown as AgentMessagePart[])
    const content = text.slice(args.offset, args.offset + args.maxChars)
    const nextOffset = args.offset + content.length < text.length ? args.offset + content.length : null
    return {
      output: `${roleLabel(record.role)}原始消息 · ${record.createdAt.toISOString()}\nmessageId=${record.id}\n字符范围=${args.offset}-${args.offset + content.length}/${text.length}${nextOffset == null ? '' : `\n下一页 offset=${nextOffset}`}\n\n${content}`,
      summary: `读取了${roleLabel(record.role)}消息原文`,
    }
  },
})
