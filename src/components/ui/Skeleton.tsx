import { cn } from '@/lib/utils'

/** 骨架需匹配最终布局：从地址栏解析当前作品，读取其工作区视角（work/ide），SSR 无 window 时按 work 处理 */
function resolveStudioPerspective(): 'work' | 'ide' {
  if (typeof window === 'undefined') return 'work'
  const match = window.location.pathname.match(/\/studio\/novel\/([^/]+)/)
  const novelId = match?.[1]
  if (!novelId) return 'work'
  return window.localStorage.getItem(`chevoink:perspective:${novelId}`) === 'ide' ? 'ide' : 'work'
}

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

const studioMessageWidths = ['w-11/12', 'w-full', 'w-4/5'] as const

function StudioMessageLines({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('space-y-3', compact && 'space-y-2.5')}>
      {studioMessageWidths.map((width, index) => (
        <Skeleton key={width} className={cn(compact ? 'h-3' : 'h-3.5', width, index === 2 && 'opacity-80')} />
      ))}
    </div>
  )
}

/** 创作区骨架屏：按真实 Work 工作区分别适配桌面端与手机端 */
const studioSkeletonMobileNav = ['exit', 'assistant', 'editor', 'chapters', 'more'] as const
const studioSkeletonInspectorTabs = ['work', 'context', 'changes', 'memory', 'skills'] as const

export function StudioSkeleton() {
  const perspective = resolveStudioPerspective()
  return (
    <div
      className="flex h-full min-h-[70vh] min-w-0 flex-col overflow-hidden bg-[var(--app-bg)]"
      aria-busy="true"
      aria-label="创作区加载中"
    >
      {/* 手机端：复刻作品选择、一体化 Agent 顶栏、工作台与安全区底栏，避免加载完成时整页跳动。 */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden" data-studio-skeleton="mobile">
        <div className="flex h-[52px] shrink-0 items-center gap-2 px-1" data-studio-region="mobile-header">
          <Skeleton className="h-11 w-[44%] shrink-0 rounded-[16px]" />
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5">
            <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 min-w-0 flex-1" />
            <Skeleton className="h-7 w-7 shrink-0 rounded-[8px]" />
            <Skeleton className="h-7 w-7 shrink-0 rounded-[8px]" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-2 pt-3" data-studio-region="mobile-conversation">
          <div className="min-h-0 flex-1 space-y-5 overflow-hidden py-2">
            <StudioMessageLines compact />
            <div className="ml-auto w-2/3 rounded-[22px] bg-[var(--surface-muted)] p-4">
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <Skeleton className="h-3 w-28" />
            <StudioMessageLines compact />
            <div className="ml-auto w-1/2 rounded-[22px] bg-[var(--surface-muted)] p-4">
              <Skeleton className="h-3.5 w-3/4" />
            </div>
          </div>

          <div className="mb-2 shrink-0 overflow-hidden rounded-[18px] border border-[var(--border-subtle)]" data-studio-region="mobile-activity">
            <div className="flex h-11 items-center gap-3 px-4">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="ml-auto h-3 w-14" />
            </div>
            <div className="flex h-11 items-center gap-3 border-t border-[var(--border-subtle)] px-4">
              <Skeleton className="h-4 w-4 rounded-[5px]" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          </div>

          <div className="h-[126px] shrink-0 rounded-[24px] border border-[var(--border-subtle)] p-4" data-studio-region="mobile-composer">
            <Skeleton className="h-3.5 w-3/4" />
            <div className="mt-12 flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-[8px]" />
              <Skeleton className="h-8 w-24 rounded-[var(--radius-pill)]" />
              <Skeleton className="h-7 w-7 rounded-[8px]" />
              <Skeleton className="ml-auto h-10 w-10 rounded-full" />
            </div>
          </div>
        </div>

        <div
          className="studio-bottom-nav flex shrink-0 items-stretch justify-around gap-1 border-t border-[var(--border-subtle)] bg-[var(--surface-default)] px-2 pb-[max(var(--safe-bottom),4px)] pt-1"
          data-studio-region="mobile-bottom-nav"
        >
          {studioSkeletonMobileNav.map((item) => (
            <div key={item} className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1" data-studio-nav-item data-studio-nav-key={item}>
              <Skeleton className="h-5 w-5 rounded-[6px]" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* 桌面端：默认 Work 模式的紧凑任务条、居中对话区和检查器条。 */}
      <div className="hidden min-h-0 flex-1 flex-col lg:flex" data-studio-skeleton="desktop">
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-3" data-studio-region="desktop-command-bar">
          <Skeleton className="h-9 w-40 rounded-[4px]" />
          <div className="h-6 w-px bg-[var(--border-subtle)]" />
          <Skeleton className="h-9 w-40 rounded-[4px]" />
          <div className="h-6 w-px bg-[var(--border-subtle)]" />
          <Skeleton className="h-9 w-20 rounded-[4px]" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-9 w-24 rounded-[4px]" />
            <Skeleton className="h-9 w-20 rounded-[4px]" />
            <Skeleton className="h-9 w-9 rounded-[4px]" />
            <Skeleton className="h-9 w-24 rounded-[4px]" />
          </div>
        </div>

        {perspective === 'ide' ? (
          <div
            className="grid min-h-0 flex-1 overflow-hidden border-y border-[var(--border-subtle)] bg-[var(--surface-default)]"
            data-studio-skeleton="ide"
            style={{ gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr) minmax(0, 320px)' }}
          >
            <div className="flex min-h-0 overflow-hidden border-r border-[var(--border-subtle)]">
              <nav className="flex w-[46px] shrink-0 flex-col items-center border-r border-[var(--border-subtle)] py-2" aria-label="IDE 工作区导航">
                <Skeleton className="mb-3 h-8 w-8 rounded-[8px]" />
                <div className="h-px w-5 bg-[var(--border-subtle)]" />
                <div className="mt-2 flex flex-col gap-1">
                  {studioSkeletonInspectorTabs.map((tab) => (
                    <Skeleton key={tab} className="h-9 w-9 rounded-[8px]" />
                  ))}
                </div>
              </nav>
              <div className="min-w-0 flex-1 space-y-3 overflow-hidden p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full rounded-[10px]" />
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <Skeleton className="h-3 w-3 rounded-[4px]" />
                    <Skeleton className={cn('h-3', index === 3 ? 'w-3/5' : 'w-5/6')} />
                  </div>
                ))}
              </div>
            </div>
            <div className="min-h-0 overflow-hidden bg-[var(--surface-default)] p-4">
              <div className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-10/12" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
            <div className="min-h-0 overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--surface-default)] p-3">
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="ml-auto h-3 w-8" />
              </div>
              <div className="space-y-3 py-3">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="ml-auto h-3.5 w-2/5" />
              </div>
            </div>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-[54px] shrink-0 flex-col items-center gap-1 border-r border-[var(--border-subtle)] py-2" data-studio-region="desktop-task-rail">
            <Skeleton className="mb-1 h-9 w-9 rounded-[9px]" />
            <Skeleton className="h-9 w-9 rounded-[9px]" />
            <div className="my-1 h-px w-6 shrink-0 bg-[var(--border-subtle)]" />
            <div className="flex min-h-0 flex-1 flex-col items-center gap-[7px] overflow-hidden py-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className={cn('h-[2px] rounded-full', index === 1 ? 'w-4' : 'w-2.5')} />
              ))}
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 justify-center overflow-hidden" data-studio-region="desktop-conversation">
            <div className="flex h-full min-h-0 w-full max-w-[960px] flex-col px-8">
              <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-[var(--border-subtle)]">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="ml-auto h-7 w-7 rounded-[8px]" />
                <Skeleton className="h-7 w-7 rounded-[8px]" />
              </div>

              <div className="min-h-0 flex-1 space-y-8 overflow-hidden px-5 py-8">
                <StudioMessageLines />
                <div className="ml-auto w-2/5 rounded-[22px] bg-[var(--surface-muted)] p-5">
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
                <Skeleton className="h-3 w-32" />
                <StudioMessageLines />
                <StudioMessageLines />
              </div>

              <div className="mb-2 shrink-0 overflow-hidden rounded-[18px] border border-[var(--border-subtle)]" data-studio-region="desktop-activity">
                <div className="flex h-10 items-center gap-3 px-4">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="ml-auto h-3 w-16" />
                </div>
                <div className="flex h-10 items-center gap-3 border-t border-[var(--border-subtle)] px-4">
                  <Skeleton className="h-4 w-4 rounded-[5px]" />
                  <Skeleton className="h-3.5 w-36" />
                </div>
              </div>

              <div className="mb-4 h-[132px] shrink-0 rounded-[24px] border border-[var(--border-subtle)] p-5" data-studio-region="desktop-composer">
                <Skeleton className="h-3.5 w-2/5" />
                <div className="mt-14 flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-[8px]" />
                  <Skeleton className="h-8 w-24 rounded-[var(--radius-pill)]" />
                  <Skeleton className="h-7 w-7 rounded-[8px]" />
                  <Skeleton className="ml-auto h-10 w-10 rounded-full" />
                </div>
              </div>
            </div>
          </main>

          <aside className="flex w-[46px] shrink-0 flex-col items-center border-l border-[var(--border-subtle)] py-2" data-studio-region="desktop-inspector-rail">
            <Skeleton className="h-8 w-8 rounded-[8px]" />
            <div className="my-3 h-px w-5 shrink-0 bg-[var(--border-subtle)]" />
            {studioSkeletonInspectorTabs.map((tab) => (
              <span key={tab} className="contents" data-studio-inspector-tab={tab} data-studio-skeleton-skill-entry={tab === 'skills' || undefined}>
                <Skeleton className="mb-1 h-5 w-5 rounded-[6px]" />
              </span>
            ))}
          </aside>
        </div>
        )}
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
