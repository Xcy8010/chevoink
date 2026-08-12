import type { AgentExecutionMode } from '../../../../shared/contracts/index.js'

/**
 * 内置 Skill 体系（plan/14 §七）：触发条件 + 流程模板 + 输出检查清单。
 * 本质是针对特定任务型态的增强提示词包，assembleContext 组装时判定命中，
 * 命中则作为独立 system 段注入；每次最多命中 1 个（按数组顺序即优先级）。
 * 方法论参考：worldwonderer/oh-story-claudecode、modoojunko/awesome-novel-agent、novel-writer-cn
 * （均为方法论重写，未复制原文）。
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

const deAiFlavorSkill: AgentSkill = {
  name: '去AI味润稿',
  trigger: {
    modes: ['build'],
    pattern: /(去\s*AI\s*味|AI\s*味|机械感|僵硬|不自然|像\s*AI\s*写).{0,20}(章|段|文|改|润)?|(润色|改写|修改).{0,12}(去\s*AI\s*味|AI\s*味)/i,
  },
  prompt: `本次任务命中「去AI味润稿」工作流，严格按以下步骤执行：
1. 读原文：chapter_read 读取目标范围，明确原剧情与文风。
2. 按清单逐类排查：① 套话与空洞情绪词（「眼中闪过一丝」「不由得」「仿佛…一般」）；② 排比抒情的模板化；③ 副词堆叠（「缓缓地」「默默地」「坚定地」）；④ 句式等长无呼吸；⑤ 段末总结升华式收尾；⑥ 对话替读者解说剧情。
3. 改写：chapter_edit_range 逐段就地修改，删除优先于替换，空洞情绪换成具体动作与物件，长短句交替，保留原剧情、视角与人物声口。
4. 收尾：一句话汇报改动范围与处理的主要 AI 味类型。
自查清单：剧情信息是否完整保留？每处问题是否真实改掉而非只指出？是否只改目标范围而未全文重写？`,
}

const characterDesignSkill: AgentSkill = {
  name: '角色设计',
  trigger: {
    modes: ['plan'],
    pattern: /(设计|创建|新建|完善|补全).{0,12}(角色|人物|主角|反派|配角|人物卡|角色卡)|(角色|人物|主角|反派).{0,12}(设计|卡|设定|弧线)/,
  },
  prompt: `本次任务命中「角色设计」工作流，严格按以下步骤执行：
1. 对齐：若角色的剧情定位（主角/反派/配角）与基本基调不明，把所有不确定点合并成一次 ask_user（最多 1 次）；作者已说明则跳过。
2. 五维产出：① 核心欲望与核心恐惧；② 缺陷与短板（成长空间来源）；③ 独特标识（说话方式、口头禅、习惯动作）；④ 角色弧线：起始状态→经历的变化→结束状态；⑤ 与既有人物的冲突与羁绊。
3. 沉淀：memory_save 存入角色卡（含角色名，便于后续检索）。
4. 收尾：一句话说明角色名与核心矛盾。
自查清单：五维是否齐全？动机是否与既有世界观自洽？是否已 memory_save 沉淀？`,
}

const worldbuildingSkill: AgentSkill = {
  name: '世界观构建',
  trigger: {
    modes: ['plan'],
    pattern: /(构建|搭建|设计|完善).{0,12}(世界观|世界设定|力量体系|魔法体系|科技设定|势力)|(世界观|力量体系|魔法体系).{0,12}(构建|搭建|设定)/,
  },
  prompt: `本次任务命中「世界观构建」工作流，严格按以下步骤执行：
1. 前置：先 memory_search 查既有世界观设定；有则在既有设定上延展修订，不要另起炉灶。
2. 三层结构：① 物理世界（地理、重要地点）；② 社会体系（势力、规则、经济文化秩序）；③ 特殊系统（力量/魔法/科技规则及其代价与限制）。每层只构建故事需要的，其余留白。
3. 铁律：规则内部自洽——设定一旦写出即成铁律，禁止为剧情方便临时扩充（「其实它还能…」）；力量体系必须同时定义边界、代价与限制。
4. 沉淀与收尾：memory_save 存入设定；一句话收尾说明体系核心规则与首要代价。
自查清单：每条规则是否有代价/限制？是否与既有设定矛盾？是否已沉淀？`,
}

const openingPlanningSkill: AgentSkill = {
  name: '新书开篇规划',
  trigger: {
    modes: ['plan'],
    pattern: /(新书|开书|新作|整书|全书).{0,12}(大纲|规划|框架|开篇)|(三幕|整体大纲).{0,12}(结构|规划)/,
  },
  prompt: `本次任务命中「新书开篇规划」工作流，严格按以下步骤执行：
1. 前置：memory_search 确认是否已有整书大纲；有则本次是修订（plan_save 时带 planId 就地更新），禁止重复建档。
2. 三幕框架：第一幕建置（约25%：日常状态→激励事件→踏上旅程）；第二幕挑战（约50%：递进困难→中点反转→危机→决战准备）；第三幕高潮（约25%：决战→解决→新常态）。每幕写清关键事件与对应情绪。
3. 主线钩子：明确全书唯一的核心悬念（读者最想知道的答案）与开篇前三章的钩子。
4. 落盘：plan_save 写入整书计划；正文只写一句话汇报。
自查清单：三幕比例是否合理？是否存在中点反转？主线悬念是否唯一且明确？是否重复落盘同名计划？`,
}

/** 优先级从高到低：意图越具体越靠前；去AI味先于修订润色（两者都可能含「润色/改写」） */
const skills: AgentSkill[] = [
  chapterPlanningSkill,
  deAiFlavorSkill,
  revisionSkill,
  characterDesignSkill,
  worldbuildingSkill,
  openingPlanningSkill,
  chapterWritingSkill,
  consistencyReviewSkill,
]

/** 按模式 + prompt 关键词匹配内置 Skill，最多命中 1 个 */
export function matchSkill(mode: AgentExecutionMode, prompt: string): AgentSkill | null {
  for (const skill of skills) {
    if (skill.trigger.modes.includes(mode) && skill.trigger.pattern.test(prompt)) {
      return skill
    }
  }
  return null
}
