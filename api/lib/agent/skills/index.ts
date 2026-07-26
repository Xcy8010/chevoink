import type { AgentExecutionMode } from '../../../../shared/contracts/index.js'

/**
 * 内置 Skill 体系（plan/14 §七）：触发条件 + 流程模板 + 输出检查清单。
 * 本质是针对特定任务型态的增强提示词包，assembleContext 组装时判定命中，
 * 命中则作为独立 system 段注入；每次最多命中 1 个（按数组顺序即优先级）。
 */

export type AgentSkill = {
  name: string
  /** 命中条件：模式匹配 + 用户 prompt 关键词正则 */
  trigger: {
    modes: AgentExecutionMode[]
    pattern: RegExp
  }
  /** 注入的流程模板 + 检查清单（≤500 字） */
  prompt: string
}

const chapterPlanningSkill: AgentSkill = {
  name: '章节规划',
  trigger: {
    modes: ['plan'],
    pattern: /(规划|大纲|计划).{0,12}(第?\s*[\d一二三四五六七八九十百]+\s*章|章节|下一章)|(第?\s*[\d一二三四五六七八九十百]+\s*章|下一章).{0,12}(规划|大纲|计划)/,
  },
  prompt: `本次任务命中「章节规划」工作流，严格按以下步骤执行：
1. 读上下文：chapter_read 读上一章结尾（至少最后 1000 字）+ memory_search 拉伏笔与关键设定。
2. 提问：若存在影响方向的不确定点，把它们合并成一次 ask_user（最多 1 次），拿到回答再继续。
3. 落盘：plan_save 写入完整计划；若作者要求修订已有计划或本次任务里已落盘过，必须带 planId 就地更新。
4. 收尾：正文只写一句话（已写入/已更新计划《标题》）。
计划内容必须包含五要素：本章剧情目标、场景序列（按顺序）、出场人物及各自动机、需要处理的伏笔（埋设/推进/回收）、结尾钩子。
自查清单：是否读了上一章？五要素是否齐全？是否重复落盘同名计划？正文是否只有一句话？`,
}

const chapterWritingSkill: AgentSkill = {
  name: '章节写作',
  trigger: {
    modes: ['build'],
    pattern: /(写|续写|创作).{0,12}(第?\s*[\d一二三四五六七八九十百]+\s*章|章节|下一章|新章)|(第?\s*[\d一二三四五六七八九十百]+\s*章|下一章).{0,12}(写|续写|创作)/,
  },
  prompt: `本次任务命中「章节写作」工作流，严格按以下步骤执行：
1. 校对：memory_search 核对本章涉及的人名、设定与时间线。
2. 读上下文：chapter_read 读上一章结尾；若「计划」文件夹里有对应本章的规划，先按规划写。
3. 写入：用 chapter_create / chapter_write / chapter_append 落库，长章节可分段追加；正文禁止贴在回复里。
4. 收尾：不超过 2 句话汇报结果（章节、字数）。
自查清单：视角是否全章一致？是否呼应了计划中的场景序列与伏笔？结尾钩子是否落地？字数是否达到作者要求？`,
}

const revisionSkill: AgentSkill = {
  name: '修订润色',
  trigger: {
    modes: ['build'],
    pattern: /(修改|润色|调整|优化|改写|删减|扩写).{0,20}(段|句|开头|结尾|对话|描写|章)/,
  },
  prompt: `本次任务命中「修订润色」工作流，严格按以下步骤执行：
1. 读原文：chapter_read 读取目标章节，明确要动的范围。
2. 精准修改：优先 chapter_edit_range 只改目标区间，禁止为局部修改全文重写；只有作者明确要求全章重写时才用 chapter_write。
3. 收尾：一句话说明改了哪里、怎么改的。
自查清单：是否只动了作者要求的范围？是否保留了原文风格与人称？改动前后上下文是否衔接自然？`,
}

const consistencyReviewSkill: AgentSkill = {
  name: '一致性审阅',
  trigger: {
    modes: ['review'],
    pattern: /./,
  },
  prompt: `本次任务命中「一致性审阅」工作流，严格按以下步骤执行：
1. memory_search 拉取全量设定（角色卡、时间线、伏笔、世界观）。
2. chapter_read 逐章比对作者指定范围，检查：人名与称谓、时间线先后、设定规则、伏笔是否断线、人物行为是否符合动机。
3. 输出结构化问题清单，每条必须含三要素：位置（第几章/段）、问题描述、建议修法。
自查清单：每条是否三要素齐全？是否漏查了时间线？是否把「风格建议」和「硬伤」分开列了？`,
}

/** 优先级从高到低：修订意图比写作意图更具体，先匹配 */
const skills: AgentSkill[] = [chapterPlanningSkill, revisionSkill, chapterWritingSkill, consistencyReviewSkill]

/** 按模式 + prompt 关键词匹配内置 Skill，最多命中 1 个 */
export function matchSkill(mode: AgentExecutionMode, prompt: string): AgentSkill | null {
  for (const skill of skills) {
    if (skill.trigger.modes.includes(mode) && skill.trigger.pattern.test(prompt)) {
      return skill
    }
  }
  return null
}
