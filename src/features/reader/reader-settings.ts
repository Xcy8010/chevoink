/** 阅读器显示设置：字号 4 档 + 背景色 4 模式 + 翻页模式 + 听书偏好，localStorage 持久化 */

export type ReaderFontScale = 'compact' | 'comfortable' | 'relaxed' | 'large'
export type ReaderTone = 'paper' | 'mist' | 'green' | 'night'
/** 手机端翻页模式：仿真翻书 / 覆盖滑动 / 上下滚动（逃生门，方案 20 §2.2） */
export type ReaderPageTurnMode = 'simulate' | 'cover' | 'scroll'

export type FontScaleOption = {
  id: ReaderFontScale
  label: string
  fontSize: number
  lineHeight: number
}

/** 字号与行距绑定档位（方案 20 §2.5：整体上调让默认阅读更轻松，id 不变老用户不跳档） */
export const fontScaleOptions: FontScaleOption[] = [
  { id: 'compact', label: '紧凑', fontSize: 17, lineHeight: 1.8 },
  { id: 'comfortable', label: '舒适', fontSize: 19, lineHeight: 1.9 },
  { id: 'relaxed', label: '宽松', fontSize: 21, lineHeight: 2 },
  { id: 'large', label: '特大', fontSize: 23, lineHeight: 2 },
]

export type PageTurnModeOption = {
  id: ReaderPageTurnMode
  label: string
  description: string
}

/** 翻页模式档位（仅手机端分页阅读使用） */
export const pageTurnModeOptions: PageTurnModeOption[] = [
  { id: 'simulate', label: '仿真', description: '真实翻书效果' },
  { id: 'cover', label: '覆盖', description: '新页滑入覆盖' },
  { id: 'scroll', label: '上下滑动', description: '传统滚动阅读' },
]

export type ToneOption = {
  id: ReaderTone
  label: string
  background: string
  text: string
  /** 章节标题等强调元素的颜色：跟随底色而非全局主题（全局深色 + 浅色底时 --color-brand 会翻成浅蓝，看不清） */
  accent: string
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
    accent: '#28435f',
    swatch: '#f8f4eb',
  },
  {
    id: 'mist',
    label: '浅灰',
    background: 'var(--reader-bg-mist)',
    text: 'var(--reader-text-mist)',
    accent: '#28435f',
    swatch: '#f5f5f5',
  },
  {
    id: 'green',
    label: '护眼',
    background: 'var(--reader-bg-green)',
    text: 'var(--reader-text-green)',
    accent: '#2c5241',
    swatch: '#e8f0e8',
  },
  {
    id: 'night',
    label: '夜读',
    background: 'var(--reader-bg-night)',
    text: 'var(--reader-text-night)',
    accent: '#c9d6e6',
    swatch: '#111318',
  },
]

const STORAGE_KEY = 'chevoink-reader-settings'

/** 听书语速档位（前端 playbackRate 变速，不参与合成，见方案 17-2.2） */
export const ttsRateOptions = [0.75, 1, 1.25, 1.5, 2, 3] as const

type PersistedSettings = {
  fontScale?: ReaderFontScale
  tone?: ReaderTone
  /** 手机端翻页模式，默认仿真翻书 */
  pageTurnMode?: ReaderPageTurnMode
  /** 选择底色时的全局主题模式：显式选择只在同主题下生效，切主题后回到跟随默认 */
  toneTheme?: 'light' | 'dark'
  /** 听书音色 id，空串 = 跟随服务端默认音色 */
  ttsVoice?: string
  ttsRate?: number
  ttsAutoNext?: boolean
}

const FALLBACK: LoadedReaderSettings = {
  fontScale: 'comfortable',
  tone: null,
  toneTheme: null,
  pageTurnMode: 'simulate',
  ttsVoice: '',
  ttsRate: 1,
  ttsAutoNext: true,
}

/** 读取后的设置：tone 为 null 表示用户未显式选择底色，默认跟随全局主题 */
export type LoadedReaderSettings = Omit<Required<PersistedSettings>, 'tone' | 'toneTheme'> & {
  tone: ReaderTone | null
  toneTheme: 'light' | 'dark' | null
}

/** 默认底色跟随全局主题：深色→夜读，浅色→纸感 */
export function getThemeDefaultTone(isDark?: boolean): ReaderTone {
  const dark =
    isDark ??
    (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  return dark ? 'night' : 'paper'
}

export function loadReaderSettings(): LoadedReaderSettings {
  if (typeof window === 'undefined') return FALLBACK
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return FALLBACK
    const parsed = JSON.parse(raw) as PersistedSettings
    // 旧版本存的 tone 没有 toneTheme，视为未显式选择，回到跟随主题
    const toneTheme = parsed.toneTheme === 'light' || parsed.toneTheme === 'dark' ? parsed.toneTheme : null
    const tone =
      toneTheme !== null && toneOptions.some((option) => option.id === parsed.tone)
        ? (parsed.tone as ReaderTone)
        : null
    return {
      fontScale: fontScaleOptions.some((option) => option.id === parsed.fontScale)
        ? (parsed.fontScale as ReaderFontScale)
        : FALLBACK.fontScale,
      tone,
      toneTheme: tone === null ? null : toneTheme,
      pageTurnMode: pageTurnModeOptions.some((option) => option.id === parsed.pageTurnMode)
        ? (parsed.pageTurnMode as ReaderPageTurnMode)
        : FALLBACK.pageTurnMode,
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
