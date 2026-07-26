import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  getAuthorName,
  getCoverUrl,
  getDisplayTitle,
  getNovelSummary,
} from '@/features/discover/api'
import { useStartReading } from '@/features/discover/useStartReading'
import { cn } from '@/lib/utils'
import type { NovelCard } from '../../../../shared/contracts/index.js'

type BannerCarouselProps = {
  novels: NovelCard[]
  /** 高度档位：mobile 180px / tablet 240px / desktop 280px */
  heightClassName?: string
}

const AUTOPLAY_MS = 5000

/** Banner 轮播：自动播放 5s，支持触控滑动与指示点 */
export default function BannerCarousel({ novels, heightClassName }: BannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const { startReading, isStarting, pendingNovelId } = useStartReading()

  const count = novels.length

  const goTo = useCallback(
    (index: number) => {
      if (count === 0) return
      setActiveIndex(((index % count) + count) % count)
    },
    [count],
  )

  useEffect(() => {
    if (paused || count <= 1) return
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % count)
    }, AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [paused, count])

  if (count === 0) return null

  const active = novels[activeIndex]

  return (
    <section
      aria-label="精选推荐轮播"
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-xl)]',
        heightClassName ?? 'h-[180px] md:h-[240px] xl:h-[280px]',
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0].clientX
        setPaused(true)
      }}
      onTouchEnd={(event) => {
        const startX = touchStartX.current
        touchStartX.current = null
        setPaused(false)
        if (startX == null) return
        const delta = event.changedTouches[0].clientX - startX
        if (Math.abs(delta) > 40) {
          goTo(activeIndex + (delta < 0 ? 1 : -1))
        }
      }}
    >
      {/* 背景：封面模糊铺底 */}
      {novels.map((novel, index) => {
        const cover = getCoverUrl(novel.coverUrl)
        return (
          <div
            key={novel.id}
            aria-hidden={index !== activeIndex}
            className={cn(
              'absolute inset-0 transition-opacity duration-[var(--duration-slow)]',
              index === activeIndex ? 'opacity-100' : 'opacity-0',
            )}
          >
            {cover ? (
              <img src={cover} alt="" className="h-full w-full scale-105 object-cover blur-[3px] brightness-[0.78]" />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(135deg,#28435f_0%,#17212d_60%,#0f1622_100%)]" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,16,24,0.78)_0%,rgba(10,16,24,0.46)_52%,rgba(10,16,24,0.22)_100%)]" />
          </div>
        )
      })}

      {/* 内容层 */}
      <div className="relative z-10 flex h-full items-center gap-4 px-4 md:gap-8 md:px-8">
        {getCoverUrl(active.coverUrl) ? (
          <img
            src={getCoverUrl(active.coverUrl) ?? ''}
            alt={getDisplayTitle(active)}
            className="hidden h-[78%] w-auto shrink-0 rounded-[var(--radius-md)] border border-white/20 object-cover shadow-[var(--shadow-elevated)] min-[420px]:block"
          />
        ) : null}

        <div className="min-w-0 flex-1 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">本周力荐</p>
          <h2 className="mt-1 line-clamp-1 text-xl font-bold tracking-tight md:mt-2 md:text-3xl">
            {getDisplayTitle(active)}
          </h2>
          <p className="mt-1 text-xs text-white/80 md:mt-2 md:text-sm">{getAuthorName(active.author)}</p>
          <p className="mt-2 line-clamp-2 max-w-2xl text-xs leading-5 text-white/85 md:mt-3 md:text-sm md:leading-6">
            {getNovelSummary(active.summary)}
          </p>

          <div className="mt-3 flex items-center gap-2 md:mt-5 md:gap-3">
            <button
              type="button"
              onClick={() => startReading(active.id)}
              disabled={isStarting && pendingNovelId === active.id}
              className="press-feedback inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] bg-white px-4 text-xs font-semibold text-[#17212d] transition-colors hover:bg-white/90 md:h-11 md:gap-2 md:px-5 md:text-sm"
            >
              <BookOpen className="h-3.5 w-3.5 md:h-4 md:w-4" />
              开始阅读
            </button>
            <Link
              to={`/novel/${active.id}`}
              className="press-feedback inline-flex h-9 items-center gap-1 rounded-[var(--radius-pill)] border border-white/40 px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/10 md:h-11 md:px-5 md:text-sm"
            >
              查看详情
              <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* 指示点：手机端收到右下角避免盖住「查看详情」按钮，桌面端保持底部居中 */}
      {count > 1 ? (
        <div className="absolute bottom-3 right-4 z-10 flex gap-1.5 md:bottom-4 md:left-1/2 md:right-auto md:-translate-x-1/2">
          {novels.map((novel, index) => (
            <button
              key={novel.id}
              type="button"
              aria-label={`切换到第 ${index + 1} 张`}
              onClick={() => goTo(index)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-[var(--duration-normal)]',
                index === activeIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
