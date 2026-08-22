/** 话题 # 引用解析（方案 18 §3）：前后端共享同一套规则，最终以服务端解析结果为准。
 * 语法：#话题名，话题名允许 文字/数字/下划线，1-9 字，遇空格或标点即结束。 */

/** 单帖最多引用/创建的话题数 */
export const MAX_TOPICS_PER_POST = 5

/** 话题名合法字符：任意语言文字/数字/下划线，1-9 字；
 * 尾部断言保证超过 9 字的连续串不会被截前 9 字误判成话题（超长即非法） */
const TOPIC_HASHTAG_SOURCE = '#([\\p{L}\\p{N}_]{1,9})(?![\\p{L}\\p{N}_])'

/** 每次调用返回新实例，避免全局 regex 的 lastIndex 状态互相污染 */
export function createTopicHashtagRegex(): RegExp {
  return new RegExp(TOPIC_HASHTAG_SOURCE, 'gu')
}

/** 从正文提取话题名：去重、保持出现顺序、上限 MAX_TOPICS_PER_POST */
export function extractTopicNames(content: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  for (const match of content.matchAll(createTopicHashtagRegex())) {
    const name = match[1]
    if (seen.has(name)) {
      continue
    }
    seen.add(name)
    names.push(name)
    if (names.length >= MAX_TOPICS_PER_POST) {
      break
    }
  }

  return names
}

/** 正文分段结果：text 原样渲染，topic 渲染为可点击的话题链接 */
export type TopicTextSegment =
  | { type: 'text'; text: string }
  | { type: 'topic'; text: string; name: string }

/** 把正文拆成 文本/话题 两类片段，供前端把 #话题 渲染成品牌色链接 */
export function splitContentByTopics(content: string): TopicTextSegment[] {
  const segments: TopicTextSegment[] = []
  let cursor = 0

  for (const match of content.matchAll(createTopicHashtagRegex())) {
    const index = match.index ?? 0
    if (index > cursor) {
      segments.push({ type: 'text', text: content.slice(cursor, index) })
    }
    segments.push({ type: 'topic', text: match[0], name: match[1] })
    cursor = index + match[0].length
  }

  if (cursor < content.length) {
    segments.push({ type: 'text', text: content.slice(cursor) })
  }

  return segments
}
