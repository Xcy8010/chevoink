import { z } from 'zod'

import type { AgentMessagePart, AgentTodoItem } from '../../../../shared/contracts/index.js'
import { prisma } from '../../prisma.js'
import { defineTool } from './types.js'

/**
 * 待办清单工具（plan/15 长任务连续性）：
 * - 复杂/多单元任务先建待办再逐项执行，每完成一项立即勾掉，防止中途早停
 * - 全量替换语义：每次调用传入完整清单，服务端按会话 upsert 一份持久化副本
 * - 循环内核据此拦截"待办未完成就想收尾"的早停（loop.ts）
 */

const todoStatusSchema = z.enum(['pending', 'in_progress', 'completed'])

const todoWriteParameters = z.object({
  items: z
    .array(
      z.object({
        content: z.string().min(1).max(100).describe('待办内容，一句话说清要完成什么（如「写第三章正文」）'),
        status: todoStatusSchema.describe('pending=未开始；in_progress=进行中（同一时刻最多 1 项）；completed=已完成'),
      }),
    )
    .min(1)
    .max(20)
    .superRefine((items, ctx) => {
      if (items.filter((item) => item.status === 'in_progress').length > 1) {
        ctx.addIssue({ code: 'custom', message: '同一时刻只能有一项待办处于进行中。' })
      }
    })
    .describe('完整的待办清单（全量替换，不是增量）。更新单项状态时也必须把其余项原样带上，否则会丢失'),
})

/**
 * 待办进度状态机：一次只能真实完成一项，且必须先进入进行中。
 * 这是服务端纪律线，避免模型在收尾时一次性把整张清单全部打勾。
 */
export function validateTodoProgression(previous: AgentTodoItem[], next: AgentTodoItem[]): string | null {
  const previousByContent = new Map(previous.map((item) => [item.content, item.status]))

  // 允许一次完成多项待办（pending/进行中 → completed 皆可），避免模型因“一次只能完成一项”
  // 频繁被拒后反复试错重试。仅保留「已完成项不可回退」这一无害纪律线。
  for (const item of next) {
    if (previousByContent.get(item.content) === 'completed' && item.status !== 'completed') {
      return `已完成的待办“${item.content}”不能回退状态；如需返工，请新增一条明确的返工待办。`
    }
  }
  return null
}

/** 会话级待办清单在 agent_artifacts 里的定位条件（metadata.todoList=true，不进计划文件夹） */
function todoArtifactWhere(sessionId: string) {
  return {
    artifactType: 'chapterPlan' as const,
    metadata: { path: ['todoList'], equals: true },
    run: { sessionId },
  }
}

/**
 * 读取会话当前的待办清单：loop 续跑与 context 注入共用。
 * 真相源优先取持久化消息里最新一次成功的 todo_write 清单（与前端展示同源）；
 * artifact 副本仅作后备：曾出现副本停留在旧任务清单，导致“继续”后模型拿到过期待办。
 */
export async function loadSessionTodoItems(sessionId: string): Promise<AgentTodoItem[]> {
  const recent = await prisma.agentMessage.findMany({
    where: { sessionId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { parts: true },
  })

  for (const record of recent) {
    const parts = record.parts as unknown as AgentMessagePart[]
    if (!Array.isArray(parts)) {
      continue
    }
    // 同一条消息内可能有多次 todo_write，倒序取最后一次成功的
    for (let index = parts.length - 1; index >= 0; index--) {
      const part = parts[index]
      if (
        part.type === 'tool-call' &&
        part.toolName === 'todo_write' &&
        part.status === 'success' &&
        part.display?.kind === 'todoList'
      ) {
        return part.display.items
      }
    }
  }

  const artifact = await prisma.agentArtifact.findFirst({
    where: todoArtifactWhere(sessionId),
    orderBy: { updatedAt: 'desc' },
    select: { content: true },
  })
  if (!artifact) {
    return []
  }
  try {
    const parsed = JSON.parse(artifact.content) as AgentTodoItem[]
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is AgentTodoItem =>
            Boolean(item && typeof item.content === 'string') &&
            ['pending', 'in_progress', 'completed'].includes((item as AgentTodoItem).status),
        )
      : []
  } catch {
    return []
  }
}

/** 渲染待办清单文本：回填给模型/注入上下文用 */
export function renderTodoItems(items: AgentTodoItem[]): string {
  return items
    .map((item, index) => {
      const mark = item.status === 'completed' ? '[x]' : item.status === 'in_progress' ? '[进行中]' : '[ ]'
      return `${index + 1}. ${mark} ${item.content}`
    })
    .join('\n')
}

export const todoWriteTool = defineTool({
  name: 'todo_write',
  title: '更新待办清单',
  description:
    '创建或全量更新本次任务的待办清单。作者的需求包含多个执行单元（如连写多章、多项修改）或步骤较多时，必须先用本工具把任务拆成待办清单，再逐步执行：开工前只把当前一项标为 in_progress；某项真实交付后即可标记为 completed（可一次把多项已交付项一起标记完成，服务端已放开该限制；pending 项完成后也可直接标记 completed）。已完成项不要回退。待办没有全部 completed 之前禁止结束任务、禁止停下来问作者“要不要继续”。每次调用都要传入完整清单（全量替换）。',
  parameters: todoWriteParameters,
  coerceArgs(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    let source = raw as Record<string, unknown>
    for (const key of ['arguments', 'args', 'params', 'parameters'] as const) {
      const wrapped = source[key]
      if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
        const candidate = wrapped as Record<string, unknown>
        if ([candidate.items, candidate.todos, candidate.tasks, candidate.todoList].some(Array.isArray)) {
          source = candidate
          break
        }
      }
    }
    const rawItems = source.items ?? source.todos ?? source.tasks ?? source.todoList
    if (!Array.isArray(rawItems)) return source
    let inProgressSeen = false
    const items = rawItems
      .map((value) => {
        if (typeof value === 'string') return { content: value.trim().slice(0, 100), status: 'pending' as const }
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null
        const item = value as Record<string, unknown>
        const contentValue = item.content ?? item.title ?? item.task ?? item.text
        if (typeof contentValue !== 'string' || !contentValue.trim()) return null
        const rawStatus = String(item.status ?? item.state ?? 'pending').toLowerCase()
        let status: AgentTodoItem['status'] = ['completed', 'done', 'complete', 'finished'].includes(rawStatus)
          ? 'completed'
          : ['in_progress', 'in-progress', 'doing', 'active', 'running'].includes(rawStatus)
            ? 'in_progress'
            : 'pending'
        if (status === 'in_progress') {
          if (inProgressSeen) status = 'pending'
          inProgressSeen = true
        }
        return { content: contentValue.trim().slice(0, 100), status }
      })
      .filter((item): item is AgentTodoItem => item !== null)
      .slice(0, 20)
    return { items }
  },
  permission: { plan: 'allow', build: 'allow', review: 'allow' },
  readOnly: true,
  async execute(ctx, args) {
    // 会话内 upsert：一份清单贯穿整个任务窗口，续跑/刷新都能恢复
    const existing = await prisma.agentArtifact.findFirst({
      where: todoArtifactWhere(ctx.sessionId),
      orderBy: { updatedAt: 'desc' },
      select: { id: true, content: true, metadata: true },
    })
    const metadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {}
    // 待办前态以「注入模型的同一真相源」为准（loadSessionTodoItems 优先取消息里最后一次成功
    // 的 todo_write 清单），跨 run / 续跑也能拿到真实前态；避免 artifact 副本停在旧任务导致
    // previous 退化为空，从而把本应已完成的旧项误判为本轮“一次完成多项”而被拒。
    const previous = await loadSessionTodoItems(ctx.sessionId)
    let items = args.items as AgentTodoItem[]
    const progressionError = validateTodoProgression(previous, items)
    // 模型偶发把多项一次打勾或 pending 直接打勾：不再把整次调用打成失败。
    // 服务端收敛到一个合法原子进度，其余项保持前态，下一轮继续更新即可。
    if (progressionError && previous.length > 0) {
      const previousByContent = new Map(previous.map((item) => [item.content, item.status]))
      let completionAccepted = false
      items = items.map((item) => {
        const before = previousByContent.get(item.content)
        if (before === 'completed') return { ...item, status: 'completed' }
        if (item.status === 'completed') {
          if (!completionAccepted && before === 'in_progress') {
            completionAccepted = true
            return item
          }
          return { ...item, status: before ?? 'pending' }
        }
        return item
      })
      let activeSeen = false
      items = items.map((item) => item.status === 'in_progress'
        ? activeSeen ? { ...item, status: 'pending' } : (activeSeen = true, item)
        : item)
    }

    const completed = items.filter((item) => item.status === 'completed').length
    const content = JSON.stringify(items)
    if (existing) {
      await prisma.agentArtifact.update({
        where: { id: existing.id },
        data: { content, summary: `待办 ${completed}/${items.length}`, metadata: { ...metadata, todoList: true, todoRunId: ctx.runId } },
      })
    } else {
      await prisma.agentArtifact.create({
        data: {
          runId: ctx.runId,
          artifactType: 'chapterPlan',
          title: '任务待办清单',
          summary: `待办 ${completed}/${items.length}`,
          content,
          metadata: { todoList: true, todoRunId: ctx.runId },
        },
      })
    }

    const remaining = items.length - completed
    return {
      output:
        remaining > 0
          ? `待办清单已更新（${completed}/${items.length} 已完成）：\n${renderTodoItems(items)}\n还有 ${remaining} 项未完成，请立即继续执行下一条未完成的待办，不要停下来询问作者。`
          : `待办清单已全部完成（${completed}/${items.length}）：\n${renderTodoItems(items)}\n请核对每项都已真实交付，然后用简短正文向作者收尾。`,
      summary: `待办 ${completed}/${items.length} 已完成`,
      display: { kind: 'todoList', items },
    }
  },
})
