import { z } from 'zod'

import type { AgentExecutionMode } from '../../../../shared/contracts/index.js'
import type { OpenAIToolDefinition } from '../../ai-service.js'
import { coverApplyTool, coverGenerateTool } from './cover-tools.js'
import { readFileTool, viewImageTool } from './attachment-tools.js'
import {
  chapterAppendTool,
  chapterCreateTool,
  chapterEditRangeTool,
  chapterRenameTool,
  chapterWriteTool,
} from './chapter-tools.js'
import { novelExportTool } from './export-tools.js'
import { askUserTool } from './interact-tools.js'
import {
  coverPromptSetTool,
  novelArchiveTool,
  novelDeleteTool,
  novelPublishTool,
  novelRenameTool,
  novelUpdateMetaTool,
} from './novel-tools.js'
import { platformNovelReadTool, platformNovelSearchTool } from './platform-tools.js'
import {
  chapterListSummariesTool,
  chapterReadTool,
  memorySearchTool,
  novelGetContextTool,
  planReadTool,
} from './read-tools.js'
import { webReadTool, webSearchTool } from './search-tools.js'
import type { AgentTool } from './types.js'
import { todoWriteTool } from './todo-tools.js'
import {
  chapterMergeTool,
  chapterMoveTool,
  chapterMoveToVolumeTool,
  chapterSplitTool,
  structureOutlineTool,
  volumeCreateTool,
  volumeDeleteTool,
  volumeListTool,
  volumeMoveTool,
  volumeUpdateTool,
} from './structure-tools.js'
import { memorySaveTool, planDeleteTool, planExitTool, planRenameTool, planSaveTool } from './write-tools.js'
import {
  bulkReplacePreviewTool,
  changeSetApplyTool,
  changeSetRollbackTool,
  entityRenamePreviewTool,
  entityResolveTool,
  impactAnalyzeTool,
  projectSearchTool,
  structureValidateTool,
} from './changeset-tools.js'
import { directiveListTool, directiveSaveTool, directiveSupersedeTool } from './directive-tools.js'
import { memoryEventSaveTool, memoryRelationSaveTool, memoryReviewListTool } from './memory-tools.js'
import {
  creativeCritiqueTool,
  creativeRevisionDraftTool,
  skillCatalogTool,
  skillCreateDraftTool,
  skillEnableTool,
  skillLoadTool,
  skillPublishTool,
  skillRollbackTool,
  skillRunExplainTool,
  skillTestTool,
} from './skill-tools.js'
import { sessionHistorySearchTool, sessionMessageReadTool } from './session-history-tools.js'
import {
  chapterBridgeCommitTool,
  chapterBridgeGetTool,
  continuityValidateTool,
  readerPromiseSaveTool,
  readerPromiseUpdateTool,
  sceneTaskBuildTool,
  storyCharterGetTool,
  storyCharterSaveTool,
  storyCompilerPrepareTool,
} from './story-compiler-tools.js'
import {
  characterVoiceGetTool,
  characterVoiceSaveTool,
  experienceAnchorGetTool,
  experienceAnchorSaveTool,
  qualityAnalyzeTool,
  qualityFindingFeedbackTool,
  qualityFindingsSelectTool,
  qualityReportGetTool,
  qualityRevisionApplyTool,
} from './humanity-quality-tools.js'

/* eslint-disable @typescript-eslint/no-explicit-any -- 注册表需要擦除各工具的 Args 泛型 */
export const allTools: AgentTool<any>[] = [
  // 读
  novelGetContextTool,
  chapterReadTool,
  chapterListSummariesTool,
  memorySearchTool,
  planReadTool,
  webSearchTool,
  webReadTool,
  platformNovelSearchTool,
  platformNovelReadTool,
  viewImageTool,
  readFileTool,
  novelExportTool,
  volumeListTool,
  structureOutlineTool,
  projectSearchTool,
  entityResolveTool,
  impactAnalyzeTool,
  structureValidateTool,
  directiveListTool,
  memoryReviewListTool,
  skillCatalogTool,
  skillLoadTool,
  skillRunExplainTool,
  sessionHistorySearchTool,
  sessionMessageReadTool,
  storyCharterGetTool,
  chapterBridgeGetTool,
  qualityReportGetTool,
  characterVoiceGetTool,
  experienceAnchorGetTool,
  // 写
  chapterCreateTool,
  chapterWriteTool,
  chapterAppendTool,
  chapterEditRangeTool,
  chapterRenameTool,
  volumeCreateTool,
  volumeUpdateTool,
  volumeMoveTool,
  volumeDeleteTool,
  chapterMoveTool,
  chapterMoveToVolumeTool,
  chapterSplitTool,
  chapterMergeTool,
  bulkReplacePreviewTool,
  entityRenamePreviewTool,
  changeSetApplyTool,
  changeSetRollbackTool,
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
  directiveSaveTool,
  directiveSupersedeTool,
  memoryRelationSaveTool,
  memoryEventSaveTool,
  creativeCritiqueTool,
  creativeRevisionDraftTool,
  skillCreateDraftTool,
  skillTestTool,
  skillEnableTool,
  skillRollbackTool,
  skillPublishTool,
  storyCharterSaveTool,
  readerPromiseSaveTool,
  readerPromiseUpdateTool,
  storyCompilerPrepareTool,
  sceneTaskBuildTool,
  continuityValidateTool,
  chapterBridgeCommitTool,
  qualityAnalyzeTool,
  qualityFindingsSelectTool,
  qualityRevisionApplyTool,
  qualityFindingFeedbackTool,
  characterVoiceSaveTool,
  experienceAnchorSaveTool,
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
