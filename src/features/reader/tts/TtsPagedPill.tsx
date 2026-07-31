import { Loader2, Pause, Play, X } from 'lucide-react'

import type { ToneOption } from '../reader-settings'
import type { TtsPlayer } from './useTtsPlayer'

type TtsPagedPillProps = {
  tts: TtsPlayer
  tone: ToneOption
  /** 点击中间信息区展开完整播放器（换音色/语速/定时/上下段） */
  onExpand: () => void
}

/**
 * 分页阅读的听书胶囊（番茄同款做法）：
 * 全宽吸底条会压住正文最后一行（分页只给底部留了 PAGE_INSET.bottom 的窄条），
 * 所以这里由 ReaderPageChrome 放进底部信息行，与左侧页码、右侧时间同一行 flex 排布：
 * 胶囊撑满中间空隙（不留突兀的空档），宽度由剩余空间决定而不是文案长度，
 * 因此文案再长也只会在胶囊内截断，绝不会挤到时间/电量上去。
 */
export default function TtsPagedPill({ tts, tone, onExpand }: TtsPagedPillProps) {
  if (!tts.isActive) return null

  const label = (() => {
    if (tts.status === 'loading') return '合成中…'
    if (tts.status === 'error') return tts.errorMessage ?? '听书暂时不可用'
    if (tts.status === 'ended') return '已播完最新章节'
    const voice = tts.voiceLabel.split(' · ')[0]
    const base = tts.status === 'paused' ? `已暂停 · ${voice}` : `${voice} · ${tts.rate}x`
    if (tts.timerRemainingMinutes) return `${base} · ${tts.timerRemainingMinutes} 分`
    if (tts.timerOption === 'chapter') return `${base} · 本章后停`
    return base
  })()

  const divider = (
    <span className="h-3.5 w-px shrink-0" style={{ background: 'currentColor', opacity: 0.18 }} />
  )

  return (
    <div
      role="region"
      aria-label="听书播放器"
      className="flex h-8 w-full items-center rounded-[var(--radius-pill)] border px-0.5 backdrop-blur-md"
      style={{
        background: `color-mix(in srgb, ${tone.swatch} 92%, transparent)`,
        borderColor: 'color-mix(in srgb, currentColor 14%, transparent)',
        boxShadow: '0 6px 18px rgba(15, 23, 42, 0.14)',
        color: tone.text,
      }}
    >
      <button
        type="button"
        aria-label={tts.status === 'playing' ? '暂停' : '继续播放'}
        onClick={() => tts.toggle()}
        className="press-feedback inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-[var(--radius-pill)]"
      >
        {tts.status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : tts.status === 'playing' ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </button>

      {divider}

      {/* 中间信息区吃掉全部剩余宽度：胶囊长度只由布局决定，文案变长只在这里截断 */}
      <button
        type="button"
        aria-label="展开听书播放器"
        onClick={onExpand}
        className="press-feedback inline-flex h-7 min-w-0 flex-1 items-center justify-center rounded-[var(--radius-pill)] px-1.5"
      >
        <span className="truncate text-[12px] leading-none" style={{ opacity: 0.72 }}>
          {label}
        </span>
      </button>

      {divider}

      <button
        type="button"
        aria-label="退出听书"
        onClick={() => tts.stop()}
        className="press-feedback inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-[var(--radius-pill)]"
      >
        <X className="h-4 w-4" style={{ opacity: 0.72 }} />
      </button>
    </div>
  )
}
