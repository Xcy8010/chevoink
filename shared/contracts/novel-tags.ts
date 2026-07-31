/** 全站统一的作品标签体系：作品设置选择、首页频道、发现页筛选、Agent 设标签共用同一套数据 */

export type NovelTagGroup = {
  label: string
  tags: string[]
}

export const NOVEL_TAG_GROUPS: NovelTagGroup[] = [
  {
    label: '男频分类',
    tags: ['玄幻', '奇幻', '武侠', '仙侠', '都市', '现实', '历史', '军事', '游戏', '竞技', '科幻', '悬疑', '轻小说'],
  },
  {
    label: '女频分类',
    tags: ['古代言情', '现代言情', '幻想言情', '浪漫青春', '悬疑灵异', '婚恋家庭'],
  },
  {
    label: '题材设定',
    tags: [
      '系统',
      '重生',
      '穿越',
      '末世',
      '无限流',
      '星际',
      '机甲',
      '修真',
      '洪荒',
      '西幻',
      '高武',
      '废土',
      '赛博朋克',
      '蒸汽朋克',
      '克苏鲁',
      '规则怪谈',
      '副本',
      '御兽',
      '领主',
      '争霸',
      '权谋',
      '谍战',
      '推理',
      '犯罪',
      '盗墓',
      '鉴宝',
      '灵异',
      '国术',
      '异能',
      '丧尸',
      '种田',
      '经商',
      '职场',
      '校园',
      '娱乐圈',
      '电竞',
      '直播',
      '美食',
      '医术',
      '宫斗',
      '宅斗',
      '家长里短',
      '太空歌剧',
    ],
  },
  {
    label: '风格基调',
    tags: [
      '热血',
      '爽文',
      '轻松',
      '搞笑',
      '沙雕',
      '脑洞',
      '群像',
      '单女主',
      '无女主',
      '甜宠',
      '虐心',
      '治愈',
      '黑暗',
      '正剧',
      '慢热',
      '日常',
      '高智商',
      '无敌流',
      '扮猪吃虎',
      '杀伐果断',
    ],
  },
]

/** 全量标签平铺（去重），供搜索匹配与合法性校验 */
export const ALL_NOVEL_TAGS: string[] = [...new Set(NOVEL_TAG_GROUPS.flatMap((group) => group.tags))]

/** 首页 / 发现页频道导航：覆盖男女频全部主分类 */
export const PRIMARY_CATEGORIES: string[] = [...NOVEL_TAG_GROUPS[0].tags, ...NOVEL_TAG_GROUPS[1].tags]

/** 单部作品最多可选标签数 */
export const MAX_NOVEL_TAGS = 6

/** 与后端一致的标签文本解析规则（"、 / 空格"分隔） */
export function parseTagsText(tagsText: string): string[] {
  return [...new Set(tagsText.split(/[、/\s]+/).map((item) => item.trim()).filter(Boolean))]
}

export function joinTags(tags: string[]): string {
  return tags.join(' / ')
}
