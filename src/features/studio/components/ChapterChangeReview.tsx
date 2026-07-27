import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { ChapterPendingReview } from '../types'
import { buildReviewDiff, type ReviewDiffSegment } from './diff'

type ChapterChangeReviewProps = {
  review: ChapterPendingReview
  busy?: boolean
  /** 浮动审查条「采纳」：保留整章全部变更 */
  onKeep: () => void
  /** 浮动审查条「拒绝」：撤销整章全部变更（上游负责自定义弹窗确认） */
  onRevert: () => void
  /** 块级 ✓：仅采纳这一处变更块 */
  onAcceptHunk?: (hunkIndex: number) => void
  /** 块级 ✕：仅撤回这一处变更块（上游负责自定义弹窗确认） */
  onRejectHunk?: (hunkIndex: number) => void
  /** 待审文件序号（1 基）与总数，用于审查条「文件 x/y」多章导航 */
  fileIndex?: number
  fileCount?: number
  onNavigateFile?: (offset: 1 | -1) => void
  className?: string
}

/** 把 diff 片段按 hunk 分组成渲染块：未变更片段独立成块，同一 hunk 的红/绿片段合成一块并挂块级定夺按钮 */
type RenderBlock = {
  hunkIndex: number | null
  segments: ReviewDiffSegment[]
}

function groupSegments(segments: ReviewDiffSegment[]): RenderBlock[] {
  const blocks: RenderBlock[] = []
  for (const segment of segments) {
    const lastBlock = blocks[blocks.length - 1]
    if (lastBlock && lastBlock.hunkIndex === segment.hunkIndex) {
      lastBlock.segments.push(segment)
      continue
    }
    blocks.push({ hunkIndex: segment.hunkIndex, segments: [segment] })
  }
  return blocks
}

export default function ChapterChangeReview({
  review,
  busy = false,
  onKeep,
  onRevert,
  onAcceptHunk,
  onRejectHunk,
  fileIndex = 1,
  fileCount = 1,
  onNavigateFile,
  className,
}: ChapterChangeReviewProps) {
  const { segments, hunkCount } = useMemo(
    () => buildReviewDiff(review.before?.content ?? '', review.after.content),
    [review.after.content, review.before?.content],
  )
  const blocks = useMemo(() => groupSegments(segments), [segments])

  const [activeHunk, setActiveHunk] = useState(0)
  const hunkRefs = useRef<Array<HTMLDivElement | null>>([])

  // 块数因逐块定夺而减少时，把当前焦点块收回到有效范围
  useEffect(() => {
    setActiveHunk((current) => Math.min(current, Math.max(hunkCount - 1, 0)))
  }, [hunkCount])

  function focusHunk(nextIndex: number) {
    if (hunkCount === 0) {
      return
    }
    const clamped = ((nextIndex % hunkCount) + hunkCount) % hunkCount
    setActiveHunk(clamped)
    hunkRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // IDE 式快捷键：Ctrl+Enter 采纳整章、Ctrl+Backspace 拒绝整章（桌面端）；
  // 焦点在输入框（如 Agent 对话框）时忽略，避免打字时误触
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || busy) {
        return
      }
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        onKeep()
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        onRevert()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [busy, onKeep, onRevert])

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-5 py-5 pb-24">
        <div className="border-b border-[var(--border-subtle)] pb-4">
          <p className="text-lg font-semibold tracking-[0.01em] text-[var(--text-primary)]">
            {review.after.title.trim() || `第 ${review.after.orderIndex} 章`}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
            {review.description} · 绿色背景为新增、红色背景为删除，可逐块或整章定夺。
          </p>
        </div>

        <div className="mt-4 text-sm leading-8 text-[var(--text-primary)]">
          {blocks.map((block, blockIndex) => {
            if (block.hunkIndex === null) {
              return (
                <div key={`plain-${blockIndex}`} className="whitespace-pre-wrap break-words">
                  {block.segments.map((segment) => segment.text).join('\n') || '\u00A0'}
                </div>
              )
            }

            const hunkIndex = block.hunkIndex
            return (
              <div
                key={`hunk-${blockIndex}`}
                ref={(element) => {
                  hunkRefs.current[hunkIndex] = element
                }}
                className={cn(
                  'relative my-1 rounded-[10px]',
                  activeHunk === hunkIndex && 'ring-1 ring-[rgba(15,23,42,0.30)]',
                )}
              >
                {block.segments.map((segment, segmentIndex) =>
                  segment.kind === 'removed' && segment.text === '' ? null : (
                    <div
                      key={`seg-${segmentIndex}`}
                      className={cn(
                        'whitespace-pre-wrap break-words rounded-[6px] px-1',
                        segment.kind === 'added' && 'bg-[rgba(34,197,94,0.16)]',
                        segment.kind === 'removed' && 'bg-[rgba(239,68,68,0.16)]',
                      )}
                    >
                      {segment.text || '\u00A0'}
                    </div>
                  ),
                )}
                {/* 块级定夺：片段右下角 ✕ 撤回（弹窗确认）/ ✓ 采纳 */}
                <div className="absolute -bottom-3 right-2 z-10 flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-default)] px-1.5 py-1 shadow-md">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHunk(hunkIndex)
                      onRejectHunk?.(hunkIndex)
                    }}
                    disabled={busy}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
                    aria-label="撤回这一处变更"
                    title="撤回这一处变更"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHunk(hunkIndex)
                      onAcceptHunk?.(hunkIndex)
                    }}
                    disabled={busy}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                    aria-label="采纳这一处变更"
                    title="采纳这一处变更"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* IDE 式浮动审查条：块导航 / 整章拒绝·采纳 / 多文件切换（自适应换行，兼容手机与平板） */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[14px] border border-[rgba(24,24,27,0.5)] bg-[rgba(24,24,27,0.94)] px-2 py-1.5 text-xs text-zinc-100 shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={() => focusHunk(activeHunk - 1)}
            disabled={hunkCount === 0}
            className="flex h-7 w-7 items-center justify-center rounded-[8px] transition hover:bg-zinc-700/70 disabled:opacity-40"
            aria-label="上一处变更"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[2.6rem] text-center tabular-nums text-zinc-300">
            {hunkCount === 0 ? '0 / 0' : `${activeHunk + 1} / ${hunkCount}`}
          </span>
          <button
            type="button"
            onClick={() => focusHunk(activeHunk + 1)}
            disabled={hunkCount === 0}
            className="flex h-7 w-7 items-center justify-center rounded-[8px] transition hover:bg-zinc-700/70 disabled:opacity-40"
            aria-label="下一处变更"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-4 w-px bg-zinc-700" />

          <button
            type="button"
            onClick={onRevert}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-[8px] px-2 transition hover:bg-zinc-700/70 disabled:opacity-50"
          >
            拒绝
            <span className="hidden text-[10px] text-zinc-500 md:inline">Ctrl+Backspace</span>
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={busy}
            className="flex h-7 items-center gap-1 rounded-[8px] bg-zinc-100 px-2 font-medium text-zinc-900 transition hover:bg-white disabled:opacity-50"
          >
            采纳
            <span className="hidden text-[10px] text-zinc-500 md:inline">Ctrl+Enter</span>
          </button>

          {fileCount > 1 && onNavigateFile ? (
            <>
              <span className="mx-1 h-4 w-px bg-zinc-700" />
              <button
                type="button"
                onClick={() => onNavigateFile(-1)}
                disabled={busy}
                className="flex h-7 w-7 items-center justify-center rounded-[8px] transition hover:bg-zinc-700/70 disabled:opacity-50"
                aria-label="上一个待审文件"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="whitespace-nowrap text-zinc-300">
                文件 {fileIndex} / {fileCount}
              </span>
              <button
                type="button"
                onClick={() => onNavigateFile(1)}
                disabled={busy}
                className="flex h-7 w-7 items-center justify-center rounded-[8px] transition hover:bg-zinc-700/70 disabled:opacity-50"
                aria-label="下一个待审文件"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** 当前章节已定夺完毕、但还有其它章节待审时的浮动跳转入口（图三样式） */
export function NextReviewFilePill({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) {
  if (count <= 0) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto flex items-center gap-1 rounded-[14px] border border-[rgba(24,24,27,0.5)] bg-[rgba(24,24,27,0.94)] px-3 py-1.5 text-xs text-zinc-100 shadow-xl backdrop-blur transition hover:bg-zinc-800"
      >
        下一个文件
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
