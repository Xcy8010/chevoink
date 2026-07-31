import { Upload, WandSparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import Button from '@/components/ui/Button'
import { FIXED_NOVEL_COVER_HEIGHT, FIXED_NOVEL_COVER_WIDTH } from '../../../../shared/contracts/index.js'
import { formatDetailDateTime, type NovelDetailState } from '../useNovelDetailState'

type EditNovelDialogProps = {
  state: NovelDetailState
}

/** 作者自有的作品页编辑弹窗（简介/标签/封面/历史封面） */
export default function EditNovelDialog({ state }: EditNovelDialogProps) {
  const {
    detail,
    detailTitle,
    detailCoverUrl,
    authorName,
    isEditing,
    setIsEditing,
    canEditNovelPage,
    editForm,
    setEditForm,
    coverHistory,
    studioPayloadQuery,
    editNovelMutation,
    uploadCoverMutation,
    applyHistoryCoverMutation,
    handleSelectLocalCover,
    handleDownloadHistoryCover,
    editNovelHref,
    editCoverHref,
  } = state

  if (!canEditNovelPage || !isEditing || !detail) {
    return null
  }

  const busy = editNovelMutation.isPending || uploadCoverMutation.isPending

  return (
    <div className="fixed inset-x-0 top-0 bottom-[var(--keyboard-inset,0px)] z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!busy) {
            setIsEditing(false)
          }
        }}
      />
      <div className="relative z-[1] max-h-full w-full max-w-[1040px] overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-6 shadow-[var(--shadow-modal)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">编辑作品页</h3>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              这里直接维护读者看到的标题、介绍、标签和封面。封面会统一裁成固定书封比例。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            aria-label="关闭编辑"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-4">
            {detailCoverUrl ? (
              <img
                src={detailCoverUrl}
                alt={detailTitle}
                className="aspect-[3/4] w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] object-cover"
              />
            ) : (
              <div className="flex aspect-[3/4] w-full flex-col justify-end rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-5">
                <p className="text-xs text-[var(--text-tertiary)]">{authorName}</p>
                <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{detailTitle}</p>
              </div>
            )}
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-4 text-sm leading-7 text-[var(--text-secondary)]">
              固定书封尺寸：{FIXED_NOVEL_COVER_WIDTH} × {FIXED_NOVEL_COVER_HEIGHT}
            </div>
            <div className="grid gap-2">
              <Button type="button" variant="secondary" onClick={handleSelectLocalCover} disabled={uploadCoverMutation.isPending}>
                <Upload className="h-4 w-4" />
                {uploadCoverMutation.isPending ? '处理中...' : '本地上传封面'}
              </Button>
              <Link
                to={editCoverHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <WandSparkles className="h-4 w-4" />
                去 AI 生成封面
              </Link>
            </div>
            {uploadCoverMutation.isError ? (
              <p className="rounded-[var(--radius-lg)] bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
                {uploadCoverMutation.error instanceof Error ? uploadCoverMutation.error.message : '封面上传失败，请稍后再试。'}
              </p>
            ) : null}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">历史封面</p>
                <p className="text-xs text-[var(--text-tertiary)]">{coverHistory.length} 张</p>
              </div>
              <div className="mt-3 space-y-3">
                {studioPayloadQuery.isLoading ? (
                  <p className="text-sm text-[var(--text-tertiary)]">正在读取历史封面...</p>
                ) : coverHistory.length === 0 ? (
                  <p className="text-sm leading-7 text-[var(--text-tertiary)]">
                    还没有历史封面，上传或生成之后都会沉淀在这里。
                  </p>
                ) : (
                  <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                    {coverHistory.map((asset) => (
                      <div
                        key={asset.id}
                        className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-3"
                      >
                        <div className="flex gap-3">
                          <img
                            src={asset.imageUrl}
                            alt="历史封面"
                            className="aspect-[3/4] w-20 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-2">
                              {detail.novel.coverAssetId === asset.id ? (
                                <span className="rounded-[var(--radius-pill)] bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-medium text-white">
                                  当前封面
                                </span>
                              ) : null}
                              <span className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-tertiary)]">
                                {formatDetailDateTime(asset.createdAt)}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-3 text-xs leading-6 text-[var(--text-tertiary)]">
                              {asset.prompt ?? '这张封面来自历史候选，可直接下载或一键替换。'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => applyHistoryCoverMutation.mutate(asset.id)}
                            disabled={detail.novel.coverAssetId === asset.id || applyHistoryCoverMutation.isPending}
                          >
                            {detail.novel.coverAssetId === asset.id ? '已在使用' : '一键更换'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDownloadHistoryCover(asset.imageUrl, asset.createdAt)}
                          >
                            下载
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid content-start gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">作品标题</span>
              <input
                value={editForm.title}
                onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                className="h-12 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--color-brand)]"
                placeholder="给作品起一个名字"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">展示副标题</span>
              <input
                value={editForm.displayTitle}
                onChange={(event) => setEditForm((current) => ({ ...current, displayTitle: event.target.value }))}
                className="h-12 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--color-brand)]"
                placeholder="一句更适合展示在作品页里的副标题"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">作品介绍</span>
              <textarea
                value={editForm.summary}
                onChange={(event) => setEditForm((current) => ({ ...current, summary: event.target.value }))}
                rows={6}
                className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--color-brand)]"
                placeholder="读者在这里先认识这本书。"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">标签</span>
              <input
                value={editForm.tagsText}
                onChange={(event) => setEditForm((current) => ({ ...current, tagsText: event.target.value }))}
                className="h-12 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--color-brand)]"
                placeholder="用逗号分隔，比如：都市，成长，悬疑"
              />
            </label>
            {editNovelMutation.isError ? (
              <p className="rounded-[var(--radius-lg)] bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
                {editNovelMutation.error instanceof Error ? editNovelMutation.error.message : '保存失败，请稍后再试。'}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsEditing(false)} disabled={editNovelMutation.isPending}>
                取消
              </Button>
              <Link
                to={editNovelHref}
                className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                打开完整作品设置
              </Link>
              <Button type="button" onClick={() => void editNovelMutation.mutateAsync()} disabled={editNovelMutation.isPending}>
                {editNovelMutation.isPending ? '保存中...' : '保存作品页'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
