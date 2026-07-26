import { Link } from 'react-router-dom'

import Avatar from '@/features/community/components/Avatar'
import { getAuthorName, getPostExcerpt, getTopicName } from '@/features/discover/api'
import BannerCarousel from '@/features/home/components/BannerCarousel'
import CategoryNav from '@/features/home/components/CategoryNav'
import CategoryNovelSection from '@/features/home/components/CategoryNovelSection'
import ContinueReadingRail from '@/features/home/components/ContinueReadingRail'
import FeaturedNovelList from '@/features/home/components/FeaturedNovelList'
import LatestUpdatesList from '@/features/home/components/LatestUpdatesList'
import RankingBoard from '@/features/home/components/RankingBoard'
import { formatRelativeTime } from '@/features/home/utils'
import type { HomeData } from '@/features/home/useHomeData'

/** 电脑端首页：番茄式扁平排版，主内容列 + 右侧轻量信息栏 */
export default function HomeDesktopLayout({
  data,
  activeCategory,
  onSelectCategory,
}: {
  data: HomeData
  activeCategory: string
  onSelectCategory: (category: string) => void
}) {
  return (
    <div className="animate-fade-in-up grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* 主内容列 */}
      <div className="min-w-0 space-y-10">
        <div className="space-y-4">
          <BannerCarousel novels={data.bannerNovels} heightClassName="h-[280px]" />
          <CategoryNav categories={data.categories} activeCategory={activeCategory} onSelect={onSelectCategory} />
        </div>
        {data.continueReading.length > 0 ? (
          <ContinueReadingRail novels={data.continueReading} progressMap={data.progressMap} />
        ) : null}
        <FeaturedNovelList novels={data.featuredNovels} variant="grid" maxItems={10} />
        <RankingBoard
          hot={data.rankingHot}
          fresh={data.rankingNew}
          finished={data.rankingFinished}
          visibleCount={5}
          variant="columns"
        />
        {activeCategory ? <CategoryNovelSection category={activeCategory} /> : null}
      </div>

      {/* 右侧信息栏：无卡片容器，黏滞在固定顶栏下方并独立滚动（隐藏滚动条），标题不会被顶栏遮住 */}
      <aside className="scrollbar-none sticky top-[calc(var(--app-header-height,132px)+12px)] max-h-[calc(100dvh-var(--app-header-height,132px)-28px)] space-y-8 overflow-y-auto">
        <LatestUpdatesList novels={data.latestUpdated} maxItems={5} />

        {data.hotTopics.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">热门话题</h2>
            <div className="flex flex-wrap gap-2">
              {data.hotTopics.slice(0, 8).map((topic) => (
                <Link
                  key={topic.id}
                  to="/community"
                  className="press-feedback rounded-[var(--radius-pill)] bg-[var(--surface-muted)]/70 px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                >
                  {topic.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {data.hotPosts.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">社区热议</h2>
              <Link to="/community" className="text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)]">
                更多
              </Link>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {data.hotPosts.slice(0, 5).map((post) => (
                <Link key={post.id} to={`/post/${post.id}`} className="block py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={getAuthorName(post.author)} src={post.author?.avatarUrl ?? null} size="sm" />
                    <span className="truncate text-xs text-[var(--text-secondary)]">{getAuthorName(post.author)}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--text-tertiary)]">{formatRelativeTime(post.updatedAt)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-primary)]">{getPostExcerpt(post)}</p>
                  <p className="mt-1 text-[11px] text-[var(--color-brand)]">{getTopicName(post.topic)}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  )
}
