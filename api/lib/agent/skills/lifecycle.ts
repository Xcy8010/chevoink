import type { AgentMessagePart, TaskIntent } from '../../../../shared/contracts/index.js'
import { isMechanicalOnly, type SkillPhase } from './index.js'

type ToolPart = Extract<AgentMessagePart, { type: 'tool-call' }>

/** Successful server tool receipts, never model prose, determine a milestone.
 * This selects instructions only; it never changes tool authority or task scope. */
export function nextSkillPhase(tool: string, part: ToolPart, intent: TaskIntent, prompt: string): SkillPhase | null {
  if (part.status !== 'success' || !['write', 'plan', 'revise', 'review'].includes(intent) || isMechanicalOnly(prompt)) return null
  if (tool === 'story_compiler_prepare') return 'scene'
  if (tool === 'scene_task_build') return 'draft'
  if (tool === 'plan_save' && intent === 'write') return 'draft'
  if (tool === 'chapter_write' || tool === 'chapter_patch') return 'critique'
  if (tool === 'continuity_validate' && part.display?.kind === 'storyCompiler' && (part.display.errorCount ?? 0) > 0) return 'revision'
  return null
}

export function phaseIntent(phase: SkillPhase): TaskIntent {
  if (phase === 'plan') return 'plan'
  if (phase === 'critique') return 'review'
  if (phase === 'revision') return 'revise'
  return 'write'
}

/** Phase-specific routing evidence. Never invented story facts or directives. */
export const phaseSignals: Partial<Record<SkillPhase, string>> = {
  scene: '场景任务 人物目标',
  draft: '正文 场景',
  critique: '证据化连续性审阅 文风连续性 近期结构去重',
  revision: '连续性修订 证据',
}
