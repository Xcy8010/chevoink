import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/ui/Skeleton'
import AppImage from '@/components/ui/AppImage'
import {
  asArray,
  getAuthorName,
  getCoverUrl,
  getDisplayTitle,
  listNovels,
} from '@/features/discover/api'
import { cn } from '@/lib/utils'
import type { NovelCard } from '../../../../shared/contracts/index.js'

type CategoryNovelSectionProps = {
  /** 当前筛选的分类标签 */
  category: string
}

const statusLabel: Record<string, string> = {
  published: '连载中',
  completed: '完结',
  archived: '已下架',
  draft: '草稿',
}

/**
 * 把筛选结果区滚进壳层主滚动容器视野。
 * 安卓 WebView 里 scrollIntoView smooth 容易被点按后的焦点滚动/横滑 snap 结算打断
 * （表现为点标签不自动滚动），改为对主滚动容器显式 scrollTo，并在稍后校验补扫：
 * 被打断未到位且用户未手动滚动时瞬时补齐，保证各端都能到达结果区。
 */
function scrollSectionIntoView(section: HTMLElement) {
  const root = section.closest<HTMLElement>('.app-main-scroll')
  if (!root) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  // 程序滚动前释放按钮焦点，避免 WebView「滚动以露出聚焦元素」打断平滑滚动
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }

  const computeTarget = () =>
    Math.max(
      0,
      root.scrollTop + section.getBoundingClientRect().top - root.getBoundingClientRect().top - 8,
    )

  let userScrolled = false
  const markUserScrolled = () => {
    userScrolled = true
  }
  root.addEventListener('touchstart', markUserScrolled, { once: true, passive: true })
  root.addEventListener('wheel', markUserScrolled, { once: true, passive: true })

  root.scrollTo({ top: computeTarget(), behavior: 'smooth' })

  window.setTimeout(() => {
    root.removeEventListener('touchstart', markUserScrolled)
    root.removeEventListener('wheel', markUserScrolled)
    if (userScrolled) return
    const target = computeTarget()
    if (target - root.scrollTop > 48) {
      root.scrollTo({ top: target, behavior: 'auto' })
    }
  }, 450)
}

/** 书封：3:4 比例，无封面时用底色 + 书名兜底（与精选好书保持同款样式） */
function NovelCover({ novel, className }: { novel: NovelCard; className?: string }) {
  const cover = getCoverUrl(novel.coverUrl)

  if (cover) {
    return (
      <AppImage
        src={cover}
        alt={getDisplayTitle(novel)}
        className={cn('aspect-[3/4] w-full rounded-[var(--radius-md)]', className)}
      />
    )
  }

  return (
    <span className={cn('flex aspect-[3/4] w-full items-end rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-2', className)}>
      <span className="line-clamp-3 text-xs font-semibold text-[var(--text-primary)]">{getDisplayTitle(novel)}</span>
    </span>
  )
}

/** 首页分类筛选区块：点击分类导航后在首页底部展示同标签作品 */
export default function CategoryNovelSection({ category }: CategoryNovelSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null)

  const query = useQuery({
    queryKey: ['home', 'category-novels', category],
    queryFn: () => listNovels({ tag: category, publishedOnly: true, pageSize: 18 }),
    enabled: Boolean(category),
  })

  // 切换分类后把筛选结果滚进视野，让“点击标签 → 底部出结果”这个动线可感知
  useEffect(() => {
    if (!category) return
    const timer = window.setTimeout(() => {
      const section = sectionRef.current
      if (section) scrollSectionIntoView(section)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [category])

  if (!category) return null

  const novels = asArray(query.data?.items).filter((novel) => novel.status !== 'draft')

  return (
    <section ref={sectionRef} aria-label={`${category}作品`} className="scroll-mt-24 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)] md:text-xl">
          「{category}」作品
        </h2>
        <Link
          to={`/discover?tag=${encodeURIComponent(category)}`}
          className="text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)] md:text-sm"
        >
          去发现页看更多
        </Link>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="aspect-[3/4] w-full rounded-[var(--radius-md)]" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
          加载「{category}」作品失败了，稍后再试试。
        </p>
      ) : novels.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
          还没有「{category}」标签的作品，换个分类看看吧。
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 xl:grid-cols-6">
          {novels.map((novel) => (
            <Link key={novel.id} to={`/novel/${novel.id}`} className="group block min-w-0">
              <NovelCover novel={novel} className="transition-transform duration-[var(--duration-normal)] group-hover:-translate-y-0.5" />
              <h3 className="mt-2 line-clamp-1 text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
                {getDisplayTitle(novel)}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-tertiary)]">
                {getAuthorName(novel.author)} · {statusLabel[novel.status] ?? novel.status}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
