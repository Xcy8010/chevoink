import { useEffect, useRef, useState } from 'react'
import { PencilLine, SquarePlus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AgentTaskSidebarItem = {
  id: string
  title: string
  updatedAt: string
  temporary: boolean
  prompt: string
  artifactsCount: number
}

export type AgentConversationRailItem = {
  id: string
  userMessageId: string
  userText: string
  assistantText: string
}

/** 对话很长时保持轨道的节奏感；完整历史仍可在主消息区滚动查看。 */
const MAX_VISIBLE_CONVERSATION_MARKERS = 40
const RAIL_VERTICAL_PADDING = 40
const RAIL_MARKER_FOOTPRINT = 14

export function AgentConversationRail({
  conversations,
  onSelectConversation,
}: {
  conversations: AgentConversationRailItem[]
  onSelectConversation: (messageId: string) => void
}) {
  const rootRef = useRef<HTMLElement | null>(null)
  const [preview, setPreview] = useState<{ conversation: AgentConversationRailItem; top: number } | null>(null)
  // 淡出期间保留最后一次的定位与内容：若让 top 随 preview 置空回落到顶部，
  // 卡片会先瞬移到顶部再淡出，看起来像“往上飞出去”。
  const lastPreviewRef = useRef<{ conversation: AgentConversationRailItem; top: number } | null>(null)
  useEffect(() => {
    if (preview) lastPreviewRef.current = preview
  }, [preview])
  const displayPreview = preview ?? lastPreviewRef.current
  const [railHeight, setRailHeight] = useState(0)
  const maxVisibleMarkers = railHeight
    ? Math.max(8, Math.min(MAX_VISIBLE_CONVERSATION_MARKERS, Math.floor((railHeight - RAIL_VERTICAL_PADDING) / RAIL_MARKER_FOOTPRINT)))
    : MAX_VISIBLE_CONVERSATION_MARKERS
  const visibleConversations = conversations.slice(-maxVisibleMarkers)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const update = () => setRailHeight(root.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const showPreview = (conversation: AgentConversationRailItem, element: HTMLButtonElement) => {
    const root = rootRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const itemRect = element.getBoundingClientRect()
    const top = Math.max(10, Math.min(rootRect.height - 150, itemRect.top - rootRect.top - 54))
    setPreview({ conversation, top })
  }

  return (
    <nav ref={rootRef} className="relative flex h-full w-11 flex-col items-center overflow-visible bg-transparent" aria-label="当前任务聊天记录">
      <div className="flex h-full w-full flex-col items-center justify-center gap-[7px] py-5">
        {visibleConversations.map((conversation, visibleIndex) => {
          const originalIndex = conversations.length - visibleConversations.length + visibleIndex
          const latest = originalIndex === conversations.length - 1
          return <button key={conversation.id} type="button" onClick={() => onSelectConversation(conversation.userMessageId)} onMouseEnter={(event) => showPreview(conversation, event.currentTarget)} onMouseLeave={() => setPreview(null)} onFocus={(event) => showPreview(conversation, event.currentTarget)} onBlur={() => setPreview(null)} className="group flex h-[7px] w-full shrink-0 items-center justify-center" aria-label={`第 ${originalIndex + 1} 轮聊天`} aria-current={latest ? 'location' : undefined}>
            <span className={cn('h-[2px] rounded-full transition-[width,background-color,opacity] duration-200 ease-[cubic-bezier(.22,1,.36,1)]', latest ? 'w-4 bg-[var(--text-primary)] opacity-90' : 'w-2.5 bg-[var(--text-tertiary)] opacity-40 group-hover:w-6 group-hover:bg-[var(--text-secondary)] group-hover:opacity-95 group-focus-visible:w-6 group-focus-visible:opacity-95')} aria-hidden />
          </button>
        })}
      </div>
      <div
        className={cn(
          'pointer-events-none absolute left-[calc(100%+10px)] z-[120] h-[142px] w-80 overflow-hidden rounded-[14px] bg-[var(--surface-contrast)] px-3.5 py-3 text-left text-[var(--text-contrast)] shadow-[0_18px_50px_rgba(15,23,42,0.24)] transition-opacity duration-200 ease-out',
          preview ? 'opacity-100' : 'opacity-0',
        )}
        style={{ top: displayPreview?.top ?? 8 }}
        aria-hidden={!preview}
      >
        <div className="grid h-full grid-rows-2 gap-2">
          <div className="min-h-0 overflow-hidden"><p className="text-[10px] font-medium leading-4 text-white/55">你</p><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-white/90">{displayPreview?.conversation.userText || '（附件或引用）'}</p></div>
          <div className="min-h-0 overflow-hidden border-t border-white/10 pt-1.5"><p className="text-[10px] font-medium leading-4 text-white/55">Agent</p><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-white/80">{displayPreview?.conversation.assistantText || '正在处理这一轮对话…'}</p></div>
        </div>
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
