import { BookOpenText, ImagePlus, PanelLeftOpen, Save, Sparkles, Trash2, Upload, WandSparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import type { Novel } from '../../../../shared/contracts/index.js'

import { SaveStatusPill } from './StudioControls'
import WorkspaceNovelSwitcher from './WorkspaceNovelSwitcher'

type StudioToolbarProps = {
  currentNovelId: string
  novelTitle: string
  novelTitleMissing?: boolean
  novelOptions: Novel[]
  chapterTitle: string
  chapterStatusLabel: string
  wordCountLabel: string
  saveState: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  saveMessage: string
  onRetrySave?: () => void
  onOpenMeta: () => void
  onOpenAssistant: () => void
  onOpenCover: () => void
  onEnterImmersive: () => void
  onSaveNovel: () => void
  onPublishNovel: () => void
  onDeleteNovel: () => void
  onSelectNovel: (novelId: string) => void
  onCreateNovel: () => void
  onEditNovelTitle?: () => void
  previewHref?: string
  immersiveDisabled?: boolean
  switchingNovel?: boolean
  novelSaving?: boolean
  novelDirty?: boolean
  novelPublished?: boolean
  novelDeleteDisabled?: boolean
}

export default function StudioToolbar({
  currentNovelId,
  novelTitle,
  novelTitleMissing = false,
  novelOptions,
  chapterTitle,
  chapterStatusLabel,
  wordCountLabel,
  saveState,
  saveMessage,
  onRetrySave,
  onOpenMeta,
  onOpenAssistant,
  onOpenCover,
  onEnterImmersive,
  onSaveNovel,
  onPublishNovel,
  onDeleteNovel,
  onSelectNovel,
  onCreateNovel,
  onEditNovelTitle,
  previewHref,
  immersiveDisabled = false,
  switchingNovel = false,
  novelSaving = false,
  novelDirty = false,
  novelPublished = false,
  novelDeleteDisabled = false,
}: StudioToolbarProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-soft)] md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <WorkspaceNovelSwitcher
              currentNovelId={currentNovelId}
              currentNovelTitle={novelTitle}
              novels={novelOptions}
              busy={switchingNovel}
              onSelectNovel={onSelectNovel}
              onCreateNovel={onCreateNovel}
            />
            <Tag tone="accent">编辑器</Tag>
            <Tag>{wordCountLabel}</Tag>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-[var(--text-secondary)]">{novelTitle}</p>
              {novelTitleMissing && onEditNovelTitle ? (
                <button
                  type="button"
                  onClick={onEditNovelTitle}
                  className="inline-flex h-9 items-center rounded-full bg-[#101114] px-4 text-sm font-medium text-white transition hover:bg-[#17191f]"
                >
                  去命名作品
                </button>
              ) : null}
            </div>
            <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--text-primary)] md:text-2xl">
              {chapterTitle}
            </h1>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[28rem] lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {novelSaving || novelDirty ? (
              <Button variant="secondary" size="sm" onClick={onSaveNovel} disabled={novelSaving}>
                <Save className="h-4 w-4" />
                {novelSaving ? '保存中' : '保存作品'}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={onPublishNovel}
              disabled={novelSaving || novelPublished}
            >
              <Upload className="h-4 w-4" />
              {novelPublished ? '已发布' : '发布'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteNovel}
              disabled={novelSaving || novelDeleteDisabled}
              className="text-[rgb(153,27,27)] hover:bg-[rgba(127,29,29,0.08)] hover:text-[rgb(127,29,29)]"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenMeta}>
              <PanelLeftOpen className="h-4 w-4" />
              设置
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenAssistant} className="xl:hidden">
              <Sparkles className="h-4 w-4" />
              Agent
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenCover}>
              <ImagePlus className="h-4 w-4" />
              封面
            </Button>
            <Button size="sm" onClick={onEnterImmersive} disabled={immersiveDisabled}>
              <WandSparkles className="h-4 w-4" />
              沉浸
            </Button>
            {previewHref ? (
              <Link
                to={previewHref}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-contrast)] px-3 text-sm font-medium text-[var(--text-contrast)] transition hover:bg-[var(--surface-contrast-hover)]"
              >
                <BookOpenText className="h-4 w-4" />
                预览阅读
              </Link>
            ) : null}
          </div>
          <SaveStatusPill state={saveState} message={saveMessage} onRetry={onRetrySave} />
        </div>
      </div>
    </div>
  )
}
