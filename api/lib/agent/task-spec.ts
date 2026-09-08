import { randomUUID } from 'node:crypto'

import type { TaskIntent, TaskSpec, UserDirective } from '../../../shared/contracts/index.js'
import type { CreativeFreedom } from '../../../shared/contracts/index.js'
import type { StoryCompilerMode } from '../../../shared/contracts/index.js'

type DirectiveCandidate = Pick<UserDirective, 'kind' | 'text'>

const PREFERENCE_MARKERS = /(希望|尽量|偏好|最好|倾向)/

/** Only explicit lower bounds for an in-chat report. This extracts a length
 * obligation, never grants research access or chapter-writing permissions. */
function explicitReportMinimum(prompt: string): number | undefined {
  if (/(保存|导出|文件|写入计划)/u.test(prompt)) return undefined
  // A separate "不要写章节" constraint must not erase the report's length.
  prompt = prompt.split(/[。！？!?；;\n，,]+/u)
    .filter(clause => !/^\s*(?:请)?(?:不要|无需|不用|不必)/u.test(clause)).join('，')
  const number = '(\\d+(?:\\.\\d+)?|一万|两万|二万|三万|五千)'
  const unit = '(万|千)?(?:个汉字|字)'
  const match = prompt.match(new RegExp(`(?:分析报告|研究报告|拆书报告|拆解报告)(?:正文)?(?:字数)?[：:，,\\s]*(?:至少|不少于|不低于)\\s*${number}${unit}`, 'u'))
    ?? prompt.match(new RegExp(`(?:至少|不少于|不低于)\\s*${number}${unit}的?(?:分析报告|研究报告|拆书报告|拆解报告)`, 'u'))
  if (!match) return undefined
  const named: Record<string, number> = { 一万: 10000, 两万: 20000, 二万: 20000, 三万: 30000, 五千: 5000 }
  const value = named[match[1]] ?? Number(match[1]) * (match[2] === '万' ? 10000 : match[2] === '千' ? 1000 : 1)
  return Number.isSafeInteger(value) && value > 0 && value <= 2_000_000 ? value : undefined
}

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
  // Separate a research-only request from the existing review-and-repair
  // workflow. Mixed requests retain their existing workflow until explicit
  // phase permissions are resolved; do not silently discard requested writes.
  const clauses = prompt.split(/[。！？!?；;\n，,]+/u)
  const requestsResearch = /拆书|拆解|调研|解读|读后评估|(?:阅读|分析).{0,16}(?:小说|这本书|本书|作品)|(?:research|analy[sz]e|dissect).{0,32}(?:novel|book)/iu.test(prompt)
  const requestsWriting = clauses.some(clause => !/(?:不要|无需|不用|不必|禁止|不得|不能|只读|不写|不改|do not|don't)/iu.test(clause)
    && /(?:写|续写|改写|修改|润色|创建|新建|发布|删除).{0,16}(?:章|正文|小说|作品|卷)|(?:保存|写入|存入).{0,24}(?:计划|文件)|(?:write|create|edit|publish).{0,20}(?:chapter|novel)/iu.test(clause))
  if (requestsResearch && !requestsWriting) return 'research_analysis'
  if (/(全书|所有章节|批量|统一).{0,16}(改名|替换|修改|变更)|全局改/.test(prompt)) return 'global_transform'
  if (/(卷|章节).{0,12}(移动|排序|顺序|拆分|合并|插入)|新增.*卷/.test(prompt)) return 'structure'
  if (/(检查|审阅|评估|分析|找问题|一致性)/.test(prompt)) return 'review'
  if (/(规划|大纲|计划|设计剧情)/.test(prompt)) return 'plan'
  if (/(改写|润色|扩写|缩写|修改|调整)/.test(prompt)) return 'revise'
  return 'write'
}

/** Repair only legacy research classification, using the complete original
 * user request recovered by the resume service. Never mint a new task identity
 * or grant additional effects from history, a summary, or tool output. */
export function narrowLegacyResearchTask(spec: TaskSpec, originalPrompt: string): TaskSpec {
  if (spec.authorization || spec.intent === 'research_analysis' || classifyIntent(originalPrompt) !== 'research_analysis') return spec
  const minimumChineseCharacters = explicitReportMinimum(originalPrompt)
  return { ...spec, intent: 'research_analysis', expectedOutputs: [{ kind: 'validation_report', required: true,
    description: '完成原始请求的只读研究并交付可核验报告',
    ...(minimumChineseCharacters ? { minimumChineseCharacters } : {}) }] }
}

export function buildTaskSpec(input: {
  runId: string
  novelId: string
  chapterId?: string | null
  prompt: string
  selection?: { start?: number; end?: number } | null
  creativeFreedom?: CreativeFreedom
  qualityMode?: StoryCompilerMode
}): TaskSpec {
  const intent = classifyIntent(input.prompt)
  const minimumChineseCharacters = intent === 'review' || intent === 'research_analysis' ? explicitReportMinimum(input.prompt) : undefined
  const requiresStructureValidation = intent === 'structure' || /(?:续写|写完|补完|完成|写到).{0,12}第?[一二两三四五六七八九十百千0-9]+卷|第?[一二两三四五六七八九十百千0-9]+卷.{0,12}(?:续写|写完|补完|完成)/.test(input.prompt)
  const protectsEarlierContent = /(不|不要|不得|不能|禁止).{0,8}(改动|修改|重写|影响).{0,8}(前面|此前|已有|之前)|保持.{0,8}(前面|此前|已有|之前).{0,8}不变/.test(input.prompt)
  const directives = extractDirectiveCandidates(input.prompt)
  const chapterIds = input.chapterId ? [input.chapterId] : undefined
  const selection = input.chapterId && input.selection?.start !== undefined && input.selection.end !== undefined
    ? { chapterId: input.chapterId, start: input.selection.start, end: input.selection.end }
    : undefined
  const outputKind = intent === 'global_transform'
    ? 'changeset'
    : intent === 'review' || intent === 'research_analysis' || intent === 'structure'
      ? 'validation_report'
      : intent === 'plan'
        ? 'artifact'
        : 'text'

  return {
    id: randomUUID(),
    runId: input.runId,
    intent,
    researchBudget: /完整拆书|全书拆解|逐章分析|逐章拆解|深度研究|全面研究|深入研究|深入分析|深度分析|拆解这本小说|拆解整本|full.book|deep research/i.test(input.prompt) ? 'extended' : 'standard',
    scope: { novelId: input.novelId, chapterIds, selection },
    goals: [input.prompt.trim().slice(0, 1000) || '继续完成上一轮任务'],
    hardConstraints: directives
      .filter((item) => item.kind === 'must' || item.kind === 'must_not')
      .map((item) => ({ id: randomUUID(), kind: 'author_directive', text: item.text })),
    softPreferences: directives
      .filter((item) => item.kind === 'preference')
      .map((item) => ({ id: randomUUID(), text: item.text, weight: 0.8 })),
    expectedOutputs: [{ kind: outputKind, description: `完成${intent}任务并给出可核验结果${minimumChineseCharacters ? `；报告至少${minimumChineseCharacters}个汉字（不计代码、URL、标点与重复段落）` : ''}`, required: true,
      ...(minimumChineseCharacters ? { minimumChineseCharacters } : {}) }],
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
    qualityMode: input.qualityMode ?? 'premium',
    createdAt: new Date().toISOString(),
  }
}

export function renderTaskSpec(spec: TaskSpec): string {
  if (spec.intent === 'research_analysis') {
    const budget = spec.researchBudget === 'extended' ? '最多5次搜索、8次页面获取' : '最多2次搜索、2次页面获取'
    return `[系统] 本轮只读研究契约（taskSpecId=${spec.id}）：\n目标：${spec.goals.join('；')}\n只读取资料并交付分析；不得创建或改写章节、卷、作品、记忆、封面或派生写作窗口，历史写作指令不构成本轮授权。正文不可读或覆盖不足必须说明缺失，不能虚称全书读完。按照用户要求完整输出报告，不套用写作任务的简短收尾规则。复杂任务可维护本轮真实待办，无待办不补建已完成清单。\n联网预算：${budget}，缓存续读不消耗获取额度；连续两次读取失败后停止新增联网，保留已有证据并说明限制。普通分析不自行扩展到影视化、销量或结局争议。用户指定外部平台作品时直接搜索官方来源，不先搜索本平台作品库。优先官方作品页，再沿真实章节链接读取；书评、新闻、简介只能作为对应类型的资料，不是原著正文。\n预期交付：${spec.expectedOutputs.map(item => item.description).join('；')}。`
  }
  const hard = spec.hardConstraints.map((item) => `- ${item.text}`).join('\n') || '- 无'
  const freedomLabel = spec.creativeFreedom === 'stable' ? '平衡延续' : spec.creativeFreedom === 'bold' ? '大胆探索' : '严谨创作'
  const freedomRule = spec.creativeFreedom === 'stable'
    ? '贴合既有走向，只修明确错误。'
    : spec.creativeFreedom === 'bold'
      ? '优先探索新可能；检查建议仅提示，不自动改写。'
      : '连续性只对可证实的事实错误做一次集中最小修订，警告不自动改写；质量审美建议只展示。保留作者声音，不反复润色。质量修改后仅复核连续性，通过后提交，不来回重做两类检查。'
  return `[系统] 本轮任务契约（taskSpecId=${spec.id}）：\n意图：${spec.intent}\n目标：${spec.goals.join('；')}\n创作模式：${freedomLabel}（${freedomRule}）；质量模式：${spec.qualityMode}\n硬约束：\n${hard}\n预期交付：${spec.expectedOutputs.map((item) => item.description).join('；')}\n完成前必须验证：${spec.postconditions.map((item) => item.description).join('；') || '按用户目标核验结果'}。`
}
