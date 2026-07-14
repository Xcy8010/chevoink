import { useMemo } from 'react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

import type { ChapterPendingReview } from '../types'

type DiffChunk = {
  kind: 'unchanged' | 'added' | 'removed'
  text: string
}

type ChapterChangeReviewProps = {
  review: ChapterPendingReview
  busy?: boolean
  onKeep: () => void
  onRevert: () => void
  className?: string
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, '\n')
}

function splitLines(value: string) {
  return normalizeLineEndings(value).split('\n')
}

function mergeDiffChunks(chunks: DiffChunk[]) {
  const merged: DiffChunk[] = []

  for (const chunk of chunks) {
    if (!chunk.text) {
      continue
    }

    const lastChunk = merged[merged.length - 1]
    if (lastChunk?.kind === chunk.kind) {
      lastChunk.text = `${lastChunk.text}\n${chunk.text}`
      continue
    }

    merged.push({ ...chunk })
  }

  return merged
}

function buildDiffChunks(beforeText: string, afterText: string): DiffChunk[] {
  const beforeLines = splitLines(beforeText)
  const afterLines = splitLines(afterText)

  if (beforeLines.length === 1 && beforeLines[0] === '' && afterLines.length === 1 && afterLines[0] === '') {
    return []
  }

  if (beforeText === afterText) {
    return beforeText ? [{ kind: 'unchanged', text: beforeText }] : []
  }

  // Protect the editor from very large quadratic diffs.
  if (beforeLines.length * afterLines.length > 120000) {
    const fallbackChunks: DiffChunk[] = [
      beforeText ? { kind: 'removed' as const, text: beforeText } : null,
      afterText ? { kind: 'added' as const, text: afterText } : null,
    ].filter(Boolean) as DiffChunk[]

    return mergeDiffChunks(fallbackChunks)
  }

  const lcs: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    Array.from<number>({ length: afterLines.length + 1 }).fill(0),
  )

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? lcs[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(lcs[beforeIndex + 1][afterIndex], lcs[beforeIndex][afterIndex + 1])
    }
  }

  const chunks: DiffChunk[] = []
  let beforeIndex = 0
  let afterIndex = 0

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      chunks.push({
        kind: 'unchanged',
        text: beforeLines[beforeIndex],
      })
      beforeIndex += 1
      afterIndex += 1
      continue
    }

    if (lcs[beforeIndex + 1][afterIndex] >= lcs[beforeIndex][afterIndex + 1]) {
      chunks.push({
        kind: 'removed',
        text: beforeLines[beforeIndex],
      })
      beforeIndex += 1
      continue
    }

    chunks.push({
      kind: 'added',
      text: afterLines[afterIndex],
    })
    afterIndex += 1
  }

  while (beforeIndex < beforeLines.length) {
    chunks.push({
      kind: 'removed',
      text: beforeLines[beforeIndex],
    })
    beforeIndex += 1
  }

  while (afterIndex < afterLines.length) {
    chunks.push({
      kind: 'added',
      text: afterLines[afterIndex],
    })
    afterIndex += 1
  }

  return mergeDiffChunks(chunks)
}

export default function ChapterChangeReview({
  review,
  busy = false,
  onKeep,
  onRevert,
  className,
}: ChapterChangeReviewProps) {
  const diffChunks = useMemo(
    () => buildDiffChunks(review.before?.content ?? '', review.after.content),
    [review.after.content, review.before?.content],
  )

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="mb-4 rounded-[22px] border border-[rgba(15,23,42,0.12)] bg-[rgba(255,255,255,0.82)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">变更已完成，请确认是否采纳</p>
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
              本次没有正文差异，主要调整已体现在当前章节设置中。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
