import { Archive, Globe2, Lock, Save, Upload, Users, FileText } from 'lucide-react'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'

import type { NovelFormState } from '../types'
import { ActionCommandButton, InputLabel, ToolShell } from './StudioControls'

type MetaPanelProps = {
  novelForm: NovelFormState
  wordCountLabel: string
  chapterCountLabel: string
  coverLabel: string
  message: string
  saving: boolean
  onChange: (next: NovelFormState) => void
  onRequestVisibilityAction: (nextVisibility: NovelFormState['visibility']) => void
  onRequestStatusAction: (nextStatus: NovelFormState['status']) => void
  onSave: () => void
  onClose: () => void
}

export default function MetaPanel({
  novelForm,
  wordCountLabel,
  chapterCountLabel,
  coverLabel,
  message,
  saving,
  onChange,
  onRequestVisibilityAction,
  onRequestStatusAction,
  onSave,
  onClose,
}: MetaPanelProps) {
  return (
    <ToolShell
      title="作品设置"
      description="集中整理书名、简介、标签与发布方式。"
      actions={
        <Button variant="ghost" size="sm" onClick={onClose}>
          收起
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          <span>{wordCountLabel}</span>
          <span>{chapterCountLabel}</span>
          <span>{coverLabel}</span>
        </div>

        <div className="grid gap-4">
          <label className="space-y-2">
            <InputLabel label="书名" />
            <TextInput
              value={novelForm.title}
              onChange={(event) => onChange({ ...novelForm, title: event.target.value })}
              placeholder="输入作品名称"
            />
          </label>

          <label className="space-y-2">
            <InputLabel label="展示标题" hint="用于详情页展示，可留空。" />
            <TextInput
              value={novelForm.displayTitle}
              onChange={(event) => onChange({ ...novelForm, displayTitle: event.target.value })}
              placeholder="更适合展示的标题"
            />
          </label>

          <label className="space-y-2">
            <InputLabel label="作品简介" />
            <textarea
              value={novelForm.summary}
              onChange={(event) => onChange({ ...novelForm, summary: event.target.value })}
              rows={5}
              className="w-full rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="用几句话说清故事冲突、人物和世界观。"
            />
          </label>

          <label className="space-y-2">
            <InputLabel label="标签" />
            <TextInput
              value={novelForm.tagsText}
              onChange={(event) => onChange({ ...novelForm, tagsText: event.target.value })}
              placeholder="太空歌剧 / 群像 / 悬疑"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <InputLabel label="可见范围操作" hint="点击动作按钮，确认后会自动保存。" />
              <div className="flex flex-wrap gap-2">
                <ActionCommandButton
                  icon={<Lock className="h-4 w-4" />}
                  label="可见范围设置为个人"
                  onClick={() => onRequestVisibilityAction('private')}
                  disabled={saving || novelForm.visibility === 'private'}
                />
                <ActionCommandButton
                  icon={<Users className="h-4 w-4" />}
                  label="可见范围设置为关注可见"
                  onClick={() => onRequestVisibilityAction('followers')}
                  disabled={saving || novelForm.visibility === 'followers'}
                />
                <ActionCommandButton
                  icon={<Globe2 className="h-4 w-4" />}
                  label="可见范围设置为公开"
                  onClick={() => onRequestVisibilityAction('public')}
                  disabled={saving || novelForm.visibility === 'public'}
                />
              </div>
            </div>

            <div className="space-y-2">
              <InputLabel label="发布状态操作" hint="点一次执行一次，确认后自动保存。" />
              <div className="flex flex-wrap gap-2">
                <ActionCommandButton
                  icon={<FileText className="h-4 w-4" />}
                  label="状态设置为草稿"
                  onClick={() => onRequestStatusAction('draft')}
                  disabled={saving || novelForm.status === 'draft'}
                />
                <ActionCommandButton
                  icon={<Upload className="h-4 w-4" />}
                  label="立即上架"
                  onClick={() => onRequestStatusAction('published')}
                  disabled={saving || novelForm.status === 'published'}
                />
                <ActionCommandButton
                  icon={<Archive className="h-4 w-4" />}
                  label="立即下架"
                  onClick={() => onRequestStatusAction('archived')}
                  disabled={saving || novelForm.status === 'archived'}
                  tone="danger"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{message}</p>
          <Button onClick={onSave} disabled={saving} className="w-full justify-center">
            <Save className="h-4 w-4" />
            保存作品设置
          </Button>
        </div>
      </div>
    </ToolShell>
  )
}
