import type { ZodType } from 'zod'

import type {
  AgentExecutionMode,
  AgentRollbackSnapshot,
  AgentToolDisplayPayload,
  AgentWorkspaceToolPermission,
  CreativeFreedom,
  StoryCompilerMode,
} from '../../../../shared/contracts/index.js'
import type { AgentStreamEventBody } from '../../../../shared/contracts/index.js'
import type { getModelTierRuntime } from '../../credits.js'

/** 工具执行上下文：身份与作用域由服务端注入，绝不信任模型给出的 ID */
export type ToolContext = {
  userId: string
  novelId: string
  chapterId: string | null
  sessionId: string
  runId: string
  /** 作者明确要求“已有/前文保持不变”时，本轮启动前已存在的章节集合。 */
  protectedChapterIds?: ReadonlySet<string>
  /** 当前工具调用的 callId：供 ask_user 等需要挂起等待前端回应的工具使用 */
  callId: string
  /** 当前轮 assistant 消息 id：子 Agent 等需要发进度事件的工具用它锚定直播位置 */
  messageId?: string
  mode: AgentExecutionMode
  creativeFreedom: CreativeFreedom
  qualityMode: StoryCompilerMode
  /** 主 run 解析好的模型运行时：子 Agent 跟随主 run 的模型与额度计费（未注入时工具自行回退） */
  modelRuntime?: Awaited<ReturnType<typeof getModelTierRuntime>>
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
  /** 附属分部：子 Agent 内嵌执行产生的内部工具调用卡片，随父消息一并落库与直播 */
  extraParts?: import('../../../../shared/contracts/index.js').AgentMessagePart[]
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
  /** 即使 AGENT_AUTO_APPROVE=true 也必须逐次确认；仅用于新增的跨文档事务等不可静默执行动作。 */
  alwaysConfirm?: boolean
  /** 校验前参数兜底修复：把模型小概率毛病（null 当未传、参数嵌套、别名键、超长标题等）
   * 修成 schema 可接受形态，返回修复后的参数对象；不改变合法参数的语义 */
  coerceArgs?: (raw: unknown) => unknown
  execute: (ctx: ToolContext, args: Args) => Promise<ToolResult>
}

/** 便捷构造器：保留 Args 推断 */
export function defineTool<Args>(tool: AgentTool<Args>): AgentTool<Args> {
  return tool
}
