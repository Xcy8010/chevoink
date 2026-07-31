import type { ReactNode } from 'react'
import { Archive, Clock3, FileText, Globe2, Lock, Trash2, Upload, Users, X } from 'lucide-react'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { cn } from '@/lib/utils'
import type { ChapterStatus } from '../../../../shared/contracts/index.js'
import type { ChapterDraftState } from '../types'
import { InputLabel } from './StudioControls'

type ChapterVisibility = ChapterDraftState['visibility']

const STATUS_OPTIONS: { value: ChapterStatus; label: string; icon: ReactNode }[] = [
  { value: 'draft', label: '草稿', icon: <FileText className="h-3.5 w-3.5" /> },
  { value: 'published', label: '上架', icon: <Upload className="h-3.5 w-3.5" /> },
  { value: 'scheduled', label: '定时', icon: <Clock3 className="h-3.5 w-3.5" /> },
  { value: 'archived', label: '下架', icon: <Archive className="h-3.5 w-3.5" /> },
]

const VISIBILITY_OPTIONS: {
  value: ChapterVisibility
  label: string
  description: string
  icon: ReactNode
}[] = [
  {
    value: 'public',
    label: '公开',
    description: '所有读者都能在作品页阅读本章。',
    icon: <Globe2 className="h-3.5 w-3.5" />,
  },
  {
    value: 'followers',
    label: '关注可见',
    description: '仅关注你的读者可以阅读本章。',
    icon: <Users className="h-3.5 w-3.5" />,
  },
  {
    value: 'private',
    label: '仅自己',
    description: '只有你自己能在创作区查看本章。',
    icon: <Lock className="h-3.5 w-3.5" />,
  },
]

type ChapterSettingsPanelProps = {
  chapterDraft: ChapterDraftState
  onChange: (next: ChapterDraftState) => void
  /** 切换发布状态：由调用方弹确认框并执行 */
  onRequestStatusAction: (next: ChapterStatus) => void
  /** 切换可见范围：由调用方弹确认框并执行 */
  onRequestVisibilityAction: (next: ChapterVisibility) => void
  onRequestDelete: () => void
  onClose: () => void
  /** 遮罩层级：编辑器内 z-40，沉浸区 portal 内 z-[110] */
  overlayClassName?: string
}

/**
 * 章节设置抽屉面板（对齐作品设置的分组卡片样式）：
 * 基本信息 / 发布状态 / 可见范围 / 危险操作 四个分组，编辑器与沉浸创作区共用。
 */
export default function ChapterSettingsPanel({
  chapterDraft,
  onChange,
  onRequestStatusAction,
  onRequestVisibilityAction,
  onRequestDelete,
  onClose,
  overlayClassName,
}: ChapterSettingsPanelProps) {
  return (
    <div
      className={cn('fixed inset-0 bg-[rgba(15,23,42,0.18)]', overlayClassName ?? 'z-40')}
      onClick={onClose}
    >
      <div
        className="absolute inset-y-4 right-4 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-full min-h-0 flex-col p-5">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">章节设置</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                调整当前章节标题、状态、可见范围和摘要。
              </p>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="h-9 w-9 px-0"
              aria-label="关闭章节设置"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {/* 分组一：基本信息 */}
            <section className="space-y-3 rounded-[18px] border border-[var(--border-subtle)] p-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">基本信息</h4>
              <label className="block space-y-2">
                <InputLabel label="章节标题" />
                <TextInput
                  value={chapterDraft.title}
                  onChange={(event) => onChange({ ...chapterDraft, title: event.target.value })}
                  placeholder="例如：第三十七章 失控回环"
                />
              </label>
              <label className="block space-y-2">
                <InputLabel label="章节摘要" hint="补充这一章的目标、节奏或推进重点。" />
                <textarea
                  value={chapterDraft.summary}
                  onChange={(event) => onChange({ ...chapterDraft, summary: event.target.value })}
                  rows={4}
                  className="min-h-[7rem] w-full resize-y overflow-y-auto rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
                  placeholder="补充这一章的目标、节奏或推进重点。"
                />
              </label>
              <p className="text-xs text-[var(--text-secondary)]">
                当前序号：第 {chapterDraft.orderIndex} 章（在左侧目录中拖拽调整顺序）
              </p>
            </section>

            {/* 分组二：发布状态 */}
            <section className="space-y-3 rounded-[18px] border border-[var(--border-subtle)] p-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">发布状态</h4>
              <div className="grid grid-cols-4 gap-2">
                {STATUS_OPTIONS.map((option) => {
                  const active = chapterDraft.status === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (!active) {
                          onRequestStatusAction(option.value)
                        }
                      }}
                      aria-pressed={active}
                      className={cn(
                        'inline-flex items-center justify-center gap-1.5 rounded-[12px] border px-2 py-2 text-xs font-medium transition-colors',
                        active
                          ? 'border-transparent bg-zinc-900 text-white'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                点选目标状态，确认后立即生效；「定时」章节会在设定时间自动上架。
              </p>
            </section>

            {/* 分组三：可见范围 */}
            <section className="space-y-3 rounded-[18px] border border-[var(--border-subtle)] p-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">可见范围</h4>
              <div className="space-y-2">
                {VISIBILITY_OPTIONS.map((option) => {
                  const active = chapterDraft.visibility === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (!active) {
                          onRequestVisibilityAction(option.value)
                        }
                      }}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-[14px] border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-transparent bg-zinc-900 text-white'
                          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 shrink-0',
                          active ? 'text-white' : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {option.icon}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block text-sm font-medium',
                            active ? 'text-white' : 'text-[var(--text-primary)]',
                          )}
                        >
                          {option.label}
                        </span>
                        <span
                          className={cn(
                            'block text-xs leading-5',
                            active ? 'text-white/70' : 'text-[var(--text-secondary)]',
                          )}
                        >
                          {option.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* 分组四：危险操作 */}
            <section className="space-y-3 rounded-[18px] border border-[rgba(190,18,60,0.25)] p-4">
              <h4 className="text-sm font-semibold text-[rgb(153,27,27)]">危险操作</h4>
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                删除章节后正文与摘要无法恢复，请谨慎操作。
              </p>
              <Button
                onClick={onRequestDelete}
                variant="ghost"
                size="sm"
                className="text-[rgb(153,27,27)] hover:bg-[rgba(127,29,29,0.08)] hover:text-[rgb(127,29,29)]"
              >
                <Trash2 className="h-4 w-4" />
                删除章节
              </Button>
            </section>
          </div>

          <div className="mt-4 flex items-center justify-end border-t border-[var(--border-subtle)] pt-4">
            <Button onClick={onClose} variant="secondary">
              完成
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
