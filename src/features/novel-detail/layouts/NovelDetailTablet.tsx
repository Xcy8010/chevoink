import { Link } from 'react-router-dom'

import DetailCtaRow from '../components/DetailCtaRow'
import DetailStatsRow from '../components/DetailStatsRow'
import { DetailTabContent, DetailTabs } from '../components/DetailTabs'
import { novelStatusMap, novelVisibilityMap, type NovelDetailState } from '../useNovelDetailState'

type NovelDetailTabletProps = {
  state: NovelDetailState
}

/** 平板端详情页：扁平化排版——封面左(168x227) + 右侧信息区 + Tab 内容，无卡片嵌套 */
export default function NovelDetailTablet({ state }: NovelDetailTabletProps) {
  const {
    detail,
    detailTitle,
    detailCoverUrl,
    authorName,
    authorId,
    detailSummary,
    detailTags,
    summaryExpanded,
    setSummaryExpanded,
  } = state

  if (!detail) {
    return null
  }

  return (
    <div className="pb-8 pt-2">
      {/* 书籍主信息：无卡片包裹，直接排布 */}
      <section className="flex gap-6">
        <div className="shrink-0">
          {detailCoverUrl ? (
            <img
              src={detailCoverUrl}
              alt={detailTitle}
              className="aspect-[20/27] w-[168px] rounded-[var(--radius-lg)] object-cover shadow-[0_14px_32px_rgba(17,24,39,0.16)]"
            />
          ) : (
            <div className="flex aspect-[20/27] w-[168px] flex-col justify-end rounded-[var(--radius-lg)] bg-[var(--surface-contrast)] p-4 shadow-[0_14px_32px_rgba(17,24,39,0.16)]">
              <p className="text-xs text-[var(--text-contrast)]/70">{authorName}</p>
              <p className="mt-1.5 text-base font-semibold text-[var(--text-contrast)]">{detailTitle}</p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-[var(--text-primary)]">
              {detailTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--text-tertiary)]">
              {authorId ? (
                <Link
                  to={`/author/${authorId}`}
                  className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--color-brand)]"
                >
                  {authorName}
                </Link>
              ) : (
                <span className="text-sm font-medium text-[var(--text-secondary)]">{authorName}</span>
              )}
              <span aria-hidden>·</span>
              <span>{detail.novel.categoryName}</span>
              <span aria-hidden>·</span>
              <span>{novelStatusMap[detail.novel.status]}</span>
              <span aria-hidden>·</span>
              <span>{novelVisibilityMap[detail.novel.visibility]}</span>
            </div>
          </div>

          <DetailStatsRow state={state} />

          <div>
            <p
              className={[
                'text-sm leading-7 text-[var(--text-secondary)]',
                summaryExpanded ? '' : 'line-clamp-3',
              ].join(' ')}
            >
              {detailSummary}
            </p>
            <button
              type="button"
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="mt-1 text-sm font-medium text-[var(--color-brand)]"
            >
              {summaryExpanded ? '收起' : '展开全部'}
            </button>
          </div>

          {detailTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {detailTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="pt-1">
            <DetailCtaRow state={state} />
          </div>
        </div>
      </section>

      {/* 目录/评论/推荐：贴页面排布，靠 Tab 下划线分区 */}
      <section className="mt-8">
        <DetailTabs state={state} />
        <DetailTabContent state={state} />
      </section>
    </div>
  )
}
