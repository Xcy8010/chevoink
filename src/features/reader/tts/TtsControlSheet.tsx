import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ttsRateOptions } from '../reader-settings'
import type { TtsPlayer, TtsTimerOption } from './useTtsPlayer'

type TtsControlSheetProps = {
  tts: TtsPlayer
}

const timerOptions: { value: TtsTimerOption; label: string }[] = [
  { value: 'off', label: '不定时' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' },
  { value: 'chapter', label: '播完本章' },
]

/** 听书控制面板内容（方案 17-4.3）：三端共用，外层容器决定 BottomSheet / 浮层形态 */
export default function TtsControlSheet({ tts }: TtsControlSheetProps) {
  return (
    <div className="space-y-6 p-4">
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
