import { Clock3, PenLine } from 'lucide-react'

import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import { formatRelativeTime } from '@/features/community/utils'
import { getDisplayTitle } from '@/features/discover/api'
import type { Novel, ProfileDraftItem } from '../../../../shared/contracts'

type CreationPanelProps = {
  drafts: ProfileDraftItem[]
  novels: Novel[]
  onOpenStudio: () => void
  onOpenNovelStudio: (novelId: string) => void
  onOpenNovel: (novelId: string) => void
}

/** 创作面板：创作中心入口 + 最近草稿 + 作品网格（继续创作） */
export default function CreationPanel({
  drafts,
  novels,
  onOpenStudio,
  onOpenNovelStudio,
  onOpenNovel,
}: CreationPanelProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--color-brand-soft)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <PenLine className="h-4 w-4 text-[var(--color-brand)]" />
          灵感来了就继续写，创作进度会自动保存在草稿里。
        </div>
        <Button size="sm" onClick={onOpenStudio}>
          进入创作中心
        </Button>
      </div>

      {drafts.length > 0 ? (
        <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Clock3 className="h-4 w-4 text-[var(--text-tertiary)]" />
            最近草稿
          </div>
          <div className="mt-4 space-y-3">
            {drafts.slice(0, 3).map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => onOpenNovelStudio(draft.novelId)}
                className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-[var(--surface-default)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-brand-soft)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{draft.title}</span>
                  <span className="mt-1 block truncate text-xs text-[var(--text-tertiary)]">{draft.summary}</span>
                </span>
                <span className="ml-4 shrink-0 text-xs text-[var(--text-tertiary)]">
                  {formatRelativeTime(draft.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {novels.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {novels.map((novel) => (
            <article key={novel.id} className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] p-3">
              {novel.coverUrl ? (
                <img
                  src={novel.coverUrl}
                  alt={getDisplayTitle(novel)}
                  className="aspect-[3/4] w-full rounded-[var(--radius-md)] object-cover"
                />
              ) : (
                <div className="flex aspect-[3/4] w-full flex-col justify-end rounded-[var(--radius-md)] bg-[var(--surface-default)] p-3">
                  <p className="line-clamp-4 text-xs font-medium text-[var(--text-primary)]">{getDisplayTitle(novel)}</p>
                </div>
              )}
              <div className="px-1 pb-1 pt-3">
                <p className="line-clamp-2 text-sm font-medium leading-6 text-[var(--text-primary)]">{getDisplayTitle(novel)}</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {novel.chapterCount} 章 · {novel.wordCount} 字
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onOpenNovel(novel.id)}>
                    查看
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => onOpenNovelStudio(novel.id)}>
                    继续写
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <AppState
          tone="empty"
          title="你还没有创作内容"
          description="从创作中心开始第一部作品，这里会同步展示你的作品和草稿。"
          primaryAction={{ label: '开始创作', onClick: onOpenStudio }}
          className="min-h-[280px]"
        />
      )}
    </div>
  )
}
