import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Copy,
  History,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Sparkles,
  SquarePen,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type {
  AgentExecutionMode,
  AgentSession,
  AgentStreamEvent,
  AgentUIMessage,
  EntityId,
} from '../../../../../shared/contracts/index.js'
import ConfirmDialog from '../../components/ConfirmDialog'

import {
  AgentApiError,
  continueAgentLoopRun,
  deleteAgentSession,
  deleteAgentSessionMessage,
  fetchAgentSessionMessages,
  fetchAgentSessions,
  renameAgentSession,
  resolveAgentApproval,
  resolveAgentQuestion,
  rollbackAgentSessionMessage,
  startAgentLoopRun,
  stopAgentLoopRun,
} from '../agentApi'
import { isRunActive, useAgentStore } from '../agentStore'
import { useAgentStream } from '../useAgentStream'
import { AgentActivityBar } from './AgentActivityBar'
import { AgentComposer } from './AgentComposer'
import { AgentMessageParts } from './AgentMessageParts'
import { AgentPermissionCard } from './AgentPermissionCard'
import { AgentQuestionCard } from './AgentQuestionCard'

/**
 * Agent Loop 主面板（plan/13 §5）：
 * - 消息流由 SSE 事件实时构建，历史通过 /sessions/:id/messages 恢复
 * - 状态栏展示模式/轮次/token；paused/failed 提供"继续"续跑
 */

type AgentPanelProps = {
  /** 未建会话时为 null，首次发送前通过 ensureSession 懒创建 */
  sessionId: EntityId | null
  novelId: EntityId
  chapterId?: EntityId | null
  selection?: { text: string; start?: number; end?: number } | null
  ensureSession: () => Promise<EntityId>
  /** SSE 事件透传：宿主据此同步章节树/编辑器等工作区状态 */
  onStreamEvent?: (event: AgentStreamEvent) => void
  /** 待审查变更总数（正文审查 + 计划审查）：驱动工作区变更头部的 ✓/✕ 一键审查按钮 */
  pendingReviewCount?: number
  reviewBusy?: boolean
  /** ✓ 一键采纳全部待审变更 / ✕ 一键撤回（宿主弹自定义确认框） */
  onApproveAllReviews?: () => void
  onRejectAllReviews?: () => void
  /** 历史任务对话：点击列表项切换会话 */
  onSelectSession?: (sessionId: EntityId) => void
  /** 历史列表删除会话成功后回调：宿主同步移除对应任务窗口，避免僵尸 sessionId 写回本地快照 */
  onSessionDeleted?: (sessionId: EntityId) => void
  /** 新建任务对话：宿主重置 sessionId 为 null（首次发送时懒创建） */
  onNewSession?: () => void
  /** 回退成功后宿主刷新工作区（章节树/编辑器/小说信息） */
  onWorkspaceRollback?: () => void
  onClose?: () => void
  className?: string
}

const phaseLabel: Record<string, string> = {
  starting: '启动中',
  running: '运行中',
  awaiting_approval: '等待确认',
  awaiting_input: '等待回答',
  paused: '已暂停',
  succeeded: '已完成',
  failed: '已失败',
  cancelled: '已取消',
}

/** 提取消息纯文本（复制用） */
function getMessageText(parts: AgentUIMessage['parts']): string {
  return parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function AgentPanel({
  sessionId,
  novelId,
  chapterId,
  selection,
  ensureSession,
  onStreamEvent,
  pendingReviewCount = 0,
  reviewBusy = false,
  onApproveAllReviews,
  onRejectAllReviews,
  onSelectSession,
  onSessionDeleted,
  onNewSession,
  onWorkspaceRollback,
  onClose,
  className,
}: AgentPanelProps) {
  const runId = useAgentStore((state) => state.runId)
  const phase = useAgentStore((state) => state.phase)
  const messages = useAgentStore((state) => state.messages)
  const pendingApproval = useAgentStore((state) => state.pendingApproval)
  const pendingQuestion = useAgentStore((state) => state.pendingQuestion)
  const usage = useAgentStore((state) => state.usage)
  const currentTurn = useAgentStore((state) => state.currentTurn)
  const errorMessage = useAgentStore((state) => state.errorMessage)
  const workspaceActivities = useAgentStore((state) => state.workspaceActivities)
  const activitiesVersion = useAgentStore((state) => state.activitiesVersion)
  const todos = useAgentStore((state) => state.todos)
  const todosVersion = useAgentStore((state) => state.todosVersion)

  const { connect, disconnect } = useAgentStream(onStreamEvent)

  const [mode, setMode] = useState<AgentExecutionMode>('build')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // 历史任务对话列表
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // 消息操作：悬停复制展开删除/回退；移动端长按展开；复制成功短暂打勾
  const [expandedActionsId, setExpandedActionsId] = useState<string | null>(null)
  const [touchActionsId, setTouchActionsId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'deleteMessage'; messageId: string }
    | { kind: 'rollbackMessage'; messageId: string }
    | { kind: 'deleteSession'; sessionId: string; title: string }
    | null
  >(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const longPressTimerRef = useRef<number | null>(null)
  const copyResetTimerRef = useRef<number | null>(null)
  // 懒创建会话：首次发送时 sessionId 从 null 变为新建 id，此时正在流式输出，需跳过历史恢复避免冲掉直播消息
  const lazySessionRef = useRef<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  // 自动跟随开关：用户上滑离开底部后暂停自动滚底（避免运行中回看历史被强制弹回），滚回底部附近自动恢复
  const pinnedToBottomRef = useRef(true)
  const active = isRunActive(phase)

  useEffect(
    () => () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current)
      }
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }
    },
    [],
  )

  // 恢复会话历史（切换会话时重新拉取；新会话尚未创建时直接置空；懒创建触发的 sessionId 变化跳过）
  useEffect(() => {
    if (sessionId && lazySessionRef.current === sessionId) {
      lazySessionRef.current = null
      return
    }

    // 面板重挂载（沉浸切换/路由往返）时：若 store 中仍有本会话的活跃 run，续接 SSE 直播而非重置，
    // 避免冲掉进行中的任务状态（后端 run 独立运行，事件支持 sinceSeq 续传）
    const live = useAgentStore.getState()
    if (live.runId && isRunActive(live.phase) && live.activeSessionId === sessionId) {
      connect(live.runId, live.lastSeq)
      setHistoryLoading(false)
      return
    }

    let cancelled = false
    disconnect()
    useAgentStore.getState().resetRun()

    if (!sessionId) {
      useAgentStore.getState().restoreMessages([])
      setHistoryLoading(false)
      return
    }

    setHistoryLoading(true)
    fetchAgentSessionMessages(sessionId)
      .then(({ messages: history, activeRunId }) => {
        if (cancelled) {
          return
        }
        if (activeRunId) {
          // 服务端仍有本会话进行中的 run（如刷新页面后回来）：
          // 历史里剔除该 run 的助手消息，改由事件重放（seq 0）重建直播与提问/审批卡片
          useAgentStore
            .getState()
            .restoreMessages(
              history.filter((message) => !(message.runId === activeRunId && message.role === 'assistant')),
            )
          useAgentStore.getState().resumeRun(activeRunId, sessionId)
          connect(activeRunId, 0)
        } else {
          useAgentStore.getState().restoreMessages(history)
        }
      })
      .catch(() => {
        if (!cancelled) {
          useAgentStore.getState().restoreMessages([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionId, connect, disconnect])

  // 消息更新自动滚动到底部（仅当用户本就贴底时）；历史载入完成（historyLoading 置回 false）后等一帧再滚，确保消息已完成布局
  useEffect(() => {
    if (historyLoading) {
      return
    }
    const node = scrollRef.current
    if (!node) {
      return
    }
    if (!pinnedToBottomRef.current) {
      return
    }
    const frame = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [messages, pendingApproval, pendingQuestion, historyLoading])

  // 跟踪用户是否贴底：距底部 80px 内视为贴底；程序自动滚底时本就在底部，不会误关
  const handleMessagesScroll = useCallback(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    pinnedToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }, [])

  const handleSend = useCallback(
    async (prompt: string) => {
      setActionError(null)
      try {
        let ensuredSessionId = sessionId
        if (!ensuredSessionId) {
          ensuredSessionId = await ensureSession()
          lazySessionRef.current = ensuredSessionId
        }
        const result = await startAgentLoopRun({
          sessionId: ensuredSessionId,
          novelId,
          chapterId: chapterId ?? null,
          mode,
          prompt,
          selection: selection ?? null,
        })
        useAgentStore.getState().beginRun(result.runId, prompt, ensuredSessionId)
        connect(result.runId)
      } catch (error) {
        // 会话已在服务端被删除（如用户删了历史任务后本地快照残留僵尸 sessionId）：
        // 重置为新对话而不是让用户死循环卡在「会话不存在或无权访问」里
        if (sessionId && error instanceof AgentApiError && error.status === 404 && error.code === 'NOT_FOUND') {
          onNewSession?.()
          setActionError('上个会话已被删除，已为你新建对话，请重新发送。')
          throw error
        }
        setActionError(error instanceof Error ? error.message : '启动失败，请稍后再试。')
        // 抛回输入框：发送失败时保留草稿，避免用户输入丢失
        throw error
      }
    },
    [sessionId, novelId, chapterId, mode, selection, ensureSession, connect, onNewSession],
  )

  const handleStop = useCallback(async () => {
    if (!runId) {
      return
    }
    try {
      await stopAgentLoopRun(runId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '停止失败，请稍后再试。')
    }
  }, [runId])

  const handleContinue = useCallback(async () => {
    if (!runId) {
      return
    }
    setActionError(null)
    try {
      const result = await continueAgentLoopRun(runId)
      useAgentStore.getState().beginRun(result.runId, '请继续完成之前的任务。', sessionId)
      connect(result.runId)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '续跑失败，请稍后再试。')
    }
  }, [runId, sessionId, connect])

  const handleResolveApproval = useCallback(
    async (approved: boolean, alwaysAllow: boolean) => {
      if (!runId || !pendingApproval) {
        return
      }
      try {
        await resolveAgentApproval(runId, {
          callId: pendingApproval.callId,
          approved,
          alwaysAllow,
        })
      } catch (error) {
        setActionError(error instanceof Error ? error.message : '提交失败，请稍后再试。')
      }
    },
    [runId, pendingApproval],
  )

  const handleResolveQuestion = useCallback(
    async (answer: string) => {
      if (!runId || !pendingQuestion) {
        return
      }
      try {
        await resolveAgentQuestion(runId, {
          callId: pendingQuestion.callId,
          answer,
        })
      } catch (error) {
        setActionError(error instanceof Error ? error.message : '提交失败，请稍后再试。')
      }
    },
    [runId, pendingQuestion],
  )

  const lastAssistantId = [...messages].reverse().find((message) => message.role === 'assistant')?.id
  const canContinue = Boolean(runId) && (phase === 'paused' || phase === 'failed')
  const combinedError = actionError ?? errorMessage

  const handleCopyText = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current)
      }
      copyResetTimerRef.current = window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setActionError('复制失败，请手动选择文本复制。')
    }
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // 移动/平板端：长按 500ms 展开复制/删除/回退按钮
  const startLongPress = useCallback(
    (messageId: string) => {
      cancelLongPress()
      longPressTimerRef.current = window.setTimeout(() => {
        setTouchActionsId(messageId)
        setExpandedActionsId(messageId)
      }, 500)
    },
    [cancelLongPress],
  )

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const { items } = await fetchAgentSessions(novelId)
      setSessions(items)
    } catch {
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [novelId])

  const toggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      const next = !open
      if (next) {
        setEditingSessionId(null)
        void loadSessions()
      }
      return next
    })
  }, [loadSessions])

  const commitRename = useCallback(async () => {
    const targetId = editingSessionId
    const title = editingTitle.trim()
    setEditingSessionId(null)
    if (!targetId || !title) {
      return
    }
    try {
      const { session } = await renameAgentSession(targetId, title)
      setSessions((current) => current.map((item) => (item.id === session.id ? session : item)))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '重命名失败，请稍后再试。')
    }
  }, [editingSessionId, editingTitle])

  const reloadMessages = useCallback(async () => {
    if (!sessionId) {
      return
    }
    try {
      const { messages: history } = await fetchAgentSessionMessages(sessionId)
      useAgentStore.getState().restoreMessages(history)
    } catch {
      /* 拉取失败保留现有消息 */
    }
  }, [sessionId])

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) {
      return
    }
    setConfirmBusy(true)
    try {
      if (confirmAction.kind === 'deleteSession') {
        await deleteAgentSession(confirmAction.sessionId)
        setSessions((current) => current.filter((item) => item.id !== confirmAction.sessionId))
        onSessionDeleted?.(confirmAction.sessionId)
        if (confirmAction.sessionId === sessionId) {
          onNewSession?.()
        }
      } else if (sessionId) {
        if (confirmAction.kind === 'deleteMessage') {
          await deleteAgentSessionMessage(sessionId, confirmAction.messageId)
          await reloadMessages()
        } else {
          await rollbackAgentSessionMessage(sessionId, confirmAction.messageId)
          await reloadMessages()
          onWorkspaceRollback?.()
        }
      }
      setConfirmAction(null)
      setTouchActionsId(null)
      setExpandedActionsId(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败，请稍后再试。')
      setConfirmAction(null)
    } finally {
      setConfirmBusy(false)
    }
  }, [confirmAction, sessionId, onSessionDeleted, onNewSession, onWorkspaceRollback, reloadMessages])

  const confirmDialogCopy = confirmAction
    ? confirmAction.kind === 'deleteSession'
      ? {
          title: '删除任务对话',
          description: `将删除「${confirmAction.title}」及其全部对话记录，已写入作品的内容不受影响。`,
          confirmLabel: '删除',
        }
      : confirmAction.kind === 'deleteMessage'
        ? {
            title: '删除这轮对话',
            description: '将删除这条消息与对应的回复记录，已写入作品的内容不会被恢复。',
            confirmLabel: '删除',
          }
        : {
            title: '回退到此对话之前',
            description: '将撤销这轮及之后所有对话对作品的修改，并删除这些对话记录。此操作不可恢复。',
            confirmLabel: '回退',
          }
    : null

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {/* 状态栏 */}
      <div className="relative flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
        <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">Chevoink Agent</span>
        {phase !== 'idle' ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              active
                ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                : phase === 'failed'
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
            )}
          >
            {phaseLabel[phase] ?? phase}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--text-secondary)]">
          {currentTurn > 0 ? `第 ${currentTurn} 轮 · ` : ''}
          {usage.totalTokens > 0 ? `${usage.totalTokens.toLocaleString()} tokens` : ''}
        </span>
        <button
          type="button"
          onClick={toggleHistory}
          className={cn(
            'shrink-0 rounded-md p-1 transition-colors',
            historyOpen
              ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
          aria-label="展开或收起历史任务对话"
          title="历史任务对话"
        >
          <History className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setHistoryOpen(false)
            onNewSession?.()
          }}
          className="shrink-0 rounded-md p-1 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          aria-label="新建任务对话"
          title="新建任务对话"
        >
          <SquarePen className="h-4 w-4" />
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            aria-label="关闭面板"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        {/* 历史任务对话下拉：列表项可切换/重命名/删除 */}
        {historyOpen ? (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
            {sessionsLoading ? (
              <div className="flex items-center gap-2 px-2 py-2 text-xs text-[var(--text-secondary)]">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                正在载入历史任务…
              </div>
            ) : sessions.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--text-secondary)]">还没有历史任务对话</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'group/item flex items-center gap-1 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-muted)]',
                    session.id === sessionId && 'bg-[var(--surface-muted)]',
                  )}
                >
                  {editingSessionId === session.id ? (
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void commitRename()
                        } else if (event.key === 'Escape') {
                          setEditingSessionId(null)
                        }
                      }}
                      maxLength={40}
                      className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryOpen(false)
                        onSelectSession?.(session.id)
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
                        {session.title}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-secondary)]">
                        {formatSessionTime(session.updatedAt)}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSessionId(session.id)
                      setEditingTitle(session.title)
                    }}
                    className="shrink-0 rounded-md p-1 text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)] md:opacity-0 md:group-hover/item:opacity-100"
                    aria-label="编辑名称"
                    title="编辑名称"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({ kind: 'deleteSession', sessionId: session.id, title: session.title })
                    }
                    className="shrink-0 rounded-md p-1 text-[var(--text-secondary)] transition-all hover:text-rose-500 md:opacity-0 md:group-hover/item:opacity-100"
                    aria-label="删除对话"
                    title="删除对话"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} onScroll={handleMessagesScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {historyLoading ? (
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            正在载入对话…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Sparkles className="h-6 w-6 text-[var(--text-secondary)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">让我来帮你推进这本书</p>
            <p className="max-w-[260px] text-xs leading-5 text-[var(--text-secondary)]">
              直接说出你的想法，我会自主阅读上下文、规划并执行——写章节、改设定、做封面都可以。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {messages.map((message) =>
              message.role === 'user' ? (
                <div
                  key={message.id}
                  className="group flex items-center justify-end gap-1.5"
                  onTouchStart={() => startLongPress(message.id)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                >
                  {/* 左侧操作组：hover 显示复制，悬停复制展开删除/回退；移动端长按展开 */}
                  <div
                    className={cn(
                      'flex shrink-0 items-center gap-0.5 transition-opacity',
                      touchActionsId === message.id
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100',
                    )}
                    onMouseEnter={() => setExpandedActionsId(message.id)}
                    onMouseLeave={() => {
                      if (touchActionsId !== message.id) {
                        setExpandedActionsId((current) => (current === message.id ? null : current))
                      }
                    }}
                  >
                    {expandedActionsId === message.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ kind: 'rollbackMessage', messageId: message.id })
                          }
                          disabled={active}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="回退到此对话之前"
                          title="回退到此对话之前"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ kind: 'deleteMessage', messageId: message.id })
                          }
                          disabled={active}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="删除这轮对话"
                          title="删除这轮对话"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleCopyText(message.id, getMessageText(message.parts))}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                      aria-label="复制消息"
                      title="复制"
                    >
                      {copiedId === message.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-[20px] bg-[var(--surface-contrast)] px-4 py-3 text-sm leading-7 text-[var(--text-contrast)]">
                    {message.parts
                      .map((part) => (part.type === 'text' ? part.text : ''))
                      .join('')}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="min-w-0">
                  <AgentMessageParts
                    parts={message.parts}
                    streaming={active && message.id === lastAssistantId}
                  />
                  {/* 最后结论复制：结尾左下角（qoder/Trae 风格），流式进行中不显示 */}
                  {message.id === lastAssistantId && !active && getMessageText(message.parts) ? (
                    <div className="mt-1 flex justify-start">
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyText(message.id, getMessageText(message.parts))
                        }
                        className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                        aria-label="复制回复"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            已复制
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            复制
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              ),
            )}
            {pendingApproval ? (
              <AgentPermissionCard approval={pendingApproval} onResolve={handleResolveApproval} />
            ) : null}
            {pendingQuestion ? (
              <AgentQuestionCard question={pendingQuestion} onAnswer={handleResolveQuestion} />
            ) : null}
            {canContinue ? (
              <div className="flex justify-start">
                <Button size="sm" variant="secondary" onClick={() => void handleContinue()}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  继续执行
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 任务停靠区：待办清单 + 工作区变更（默认折叠，被触发时自动展开；待审时头部提供 ✓/✕ 一键审查） */}
      {workspaceActivities.length > 0 || todos.length > 0 || pendingReviewCount > 0 ? (
        <div className="px-4 pb-2">
          <AgentActivityBar
            activities={workspaceActivities}
            activitiesVersion={activitiesVersion}
            todos={todos}
            todosVersion={todosVersion}
            runActive={active}
            pendingReviewCount={pendingReviewCount}
            reviewBusy={reviewBusy}
            onApproveAllReviews={onApproveAllReviews}
            onRejectAllReviews={onRejectAllReviews}
          />
        </div>
      ) : null}

      {/* 错误提示 */}
      {combinedError ? (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <p className="min-w-0 flex-1 text-xs leading-5 text-rose-600">{combinedError}</p>
          <button
            type="button"
            onClick={() => {
              setActionError(null)
              useAgentStore.getState().clearError()
            }}
            className="shrink-0 text-rose-400 transition-colors hover:text-rose-600"
            aria-label="关闭提示"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* 输入区 */}
      <div className="px-4 pb-4">
        <AgentComposer
          mode={mode}
          running={active}
          disabled={historyLoading}
          onModeChange={setMode}
          onSend={(prompt) => void handleSend(prompt)}
          onStop={() => void handleStop()}
        />
      </div>

      {/* 消息删除/回退、历史对话删除确认 */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmDialogCopy?.title ?? ''}
        description={confirmDialogCopy?.description ?? ''}
        confirmLabel={confirmDialogCopy?.confirmLabel}
        tone="danger"
        busy={confirmBusy}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
