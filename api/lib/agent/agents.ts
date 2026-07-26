import type { AgentExecutionMode } from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import type { AgentTool } from './tools/types.js'
import { getToolsForMode } from './tools/registry.js'

/** Agent 声明式定义（替代 buildExecutionAgent 的硬编码 switch） */
export type AgentDefinition = {
  type: string
  title: string
  model: string
  /** '*' 表示全部注册工具；数组则为白名单 */
  tools: '*' | string[]
  modes: AgentExecutionMode[]
}

/**
 * P0/P1 只保留 orchestrator 单主 Agent 跑通循环（plan/13 §4.8）。
 * 子 Agent（storyPlanner/continuityReviewer 等）在 P2 通过 task_delegate 收窄工具集引入。
 */
export const agentRegistry: AgentDefinition[] = [
  {
    type: 'orchestrator',
    title: '写作主控',
    model: env.agentModel,
    tools: '*',
    modes: ['plan', 'build', 'review'],
  },
]

export function getAgentDefinition(type: string): AgentDefinition {
  return agentRegistry.find((agent) => agent.type === type) ?? agentRegistry[0]
}

/** 按 Agent 白名单 + 模式权限过滤可用工具 */
export function getToolsForAgent(agent: AgentDefinition, mode: AgentExecutionMode): AgentTool[] {
  const modeTools = getToolsForMode(mode)

  if (agent.tools === '*') {
    return modeTools
  }

  const allowed = new Set(agent.tools)
  return modeTools.filter((tool) => allowed.has(tool.name))
}
