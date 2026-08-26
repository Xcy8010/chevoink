import ChapterDirectory from './ChapterDirectory'
import NovelComments from './NovelComments'
import RelatedNovelsPanel from './RelatedNovelsPanel'
import type { DetailTab, NovelDetailState } from '../useNovelDetailState'

type DetailTabsProps = {
  state: NovelDetailState
}

/** 详情页 Tab 导航：目录 / 评论 / 相关推荐（品牌色下划线选中态） */
export function DetailTabs({ state }: DetailTabsProps) {
  const { activeTab, setActiveTab, chapters, commentsQuery, relatedNovels } = state

  const tabs: Array<{ id: DetailTab; label: string; count: number | null }> = [
    { id: 'directory', label: '目录', count: chapters.length },
    { id: 'comments', label: '评论', count: commentsQuery.data?.pagination.total ?? null },
    { id: 'related', label: '相关推荐', count: relatedNovels.length || null },
  ]

  return (
    <div className="flex items-center gap-6 border-b border-[var(--border-subtle)]" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'relative -mb-px flex items-center gap-1.5 pb-3 pt-1 text-[15px] transition-colors',
              isActive
                ? 'font-semibold text-[var(--color-brand)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== null ? (
              <span className="text-xs font-normal tabular-nums text-[var(--text-tertiary)]">{tab.count}</span>
            ) : null}
            <span
              className={[
                'absolute inset-x-0 bottom-0 h-[2.5px] rounded-full bg-[var(--color-brand)] transition-opacity duration-[var(--duration-fast)]',
                isActive ? 'opacity-100' : 'opacity-0',
              ].join(' ')}
            />
          </button>
        )
      })}
    </div>
  )
}

type DetailTabContentProps = {
  state: NovelDetailState
  /** 目录紧凑单行（手机端） */
  dense?: boolean
  /** 目录显示字数+更新时间列（桌面端） */
  showMeta?: boolean
  /** 相关推荐展现形式 */
  relatedVariant?: 'grid' | 'list'
}

/** 当前 Tab 的内容区 */
export function DetailTabContent({
  state,
  dense = false,
  showMeta = false,
  relatedVariant = 'grid',
}: DetailTabContentProps) {
  const { activeTab, chapters, volumes, novelId, readingProgress, relatedNovels } = state

  if (activeTab === 'comments') {
    return (
      <div className="pt-5">
        <NovelComments state={state} />
      </div>
    )
  }

  if (activeTab === 'related') {
    return (
      <div className="pt-5">
        <RelatedNovelsPanel novels={relatedNovels} variant={relatedVariant} />
      </div>
    )
  }

  return (
    <div className="pt-5">
      <ChapterDirectory
        chapters={chapters}
        volumes={volumes}
        novelId={novelId ?? ''}
        currentChapterId={readingProgress?.chapterId ?? null}
        dense={dense}
        showMeta={showMeta}
      />
    </div>
  )
}
