import { z } from 'zod'

import type { AgentMessagePart, AgentTodoItem } from '../../../../shared/contracts/index.js'
import { prisma } from '../../prisma.js'
import { defineTool } from './types.js'
import { getTaskRunIds } from '../task-lineage.js'

/**
 * 待办清单工具（plan/15 长任务连续性）：
 * - 复杂/多单元任务先建待办再逐项执行，每完成一项立即勾掉，防止中途早停
 * - 完整快照语义：按任务谱系保存；无效收尾忽略、漏带旧项保留，其他任务不覆盖
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
    .max(20)
    .superRefine((items, ctx) => {
      if (items.filter((item) => item.status === 'in_progress').length > 1) {
        ctx.addIssue({ code: 'custom', message: '同一时刻只能有一项待办处于进行中。' })
      }
    })
    .describe('本任务完整清单，保留原项。仅长任务/复杂任务在执行前建至少两项；不要在结尾补造清单。空数组只会忽略，不代表已完成，也不删除旧清单'),
})

/**
 * 待办进度状态机：真实完成后允许批量确认，已完成项不可回退。
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

/** 不为收尾补造清单；空更新及无变化更新不触碰持久化和 UI。 */
export function prepareTodoUpdate(previous: AgentTodoItem[], requested: AgentTodoItem[]): { items: AgentTodoItem[]; changed: boolean } {
  const unchanged = { items: previous, changed: false }
  if (requested.length === 0) return unchanged
  if (previous.length === 0 && (requested.length < 2 || requested.every(item => item.status === 'completed'))) return unchanged
  const previousByContent = new Map(previous.map(item => [item.content, item]))
  // 不把新编造的已完成项当作进度；只允许结算已有工作。
  if (requested.some(item => item.status === 'completed' && !previousByContent.has(item.content))) return unchanged
  const items = requested.map(item => previousByContent.get(item.content)?.status === 'completed' ? { ...item, status: 'completed' as const } : item)
  // 全量更新漏带旧项时保留：既保护已完成历史，也避免静默丢失未完成工作。
  const requestedNames = new Set(items.map(item => item.content))
  items.push(...previous.filter(item => !requestedNames.has(item.content)))
  if (items.length > 20) return unchanged
  let activeSeen = false
  const normalized = items.map(item => item.status === 'in_progress'
    ? activeSeen ? { ...item, status: 'pending' as const } : (activeSeen = true, item)
    : item)
  return { items: normalized, changed: JSON.stringify(normalized) !== JSON.stringify(previous) }
}

/** 待办副本定位条件；调用方传任务谱系 runIds，隔离同会话的其他任务。 */
function todoArtifactWhere(sessionId: string, runIds?: string[]) {
  return {
    artifactType: 'chapterPlan' as const,
    metadata: { path: ['todoList'], equals: true },
    run: { sessionId },
    ...(runIds ? { runId: { in: runIds } } : {}),
  }
}

/**
 * 读取会话当前的待办清单：loop 续跑与 context 注入共用。
 * 真相源优先取持久化消息里最新一次成功的 todo_write 清单（与前端展示同源）；
 * artifact 副本仅作后备：曾出现副本停留在旧任务清单，导致“继续”后模型拿到过期待办。
 */
export async function loadSessionTodoItems(sessionId: string, runIds?: string[]): Promise<AgentTodoItem[]> {
  const recent = await prisma.agentMessage.findMany({
    where: { sessionId, role: 'assistant', ...(runIds ? { runId: { in: runIds } } : {}) },
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
    where: todoArtifactWhere(sessionId, runIds),
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
    '仅用于长任务、复杂任务（如连写多章、跨章批量整改、多项独立交付步骤）：开工前建立至少两项真实待办，再逐项推进。简单问答、单处修改、简单单步操作不需要清单。首次创建不能全是 completed；禁止在收尾时补写完成清单或用一条总结覆盖旧清单。已真实交付的既有项可批量标记 completed，已完成项不回退、原项不遗漏。有未完成项就继续执行，无法完成时说明阻塞，不得假勾选。空数组不会清空旧清单；进度未变化不要重复调用。',
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
    const runIds = await getTaskRunIds(ctx.sessionId, ctx.runId)
    // 任务谱系内 upsert：续跑/刷新恢复本任务清单，不覆盖其他任务副本。
    const existing = await prisma.agentArtifact.findFirst({
      where: todoArtifactWhere(ctx.sessionId, runIds),
      orderBy: { updatedAt: 'desc' },
      select: { id: true, content: true, metadata: true },
    })
    const metadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {}
    // 待办前态以「注入模型的同一真相源」为准（loadSessionTodoItems 优先取消息里最后一次成功
    // 的 todo_write 清单），跨 run / 续跑也能拿到真实前态；避免 artifact 副本停在旧任务导致
    // previous 退化为空，从而把本应已完成的旧项误判为本轮“一次完成多项”而被拒。
    const previous = await loadSessionTodoItems(ctx.sessionId, runIds)
    const { items, changed } = prepareTodoUpdate(previous, args.items)
    if (!changed) return {
      output: `待办清单未变更，未清空或覆盖原清单。仅在长任务/复杂任务开工前建立至少两项未完成工作，或更新既有项真实进度；不要为收尾补造 completed 项，也不要重试无变化的清单。${previous.length ? `\n本任务原清单仍为：\n${renderTodoItems(previous)}` : '\n本任务没有清单；如已完成请直接交付，否则继续实际工作。'}`,
      summary: '待办清单未变更',
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
