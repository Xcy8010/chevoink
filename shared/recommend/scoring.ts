/**
 * 推荐评分统一纯函数模块（推荐算法优化方案 Phase 0）：
 * 服务端（首页榜单/相关推荐）与客户端（发现页/周力荐/日精选）共用本文件同一实现，
 * 消除双端重复实现带来的权重漂移；所有函数保持纯函数，便于版本化与单测复现。
 * 权重、过滤规则或特征变化时必须递增 RECOMMEND_ALGORITHM_VERSIONS 对应版本。
 */

/** 评分所需最小信号集：NovelCard 与服务端 prisma 记录在结构上均满足 */
export type NovelScoreSignals = {
  viewCount?: number | null
  likeCount?: number | null
  commentCount?: number | null
  favoriteCount?: number | null
  chapterCount: number
  wordCount: number
  lastPublishedAt?: string | Date | null
  updatedAt: string | Date
}

/** 算法版本号：用于曝光归因、结果解释与实验对照 */
export const RECOMMEND_ALGORITHM_VERSIONS = {
  /** 首页聚合（候选池 + 全局榜单） */
  home: 'novel-home-v2',
  /** 相关推荐 */
  related: 'related-v2',
  /** 服务端个性化为你推荐 */
  forYou: 'for-you-v1',
  /** 本周力荐 */
  weeklyPicks: 'weekly-picks-v1',
  /** 每日精选 */
  dailyPicks: 'daily-picks-v1',
} as const

export const DAY_MS = 86_400_000
export const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000

function toMillis(value: string | Date | null | undefined): number {
  if (value == null) return 0
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

/** 热度分：互动加权（阅读1/点赞3/评论4/收藏5）+ 内容规模基础分，除以时间衰减（gravity 榜单口径） */
export function hotScore(novel: NovelScoreSignals, now: number = Date.now()): number {
  const engagement =
    (novel.viewCount ?? 0) + (novel.likeCount ?? 0) * 3 + (novel.commentCount ?? 0) * 4 + (novel.favoriteCount ?? 0) * 5
  const substance = Math.min(novel.chapterCount, 50) * 2 + Math.min(novel.wordCount / 10000, 30)
  const lastActive = toMillis(novel.lastPublishedAt ?? novel.updatedAt)
  const ageDays = Math.max(0, (now - lastActive) / DAY_MS)
  return (engagement + substance) / Math.pow(ageDays + 2, 1.4)
}

/** 累计口碑分（完结榜等）：不做时间衰减 */
export function totalScore(novel: NovelScoreSignals): number {
  return (
    (novel.viewCount ?? 0) +
    (novel.likeCount ?? 0) * 3 +
    (novel.commentCount ?? 0) * 4 +
    (novel.favoriteCount ?? 0) * 5 +
    novel.wordCount / 10000
  )
}

/** 当前所处的 UTC+8 自然周编号（周一为一周起点），跨周自动变化即实现“每周重置” */
export function getWeekKey(now: Date = new Date()): string {
  const shifted = now.getTime() + UTC8_OFFSET_MS
  const days = Math.floor(shifted / DAY_MS)
  // 1970-01-01 是周四，+3 让周一对齐到周期起点
  const weekIndex = Math.floor((days + 3) / 7)
  return `week-${weekIndex}`
}

/** 当前所处的 UTC+8 自然日编号，跨天自动变化即实现“每日重置” */
export function getDayKey(now: Date = new Date()): string {
  const dayIndex = Math.floor((now.getTime() + UTC8_OFFSET_MS) / DAY_MS)
  return `day-${dayIndex}`
}

/** 确定性字符串哈希（FNV-1a），用于给“作品 × 周期”生成稳定的轮换扰动 */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x1000193)
  }
  return hash >>> 0
}

/** 更新活跃度：越近更新得分越高，两周外快速衰减 */
export function updateRecencyScore(novel: NovelScoreSignals, now: number): number {
  const lastPublished = novel.lastPublishedAt ?? novel.updatedAt
  const elapsedDays = Math.max(0, (now - toMillis(lastPublished)) / DAY_MS)
  if (elapsedDays <= 1) return 40
  if (elapsedDays <= 3) return 32
  if (elapsedDays <= 7) return 24
  if (elapsedDays <= 14) return 14
  return Math.max(0, 8 - elapsedDays / 10)
}

/** 篇幅得分：有一定体量的作品更值得力推，10 万字后收益封顶 */
export function lengthScore(novel: NovelScoreSignals): number {
  const words = Math.max(0, novel.wordCount)
  const chapters = Math.max(0, novel.chapterCount)
  return Math.min(20, words / 5000) * 0.7 + Math.min(10, chapters) * 0.3
}

/** 周力荐/日精选共用基础分：对数加权热度 + 更新活跃度 + 篇幅 */
export function picksBaseScore(novel: NovelScoreSignals, now: number): number {
  return (
    Math.log1p(novel.viewCount ?? 0) * 12 +
    Math.log1p(novel.commentCount ?? 0) * 10 +
    Math.log1p(novel.likeCount ?? 0) * 7 +
    Math.log1p(novel.favoriteCount ?? 0) * 8 +
    updateRecencyScore(novel, now) +
    lengthScore(novel)
  )
}

/** 本周力荐分：基础分 + 周扰动（同一周内固定，跨周轮换露出） */
export function weeklyScore(novel: NovelScoreSignals & { id: string }, weekKey: string, now: number): number {
  const jitter = (hashSeed(`${weekKey}:${novel.id}`) % 1000) / 1000
  return picksBaseScore(novel, now) + jitter * 12
}

/** 每日精选分：基础分 + 日扰动（同一天内固定，跨天轮换露出） */
export function dailyScore(novel: NovelScoreSignals & { id: string }, dayKey: string, now: number): number {
  const jitter = (hashSeed(`${dayKey}:${novel.id}`) % 1000) / 1000
  return picksBaseScore(novel, now) + jitter * 10
}
