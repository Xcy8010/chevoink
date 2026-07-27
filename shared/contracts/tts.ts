/**
 * 听书（TTS）契约：类型 + 切批纯函数。
 * 切批函数是前后端唯一实现：前端用它决定播放批次与段落高亮区间，
 * 后端用它从章节正文取出同一批文本做合成，保证双端批次边界一致。
 */

export type TtsVoice = {
  /** 微软神经音色 id，如 zh-CN-XiaoxiaoNeural */
  id: string
  label: string
  gender: 'female' | 'male'
  recommended?: boolean
}

export type TtsVoicesPayload = {
  /** TTS provider 未配置或被禁用时为 false，前端据此隐藏听书入口 */
  available: boolean
  defaultVoiceId: string
  voices: TtsVoice[]
}

export type TtsSynthesizeRequest = {
  novelId: string
  chapterId: string
  /** 第几批（0 起），越界返回 400 */
  batchIndex: number
  /** 必须在服务端白名单内 */
  voiceId: string
}

export type TtsBatch = {
  index: number
  /** 覆盖的段落下标（含） */
  paragraphStart: number
  paragraphEnd: number
  charCount: number
  /** 该批合成文本（段落以换行拼接） */
  text: string
}

/** 与阅读器正文渲染同一份段落切分规则（splitReaderParagraphs 委托本函数） */
export function splitTtsParagraphs(content: string | null | undefined): string[] {
  const normalized = content?.trim()

  return normalized
    ? normalized
        .split('\n\n')
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : []
}

/** 单批上限：累计 ≥600 字或 ≥6 段就切一批（600 字 ≈ 30s 音频，首批快出声） */
const TTS_BATCH_MAX_CHARS = 600
const TTS_BATCH_MAX_PARAGRAPHS = 6

export function splitTtsBatches(paragraphs: string[]): TtsBatch[] {
  const batches: TtsBatch[] = []
  let start = 0
  let chars = 0
  let texts: string[] = []

  const flush = (end: number) => {
    if (texts.length === 0) return
    batches.push({
      index: batches.length,
      paragraphStart: start,
      paragraphEnd: end,
      charCount: chars,
      text: texts.join('\n'),
    })
    start = end + 1
    chars = 0
    texts = []
  }

  paragraphs.forEach((paragraph, index) => {
    texts.push(paragraph)
    chars += paragraph.length

    if (chars >= TTS_BATCH_MAX_CHARS || texts.length >= TTS_BATCH_MAX_PARAGRAPHS) {
      flush(index)
    }
  })

  flush(paragraphs.length - 1)

  return batches
}
