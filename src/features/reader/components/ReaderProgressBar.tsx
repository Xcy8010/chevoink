import { cn } from '@/lib/utils'

type ReaderProgressBarProps = {
  /** 0-100 */
  percent: number
  className?: string
}

/** 顶部阅读进度条（方案 5.3.1）：3px，颜色跟随当前阅读底色的墨色（currentColor），四种底色与明暗主题均自适应 */
export default function ReaderProgressBar({ percent, className }: ReaderProgressBarProps) {
  return (
    <div
      className={cn('h-[3px] w-full overflow-hidden', className)}
      style={{ background: 'color-mix(in srgb, currentColor 10%, transparent)' }}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="阅读进度"
    >
      <div
        className="h-full transition-[width] [transition-duration:var(--duration-normal)] [transition-timing-function:var(--easing-default)]"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          background:
            'linear-gradient(90deg, color-mix(in srgb, currentColor 38%, transparent), color-mix(in srgb, currentColor 62%, transparent))',
        }}
      />
    </div>
  )
}
