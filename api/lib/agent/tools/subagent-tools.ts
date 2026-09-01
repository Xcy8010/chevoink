import { z } from 'zod'

import { defineTool } from './types.js'

const subAgentDelegateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  role: z.enum(['research', 'continuity', 'quality', 'lore']),
  triggerCondition: z.string().trim().min(1).max(1_000),
  prompt: z.string().trim().min(1).max(12_000),
  tokenBudget: z.number().int().min(500).max(32_000).default(4_000),
})

export const subAgentDelegateTool = defineTool({
  name: 'subagent_delegate',
  title: '调用子 Agent',
  description: '把边界清晰的独立工作委派给一个具名专业子 Agent。主 Agent 与专业子 Agent 均可调用，但必须提供明确名称、触发条件、任务目标与预算；不得用它拆分简单工作，也不得创建匿名 Agent。系统限制每个调用者同时最多运行 4 个子任务。',
  parameters: subAgentDelegateSchema,
  permission: { plan: 'ask', build: 'ask', review: 'ask' },
  readOnly: false,
  async execute(ctx, args) {
    // 动态导入避免 run-service -> registry -> productivity 的模块初始化环。
    const { createAgentSubtask } = await import('../productivity.js')
    const { item } = await createAgentSubtask(ctx.userId, {
      novelId: ctx.novelId,
      parentSessionId: ctx.sessionId,
      chapterId: ctx.chapterId,
      ...args,
    })
    return {
      output: `已调用子 Agent“${item.name}”。触发条件：${item.triggerCondition}。它会在独立任务中执行，主 Agent 可以继续当前工作。`,
      summary: `调用子 Agent · ${item.name}`,
    }
  },
})
