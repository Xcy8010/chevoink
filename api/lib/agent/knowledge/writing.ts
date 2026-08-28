/**
 * 写作文笔知识集（plan/14 §六 D2）：怎么写得好，分通用规范卡与题材文风卡。
 * 首批为静态卡片（人工撰写），按 importance 取 top 注入；后续可迁移到数据库表并加检索工具。
 */

export type WritingKnowledgeCard = {
  /** 主题：开篇/对话/打斗/情感/悬念钩子/节奏… */
  topic: string
  /** 守则内容（≤400 字） */
  content: string
  /** 注入优先级，越大越优先 */
  importance: number
}

/** 通用文笔规范卡（题材无关）：常驻注入 top3 */
export const GENERAL_WRITING_CARDS: WritingKnowledgeCard[] = [
  {
    topic: '展示优于陈述',
    content: '当情绪或性格缺少可信依据时，优先补一个与人物处境有关的动作、选择、对话或生活细节；直述、概括和留白本身并非错误，不要把每句「感到/觉得」机械替换成攥拳、颤抖等模板动作。',
    importance: 10,
  },
  {
    topic: '章节钩子结构',
    content: '只有当本章承担连载拉读或悬念推进任务时，才检查结尾是否保留未完成动作、信息差或情感余波；舒缓章、收束章可以自然落地。开篇应让读者尽快定位人物处境，但不规定字数，也不禁止有剧情作用的环境或回忆。',
    importance: 9,
  },
  {
    topic: 'AI 痕迹规避',
    content: '只处理原文中真实出现的机械模式：无铺垫的孤立华丽词、同构句式、解释性复述、与人物无关的修饰堆砌和连续总结。词语本身不设黑名单；结合题材、视角、语域和作者既有声音判断，删除通常优先于同义替换。',
    importance: 8,
  },
  {
    topic: '对话推动剧情',
    content: '当对话篇幅较长却没有改变信息、关系、行动或气氛时，再判断是否需要压缩。寒暄可以承担关系质感和潜台词；动作标签只在有新信息时使用，不要求每句对白都配动作。人物差异来自目的、知识边界和回避方式，而不只是口头禅。',
    importance: 8,
  },
  {
    topic: '视角一致性',
    content: '默认延续作品已经采用的视角规则。限知视角下检查人物是否无依据知道他人心理或不可见信息；全知、多视角及有意切换不应被误判，切换只需让读者能够识别。',
    importance: 8,
  },
  {
    topic: '节奏控制',
    content: '句段节奏应服务当前视角与场景压力。只有当连续同构影响阅读、或设定说明让人物行动停滞时才提示调整；不规定连续段数和说明字数，也不把短句等同紧张、长句等同抒情。',
    importance: 7,
  },
]

/** 题材文风卡：按作品 tagNames 匹配注入 top3 */
export const GENRE_WRITING_CARDS: Record<string, WritingKnowledgeCard[]> = {
  科幻: [
    {
      topic: '硬设定自洽',
      content: '科技设定一旦写出就是铁律：能力边界、代价、限制条件全书一致，新章节使用设定前先核对已有描述。禁止为剧情方便临时扩充能力（「其实它还能…」）。设定服务于两难困境而不是万能解药。',
      importance: 10,
    },
    {
      topic: '术语密度控制',
      content: '每个场景新造术语不超过 2 个，出场时用一句话在动作中带出含义，不停下来解释。已有术语复用优先于造新词。技术描写点到为止：读者需要知道「它能做什么、代价是什么」，不需要原理论文。',
      importance: 9,
    },
    {
      topic: '尺度感与陌生化',
      content: '科幻的爽点在尺度与陌生感：宇宙尺度的数字要落到人的体感上（「信号往返一次，地球上已过去三代人」）。日常物件的异化比全新造物更有冲击力。留一处「不给答案的谜」维持世界的深度。',
      importance: 8,
    },
  ],
  悬疑: [
    {
      topic: '信息释放节奏',
      content: '每章至少释放一条新线索，同时抛出一个新疑问，保持「已知在增长、谜团也在增长」。关键线索必须在揭晓前至少埋两次（读者回看能找到），但埋设时用日常细节包装，不要加聚光灯。已埋的伏笔超过全书三分之一篇幅仍未推进的，要主动推进或回收，禁止断线。',
      importance: 10,
    },
    {
      topic: '红鲱鱼与公平性',
      content: '误导（红鲱鱼）必须基于真实存在的线索让读者自己推错，而不是靠叙述者说谎。揭晓时所有伏笔要能闭环：凶手/真相的每个要素都在正文出现过。禁止最后一章空降新人物新动机。',
      importance: 9,
    },
    {
      topic: '压迫感营造',
      content: '恐惧来自「知道危险存在但不知道在哪」：写脚步声消失比写脚步声逼近更瘆人。环境细节做威胁的放大器（停摆的钟、半杯还温的水）。让主角犯合理的错，读者比主角早半步看到危险时张力最大。',
      importance: 8,
    },
  ],
  玄幻: [
    {
      topic: '力量体系规则感',
      content: '境界、功法、代价三件套定义清楚后全书恪守：越级战胜必须有提前埋设的代价或外因，禁止「怒火觉醒」式无成本爆种。每次突破都要有可感知的新能力边界，并同步更新敌我实力对比。',
      importance: 10,
    },
    {
      topic: '爽点节奏',
      content: '压抑与释放成对出现：憋屈不超过三章必须给一次兑现，兑现的爽感与前期压抑深度成正比。打脸要打在具体的人和事上，不要泛泛「众人震惊」。每个大境界安排一次质变级的爽点（身份揭晓、神通初显）。',
      importance: 9,
    },
    {
      topic: '战斗描写',
      content: '战斗写攻防逻辑而不是光效轰鸣：每一招要有意图（试探/换伤/控场），胜负手提前埋设（地形、暗伤、底牌）。三招之内必须出现转折，超过五个回合的战斗要切一次内心或旁观视角换气。',
      importance: 8,
    },
  ],
  都市: [
    {
      topic: '生活质感',
      content: '都市文的真实感来自精确的生活细节：地铁换乘、房租数字、加班餐的品牌，宁可少而准不要多而泛。人物的经济状况决定他的选择半径，消费行为要与收入自洽。',
      importance: 10,
    },
    {
      topic: '口语化对话',
      content: '对话贴近真实口语：有省略、有打断、有话里有话。职场、圈层用语要准（甲方、对齐、走流程），但密度控制在提味即可。潜台词优先：让人物说「没事」的方式暴露他有事。',
      importance: 9,
    },
  ],
  言情: [
    {
      topic: '情感递进层次',
      content: '感情线按「注意→在意→依赖→确认」四阶推进，每阶至少一个标志性事件，禁止跳档（前一章还是陌生人下一章就深情告白）。心动写生理反应与行为失常（多看了一眼、回错了消息），不写「她发现自己爱上了他」。',
      importance: 10,
    },
    {
      topic: '张力与误会',
      content: '拉扯的张力来自「彼此在意但各有不能说的理由」，理由必须成立（立场、身世、误会有实据）。误会不能靠「就是不问」硬撑超过三章，要有解开的推进感。虐点之后必须跟一个甜点回血。',
      importance: 9,
    },
  ],
}

/** 按重要性取通用卡 top N，拼成常驻注入段（≤300 字目标） */
export function buildGeneralWritingDigest(limit = 2): string {
  const cards = [...GENERAL_WRITING_CARDS].sort((a, b) => b.importance - a.importance).slice(0, limit)
  return `写作软质量信号（仅在原文有证据时使用，作品自身风格优先）：\n${cards
    .map((card) => `[${card.topic}] ${card.content}`)
    .join('\n')}`
}

/** 按作品标签匹配题材文风卡：命中多个题材时按卡片重要性混排取 top */
export function buildGenreWritingDigest(tagNames: string[], limit = 3): string | null {
  const matched: WritingKnowledgeCard[] = []
  for (const [genre, cards] of Object.entries(GENRE_WRITING_CARDS)) {
    if (tagNames.some((tag) => tag.includes(genre))) {
      matched.push(...cards)
    }
  }
  if (matched.length === 0) {
    return null
  }
  const top = matched.sort((a, b) => b.importance - a.importance).slice(0, limit)
  return `题材文风守则（按本作标签匹配）：\n${top.map((card) => `[${card.topic}] ${card.content}`).join('\n')}`
}
