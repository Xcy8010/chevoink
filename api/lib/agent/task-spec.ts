import { randomUUID } from 'node:crypto'

import type { TaskIntent, TaskSpec, UserDirective } from '../../../shared/contracts/index.js'
import type { CreativeFreedom } from '../../../shared/contracts/index.js'

type DirectiveCandidate = Pick<UserDirective, 'kind' | 'text'>

const PREFERENCE_MARKERS = /(希望|尽量|偏好|最好|倾向)/

function sentences(prompt: string): string[] {
  return prompt
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30)
}

export function extractDirectiveCandidates(prompt: string): DirectiveCandidate[] {
  const result: DirectiveCandidate[] = []
  const seen = new Set<string>()
  for (const text of sentences(prompt)) {
    const normalized = text.replace(/\s+/g, ' ').slice(0, 500)
    if (seen.has(normalized)) continue
    let kind: DirectiveCandidate['kind'] | null = null
    if (/(不要|不得|不能|禁止|严禁)/.test(normalized)) kind = 'must_not'
    else if (/(必须|务必|一定要|只能|保持)/.test(normalized)) kind = 'must'
    else if (/(改为|改成|以后|决定|采用)/.test(normalized)) kind = 'decision'
    else if (PREFERENCE_MARKERS.test(normalized)) kind = 'preference'
    if (kind) {
      seen.add(normalized)
      result.push({ kind, text: normalized })
    }
  }
  return result
}

function classifyIntent(prompt: string): TaskIntent {
  if (/(全书|所有章节|批量|统一).{0,16}(改名|替换|修改|变更)|全局改/.test(prompt)) return 'global_transform'
  if (/(卷|章节).{0,12}(移动|排序|顺序|拆分|合并|插入)|新增.*卷/.test(prompt)) return 'structure'
  if (/(检查|审阅|评估|分析|找问题|一致性)/.test(prompt)) return 'review'
  if (/(规划|大纲|计划|设计剧情)/.test(prompt)) return 'plan'
  if (/(改写|润色|扩写|缩写|修改|调整)/.test(prompt)) return 'revise'
  return 'write'
}

export function buildTaskSpec(input: {
  runId: string
  novelId: string
  chapterId: string | null
  prompt: string
  selection?: { start?: number; end?: number } | null
  creativeFreedom?: CreativeFreedom
}): TaskSpec {
  const intent = classifyIntent(input.prompt)
  const requiresStructureValidation = intent === 'structure' || /(?:续写|写完|补完|完成|写到).{0,12}第?[一二两三四五六七八九十百千0-9]+卷|第?[一二两三四五六七八九十百千0-9]+卷.{0,12}(?:续写|写完|补完|完成)/.test(input.prompt)
  const protectsEarlierContent = /(不|不要|不得|不能|禁止).{0,8}(改动|修改|重写|影响).{0,8}(前面|此前|已有|之前)|保持.{0,8}(前面|此前|已有|之前).{0,8}不变/.test(input.prompt)
  const directives = extractDirectiveCandidates(input.prompt)
  const chapterIds = input.chapterId ? [input.chapterId] : undefined
  const selection = input.chapterId && input.selection?.start !== undefined && input.selection.end !== undefined
    ? { chapterId: input.chapterId, start: input.selection.start, end: input.selection.end }
    : undefined
  const outputKind = intent === 'global_transform'
    ? 'changeset'
    : intent === 'review' || intent === 'structure'
      ? 'validation_report'
      : intent === 'plan'
        ? 'artifact'
        : 'text'

  return {
    id: randomUUID(),
    runId: input.runId,
    intent,
    scope: { novelId: input.novelId, chapterIds, selection },
    goals: [input.prompt.trim().slice(0, 1000) || '继续完成上一轮任务'],
    hardConstraints: directives
      .filter((item) => item.kind === 'must' || item.kind === 'must_not')
      .map((item) => ({ id: randomUUID(), kind: 'author_directive', text: item.text })),
    softPreferences: directives
      .filter((item) => item.kind === 'preference')
      .map((item) => ({ id: randomUUID(), text: item.text, weight: 0.8 })),
    expectedOutputs: [{ kind: outputKind, description: `完成${intent}任务并给出可核验结果`, required: true }],
    postconditions: [
      ...(intent === 'global_transform'
        ? [{ code: 'CHANGESET_VERIFIED', description: '全书变更通过预览、版本校验与原子应用', severity: 'error' as const }]
        : []),
      ...(requiresStructureValidation
        ? [{ code: 'STRUCTURE_VALIDATED', description: '卷章顺序与标题结构通过校验', severity: 'error' as const }]
        : []),
      ...(protectsEarlierContent
        ? [{ code: 'EARLIER_CONTENT_UNCHANGED', description: '任务开始前已有章节正文保持不变，仅新增目标范围内容', severity: 'error' as const }]
        : []),
    ],
    ambiguity: input.prompt.trim().length <= 2 ? 'must_ask' : 'safe_to_assume',
    creativeFreedom: input.creativeFreedom ?? 'balanced',
    createdAt: new Date().toISOString(),
  }
}

export function renderTaskSpec(spec: TaskSpec): string {
  const hard = spec.hardConstraints.map((item) => `- ${item.text}`).join('\n') || '- 无'
  return `[系统] 本轮任务契约（taskSpecId=${spec.id}）：\n意图：${spec.intent}\n目标：${spec.goals.join('；')}\n硬约束：\n${hard}\n预期交付：${spec.expectedOutputs.map((item) => item.description).join('；')}\n完成前必须验证：${spec.postconditions.map((item) => item.description).join('；') || '按用户目标核验结果'}。`
}
