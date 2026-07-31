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
    content: '用动作、对话、感官细节呈现情绪与性格，不直接下结论。写「他捏紧了杯柄，指节发白」而不是「他很愤怒」；写「她数了三遍找零」而不是「她很拮据」。每当想写「感到/觉得/非常」时停下来，换成一个可被看见的细节。',
    importance: 10,
  },
  {
    topic: '章节钩子结构',
    content: '每章结尾必须留钩子：新悬念、危机升级、认知反转或情感落差四选一。钩子要在最后 200 字内收紧，不要在高潮后再写长段收拾情绪的闲笔。开篇 300 字内要接住上一章的钩子或抛出本章张力，禁止用大段环境描写或回忆开场。',
    importance: 9,
  },
  {
    topic: '对话推动剧情',
    content: '对话必须至少承担一个功能：推进情节、暴露性格、埋设伏笔或制造冲突，纯寒暄一律删掉。避免「说道/问道」的单调标签，用动作拍（beat）代替：「你确定？」他把枪口压低了两寸。人物说话要有区分度——身份、教育、情绪决定用词与句长。',
    importance: 8,
  },
  {
    topic: '视角一致性',
    content: '单章内保持单一视角（POV），不要在同一场景里跳进多个人物的内心。视角人物感知不到的信息（别人的心理活动、看不见的动作）禁止直接写出，需要透露时改用可观察的外部表现或对话。切视角必须换场景或分章。',
    importance: 8,
  },
  {
    topic: '节奏控制',
    content: '紧张场景用短句、短段落，加快呼吸；抒情与铺垫用长句慢下来。连续三段以上同一节奏就要变速。信息密集的设定说明要拆碎揉进动作与对话里，单次说明不超过 150 字，禁止整段「设定倾泻」。',
    importance: 7,
  },
  {
    topic: '避免形容词堆砌',
    content: '一个名词最多带一个修饰语，砍掉「美丽动人」「冰冷刺骨的寒意」这类叠床架屋。优先选精确的动词而不是华丽的形容词：「他攥着信」胜过「他紧紧地拿着那封重要的信」。副词（地/得）出现即检查：多数可删。',
    importance: 6,
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
      content: '每章至少释放一条新线索，同时抛出一个新疑问，保持「已知在增长、谜团也在增长」。关键线索必须在揭晓前至少埋两次（读者回看能找到），但埋设时用日常细节包装，不要加聚光灯。',
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
export function buildGeneralWritingDigest(limit = 3): string {
  const cards = [...GENERAL_WRITING_CARDS].sort((a, b) => b.importance - a.importance).slice(0, limit)
  return `写作规范（平台通用守则，作品自身的风格规则优先于本节）：\n${cards
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
