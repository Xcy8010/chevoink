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
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
