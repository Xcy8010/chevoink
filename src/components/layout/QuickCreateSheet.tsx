import { Link } from 'react-router-dom'
import { Bot, BookPlus, Send, SquarePen, X } from 'lucide-react'

import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import { quickCreateActions } from '@/types/app'

type QuickCreateSheetProps = {
  open: boolean
  onClose: () => void
}

const actionIcons = [Bot, BookPlus, SquarePen, Send]

export default function QuickCreateSheet({ open, onClose }: QuickCreateSheetProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,23,42,0.24)] px-4 pb-[calc(1rem+var(--safe-bottom))] pt-14 backdrop-blur-[2px] md:items-center md:pt-20">
      <Surface className="w-full max-w-xl" padding="md">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
              快速开始
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">选择一个动作继续</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">保持入口短路径，避免在开始阶段堆叠多余步骤。</p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="h-10 w-10 px-0"
            aria-label="关闭快捷面板"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {quickCreateActions.map((action, index) => {
            const Icon = actionIcons[index]

            return (
              <Link
                key={action.title}
                to={action.href}
                onClick={onClose}
                className="group rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-default)]"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-primary)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{action.title}</p>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{action.description}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </Surface>
    </div>
  )
}
