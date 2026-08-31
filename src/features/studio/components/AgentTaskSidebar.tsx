import { useEffect, useRef, useState } from 'react'
import { ChevronRight, PencilLine, SquarePlus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AgentTaskSidebarItem = {
  id: string
  title: string
  updatedAt: string
  temporary: boolean
  prompt: string
  artifactsCount: number
}

export function AgentTaskRail({
  taskWindows,
  activeTaskWindowId,
  taskSwitchLocked,
  onExpand,
  onCreateTaskWindow,
  onSelectTaskWindow,
}: Pick<AgentTaskSidebarProps, 'taskWindows' | 'activeTaskWindowId' | 'taskSwitchLocked' | 'onCreateTaskWindow' | 'onSelectTaskWindow'> & { onExpand: () => void }) {
  const rootRef = useRef<HTMLElement | null>(null)
  const [preview, setPreview] = useState<{ task: AgentTaskSidebarItem; top: number } | null>(null)
  const dense = taskWindows.length > 28
  const veryDense = taskWindows.length > 56

  const showPreview = (task: AgentTaskSidebarItem, element: HTMLButtonElement) => {
    const root = rootRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const itemRect = element.getBoundingClientRect()
    const top = Math.max(8, Math.min(rootRect.height - 94, itemRect.top - rootRect.top - 18))
    setPreview({ task, top })
  }

  return (
    <nav ref={rootRef} className="relative flex h-full w-[54px] flex-col items-center gap-1 overflow-visible py-2" aria-label="任务快捷栏">
      <button type="button" onClick={onExpand} className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label="展开任务区" title="展开任务区">
        <ChevronRight className="h-4 w-4" />
      </button>
      <button type="button" onClick={onCreateTaskWindow} disabled={taskSwitchLocked} className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:opacity-40" aria-label="新建任务" title="新建任务">
        <SquarePlus className="h-4 w-4" />
      </button>
      <div className="my-1 h-px w-6 shrink-0 bg-[var(--border-subtle)]" />
      <div className={cn('flex min-h-0 flex-1 flex-col items-center overflow-y-auto py-2 [scrollbar-width:none]', veryDense ? 'gap-0.5' : dense ? 'gap-1' : 'gap-[7px]')}>
        {taskWindows.map((taskWindow) => {
          const active = taskWindow.id === activeTaskWindowId
          return <button key={taskWindow.id} type="button" onClick={() => onSelectTaskWindow(taskWindow.id)} onMouseEnter={(event) => showPreview(taskWindow, event.currentTarget)} onMouseLeave={() => setPreview(null)} onFocus={(event) => showPreview(taskWindow, event.currentTarget)} onBlur={() => setPreview(null)} disabled={taskSwitchLocked} className={cn('group flex w-9 shrink-0 items-center justify-center disabled:opacity-55', veryDense ? 'h-[3px]' : dense ? 'h-[5px]' : 'h-[7px]')} aria-label={taskWindow.title} aria-current={active ? 'page' : undefined}>
            <span className={cn('h-[2px] rounded-full transition-[width,background-color,opacity] duration-200 ease-out', active ? 'w-4 bg-[var(--text-primary)] opacity-95' : 'w-2.5 bg-[var(--text-tertiary)] opacity-45 group-hover:w-3.5 group-hover:opacity-80')} aria-hidden />
          </button>
        })}
      </div>
      <div
        className={cn(
          'pointer-events-none absolute left-[calc(100%+8px)] z-50 w-64 border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2.5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.14)] transition-[opacity,transform] duration-150 ease-out',
          preview ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0',
        )}
        style={{ top: preview?.top ?? 8 }}
        aria-hidden={!preview}
      >
        <p className="truncate text-xs font-medium text-[var(--text-primary)]">{preview?.task.title}</p>
        <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          {preview?.task.prompt.trim() || (preview?.task.temporary ? '等待开始第一轮对话。' : '打开这轮任务的完整上下文。')}
        </p>
      </div>
    </nav>
  )
}

type AgentTaskSidebarProps = {
  embedded?: boolean
  taskWindows: AgentTaskSidebarItem[]
  activeTaskWindowId: string | null
  taskSwitchLocked: boolean
  fallbackDescription?: string
  onCreateTaskWindow: () => void
  onSelectTaskWindow: (taskWindowId: string) => void
  onRenameTaskWindow: (taskWindowId: string, title: string) => void
  onDeleteTaskWindow: (taskWindowId: string) => void
}

function formatTaskWindowTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function AgentTaskSidebar({
  embedded = false,
  taskWindows,
  activeTaskWindowId,
  taskSwitchLocked,
  fallbackDescription = '查看这轮任务的完整上下文。',
  onCreateTaskWindow,
  onSelectTaskWindow,
  onRenameTaskWindow,
  onDeleteTaskWindow,
}: AgentTaskSidebarProps) {
  const [editingTaskWindowId, setEditingTaskWindowId] = useState<string | null>(null)
  const [editingTaskTitle, setEditingTaskTitle] = useState('')

  useEffect(() => {
    if (!editingTaskWindowId) {
      return
    }

    const editingTaskWindow = taskWindows.find((taskWindow) => taskWindow.id === editingTaskWindowId)
    if (!editingTaskWindow) {
      setEditingTaskWindowId(null)
      setEditingTaskTitle('')
    }
  }, [editingTaskWindowId, taskWindows])

  function handleStartRenameTaskWindow(taskWindowId: string, title: string) {
    setEditingTaskWindowId(taskWindowId)
    setEditingTaskTitle(title)
  }

  function commitTaskWindowRename(taskWindowId: string) {
    const normalizedTitle = editingTaskTitle.trim()
    if (normalizedTitle) {
      onRenameTaskWindow(taskWindowId, normalizedTitle)
    }

    setEditingTaskWindowId(null)
    setEditingTaskTitle('')
  }

  return (
    <aside className={cn('flex min-h-0 flex-col overflow-hidden bg-[var(--app-bg)]', embedded ? 'w-full' : 'h-full w-[220px] shrink-0')}>
      <div className={cn('flex items-center justify-between gap-3', embedded ? 'px-2 pb-1 pt-4' : 'border-b border-[var(--border-subtle)] py-4 pl-4 pr-12')}>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">任务</p>
          {!embedded ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{taskWindows.length} 个对话窗口</p> : null}
        </div>
        <button
          type="button"
          onClick={onCreateTaskWindow}
          disabled={taskSwitchLocked}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="新建任务"
          title="新建任务"
        >
          <SquarePlus className="h-4 w-4" />
        </button>
      </div>
      <div className={cn('min-h-0 px-0.5 py-1', embedded ? '' : 'flex-1 overflow-y-auto px-2 py-2')}>
        <div className="space-y-0.5">
          {taskWindows.map((taskWindow) => {
            const isActiveTaskWindow = taskWindow.id === activeTaskWindowId
            const isEditingTaskWindow = editingTaskWindowId === taskWindow.id
            const hasTaskContent = Boolean(taskWindow.prompt.trim()) || taskWindow.artifactsCount > 0

            return (
              <div
                key={taskWindow.id}
                className={cn(
                  'group/task relative transition-colors',
                  isActiveTaskWindow
                    ? 'bg-[var(--surface-muted)]'
                    : 'hover:bg-[var(--surface-muted)]/70',
                )}
              >
                {isActiveTaskWindow ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-[var(--text-primary)]" /> : null}
                <div className={cn('flex items-start gap-2', embedded ? 'px-2.5 py-2' : 'px-3 py-2.5')}>
                  {isEditingTaskWindow ? (
                    <div className="min-w-0 flex-1">
                      <input
                        value={editingTaskTitle}
                        onChange={(event) => setEditingTaskTitle(event.target.value)}
                        onBlur={() => commitTaskWindowRename(taskWindow.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitTaskWindowRename(taskWindow.id)
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            setEditingTaskWindowId(null)
                            setEditingTaskTitle('')
                          }
                        }}
                        autoFocus
                        maxLength={160}
                        className="w-full border border-[var(--border-subtle)] bg-[var(--surface-default)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
                      />
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {taskWindow.temporary && !hasTaskContent ? '等待开始' : formatTaskWindowTime(taskWindow.updatedAt)}
                      </p>
                      <p className={cn('mt-1 text-xs leading-5 text-[var(--text-secondary)]', embedded ? 'line-clamp-1' : 'line-clamp-2')}>
                        {taskWindow.prompt.trim() ||
                          (taskWindow.temporary ? '开始第一轮对话后，这里会自动生成任务名。' : fallbackDescription)}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectTaskWindow(taskWindow.id)}
                      disabled={taskSwitchLocked}
                      className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{taskWindow.title}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {taskWindow.temporary && !hasTaskContent ? '等待开始' : formatTaskWindowTime(taskWindow.updatedAt)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
                        {taskWindow.prompt.trim() ||
                          (taskWindow.temporary ? '开始第一轮对话后，这里会自动生成任务名。' : fallbackDescription)}
                      </p>
                    </button>
                  )}

                  {!isEditingTaskWindow ? (
                    <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover/task:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleStartRenameTaskWindow(taskWindow.id, taskWindow.title)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)]"
                        aria-label="编辑任务名称"
                        title="编辑任务名称"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTaskWindow(taskWindow.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-default)] hover:text-[#b42318]"
                        aria-label="删除任务"
                        title="删除任务"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
