import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  FileText,
  ListTodo,
  LoaderCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AgentTodoItem } from '../../../../../shared/contracts/index.js'
import type { WorkspaceActivity } from '../agentStore'

/**
 * Agent 任务停靠区（输入框上方）：待办清单 + 工作区变更两个折叠区块。
 * - 默认折叠，仅被触发（agent 更新待办 / 新增变更）时自动展开；用户可点击头部手动开合
 * - 工作区变更头部显示当前任务窗口累计变更数；有待审变更时提供明确的「接受 / 拒绝」操作
 */

function deltaLabel(activity: WorkspaceActivity): string | null {
  if (activity.deltaChars === null || activity.deltaChars === 0) {
    return null
  }
  return activity.deltaChars > 0 ? `+${activity.deltaChars} 字` : `${activity.deltaChars} 字`
}

/**
 * 触发版本递增时自动展开，1.2 秒后自动收起（历史恢复不递增版本，不会误展开）；
 * 连续更新会重置倒计时，在最后一次更新的 1.2 秒后才收起。
 * 返回 cancelAutoCollapse 供用户手动开合时取消挂起的自动收起，避免看着看着被折叠。
 */
function useAutoExpand(version: number, setOpen: (open: boolean) => void) {
  const lastVersionRef = useRef(version)
  const collapseTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (version > lastVersionRef.current) {
      lastVersionRef.current = version
      setOpen(true)
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current)
      }
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null
        setOpen(false)
      }, 1200)
    }
  }, [version, setOpen])

  // 卸载时清理未触发的收起定时器
  useEffect(
    () => () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current)
      }
    },
    [],
  )

  return function cancelAutoCollapse() {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }
}

function SectionHeader({
  open,
  onToggle,
  icon,
  title,
  summary,
  extra,
}: {
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  title: string
  summary: string
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)] transition-transform',
            !open && '-rotate-90',
          )}
        />
        {icon}
        <span className="shrink-0 text-xs font-medium text-[var(--text-primary)]">{title}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-[var(--text-secondary)]">
          {summary}
        </span>
      </button>
      {extra}
    </div>
  )
}

/** 待办清单区块 */
function TodoSection({
  todos,
  todosVersion,
  runActive,
}: {
  todos: AgentTodoItem[]
  todosVersion: number
  runActive: boolean
}) {
  const [open, setOpen] = useState(false)
  const cancelAutoCollapse = useAutoExpand(todosVersion, setOpen)

  if (todos.length === 0) {
    return null
  }

  const completed = todos.filter((item) => item.status === 'completed').length

  return (
    <div className="overflow-hidden border-b border-[var(--border-subtle)] bg-transparent last:border-b-0">
      <SectionHeader
        open={open}
        onToggle={() => {
          cancelAutoCollapse()
          setOpen((current) => !current)
        }}
        icon={<ListTodo className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />}
        title="待办"
        summary={`${completed}/${todos.length} 已完成`}
      />
      {open ? (
        <ul className="max-h-40 overflow-y-auto border-t border-[var(--border-subtle)] py-1">
          {todos.map((item, index) => (
            <li key={`${index}-${item.content}`} className="flex items-start gap-2 px-3 py-1.5 text-xs">
              <span className="mt-0.5 shrink-0">
                {item.status === 'completed' ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-600" />
                ) : item.status === 'in_progress' && runActive ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  // 任务不在运行（已终止/中断）时 in_progress 项不再转圈，避免误导为仍在执行
                  <Circle className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                )}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 leading-5',
                  item.status === 'completed'
                    ? 'text-[var(--text-secondary)] line-through'
                    : item.status === 'in_progress'
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]',
                )}
              >
                {item.content}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 工作区变更区块：头部 n 个变更 + 待审操作，展开显示当前任务窗口全部变更 */
function ChangesSection({
  activities,
  activitiesVersion,
  pendingReviewCount,
  reviewBusy,
  onApproveAllReviews,
  onRejectAllReviews,
}: {
  activities: WorkspaceActivity[]
  activitiesVersion: number
  pendingReviewCount: number
  reviewBusy: boolean
  onApproveAllReviews?: () => void
  onRejectAllReviews?: () => void
}) {
  const [open, setOpen] = useState(false)
  const cancelAutoCollapse = useAutoExpand(activitiesVersion, setOpen)

  // 无变更记录但有待审项（如刷新后仅恢复了审查态）时仍需展示，保证 ✓/✕ 入口可达
  if (activities.length === 0 && pendingReviewCount === 0) {
    return null
  }

  return (
    <div className="overflow-hidden border-b border-[var(--border-subtle)] bg-transparent last:border-b-0">
      <SectionHeader
        open={open}
        onToggle={() => {
          cancelAutoCollapse()
          setOpen((current) => !current)
        }}
        icon={<FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />}
        title="工作区变更"
        summary={`${activities.length} 个变更${pendingReviewCount > 0 ? ` · ${pendingReviewCount} 项待审` : ''}`}
        extra={
          pendingReviewCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onApproveAllReviews}
                disabled={reviewBusy}
                aria-label="接受全部待审变更"
                title="接受全部待审变更"
                className="inline-flex min-h-8 items-center justify-center rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-contrast)] px-2.5 text-[11px] font-medium text-[var(--text-contrast)] transition-all hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reviewBusy ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  '接受'
                )}
              </button>
              <button
                type="button"
                onClick={onRejectAllReviews}
                disabled={reviewBusy}
                aria-label="拒绝全部待审变更"
                title="拒绝全部待审变更"
                className="inline-flex min-h-8 items-center justify-center rounded-[8px] border border-[var(--border-strong)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                拒绝
              </button>
            </span>
          ) : null
        }
      />
      {open ? (
        <ul className="max-h-40 overflow-y-auto border-t border-[var(--border-subtle)]">
          {activities.map((activity) => {
            const delta = deltaLabel(activity)
            const running = activity.status === 'running'

            return (
              <li
                key={activity.callId}
                className={cn(
                  'relative flex items-center gap-2 px-3 py-1.5 text-xs',
                  running && 'overflow-hidden',
                )}
              >
                {running ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 animate-pulse bg-[var(--surface-muted)]/70"
                  />
                ) : null}
                <FileText className="relative h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                <span className="relative min-w-0 flex-1 truncate text-[var(--text-primary)]">
                  {activity.label}
                </span>
                {delta ? (
                  <span
                    className={cn(
                      'relative shrink-0 tabular-nums text-[11px]',
                      (activity.deltaChars ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-500',
                    )}
                  >
                    {delta}
                  </span>
                ) : null}
                <span className="relative shrink-0">
                  {running ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" />
                  ) : activity.status === 'done' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <CircleAlert className="h-3.5 w-3.5 text-rose-500" />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export function AgentActivityBar({
  activities,
  activitiesVersion,
  todos,
  todosVersion,
  runActive,
  pendingReviewCount,
  reviewBusy,
  onApproveAllReviews,
  onRejectAllReviews,
}: {
  activities: WorkspaceActivity[]
  activitiesVersion: number
  todos: AgentTodoItem[]
  todosVersion: number
  runActive: boolean
  pendingReviewCount: number
  reviewBusy: boolean
  onApproveAllReviews?: () => void
  onRejectAllReviews?: () => void
}) {
  if (activities.length === 0 && todos.length === 0 && pendingReviewCount === 0) {
    return null
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <TodoSection todos={todos} todosVersion={todosVersion} runActive={runActive} />
      <ChangesSection
        activities={activities}
        activitiesVersion={activitiesVersion}
        pendingReviewCount={pendingReviewCount}
        reviewBusy={reviewBusy}
        onApproveAllReviews={onApproveAllReviews}
        onRejectAllReviews={onRejectAllReviews}
      />
    </div>
  )
}
