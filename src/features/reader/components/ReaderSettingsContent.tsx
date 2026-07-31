import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { fontScaleOptions, toneOptions, type ReaderFontScale, type ReaderTone } from '../reader-settings'

type ReaderSettingsContentProps = {
  fontScale: ReaderFontScale
  tone: ReaderTone
  onFontScaleChange: (next: ReaderFontScale) => void
  onToneChange: (next: ReaderTone) => void
}

/** 阅读设置内容：字号 4 档 + 背景色 4 模式（三端共用，外层容器决定承载形态） */
export default function ReaderSettingsContent({
  fontScale,
  tone,
  onFontScaleChange,
  onToneChange,
}: ReaderSettingsContentProps) {
  return (
    <div className="space-y-6 p-4">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">字号与行距</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {fontScaleOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onFontScaleChange(option.id)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-[var(--radius-md)] border px-2 py-2.5 transition-colors press-feedback',
                fontScale === option.id
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-[11px] opacity-70">
                {option.fontSize}px · {option.lineHeight}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">页面底色</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {toneOptions.map((option) => {
            const isActive = tone === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onToneChange(option.id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-[var(--radius-md)] border px-2 py-3 transition-colors press-feedback',
                  isActive
                    ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]',
                )}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10"
                  style={{ background: option.swatch }}
                >
                  {isActive ? <Check className="h-4 w-4 text-[var(--color-brand)]" /> : null}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">{option.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
