import BannerCarousel from '@/features/home/components/BannerCarousel'
import CategoryNav from '@/features/home/components/CategoryNav'
import CategoryNovelSection from '@/features/home/components/CategoryNovelSection'
import ContinueReadingRail from '@/features/home/components/ContinueReadingRail'
import FeaturedNovelList from '@/features/home/components/FeaturedNovelList'
import HotPostsRail from '@/features/home/components/HotPostsRail'
import LatestUpdatesList from '@/features/home/components/LatestUpdatesList'
import RankingBoard from '@/features/home/components/RankingBoard'
import type { HomeData } from '@/features/home/useHomeData'

/** 手机端首页：单列沉浸，扁平信息流 */
export default function HomeMobileLayout({
  data,
  activeCategory,
  onSelectCategory,
}: {
  data: HomeData
  activeCategory: string
  onSelectCategory: (category: string) => void
}) {
  return (
    <div className="animate-fade-in-up space-y-7">
      <div className="space-y-3">
        <BannerCarousel novels={data.bannerNovels} heightClassName="h-[180px]" />
        <CategoryNav categories={data.categories} activeCategory={activeCategory} onSelect={onSelectCategory} />
      </div>
      {data.continueReading.length > 0 ? (
        <ContinueReadingRail novels={data.continueReading} progressMap={data.progressMap} />
      ) : null}
      <FeaturedNovelList novels={data.featuredNovels} variant="list" maxItems={4} />
      <RankingBoard hot={data.rankingHot} fresh={data.rankingNew} finished={data.rankingFinished} visibleCount={5} />
      <LatestUpdatesList novels={data.latestUpdated} maxItems={5} />
      <HotPostsRail posts={data.hotPosts} />
      {activeCategory ? <CategoryNovelSection category={activeCategory} /> : null}
    </div>
  )
}
