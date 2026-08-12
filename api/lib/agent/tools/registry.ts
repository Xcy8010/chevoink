import { z } from 'zod'

import type { AgentExecutionMode } from '../../../../shared/contracts/index.js'
import type { OpenAIToolDefinition } from '../../ai-service.js'
import { coverApplyTool, coverGenerateTool } from './cover-tools.js'
import { askUserTool } from './interact-tools.js'
import {
  chapterListSummariesTool,
  chapterReadTool,
  memorySearchTool,
  novelGetContextTool,
  planReadTool,
} from './read-tools.js'
import { webSearchTool } from './search-tools.js'
import type { AgentTool } from './types.js'
import { todoWriteTool } from './todo-tools.js'
import {
  chapterAppendTool,
  chapterCreateTool,
  chapterEditRangeTool,
  chapterRenameTool,
  chapterWriteTool,
  coverPromptSetTool,
  memorySaveTool,
  novelArchiveTool,
  novelDeleteTool,
  novelPublishTool,
  novelRenameTool,
  novelUpdateMetaTool,
  planDeleteTool,
  planExitTool,
  planRenameTool,
  planSaveTool,
} from './write-tools.js'

/* eslint-disable @typescript-eslint/no-explicit-any -- 注册表需要擦除各工具的 Args 泛型 */
export const allTools: AgentTool<any>[] = [
  // 读
  novelGetContextTool,
  chapterReadTool,
  chapterListSummariesTool,
  memorySearchTool,
  planReadTool,
  webSearchTool,
  // 写
  chapterCreateTool,
  chapterWriteTool,
  chapterAppendTool,
  chapterEditRangeTool,
  chapterRenameTool,
  novelRenameTool,
  novelUpdateMetaTool,
  planSaveTool,
  planRenameTool,
  planDeleteTool,
  // 封面
  coverPromptSetTool,
  coverGenerateTool,
  coverApplyTool,
  // 高危
  novelPublishTool,
  novelArchiveTool,
  novelDeleteTool,
  // 记忆与流程
  memorySaveTool,
  planExitTool,
  todoWriteTool,
  // 交互
  askUserTool,
]
/* eslint-enable @typescript-eslint/no-explicit-any */

const toolsByName = new Map(allTools.map((tool) => [tool.name, tool]))

export function getToolByName(name: string): AgentTool | undefined {
  return toolsByName.get(name)
}

/** 按模式过滤：deny 的工具不出现在 LLM 工具列表里（对模型不可见） */
export function getToolsForMode(mode: AgentExecutionMode): AgentTool[] {
  return allTools.filter((tool) => tool.permission[mode] !== 'deny')
}

/** zod schema → OpenAI function calling 定义（zod v4 原生转换） */
export function toOpenAITools(tools: AgentTool[]): OpenAIToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.parameters, { io: 'input' }) as Record<string, unknown>,
    },
  }))
}
