import type { ZodType } from 'zod'

import type {
  AgentExecutionMode,
  AgentRollbackSnapshot,
  AgentToolDisplayPayload,
  AgentWorkspaceToolPermission,
} from '../../../../shared/contracts/index.js'
import type { AgentStreamEventBody } from '../../../../shared/contracts/index.js'

/** 工具执行上下文：身份与作用域由服务端注入，绝不信任模型给出的 ID */
export type ToolContext = {
  userId: string
  novelId: string
  chapterId: string | null
  sessionId: string
  runId: string
  /** 当前工具调用的 callId：供 ask_user 等需要挂起等待前端回应的工具使用 */
  callId: string
  mode: AgentExecutionMode
  /** 工具内部可发进度事件（进入统一事件总线） */
  emit: (event: AgentStreamEventBody) => void
  signal: AbortSignal
}

export type ToolResult = {
  /** 回填给模型的观察结果：简洁、面向下一步决策 */
  output: string
  /** 给前端渲染的结构化数据（diff、封面图、计划等） */
  display?: AgentToolDisplayPayload
  /** 写操作自动记录的回滚快照 */
  snapshot?: AgentRollbackSnapshot
  /** 人类可读的一行执行摘要（工具卡片展示） */
  summary?: string
}

export type AgentTool<Args = unknown> = {
  name: string
  /** 工具卡片显示的中文名 */
  title: string
  /** 给模型看的自然语言说明（替代穷举规则 prompt） */
  description: string
  /** zod schema：校验模型参数 + 自动转 JSON Schema 给 LLM */
  parameters: ZodType<Args>
  permission: Record<AgentExecutionMode, AgentWorkspaceToolPermission>
  /** 只读工具跳过审批与快照 */
  readOnly: boolean
  /** 高危操作不提供"总是允许"（发布/删除/下架） */
  dangerous?: boolean
  execute: (ctx: ToolContext, args: Args) => Promise<ToolResult>
}

/** 便捷构造器：保留 Args 推断 */
export function defineTool<Args>(tool: AgentTool<Args>): AgentTool<Args> {
  return tool
}
