import type { AgentExecutionMode } from '../../../shared/contracts/index.js'
import { env } from '../../config/env.js'
import type { AgentTool } from './tools/types.js'
import { getToolsForMode } from './tools/registry.js'
import type { Agent2FeatureFlags } from '../../../shared/contracts/index.js'

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
export function getToolsForAgent(
  agent: AgentDefinition,
  mode: AgentExecutionMode,
  featureFlags?: Agent2FeatureFlags,
): AgentTool[] {
  let modeTools = getToolsForMode(mode)

  if (featureFlags) {
    const disabled = new Set<string>()
    if (!featureFlags.volume) {
      ;['volume_list', 'volume_create', 'volume_update', 'volume_move', 'volume_delete', 'chapter_move', 'chapter_move_to_volume', 'chapter_split', 'chapter_merge', 'structure_outline'].forEach((name) => disabled.add(name))
    }
    if (!featureFlags.changeSet) {
      ;['project_search', 'entity_resolve', 'impact_analyze', 'structure_validate', 'bulk_replace_preview', 'entity_rename_preview', 'changeset_apply', 'changeset_rollback'].forEach((name) => disabled.add(name))
    }
    if (!featureFlags.memory2) {
      ;['memory_review_list', 'memory_relation_save', 'memory_event_save'].forEach((name) => disabled.add(name))
    }
    if (!featureFlags.skill2) {
      ;['skill_catalog', 'skill_load', 'creative_critique', 'creative_revision_draft'].forEach((name) => disabled.add(name))
    }
    modeTools = modeTools.filter((tool) => !disabled.has(tool.name))
  }

  if (agent.tools === '*') {
    return modeTools
  }

  const allowed = new Set(agent.tools)
  return modeTools.filter((tool) => allowed.has(tool.name))
}
