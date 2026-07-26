/**
 * 全站统一的作品标签体系：真相源已下沉到 shared/contracts/novel-tags.ts，
 * 前端（作品设置、首页频道、发现页筛选）与后端（Agent 设标签校验）共用同一份数据。
 */
export {
  NOVEL_TAG_GROUPS,
  ALL_NOVEL_TAGS,
  PRIMARY_CATEGORIES,
  MAX_NOVEL_TAGS,
  parseTagsText,
  joinTags,
} from '../../shared/contracts/novel-tags.js'
export type { NovelTagGroup } from '../../shared/contracts/novel-tags.js'
