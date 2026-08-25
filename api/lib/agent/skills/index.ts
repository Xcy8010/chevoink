import type { AgentExecutionMode, TaskIntent } from '../../../../shared/contracts/index.js'

export type CreativeFreedom = 'stable' | 'balanced' | 'bold'
export type SkillPhase = 'draft' | 'critique' | 'revision'

export type AgentSkill = {
  id: string
  name: string
  version: string
  license: 'internal' | 'MIT-adapted'
  attribution?: string
  intents: TaskIntent[]
  modes: AgentExecutionMode[]
  phases: SkillPhase[]
  strength: 'soft'
  pattern: RegExp
  synopsis: string
  resources: Partial<Record<SkillPhase, string>>
}

/** Skill 2.0：只承载可选择的创作方法，安全、版本和权限仍由代码硬约束。 */
export const skillCatalog: AgentSkill[] = [
  {
    id: 'scene-craft.v2', name: '场景化叙事', version: '2.0.0', license: 'internal',
    intents: ['write', 'revise'], modes: ['build'], phases: ['draft', 'revision'], strength: 'soft',
    pattern: /(场景|氛围|描写|动作|沉浸|扩写|写|续写)/,
    synopsis: '用人物目标、阻力和可感细节搭建场景；不强制固定开篇或结尾结构。',
    resources: {
      draft: '先确认人物此刻真正想得到什么，以及阻止他的具体事物。选择少量与视角人物有关的可感细节；允许留白，不为凑完整度解释所有情绪。段落节奏服务于当下动作，不要求每章固定钩子。',
      revision: '只修订已指出的场景问题。优先删去解释性复述，让动作、物件和对话承担信息；保留作者原有节奏、怪癖和不规则句式。',
    },
  },
  {
    id: 'character-voice.v2', name: '人物声口', version: '2.0.0', license: 'MIT-adapted',
    attribution: '方法论参考 OpenFic 的角色与长篇状态组织方式，未复制源提示词。',
    intents: ['write', 'revise', 'plan'], modes: ['plan', 'build'], phases: ['draft', 'critique', 'revision'], strength: 'soft',
    pattern: /(人物|角色|对话|声口|口吻|关系|争执|交锋|主角|配角)/,
    synopsis: '从欲望、信息差、关系阶段和既有语言样本区分人物。',
    resources: {
      draft: '先从记忆证据确认关系阶段和各自掌握的信息。对话围绕目的与回避展开；不同人物可在句长、称谓、停顿和关注点上自然分化，不靠口头禅标签化。',
      critique: '只指出能由原文举证的声口趋同、信息越权、动机跳变；把事实硬伤和审美偏好分开。',
      revision: '仅处理作者选中的问题，尽量保留原句骨架；通过目的、潜台词和反应差异修正，不给每句对白添加动作标签。',
    },
  },
  {
    id: 'continuity-evidence.v2', name: '证据化连续性', version: '2.0.0', license: 'MIT-adapted',
    attribution: '方法论参考 TencentDB-Agent-Memory 的分层记忆与证据召回思想。',
    intents: ['write', 'revise', 'review', 'structure'], modes: ['build', 'review'], phases: ['draft', 'critique', 'revision'], strength: 'soft',
    pattern: /(连续|一致|时间线|伏笔|设定|关系|中间|插章|扩展)/,
    synopsis: '写前按任务召回证据，审阅时区分事实冲突与可接受留白。',
    resources: {
      draft: '只携带当前场景必需的已确认事实、活跃关系、未收束事件和作者禁区。遇到 conflicted/inferred 记忆时回到来源核实，不自行选边。',
      critique: '逐项给出位置、冲突双方和 sourceId/revision；没有证据的疑点标为待核实，不升级为硬伤。',
      revision: '按选中的连续性问题最小改动，并在完成后重新检索来源与运行 structure_validate。',
    },
  },
  {
    id: 'prose-specificity.v2', name: '语言具体化', version: '2.0.0', license: 'internal',
    intents: ['revise'], modes: ['build'], phases: ['critique', 'revision'], strength: 'soft',
    pattern: /(AI味|机械|僵硬|不自然|套话|润色|文风|语言)/i,
    synopsis: '针对具体文本证据减少套话、同构句和解释性复述，不执行一键“去 AI”公式。',
    resources: {
      critique: '标出真实出现的重复意象、同构句式、抽象情绪、副词依赖或总结式收尾，并引用短句；未出现的问题不要凑清单。',
      revision: '只改作者选中的证据点。删除通常优先于同义替换；把抽象判断换成与人物处境有关的动作或物件，但允许克制、直述和不完美的人类节奏。',
    },
  },
  {
    id: 'story-shaping.v2', name: '故事塑形', version: '2.0.0', license: 'MIT-adapted',
    attribution: '方法论参考 OpenFic 与公开小说创作 Agent 的情节状态设计，已重写并去除固定三幕/爆款公式。',
    intents: ['plan', 'write'], modes: ['plan', 'build'], phases: ['draft', 'critique'], strength: 'soft',
    pattern: /(规划|大纲|情节|冲突|悬念|开篇|结尾|转折|节奏|写|续写)/,
    synopsis: '围绕读者承诺、因果推进和人物选择塑形，结构随题材与章节功能变化。',
    resources: {
      draft: '先说清这段内容兑现哪项读者期待、人物做了什么不可逆选择、信息如何变化。结构可以舒缓、断裂或留白；钩子、反转和冲突都不是每章必选项。',
      critique: '检查因果缺口、重复功能和无代价推进；不按固定节拍表判分，也不因为没有章末悬念就判失败。',
    },
  },
]

function freedomGuidance(freedom: CreativeFreedom): string {
  if (freedom === 'stable') return '创作自由度：稳定延续。软技巧低强度使用，优先贴合已有文风、人物轨迹和段落节奏。'
  if (freedom === 'bold') return '创作自由度：大胆探索。允许提出 2–3 个明显不同的方向；涉及核心设定或不可逆剧情时先让作者选择。事实约束不因此放宽。'
  return '创作自由度：平衡创作。守住人物与世界事实，同时允许在场景表达、节奏和意象上做有理由的新选择。'
}

export function routeSkills(input: {
  mode: AgentExecutionMode; prompt: string; intent: TaskIntent; phase?: SkillPhase; freedom: CreativeFreedom
}): AgentSkill[] {
  const phase = input.phase ?? (input.intent === 'review' ? 'critique' : input.intent === 'revise' ? 'revision' : 'draft')
  return skillCatalog
    .map((skill, index) => ({
      skill,
      score: (skill.intents.includes(input.intent) ? 4 : 0) + (skill.pattern.test(input.prompt) ? 3 : 0) + (skill.phases.includes(phase) ? 2 : 0) - index * 0.001,
    }))
    .filter(({ skill, score }) => score >= 6 && skill.modes.includes(input.mode) && skill.phases.includes(phase))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ skill }) => skill)
}

export function buildSkillManifestDigest(skills: AgentSkill[], freedom: CreativeFreedom): string {
  const listed = skills.length
    ? skills.map((skill) => `- ${skill.id}（${skill.name}）：${skill.synopsis}；需要时调用 skill_load 加载当前阶段资源。`).join('\n')
    : '- 本轮无需专用创作 Skill，直接遵从作者目标。'
  return `${freedomGuidance(freedom)}\n本轮 Skill Router 候选（均为软技巧，可不用，不得覆盖作者要求与故事事实）：\n${listed}`
}

export function loadSkill(skillId: string, phase: SkillPhase, freedom: CreativeFreedom): string | null {
  const skill = skillCatalog.find((item) => item.id === skillId)
  const resource = skill?.resources[phase]
  if (!skill || !resource) return null
  return `[Skill ${skill.id}@${skill.version} / ${phase} / soft]\n${freedomGuidance(freedom)}\n${resource}\n边界：这是一组可选择的创作启发，不是检查表；不得覆盖用户硬约束、故事证据、权限和版本校验。`
}
