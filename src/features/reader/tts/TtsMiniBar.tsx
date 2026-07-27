import { Loader2, Pause, Play, SkipBack, SkipForward, Timer, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ToneOption } from '../reader-settings'
import type { TtsPlayer } from './useTtsPlayer'

type TtsMiniBarProps = {
  tts: TtsPlayer
  tone: ToneOption
  /** 点击 bar 主体展开控制面板 */
  onExpand: () => void
  className?: string
}

/**
 * 听书迷你播放条（方案 17-4.3）：播放中吸底显示。
 * 手机端全宽吸底；平板/桌面端由外层加 max-width 呈现居中悬浮胶囊。
 */
export default function TtsMiniBar({ tts, tone, onExpand, className }: TtsMiniBarProps) {
  if (!tts.isActive) return null

  const iconButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] transition-colors press-feedback',
        disabled ? 'opacity-35' : 'hover:bg-black/5',
      )}
    >
      {icon}
    </button>
  )

  const statusText = (() => {
    if (tts.status === 'loading') return '合成中…'
    if (tts.status === 'error') return tts.errorMessage ?? '听书暂时不可用'
    if (tts.status === 'ended') return '已播完最新章节'
    return `${tts.voiceLabel.split(' · ')[0]} · ${tts.rate}x`
  })()

  return (
    <div
      role="region"
      aria-label="听书播放器"
      onClick={onExpand}
      className={cn(
        'flex cursor-pointer items-center gap-1 border-t px-2 backdrop-blur-md',
        className,
      )}
      style={{
        background: `color-mix(in srgb, ${tone.swatch} 94%, transparent)`,
        borderColor: 'color-mix(in srgb, currentColor 12%, transparent)',
        color: tone.text,
      }}
    >
      {iconButton(
        tts.status === 'playing' ? '暂停' : '播放',
        tts.status === 'loading' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : tts.status === 'playing' ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
        ),
        () => tts.toggle(),
      )}

      <div className="min-w-0 flex-1 py-2">
        <p className="truncate text-[13px] font-medium leading-5">{statusText}</p>
        <p className="truncate text-[11px] leading-4 opacity-55">
          第 {tts.currentBatchIndex + 1}/{tts.totalBatches} 段
          {tts.timerRemainingMinutes ? ` · ${tts.timerRemainingMinutes} 分钟后关闭` : ''}
          {tts.timerOption === 'chapter' ? ' · 播完本章关闭' : ''}
        </p>
      </div>

      {iconButton('上一段', <SkipBack className="h-4.5 w-4.5" />, () => tts.prevBatch(), !tts.hasPrevBatch)}
      {iconButton('下一段', <SkipForward className="h-4.5 w-4.5" />, () => tts.nextBatch(), !tts.hasNextBatch)}
      {tts.timerRemainingMinutes || tts.timerOption === 'chapter' ? (
        <span className="inline-flex h-10 w-8 shrink-0 items-center justify-center text-[var(--color-brand)]">
          <Timer className="h-4.5 w-4.5" />
        </span>
      ) : null}
      {iconButton('停止听书', <X className="h-5 w-5" />, () => tts.stop())}
    </div>
  )
}
