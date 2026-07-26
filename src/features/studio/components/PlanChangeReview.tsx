import { useMemo } from 'react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

import type { PlanPendingReview } from '../types'
import { buildDiffChunks } from './diff'

type PlanChangeReviewProps = {
  review: PlanPendingReview
  busy?: boolean
  onKeep: () => void
  onRevert: () => void
  className?: string
}

/** 计划文档的 IDE 式审查视图：与章节审查一致的绿(新增)/红(删除)行级 diff，由用户保留/撤销定夺 */
export default function PlanChangeReview({
  review,
  busy = false,
  onKeep,
  onRevert,
  className,
}: PlanChangeReviewProps) {
  const diffChunks = useMemo(
    () => buildDiffChunks(review.before, review.after),
    [review.after, review.before],
  )

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="mb-4 rounded-[22px] border border-[rgba(15,23,42,0.12)] bg-[rgba(255,255,255,0.82)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {review.isCreate ? '计划已新建，请确认是否保留' : '计划已更新，请确认是否采纳'}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{review.description}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">绿色为新增，红色为删除。确认前将暂时停留在预览态。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onRevert} variant="ghost" size="sm" disabled={busy}>
              撤销
            </Button>
            <Button onClick={onKeep} variant="secondary" size="sm" disabled={busy}>
              保留
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-5 py-5">
        <div className="space-y-3 text-sm leading-8 text-[var(--text-primary)]">
          {diffChunks.length > 0 ? (
            diffChunks.map((chunk, index) => (
              <div
                key={`${chunk.kind}-${index}`}
                className={cn(
                  'whitespace-pre-wrap break-words rounded-[18px] px-4 py-3',
                  chunk.kind === 'unchanged' && 'text-[var(--text-primary)]',
                  chunk.kind === 'added' &&
                    'border border-[rgba(22,163,74,0.18)] bg-[rgba(22,163,74,0.08)] text-[rgb(22,101,52)]',
                  chunk.kind === 'removed' &&
                    'border border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.08)] text-[rgb(153,27,27)] line-through',
                )}
              >
                {chunk.text || ' '}
              </div>
            ))
          ) : (
            <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-7 text-[var(--text-secondary)]">
              本次没有内容差异，主要调整可能是计划标题。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
