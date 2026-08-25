import type { ReactNode } from 'react'

import { BookOpenText, BrainCircuit, FileClock, GitCompareArrows } from 'lucide-react'

type WorkPerspectiveProps = {
  taskRail: ReactNode
  conversation: ReactNode
  novelTitle: string
  chapterTitle: string
  chapterCount: number
  wordCount: string
  pendingReviewCount: number
  activeArtifactTitle?: string | null
  onOpenIde: () => void
  onOpenMemoryReview?: () => void
}

/** Agent-first 工作台：对话是主表面，任务与证据只占窄侧栏，不嵌套卡片容器。 */
export default function WorkPerspective({
  taskRail,
  conversation,
  novelTitle,
  chapterTitle,
  chapterCount,
  wordCount,
  pendingReviewCount,
  activeArtifactTitle,
  onOpenIde,
  onOpenMemoryReview,
}: WorkPerspectiveProps) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[15rem_minmax(0,1fr)_17rem] overflow-hidden border-y border-[var(--border-subtle)] bg-[var(--surface-default)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
      <aside className="min-h-0 overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--app-bg)]">
        {taskRail}
      </aside>
      <main className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden">
        {conversation}
      </main>
      <aside className="min-h-0 overflow-y-auto border-l border-[var(--border-subtle)] px-5 py-5">
        <div className="space-y-6">
          <section>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">当前上下文</p>
            <h2 className="mt-2 text-base font-semibold text-[var(--text-primary)]">{novelTitle}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{chapterTitle}</p>
            <p className="mt-2 text-xs tabular-nums text-[var(--text-tertiary)]">{chapterCount} 章 · {wordCount}</p>
          </section>
          <section className="border-t border-[var(--border-subtle)] pt-4">
            <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <GitCompareArrows className="h-4 w-4 text-[var(--text-secondary)]" />
              {pendingReviewCount > 0 ? `${pendingReviewCount} 项变更待审` : '没有待审变更'}
            </div>
            {activeArtifactTitle ? (
              <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                <FileClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{activeArtifactTitle}</span>
              </div>
            ) : null}
          </section>
          {onOpenMemoryReview ? <button
            type="button"
            onClick={onOpenMemoryReview}
            className="inline-flex w-full items-center gap-2 border-t border-[var(--border-subtle)] px-2 pt-4 text-sm text-[var(--text-primary)] transition-opacity hover:opacity-65"
          >
            <BrainCircuit className="h-4 w-4" />
            查看记忆与冲突
          </button> : null}
          <button
            type="button"
            onClick={onOpenIde}
            className="inline-flex w-full items-center justify-center gap-2 border-t border-[var(--border-subtle)] px-2 pt-4 text-sm font-medium text-[var(--text-primary)] transition-opacity hover:opacity-65"
          >
            <BookOpenText className="h-4 w-4" />
            在 IDE 中打开正文
          </button>
        </div>
      </aside>
    </div>
  )
}
