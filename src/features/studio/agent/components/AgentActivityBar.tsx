import { Check, CircleAlert, FileText, LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { WorkspaceActivity } from '../agentStore'

/**
 * 工作区变更条（IDE 文件变更行风格）：
 * - 每条写入活动一行：图标 + 目标名 + 字数增减 + 状态
 * - running 时行内 shimmer 动画，直观表达"Agent 正在写入"
 */

function deltaLabel(activity: WorkspaceActivity): string | null {
  if (activity.deltaChars === null || activity.deltaChars === 0) {
    return null
  }
  return activity.deltaChars > 0 ? `+${activity.deltaChars} 字` : `${activity.deltaChars} 字`
}

export function AgentActivityBar({ activities }: { activities: WorkspaceActivity[] }) {
  if (activities.length === 0) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <p className="border-b border-[var(--border-subtle)] px-3 py-1.5 text-[10px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">
        工作区变更
      </p>
      <ul className="max-h-32 overflow-y-auto">
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
    </div>
  )
}
