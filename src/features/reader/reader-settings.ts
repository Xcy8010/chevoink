/** 阅读器显示设置：字号 4 档 + 背景色 4 模式 + 听书偏好，localStorage 持久化 */

export type ReaderFontScale = 'compact' | 'comfortable' | 'relaxed' | 'large'
export type ReaderTone = 'paper' | 'mist' | 'green' | 'night'

export type FontScaleOption = {
  id: ReaderFontScale
  label: string
  fontSize: number
  lineHeight: number
}

/** 字号与行距绑定档位（方案 5.3.4） */
export const fontScaleOptions: FontScaleOption[] = [
  { id: 'compact', label: '紧凑', fontSize: 16, lineHeight: 1.9 },
  { id: 'comfortable', label: '舒适', fontSize: 17, lineHeight: 2.1 },
  { id: 'relaxed', label: '宽松', fontSize: 18, lineHeight: 2.3 },
  { id: 'large', label: '特大', fontSize: 20, lineHeight: 2.5 },
]

export type ToneOption = {
  id: ReaderTone
  label: string
  background: string
  text: string
  /** 设置面板中的色板预览色 */
  swatch: string
}

/** 背景色体系（方案 5.3.3），统一使用设计令牌 */
export const toneOptions: ToneOption[] = [
  {
    id: 'paper',
    label: '纸感',
    background: 'var(--reader-bg-paper)',
    text: 'var(--reader-text-paper)',
    swatch: '#f8f4eb',
  },
  {
    id: 'mist',
    label: '浅灰',
    background: 'var(--reader-bg-mist)',
    text: 'var(--reader-text-mist)',
    swatch: '#f5f5f5',
  },
  {
    id: 'green',
    label: '护眼',
    background: 'var(--reader-bg-green)',
    text: 'var(--reader-text-green)',
    swatch: '#e8f0e8',
  },
  {
    id: 'night',
    label: '夜读',
    background: 'var(--reader-bg-night)',
    text: 'var(--reader-text-night)',
    swatch: '#111318',
  },
]

const STORAGE_KEY = 'chevoink-reader-settings'

/** 听书语速档位（前端 playbackRate 变速，不参与合成，见方案 17-2.2） */
export const ttsRateOptions = [0.75, 1, 1.25, 1.5, 2, 3] as const

type PersistedSettings = {
  fontScale?: ReaderFontScale
  tone?: ReaderTone
  /** 听书音色 id，空串 = 跟随服务端默认音色 */
  ttsVoice?: string
  ttsRate?: number
  ttsAutoNext?: boolean
}

const FALLBACK: Required<PersistedSettings> = {
  fontScale: 'comfortable',
  tone: 'paper',
  ttsVoice: '',
  ttsRate: 1,
  ttsAutoNext: true,
}

export function loadReaderSettings(): Required<PersistedSettings> {
  if (typeof window === 'undefined') return FALLBACK
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return FALLBACK
    const parsed = JSON.parse(raw) as PersistedSettings
    return {
      fontScale: fontScaleOptions.some((option) => option.id === parsed.fontScale)
        ? (parsed.fontScale as ReaderFontScale)
        : FALLBACK.fontScale,
      tone: toneOptions.some((option) => option.id === parsed.tone)
        ? (parsed.tone as ReaderTone)
        : FALLBACK.tone,
      ttsVoice: typeof parsed.ttsVoice === 'string' ? parsed.ttsVoice : FALLBACK.ttsVoice,
      ttsRate: ttsRateOptions.some((option) => option === parsed.ttsRate)
        ? (parsed.ttsRate as number)
        : FALLBACK.ttsRate,
      ttsAutoNext: typeof parsed.ttsAutoNext === 'boolean' ? parsed.ttsAutoNext : FALLBACK.ttsAutoNext,
    }
  } catch {
    return FALLBACK
  }
}

export function saveReaderSettings(settings: PersistedSettings) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const current = raw ? (JSON.parse(raw) as PersistedSettings) : {}
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...settings }))
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function getFontScaleOption(id: ReaderFontScale): FontScaleOption {
  return fontScaleOptions.find((option) => option.id === id) ?? fontScaleOptions[1]
}

export function getToneOption(id: ReaderTone): ToneOption {
  return toneOptions.find((option) => option.id === id) ?? toneOptions[0]
}
