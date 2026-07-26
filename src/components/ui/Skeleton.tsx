import { cn } from '@/lib/utils'

type SkeletonProps = {
  className?: string
}

/** 基础骨架块 */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton-shimmer rounded-[var(--radius-sm)]', className)} />
}

/** 文字条骨架 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-3.5"
          // 最后一行缩短，模拟自然段落
          {...(index === lines - 1 ? { style: { width: '72%' } } : {})}
        />
      ))}
    </div>
  )
}

/** 头像骨架 */
export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <Skeleton className="shrink-0 rounded-full" {...{ style: { width: size, height: size } }} />
}

/** 封面骨架（3:4 书籍封面比例） */
export function SkeletonCover({ className }: SkeletonProps) {
  return <Skeleton className={cn('aspect-[3/4] w-24 rounded-[var(--radius-md)]', className)} />
}

/** 小说卡片骨架：封面 + 文字条 */
export function SkeletonNovelCard({ className }: SkeletonProps) {
  return (
    <div className={cn('flex gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3', className)}>
      <SkeletonCover />
      <div className="min-w-0 flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <SkeletonText lines={2} className="pt-1" />
      </div>
    </div>
  )
}

/** 首页骨架屏 */
export function HomeSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="内容加载中">
      <Skeleton className="h-[180px] w-full rounded-[var(--radius-xl)] md:h-[240px]" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-20 shrink-0 rounded-[var(--radius-pill)]" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <SkeletonNovelCard />
        <SkeletonNovelCard />
        <SkeletonNovelCard />
      </div>
    </div>
  )
}

/** 阅读器骨架屏 */
export function ReaderSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-8" aria-busy="true" aria-label="正文加载中">
      <Skeleton className="h-7 w-48" />
      <div className="space-y-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-4"
            {...{ style: { width: `${88 + ((index * 7) % 12)}%` } }}
          />
        ))}
      </div>
      <div className="space-y-4 pt-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-4"
            {...{ style: { width: `${86 + ((index * 11) % 14)}%` } }}
          />
        ))}
      </div>
    </div>
  )
}

/** 社区帖子流骨架 */
export function PostListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="帖子加载中">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
          <div className="flex items-center gap-3">
            <SkeletonAvatar />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <SkeletonText lines={3} />
        </div>
      ))}
    </div>
  )
}

/** 消息会话列表骨架 */
export function ConversationSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1" aria-busy="true" aria-label="会话加载中">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3">
          <SkeletonAvatar />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  )
}

/** 个人中心骨架屏：封面条 + 头像 + 统计卡 + tab 条 + 卡片栅格 */
export function ProfileSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="个人中心加载中">
      <Skeleton className="h-[160px] w-full rounded-[var(--radius-xl)] md:h-[200px]" />
      <div className="flex items-center gap-4 px-2">
        <SkeletonAvatar size={72} />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-20 rounded-[var(--radius-pill)]" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SkeletonNovelCard />
        <SkeletonNovelCard />
        <SkeletonNovelCard />
        <SkeletonNovelCard />
      </div>
    </div>
  )
}

/** 帖子详情骨架屏：正文卡 + 评论条 + 右侧延伸区 */
export function PostDetailSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_340px]" aria-busy="true" aria-label="帖子加载中">
      <div className="space-y-4">
        <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <SkeletonAvatar />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-5 w-3/4" />
          <SkeletonText lines={5} />
        </div>
        <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 sm:p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <SkeletonAvatar size={32} />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <SkeletonText lines={2} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4">
        <Skeleton className="h-4 w-24" />
        <SkeletonText lines={3} />
        <SkeletonText lines={3} />
      </div>
    </div>
  )
}

/** 创作区骨架屏：左侧目录条列 + 中部编辑区 + 右侧面板条列 */
export function StudioSkeleton() {
  return (
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px]" aria-busy="true" aria-label="创作区加载中">
      <div className="hidden space-y-2 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-3 lg:block">
        <Skeleton className="h-9 w-full rounded-[14px]" />
        <div className="space-y-1.5 pt-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-8 rounded-[10px]" {...{ style: { width: `${72 + ((index * 9) % 26)}%` } }} />
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-5">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-[12px]" />
            <Skeleton className="h-8 w-14 rounded-[12px]" />
          </div>
        </div>
        <Skeleton className="h-7 w-3/5" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-4" {...{ style: { width: `${84 + ((index * 7) % 16)}%` } }} />
          ))}
        </div>
      </div>
      <div className="hidden space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 lg:block">
        <Skeleton className="h-5 w-24" />
        <SkeletonText lines={3} />
        <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
        <SkeletonText lines={4} />
      </div>
    </div>
  )
}

/** 设置页骨架屏：分区卡片轮廓 */
export function SettingsSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="设置加载中">
      <Skeleton className="h-[140px] w-full rounded-[var(--radius-xl)]" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-5">
          <Skeleton className="h-5 w-28" />
          <SkeletonText lines={2} />
          <Skeleton className="h-10 w-full rounded-[var(--radius-lg)]" />
        </div>
      ))}
    </div>
  )
}

/** 作品下拉选项骨架：列表未就绪时占位 3-5 行 */
export function NovelOptionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-1" aria-busy="true" aria-label="作品列表加载中">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-[16px] px-3 py-3">
          <Skeleton className="h-9 w-9 rounded-[12px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 作者主页骨架屏：资料卡 + 统计卡 + 作品栅格 + 讨论列 */
export function AuthorSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="作者主页加载中">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_320px]">
        <div className="space-y-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <SkeletonAvatar size={64} />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-6 w-40" />
              <SkeletonText lines={2} />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-28 rounded-[var(--radius-pill)]" />
                <Skeleton className="h-6 w-24 rounded-[var(--radius-pill)]" />
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-[var(--radius-lg)]" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4">
          <Skeleton className="h-4 w-24" />
          <SkeletonText lines={3} />
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="aspect-[4/5] w-full rounded-[var(--radius-xl)]" />
            <Skeleton className="aspect-[4/5] w-full rounded-[var(--radius-xl)]" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <PostListSkeleton count={2} />
        </div>
      </section>
    </div>
  )
}

/** 发现页骨架屏：标题区 + 筛选 chips + 精选双卡 + 右侧榜单列 */
export function DiscoverSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="分类发现加载中">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 sm:p-5 lg:p-6">
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.08fr)_272px] xl:grid-cols-[minmax(0,1.18fr)_320px]">
          <div className="space-y-5">
            <div className="space-y-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-4/5 max-w-md" />
              <SkeletonText lines={2} className="max-w-2xl" />
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-20 rounded-[var(--radius-pill)]" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 sm:grid-cols-[88px_minmax(0,1fr)]"
                >
                  <Skeleton className="aspect-[3/4] w-full rounded-[var(--radius-lg)]" />
                  <div className="space-y-3 py-1">
                    <Skeleton className="h-4 w-3/5" />
                    <SkeletonText lines={3} />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-10 w-24 rounded-[var(--radius-pill)]" />
                      <Skeleton className="h-10 w-16 rounded-[var(--radius-pill)]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4">
                <Skeleton className="h-4 w-20" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 5 }).map((_, chipIndex) => (
                    <Skeleton key={chipIndex} className="h-8 w-16 rounded-[var(--radius-pill)]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonNovelCard key={index} />
        ))}
      </div>
    </div>
  )
}
