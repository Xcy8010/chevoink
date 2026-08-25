import { useEffect, useState } from 'react'
import { PencilLine, SquarePlus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

type AgentTaskSidebarItem = {
  id: string
  title: string
  updatedAt: string
  temporary: boolean
  prompt: string
  artifactsCount: number
}

type AgentTaskSidebarProps = {
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
    <aside className="flex h-full w-[220px] shrink-0 flex-col overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--app-bg)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-4 pl-4 pr-12">
        <div>
          <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-secondary)]">任务</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{taskWindows.length} 个对话窗口</p>
        </div>
        <button
          type="button"
          onClick={onCreateTaskWindow}
          disabled={taskSwitchLocked}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="新建任务"
          title="新建任务"
        >
          <SquarePlus className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {taskWindows.map((taskWindow) => {
            const isActiveTaskWindow = taskWindow.id === activeTaskWindowId
            const isEditingTaskWindow = editingTaskWindowId === taskWindow.id
            const hasTaskContent = Boolean(taskWindow.prompt.trim()) || taskWindow.artifactsCount > 0

            return (
              <div
                key={taskWindow.id}
                className={cn(
                  'group/task rounded-[18px] border transition-colors',
                  isActiveTaskWindow
                    ? 'border-[var(--border-strong)] bg-[var(--surface-default)]'
                    : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--surface-default)]/78',
                )}
              >
                <div className="flex items-start gap-2 px-3 py-3">
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
                        className="w-full rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
                      />
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {taskWindow.temporary && !hasTaskContent ? '等待开始' : formatTaskWindowTime(taskWindow.updatedAt)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
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
