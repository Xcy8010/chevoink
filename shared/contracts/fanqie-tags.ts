/**
 * 番茄小说发布建议专用标签词表（一键导出「发布建议」与 AI 设标签共用）。
 * 主分类/主题/角色来自番茄作者端「作品标签」弹窗截图，情节来自产品口径清单；
 * AI 只能从这些词表里选，禁止自创标签。
 */

export const FANQIE_CHANNELS = ['男频', '女频'] as const

export type FanqieChannel = (typeof FANQIE_CHANNELS)[number]

/** 主分类（必选且只能选一个）：男频清单来自番茄截图 */
export const FANQIE_MALE_CATEGORIES = [
  '西方奇幻',
  '东方仙侠',
  '科幻末世',
  '男频衍生',
  '都市高武',
  '悬疑灵异',
  '悬疑脑洞',
  '抗战谍战',
  '历史古代',
  '历史脑洞',
  '都市种田',
  '都市脑洞',
  '都市日常',
  '玄幻脑洞',
  '战神赘婿',
  '动漫衍生',
  '游戏体育',
  '传统玄幻',
  '都市修真',
] as const

/** 女频主分类：复用本站女频分类（番茄截图未提供女频清单，不自创） */
export const FANQIE_FEMALE_CATEGORIES = [
  '古代言情',
  '现代言情',
  '幻想言情',
  '浪漫青春',
  '悬疑灵异',
  '婚恋家庭',
] as const

export const FANQIE_ALL_CATEGORIES: string[] = [...FANQIE_MALE_CATEGORIES, ...FANQIE_FEMALE_CATEGORIES]

/** 主题（最多两个） */
export const FANQIE_THEME_TAGS = [
  '衍生',
  '仕途',
  '综影视',
  '天文',
  '第一人称',
  '赛博朋克',
  '第四天灾',
  '规则怪谈',
  '搞笑轻松',
  '古代',
  '悬疑',
  '克苏鲁',
  '都市异能',
  '末日求生',
  '灵气复苏',
  '高武世界',
  '异世大陆',
  '东方玄幻',
  '谍战',
  '清朝',
  '宋朝',
  '断层',
  '武将',
  '国运',
  '综漫',
  '开局',
  '架空',
  '奇幻仙侠',
  '都市',
  '玄幻',
  '历史',
  '体育',
  '武侠',
] as const

/** 角色（最多两个） */
export const FANQIE_ROLE_TAGS = [
  '多女主',
  '赘婿',
  '全能',
  '大佬',
  '大小姐',
  '特工',
  '游戏主播',
  '神探',
  '贵族',
  '皇帝',
  '单女主',
  '校花',
  '无女主',
  '女帝',
  '特种兵',
  '反派',
  '神医',
  '奶爸',
  '学霸',
  '天才',
  '腹黑',
  '扮猪吃虎',
] as const

/** 情节（最多两个） */
export const FANQIE_PLOT_TAGS = [
  '都市江湖',
  '风水秘术',
  '斩神衍生',
  '十日衍生',
  '西游衍生',
  '公版衍生',
  '红楼衍生',
  '甄嬛衍生',
  '如懿衍生',
  '惊悚游戏',
  '卡牌',
  '山海经',
  '捉鬼',
  '剑修',
  '废土',
  '副本',
  '黑科技',
  '无脑爽',
  '魂穿',
  '高手下山',
  '黑化',
  '迪化',
  '发家致富',
  '无后宫',
  '争霸',
  '1v1',
  '升级流',
  '灵魂互换',
  '科举',
  '封神',
  '四合院',
  '电竞',
  '双重生',
  '乡村',
  '同人',
  '打脸',
  '破案',
  '囤物资',
  '钓鱼',
  '网游',
  '奥特同人',
  '求生',
  '无敌',
  '九叔',
  '穿书',
  '聊天群',
  '大秦',
  '龙珠',
  '漫威',
  '神奇宝贝',
  '海贼',
  '火影',
  '职场',
  '明朝',
  '家庭',
  '三国',
  '末世',
  '直播',
  '无限流',
  '诸天万界',
  '大唐',
  '宠物',
  '外卖',
  '星际',
  '美食',
  '剑道',
  '盗墓',
  '灵异',
  '鉴宝',
  '系统',
  '神豪',
  '重生',
  '穿越',
  '二次元',
  '海岛',
  '娱乐圈',
  '空间',
  '推理',
  '洪荒',
] as const

/** AI 生成的番茄发布建议（字段均已按词表 sanitize） */
export type PublishAdvice = {
  channel: FanqieChannel
  mainCategory: string
  themeTags: string[]
  roleTags: string[]
  plotTags: string[]
  protagonists: string[]
  advice: string
}

function pickFromVocabulary(raw: unknown, vocabulary: readonly string[], max: number): string[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const seen = new Set<string>()
  const picked: string[] = []

  for (const item of raw) {
    if (picked.length >= max) {
      break
    }

    const text = typeof item === 'string' ? item.trim() : ''
    if (text && vocabulary.includes(text) && !seen.has(text)) {
      seen.add(text)
      picked.push(text)
    }
  }

  return picked
}

/** 把模型输出钳制到番茄词表内：非法值丢弃、数量截断，避免自创标签 */
export function sanitizePublishAdvice(raw: unknown): PublishAdvice {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}

  const channel: FanqieChannel = source.channel === '女频' ? '女频' : '男频'

  const mainCategory =
    typeof source.mainCategory === 'string' && FANQIE_ALL_CATEGORIES.includes(source.mainCategory.trim())
      ? source.mainCategory.trim()
      : ''

  const protagonists = Array.isArray(source.protagonists)
    ? source.protagonists
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 20))
        .slice(0, 2)
    : []

  return {
    channel,
    mainCategory,
    themeTags: pickFromVocabulary(source.themeTags, FANQIE_THEME_TAGS, 2),
    roleTags: pickFromVocabulary(source.roleTags, FANQIE_ROLE_TAGS, 2),
    plotTags: pickFromVocabulary(source.plotTags, FANQIE_PLOT_TAGS, 2),
    protagonists,
    advice: typeof source.advice === 'string' ? source.advice.trim().slice(0, 800) : '',
  }
}
