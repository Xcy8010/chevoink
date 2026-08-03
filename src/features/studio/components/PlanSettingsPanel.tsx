import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { cn } from '@/lib/utils'
import type { WorkspacePlanFile } from '../types'
import { InputLabel } from './StudioControls'

type PlanSettingsPanelProps = {
  plan: WorkspacePlanFile
  onRename: (title: string) => void
  onRequestDelete: () => void
  onClose: () => void
  /** 遮罩层级：编辑器内 z-40，沉浸区 portal 内 z-[110] */
  overlayClassName?: string
}

/**
 * 计划设置抽屉面板（对齐章节设置的分组卡片样式）：
 * 基本信息 / 危险操作两个分组，编辑器与沉浸创作区共用。
 */
export default function PlanSettingsPanel({
  plan,
  onRename,
  onRequestDelete,
  onClose,
  overlayClassName,
}: PlanSettingsPanelProps) {
  // 计划标题在派生时有「创作计划」兜底，直接受控会导致清空输入框时跳字，这里用本地 state 承载
  const [title, setTitle] = useState(plan.title)

  useEffect(() => {
    setTitle(plan.title)
    // 仅在切换计划时同步外部标题，避免输入过程被回写打断
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id])

  const wordCount = plan.content.replace(/\s/g, '').length

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
              <h3 className="text-base font-semibold text-[var(--text-primary)]">计划设置</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                调整这份计划的名称，或从计划文件夹中移除。
              </p>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="h-9 w-9 px-0"
              aria-label="关闭计划设置"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {/* 分组一：基本信息 */}
            <section className="space-y-3 rounded-[18px] border border-[var(--border-subtle)] p-4">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">基本信息</h4>
              <label className="block space-y-2">
                <InputLabel label="计划标题" hint="Agent 读取计划时会按标题定位，建议写清覆盖的章节范围。" />
                <TextInput
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    onRename(event.target.value)
                  }}
                  placeholder="例如：第 21-30 章详细规划"
                />
              </label>
              <p className="text-xs text-[var(--text-secondary)]">
                当前计划正文约 {wordCount} 字（在右侧编辑区直接补充内容）
              </p>
            </section>

            {/* 分组二：危险操作 */}
            <section className="space-y-3 rounded-[18px] border border-[rgba(190,18,60,0.25)] p-4">
              <h4 className="text-sm font-semibold text-[rgb(153,27,27)]">危险操作</h4>
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                删除后这份计划会从计划文件夹移除，Agent 将无法再读取其中的内容。
              </p>
              <Button
                onClick={onRequestDelete}
                variant="ghost"
                size="sm"
                className="text-[rgb(153,27,27)] hover:bg-[rgba(127,29,29,0.08)] hover:text-[rgb(127,29,29)]"
              >
                <Trash2 className="h-4 w-4" />
                删除这份计划
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
