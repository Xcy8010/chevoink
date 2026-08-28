import type { AgentExecutionMode, TaskIntent } from '../../shared/contracts/index.js'
import type { SkillPhase } from '../../api/lib/agent/skills/index.js'

export const CN_FICTION_EVAL_VERSION = 'cn-fiction-v1.0.0' as const

export type CnFictionGenre = 'urban' | 'fantasy' | 'suspense' | 'romance' | 'science_fiction' | 'history'
export type CnFictionTask = 'open_book' | 'outline' | 'first_chapter' | 'continue' | 'conflict' | 'emotion' | 'revise' | 'long_context' | 'hard_negative'
export type CnFictionStyle = 'fast_direct' | 'restrained_realism' | 'light_comedy' | 'classical' | 'hardboiled' | 'genre_technical'
export type CnQualitySignal =
  | 'style_drift'
  | 'orphaned_sophistication'
  | 'plot_progress'
  | 'description_load'
  | 'emotion_grounding'
  | 'explanation_echo'
  | 'sentence_homology'
  | 'image_repetition'
  | 'character_voice'
  | 'causal_gap'
  | 'chapter_bridge'
  | 'reader_pull'

export type CnFictionEvalScenario = {
  id: string
  datasetVersion: typeof CN_FICTION_EVAL_VERSION
  genre: CnFictionGenre
  task: CnFictionTask
  style: CnFictionStyle
  mode: AgentExecutionMode
  intent: TaskIntent
  phase?: SkillPhase
  title: string
  fixture: string
  prompt: string
  expectedSkillIds: string[]
  forbiddenSkillIds: string[]
  qualitySignals: CnQualitySignal[]
  hardNegative: boolean
}

const scenario = (value: Omit<CnFictionEvalScenario, 'datasetVersion'>): CnFictionEvalScenario => ({
  datasetVersion: CN_FICTION_EVAL_VERSION,
  ...value,
})

/**
 * 冻结中文网文路由集。这里不放受版权保护的小说原文，只保存自建任务、事实夹具和可验证期望。
 * 文本质量盲评样本由独立脱敏管线保存，不能回填到本文件成为提示词泄漏。
 */
export const CN_FICTION_EVAL_SCENARIOS: CnFictionEvalScenario[] = [
  scenario({
    id: 'CNF-001', genre: 'urban', task: 'open_book', style: 'fast_direct', mode: 'plan', intent: 'plan',
    title: '都市逆袭新书定位', fixture: '外卖员发现连锁餐饮财务漏洞；拒绝系统流和当众打脸模板。',
    prompt: '我想写一本都市职场新书，先做题材定位、目标受众、读者承诺和差异化故事方向，不要直接列三十章大纲。',
    expectedSkillIds: ['cn-project-positioning.v3'], forbiddenSkillIds: ['cn-webfiction-draft.v3'],
    qualitySignals: ['reader_pull', 'causal_gap'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-002', genre: 'urban', task: 'conflict', style: 'restrained_realism', mode: 'build', intent: 'write', phase: 'draft',
    title: '都市职场谈判冲突', fixture: '主角掌握一条可验证数据；职位和项目归属是实际代价。',
    prompt: '写这一章的职场谈判冲突正文。主角不靠众人震惊翻盘，要通过具体选择付出职位风险。',
    expectedSkillIds: ['cn-scene-task.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['plot_progress', 'causal_gap', 'description_load'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-003', genre: 'urban', task: 'revise', style: 'fast_direct', mode: 'build', intent: 'revise', phase: 'revision',
    title: '都市正文去机械复述', fixture: '对白后连续三次由叙述解释同一情绪。',
    prompt: '这段太有AI味，机械复述、套话和形容词堆砌明显。只做局部修订，不要整章重写。',
    expectedSkillIds: ['cn-prose-specificity.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['explanation_echo', 'orphaned_sophistication', 'sentence_homology'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-004', genre: 'fantasy', task: 'outline', style: 'fast_direct', mode: 'plan', intent: 'plan', phase: 'plan',
    title: '玄幻分卷升级规划', fixture: '力量提升必须消耗记忆；每卷兑现一种代价。',
    prompt: '规划这本玄幻长篇的大纲和分卷主线，围绕能力代价、人物选择与阶段兑现，不要固定爽点间隔。',
    expectedSkillIds: ['cn-long-outline.v3'], forbiddenSkillIds: ['cn-prose-specificity.v3'],
    qualitySignals: ['plot_progress', 'causal_gap', 'reader_pull'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-005', genre: 'fantasy', task: 'first_chapter', style: 'fast_direct', mode: 'build', intent: 'write', phase: 'draft',
    title: '玄幻第一章能力代价', fixture: '主角第一次用术法后忘记妹妹的声音。',
    prompt: '写第一章正文：主角为救人第一次动用术法，立即付出记忆代价，让冲突真实推进。',
    expectedSkillIds: ['cn-scene-task.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-project-positioning.v3'],
    qualitySignals: ['plot_progress', 'emotion_grounding', 'reader_pull'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-006', genre: 'fantasy', task: 'continue', style: 'classical', mode: 'build', intent: 'write', phase: 'draft',
    title: '玄幻跨章承接', fixture: '上一章停在师父举剑却认不出主角；主角左臂受伤。',
    prompt: '续写下一章，承接上一章未完成动作、伤势和双方知识差，避免复述摘要。',
    expectedSkillIds: ['cn-chapter-bridge.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-project-positioning.v3'],
    qualitySignals: ['chapter_bridge', 'causal_gap', 'image_repetition'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-007', genre: 'suspense', task: 'first_chapter', style: 'hardboiled', mode: 'build', intent: 'write', phase: 'draft',
    title: '悬疑第一章证据进入', fixture: '三部离线手机出现同一个被裁掉的人影。',
    prompt: '写悬疑第一章正文。让主角从具体行动发现证据，信息变化必须由人物选择造成。',
    expectedSkillIds: ['cn-scene-task.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['plot_progress', 'causal_gap', 'reader_pull'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-008', genre: 'suspense', task: 'long_context', style: 'hardboiled', mode: 'review', intent: 'review', phase: 'critique',
    title: '悬疑百章伏笔核验', fixture: '枪在第 3 章入库、第 48 章被调包、第 97 章重新出现。',
    prompt: '检查第一章里的枪到第一百章是否连续一致，核对时间线、持有物和伏笔证据，不要改写正文。',
    expectedSkillIds: ['cn-continuity-audit.v3'], forbiddenSkillIds: ['cn-webfiction-draft.v3'],
    qualitySignals: ['causal_gap', 'chapter_bridge'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-009', genre: 'suspense', task: 'revise', style: 'hardboiled', mode: 'build', intent: 'revise', phase: 'revision',
    title: '悬疑孤立华丽词修订', fixture: '审讯场景突然使用与全书语域无关的古典比喻。',
    prompt: '文风前后割裂，突然华丽堆砌而且语域不统一。找出证据后局部修改。',
    expectedSkillIds: ['cn-prose-specificity.v3', 'cn-style-continuity.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['style_drift', 'orphaned_sophistication'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-010', genre: 'romance', task: 'emotion', style: 'restrained_realism', mode: 'build', intent: 'write', phase: 'draft',
    title: '言情克制重逢', fixture: '两人分开五年；一方仍保留没寄出的挂号单。',
    prompt: '写一段克制的重逢情感场景正文，用行动、回避和关系后果表达悲伤，不要直接喊情绪。',
    expectedSkillIds: ['cn-emotion-grounding.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['emotion_grounding', 'character_voice', 'explanation_echo'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-011', genre: 'romance', task: 'conflict', style: 'light_comedy', mode: 'build', intent: 'write', phase: 'draft',
    title: '言情轻喜争执', fixture: '双方都想保住共同租约，但谁也不肯先承认需要对方。',
    prompt: '写这一章两位主角争执的对话和冲突，保持各自声口、回避方式与关系变化。',
    expectedSkillIds: ['cn-character-voice.v3', 'cn-scene-task.v3'], forbiddenSkillIds: ['cn-project-positioning.v3'],
    qualitySignals: ['character_voice', 'plot_progress', 'sentence_homology'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-012', genre: 'romance', task: 'continue', style: 'restrained_realism', mode: 'build', intent: 'write', phase: 'draft',
    title: '言情情绪余波续写', fixture: '上一章有人拒绝求婚但没有解释原因。',
    prompt: '继续写下一章，承接上一章的关系余波和未完成问题，不要机械回顾拒绝求婚的过程。',
    expectedSkillIds: ['cn-chapter-bridge.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['chapter_bridge', 'emotion_grounding', 'reader_pull'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-013', genre: 'science_fiction', task: 'open_book', style: 'genre_technical', mode: 'plan', intent: 'plan', phase: 'plan',
    title: '硬科幻项目定位', fixture: '城市借助概率预报治理犯罪；代价是个人选择被量化。',
    prompt: '为一本硬科幻新书做题材定位和读者承诺，保留必要术语，但不要用概念堆砌代替人物冲突。',
    expectedSkillIds: ['cn-project-positioning.v3'], forbiddenSkillIds: ['cn-webfiction-draft.v3'],
    qualitySignals: ['causal_gap', 'reader_pull'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-014', genre: 'science_fiction', task: 'continue', style: 'genre_technical', mode: 'build', intent: 'write', phase: 'draft',
    title: '科幻知识状态承接', fixture: '主角知道量子中继器有后门，队友仍不知情。',
    prompt: '续写下一章正文，承接人物知识差和未完成动作，量子中继器是合理设定，不要擅自删掉术语。',
    expectedSkillIds: ['cn-chapter-bridge.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-project-positioning.v3'],
    qualitySignals: ['chapter_bridge', 'causal_gap', 'character_voice'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-015', genre: 'science_fiction', task: 'hard_negative', style: 'genre_technical', mode: 'review', intent: 'review', phase: 'critique',
    title: '科幻术语不是 AI 词', fixture: '量子、熵和中微子均为世界规则必要术语且已有铺垫。',
    prompt: '审阅这段硬科幻设定的一致性。量子、熵和中微子有充分铺垫，不要仅因这些词判断为AI味或强行润色。',
    expectedSkillIds: ['cn-continuity-audit.v3'], forbiddenSkillIds: ['cn-prose-specificity.v3'],
    qualitySignals: ['causal_gap', 'style_drift'], hardNegative: true,
  }),
  scenario({
    id: 'CNF-016', genre: 'history', task: 'outline', style: 'classical', mode: 'plan', intent: 'plan', phase: 'plan',
    title: '历史长篇分卷', fixture: '盐政改革牵动地方财政、宗族和漕运；不能用现代公司话术。',
    prompt: '规划历史长篇大纲和分卷情节弧，围绕盐政、宗族与漕运的冲突升级和人物代价。',
    expectedSkillIds: ['cn-long-outline.v3'], forbiddenSkillIds: ['cn-webfiction-draft.v3'],
    qualitySignals: ['plot_progress', 'causal_gap', 'reader_pull'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-017', genre: 'history', task: 'conflict', style: 'classical', mode: 'build', intent: 'write', phase: 'draft',
    title: '历史堂审交锋', fixture: '主角只有账簿缺页和证人迟到两项筹码。',
    prompt: '写堂审交锋场景正文，人物对话要符合身份和知识边界，冲突靠证据与选择推进。',
    expectedSkillIds: ['cn-character-voice.v3', 'cn-scene-task.v3'], forbiddenSkillIds: ['cn-project-positioning.v3'],
    qualitySignals: ['character_voice', 'plot_progress', 'causal_gap'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-018', genre: 'history', task: 'hard_negative', style: 'classical', mode: 'review', intent: 'review', phase: 'critique',
    title: '故意华丽的角色视角', fixture: '角色是受过古典教育的诗人，全文均保持同一叙事距离。',
    prompt: '审阅这段故意华丽的诗人视角是否前后风格一致，不要因为修辞密度高就直接判错或改成白话。',
    expectedSkillIds: ['cn-style-continuity.v3'], forbiddenSkillIds: ['cn-prose-specificity.v3'],
    qualitySignals: ['style_drift', 'orphaned_sophistication'], hardNegative: true,
  }),
  scenario({
    id: 'CNF-019', genre: 'urban', task: 'hard_negative', style: 'restrained_realism', mode: 'review', intent: 'review', phase: 'critique',
    title: '情绪收束章无需强钩子', fixture: '本卷主要冲突已兑现，本章功能是葬礼后的关系和解。',
    prompt: '审阅这个没有章末悬念的情绪收束章。它已经完成关系变化，不要强制添加反转或钩子。',
    expectedSkillIds: ['cn-emotion-grounding.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['emotion_grounding', 'reader_pull'], hardNegative: true,
  }),
  scenario({
    id: 'CNF-020', genre: 'fantasy', task: 'hard_negative', style: 'fast_direct', mode: 'build', intent: 'revise', phase: 'revision',
    title: '只改错字不加载文笔技能', fixture: '正文只有一个“的/地”误用。',
    prompt: '只改一个错别字，不要动其他内容。',
    expectedSkillIds: [], forbiddenSkillIds: ['cn-prose-specificity.v3', 'cn-webfiction-draft.v3'],
    qualitySignals: [], hardNegative: true,
  }),
  scenario({
    id: 'CNF-021', genre: 'suspense', task: 'hard_negative', style: 'hardboiled', mode: 'build', intent: 'structure',
    title: '移动章节不加载创作技能', fixture: '第八章需要移动到第二卷首位。',
    prompt: '把第八章移动到第二卷，不改正文。',
    expectedSkillIds: [], forbiddenSkillIds: ['cn-scene-task.v3', 'cn-webfiction-draft.v3'],
    qualitySignals: [], hardNegative: true,
  }),
  scenario({
    id: 'CNF-022', genre: 'science_fiction', task: 'emotion', style: 'genre_technical', mode: 'build', intent: 'write', phase: 'draft',
    title: '科幻亲子情绪场景', fixture: '父亲只能在模拟舱中听见女儿十年前留下的三句话。',
    prompt: '写这一章科幻情感场景正文，让悲伤落在人物的身体反应、选择和实际后果上。',
    expectedSkillIds: ['cn-emotion-grounding.v3', 'cn-webfiction-draft.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['emotion_grounding', 'description_load', 'plot_progress'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-023', genre: 'romance', task: 'revise', style: 'light_comedy', mode: 'build', intent: 'revise', phase: 'revision',
    title: '轻喜对白声口修订', fixture: '两名角色连续六句使用相同句长和总结口吻。',
    prompt: '这段人物对话声口太像、语言不自然。保留轻喜节奏，只局部修改各自回避方式。',
    expectedSkillIds: ['cn-character-voice.v3', 'cn-prose-specificity.v3'], forbiddenSkillIds: ['cn-long-outline.v3'],
    qualitySignals: ['character_voice', 'sentence_homology', 'explanation_echo'], hardNegative: false,
  }),
  scenario({
    id: 'CNF-024', genre: 'history', task: 'continue', style: 'classical', mode: 'build', intent: 'write', phase: 'draft',
    title: '历史跨五十章续写', fixture: '第 2 章许下归还族谱，第 31 章族谱被烧，第 50 章发现副本。',
    prompt: '续写第五十一章正文，承接上一章发现副本的动作，并核对前文族谱状态、人物关系与知识边界。',
    expectedSkillIds: ['cn-chapter-bridge.v3', 'cn-continuity-audit.v3'], forbiddenSkillIds: ['cn-project-positioning.v3'],
    qualitySignals: ['chapter_bridge', 'causal_gap', 'character_voice'], hardNegative: false,
  }),
]
