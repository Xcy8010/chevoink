import { Check, Loader2, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ttsRateOptions } from '../reader-settings'
import type { TtsPlayer, TtsTimerOption } from './useTtsPlayer'

type TtsControlSheetProps = {
  tts: TtsPlayer
  /**
   * 顶部带完整播放器（段落进度 + 上一段/播放/下一段 + 退出听书）。
   * 手机分页阅读的吸底条被换成了窄胶囊（不挡正文），上下段与退出这类操作收在这里；
   * 平板/桌面仍用全宽迷你条自带这些键，故默认不显示，避免重复。
   */
  showPlayer?: boolean
  /** 在播放器里点「退出听书」之后（供外层顺手关掉面板） */
  onStopped?: () => void
}

const timerOptions: { value: TtsTimerOption; label: string }[] = [
  { value: 'off', label: '不定时' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' },
  { value: 'chapter', label: '播完本章' },
]

/** 听书控制面板内容（方案 17-4.3）：三端共用，外层容器决定 BottomSheet / 浮层形态 */
export default function TtsControlSheet({ tts, showPlayer = false, onStopped }: TtsControlSheetProps) {
  const statusLine = (() => {
    if (tts.status === 'loading') return '正在合成语音…'
    if (tts.status === 'error') return tts.errorMessage ?? '听书暂时不可用'
    if (tts.status === 'ended') return '已播完最新章节'
    if (!tts.isActive) return '未在播放'
    const progress = tts.totalBatches > 0 ? `第 ${tts.currentBatchIndex + 1}/${tts.totalBatches} 段` : ''
    return [tts.status === 'paused' ? '已暂停' : '正在朗读', progress].filter(Boolean).join(' · ')
  })()

  const stepButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled: boolean,
  ) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'press-feedback inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-pill)] text-[var(--text-secondary)] transition-colors',
        disabled ? 'opacity-30' : 'hover:bg-[var(--surface-muted)]',
      )}
    >
      {icon}
    </button>
  )

  return (
    <div className="space-y-6 p-4">
      {showPlayer ? (
        <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-4">
          <p className="text-center text-xs text-[var(--text-tertiary)]">{statusLine}</p>
          <div className="mt-3 flex items-center justify-center gap-8">
            {stepButton('上一段', <SkipBack className="h-5 w-5" />, () => tts.prevBatch(), !tts.hasPrevBatch)}
            <button
              type="button"
              aria-label={tts.status === 'playing' ? '暂停' : '继续播放'}
              onClick={() => tts.toggle()}
              className="press-feedback inline-flex h-14 w-14 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-brand)] text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] transition-transform"
            >
              {tts.status === 'loading' ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : tts.status === 'playing' ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </button>
            {stepButton('下一段', <SkipForward className="h-5 w-5" />, () => tts.nextBatch(), !tts.hasNextBatch)}
          </div>
          <button
            type="button"
            onClick={() => {
              tts.stop()
              onStopped?.()
            }}
            className="press-feedback mx-auto mt-3 flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
          >
            <Square className="h-3 w-3" />
            退出听书
          </button>
        </div>
      ) : null}

      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">音色</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tts.voices.map((voice) => {
            const isActive = tts.voiceId === voice.id
            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => tts.setVoice(voice.id)}
                className={cn(
                  'flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors press-feedback',
                  isActive
                    ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{voice.label}</span>
                  {voice.recommended ? (
                    <span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--color-brand)]">
                      推荐
                    </span>
                  ) : null}
                </span>
                {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">语速</p>
        <div className="mt-3 grid grid-cols-6 gap-2">
          {ttsRateOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => tts.setRate(option)}
              className={cn(
                'rounded-[var(--radius-pill)] border px-1 py-2 text-[13px] font-medium transition-colors press-feedback',
                tts.rate === option
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
              )}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">定时关闭</p>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {timerOptions.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => tts.setTimerOption(option.value)}
              className={cn(
                'rounded-[var(--radius-md)] border px-1 py-2 text-xs font-medium transition-colors press-feedback',
                tts.timerOption === option.value
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {tts.timerRemainingMinutes ? (
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            约 {tts.timerRemainingMinutes} 分钟后自动停止
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">自动播放下一章</p>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">本章播完后自动续播下一章</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={tts.autoNext}
          onClick={() => tts.setAutoNext(!tts.autoNext)}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-[var(--radius-pill)] transition-colors',
            tts.autoNext ? 'bg-[var(--color-brand)]' : 'bg-[var(--border-strong)]',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              tts.autoNext ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  )
}
