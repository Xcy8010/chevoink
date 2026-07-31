import { useNavigate } from 'react-router-dom'

import { getCoverUrl, getDisplayTitle } from '@/features/discover/api'
import { useStartReading } from '@/features/discover/useStartReading'
import {
  getProgressPercent,
  type ReadingProgressEntry,
} from '@/features/home/reading-progress'
import type { NovelCard } from '../../../../shared/contracts/index.js'

type ContinueReadingRailProps = {
  novels: NovelCard[]
  progressMap: Record<string, ReadingProgressEntry>
}

/** 继续阅读横滑卡片：封面 + 进度条 + 章节标签，点击直达上次章节 */
export default function ContinueReadingRail({ novels, progressMap }: ContinueReadingRailProps) {
  const navigate = useNavigate()
  const { startReading } = useStartReading()

  if (novels.length === 0) return null

  const handleOpen = (novel: NovelCard) => {
    const progress = progressMap[novel.id]
    if (progress) {
      navigate(`/novel/${novel.id}/read/${progress.chapterId}`)
      return
    }
    startReading(novel.id)
  }

  return (
    <section aria-label="继续阅读" className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)] md:text-xl">继续阅读</h2>
      {/* scroll-padding 与左右内边距对齐，保证吸附后首卡不被滑动口左缘裁切 */}
      <div className="rail-scroll -mx-1 flex gap-3 scroll-px-1 px-1 pb-1">
        {novels.map((novel) => {
          const progress = progressMap[novel.id]
          const percent = progress ? getProgressPercent(progress) : null
          const cover = getCoverUrl(novel.coverUrl)

          return (
            <button
              key={novel.id}
              type="button"
              onClick={() => handleOpen(novel)}
              className="press-feedback w-[104px] shrink-0 text-left md:w-[128px]"
            >
              {cover ? (
                <img
                  src={cover}
                  alt={getDisplayTitle(novel)}
                  loading="lazy"
                  className="h-[136px] w-[104px] rounded-[var(--radius-md)] object-cover md:h-[168px] md:w-[128px]"
                />
              ) : (
                <span className="flex h-[136px] w-[104px] items-end rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-2 md:h-[168px] md:w-[128px]">
                  <span className="line-clamp-3 text-xs font-semibold text-[var(--text-primary)]">
                    {getDisplayTitle(novel)}
                  </span>
                </span>
              )}
              <span className="mt-1.5 block truncate text-xs font-medium text-[var(--text-primary)] md:text-sm">
                {getDisplayTitle(novel)}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--text-tertiary)]">
                {progress ? progress.chapterTitle : `共 ${novel.chapterCount} 章`}
              </span>
              {/* 进度条 */}
              <span className="mt-1 block h-0.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <span
                  className="block h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-[var(--duration-normal)]"
                  style={{ width: `${percent ?? 0}%` }}
                />
              </span>
              {percent != null ? (
                <span className="mt-0.5 block text-[11px] text-[var(--color-brand)]">已读 {percent}%</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
