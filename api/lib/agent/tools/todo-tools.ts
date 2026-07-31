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
    .describe('完整的待办清单（全量替换，不是增量）。更新单项状态时也必须把其余项原样带上，否则会丢失'),
})

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
    '创建或全量更新本次任务的待办清单。作者的需求包含多个执行单元（如连写多章、多项修改）或步骤较多时，必须先用本工具把任务拆成待办清单，再逐项执行：开始做某项前把它标为 in_progress，做完立即标为 completed 并顺手带上其余项原样提交。待办没有全部 completed 之前禁止结束任务、禁止停下来问作者"要不要继续"。每次调用都要传入完整清单（全量替换）。',
  parameters: todoWriteParameters,
  permission: { plan: 'allow', build: 'allow', review: 'allow' },
  readOnly: true,
  async execute(ctx, args) {
    const items = args.items as AgentTodoItem[]
    const completed = items.filter((item) => item.status === 'completed').length
    const content = JSON.stringify(items)

    // 会话内 upsert：一份清单贯穿整个任务窗口，续跑/刷新都能恢复
    const existing = await prisma.agentArtifact.findFirst({
      where: todoArtifactWhere(ctx.sessionId),
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    if (existing) {
      await prisma.agentArtifact.update({
        where: { id: existing.id },
        data: { content, summary: `待办 ${completed}/${items.length}` },
      })
    } else {
      await prisma.agentArtifact.create({
        data: {
          runId: ctx.runId,
          artifactType: 'chapterPlan',
          title: '任务待办清单',
          summary: `待办 ${completed}/${items.length}`,
          content,
          metadata: { todoList: true },
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
