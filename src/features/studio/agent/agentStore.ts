import { create } from 'zustand'

import type {
  AgentAttachmentMeta,
  AgentMessagePart,
  AgentStreamEvent,
  AgentTodoItem,
  AgentTokenUsage,
  AgentUIMessage,
} from '../../../../shared/contracts/index.js'

/**
 * Agent Loop 前端状态（plan/13 §5）：
 * - messages 由 SSE 事件流实时构建（parts 结构），历史用 /sessions/:id/messages 恢复
 * - lastSeq 用于断线重连（Last-Event-ID）
 */

export type AgentRunPhase =
  | 'idle'
  | 'starting'
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_input'
  | 'paused'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type PendingApproval = {
  callId: string
  toolName: string
  title: string
  args: unknown
  allowAlways: boolean
  expiresAt: string
}

/** ask_user 工具挂起中的提问，驱动专门的提问卡片 UI */
export type PendingQuestion = {
  callId: string
  question: string
  options: Array<{ label: string; detail?: string }>
}

/** 从 ask_user 的 tool.call args 中防御性解析提问内容 */
function parseQuestionArgs(callId: string, args: unknown): PendingQuestion | null {
  if (!args || typeof args !== 'object') {
    return null
  }
  const payload = args as { question?: unknown; options?: unknown }
  if (typeof payload.question !== 'string' || !payload.question.trim()) {
    return null
  }
  const options = Array.isArray(payload.options)
    ? payload.options
        .filter((option): option is { label: string; detail?: string } =>
          Boolean(option && typeof option === 'object' && typeof (option as { label?: unknown }).label === 'string'),
        )
        .map((option) => ({
          label: option.label,
          detail: typeof option.detail === 'string' ? option.detail : undefined,
        }))
    : []
  return { callId, question: payload.question, options }
}

/** 本次 run 对工作区（章节/作品）的写入活动，驱动变更条 UI 与动效 */
export type WorkspaceActivity = {
  callId: string
  toolName: string
  label: string
  chapterId: string | null
  deltaChars: number | null
  status: 'running' | 'done' | 'failed'
}

/** 会对工作区（章节树/正文/作品信息）产生写入的工具集合 */
export const WORKSPACE_WRITE_TOOLS = new Set([
  'chapter_create',
  'chapter_write',
  'chapter_append',
  'chapter_edit_range',
  'chapter_rename',
  'novel_rename',
  'novel_update_meta',
  'cover_prompt_set',
  'cover_apply',
  'novel_publish',
  'novel_archive',
  'novel_delete',
])

const WRITE_TOOL_LABELS: Record<string, string> = {
  chapter_create: '新建章节',
  chapter_write: '写入正文',
  chapter_append: '追加正文',
  chapter_edit_range: '改写片段',
  chapter_rename: '重命名章节',
  novel_rename: '重命名作品',
  novel_update_meta: '更新作品设置',
  cover_prompt_set: '设置封面描述',
  cover_apply: '应用封面',
  novel_publish: '发布作品',
  novel_archive: '下架作品',
  novel_delete: '删除作品',
}

type AgentStoreState = {
  runId: string | null
  phase: AgentRunPhase
  agentTitle: string
  messages: AgentUIMessage[]
  pendingApproval: PendingApproval | null
  pendingQuestion: PendingQuestion | null
  usage: AgentTokenUsage
  currentTurn: number
  lastSeq: number
  outputSummary: string
  errorMessage: string | null
  /** 当前 run 所属会话：面板重挂载（沉浸切换/路由往返）时用于判断能否续接直播而非重置 */
  activeSessionId: string | null
  /** 输入框草稿：提升到全局 store，避免面板重挂载时丢失未发送内容 */
  composerDraft: string
  /** 输入框附件（已上传成功的元数据）：同草稿提升全局，沉浸/普通视图重挂载不丢 */
  composerAttachments: AgentAttachmentMeta[]
  /** 正在上传中的附件数量：上传完成前禁止发送 */
  composerUploading: number
  /** 自动追踪：Agent 写入章节时编辑器自动跳转到对应正文（默认开启） */
  autoFollow: boolean
  /** 当前任务窗口（会话）累计的工作区写入活动（变更区） */
  workspaceActivities: WorkspaceActivity[]
  /** 工作区变更触发版本：仅 live 事件递增，驱动变更区自动展开（历史恢复不触发） */
  activitiesVersion: number
  /** 当前会话的任务待办清单（todo_write 全量维护） */
  todos: AgentTodoItem[]
  /** 待办触发版本：仅 live 事件递增，驱动待办区自动展开（历史恢复不触发） */
  todosVersion: number
  /** 事件 reducer：live 与 replay 共用同一构建逻辑 */
  applyEvent: (event: AgentStreamEvent) => void
  beginRun: (runId: string, userPrompt: string, sessionId: string | null, attachments?: AgentAttachmentMeta[]) => void
  /** 续接服务端仍在进行的 run（刷新后恢复）：不追加用户消息，从 seq 0 重放事件重建直播 */
  resumeRun: (runId: string, sessionId: string | null) => void
  restoreMessages: (messages: AgentUIMessage[]) => void
  resetRun: () => void
  clearError: () => void
  setComposerDraft: (value: string) => void
  setComposerAttachments: (list: AgentAttachmentMeta[]) => void
  addComposerAttachment: (meta: AgentAttachmentMeta) => void
  removeComposerAttachment: (id: string) => void
  bumpComposerUploading: (delta: number) => void
  setAutoFollow: (value: boolean) => void
}

const emptyUsage: AgentTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

// 自动追踪开关持久化：刷新/重开页面后保持用户上次的选择（默认开启）
const AUTO_FOLLOW_STORAGE_KEY = 'chevoink-agent-auto-follow'

function readStoredAutoFollow(): boolean {
  try {
    return window.localStorage.getItem(AUTO_FOLLOW_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

function writeStoredAutoFollow(value: boolean) {
  try {
    window.localStorage.setItem(AUTO_FOLLOW_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // localStorage 不可用时降级为会话内开关
  }
}

/** 从工具事件提取变更条所需的章节/字数信息 */
function activityFromDisplay(display: unknown): { label: string | null; chapterId: string | null; deltaChars: number | null } {
  if (display && typeof display === 'object' && 'kind' in display) {
    const payload = display as { kind: string; [key: string]: unknown }
    if (payload.kind === 'chapterDiff') {
      const before = typeof payload.before === 'string' ? payload.before : ''
      const after = typeof payload.after === 'string' ? payload.after : ''
      return {
        label: typeof payload.chapterTitle === 'string' ? payload.chapterTitle : null,
        chapterId: typeof payload.chapterId === 'string' ? payload.chapterId : null,
        deltaChars: after.length - before.length,
      }
    }
    if (payload.kind === 'chapterRef') {
      return {
        label: typeof payload.title === 'string' ? payload.title : null,
        chapterId: typeof payload.chapterId === 'string' ? payload.chapterId : null,
        deltaChars: typeof payload.wordCount === 'number' && payload.wordCount > 0 ? payload.wordCount : null,
      }
    }
  }
  return { label: null, chapterId: null, deltaChars: null }
}

/** 从历史消息的工具轨迹推导会话级的工作区变更与待办清单（刷新/切换会话后恢复） */
function deriveSessionStateFromMessages(messages: AgentUIMessage[]): {
  workspaceActivities: WorkspaceActivity[]
  todos: AgentTodoItem[]
} {
  const workspaceActivities: WorkspaceActivity[] = []
  let todos: AgentTodoItem[] = []

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'tool-call') {
        continue
      }
      if (part.display?.kind === 'todoList') {
        todos = part.display.items
      }
      if (!WORKSPACE_WRITE_TOOLS.has(part.toolName)) {
        continue
      }
      const extracted = activityFromDisplay(part.display)
      workspaceActivities.push({
        callId: part.callId,
        toolName: part.toolName,
        label: extracted.label ?? WRITE_TOOL_LABELS[part.toolName] ?? part.title,
        chapterId: extracted.chapterId,
        deltaChars: extracted.deltaChars,
        status: part.status === 'failed' ? 'failed' : 'done',
      })
    }
  }

  return { workspaceActivities, todos }
}

function updateMessageParts(
  messages: AgentUIMessage[],
  messageId: string,
  update: (parts: AgentMessagePart[]) => AgentMessagePart[],
): AgentUIMessage[] {
  return messages.map((message) =>
    message.id === messageId ? { ...message, parts: update(message.parts) } : message,
  )
}

/** 追加流式 delta：最后一个同类 part 存在则拼接，否则新建 */
function appendDelta(
  parts: AgentMessagePart[],
  type: 'text' | 'reasoning',
  delta: string,
): AgentMessagePart[] {
  const last = parts[parts.length - 1]

  if (last && last.type === type) {
    return [...parts.slice(0, -1), { ...last, text: last.text + delta }]
  }

  return [...parts, { type, text: delta }]
}

/** 任务停止/结束后把仍处于「执行中」的工具卡片就地收尾：
 * 被中止的工具永远收不到 tool.result 事件，不收尾会导致卡片无限转圈 */
function settleRunningToolParts(messages: AgentUIMessage[], summary: string): AgentUIMessage[] {
  return messages.map((message) => {
    if (!message.parts.some((part) => part.type === 'tool-call' && part.status === 'running')) {
      return message
    }
    return {
      ...message,
      parts: message.parts.map((part) =>
        part.type === 'tool-call' && part.status === 'running'
          ? { ...part, status: 'failed' as const, summary }
          : part,
      ),
    }
  })
}

/** 同步收尾变更区里还在转圈的写入活动 */
function settleRunningActivities(activities: WorkspaceActivity[]): WorkspaceActivity[] {
  return activities.map((activity) =>
    activity.status === 'running' ? { ...activity, status: 'failed' as const } : activity,
  )
}

export const useAgentStore = create<AgentStoreState>((set) => ({
  runId: null,
  phase: 'idle',
  agentTitle: '写作主控',
  messages: [],
  pendingApproval: null,
  pendingQuestion: null,
  usage: emptyUsage,
  currentTurn: 0,
  lastSeq: 0,
  outputSummary: '',
  errorMessage: null,
  activeSessionId: null,
  composerDraft: '',
  composerAttachments: [],
  composerUploading: 0,
  autoFollow: readStoredAutoFollow(),
  workspaceActivities: [],
  activitiesVersion: 0,
  todos: [],
  todosVersion: 0,

  beginRun: (runId, userPrompt, sessionId, attachments) =>
    set((state) => ({
      runId,
      phase: 'starting',
      activeSessionId: sessionId,
      pendingApproval: null,
      pendingQuestion: null,
      usage: emptyUsage,
      currentTurn: 0,
      lastSeq: 0,
      outputSummary: '',
      errorMessage: null,
      // 工作区变更与待办按任务窗口（会话）累计，新 run 不清空；
      // 上一个任务若被停止后遗留了「执行中」的工具卡片（终态事件丢失时），开新任务前一并收尾
      workspaceActivities: settleRunningActivities(state.workspaceActivities),
      messages: [
        ...settleRunningToolParts(state.messages, '已停止'),
        {
          id: `local-${Date.now()}`,
          runId,
          role: 'user',
          // 附件随提示词一起发送：本地用户消息即时回显附件 part
          parts: [
            { type: 'text', text: userPrompt },
            ...(attachments ?? []).map((attachment) => ({
              type: 'attachment' as const,
              kind: attachment.kind,
              name: attachment.name,
              url: attachment.url,
              size: attachment.size,
            })),
          ],
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  resumeRun: (runId, sessionId) =>
    set({
      runId,
      phase: 'starting',
      activeSessionId: sessionId,
      pendingApproval: null,
      pendingQuestion: null,
      usage: emptyUsage,
      currentTurn: 0,
      lastSeq: 0,
      outputSummary: '',
      errorMessage: null,
      // 不清空变更/待办：历史部分由 restoreMessages 推导，活跃 run 部分由事件重放按 callId 去重补齐
    }),

  restoreMessages: (messages) =>
    set({
      messages,
      phase: 'idle',
      runId: null,
      activeSessionId: null,
      pendingApproval: null,
      pendingQuestion: null,
      errorMessage: null,
      // 从历史工具轨迹恢复会话级变更与待办；不递增触发版本，避免历史恢复误自动展开
      ...deriveSessionStateFromMessages(messages),
    }),

  resetRun: () =>
    set({
      runId: null,
      phase: 'idle',
      activeSessionId: null,
      pendingApproval: null,
      pendingQuestion: null,
      usage: emptyUsage,
      currentTurn: 0,
      lastSeq: 0,
      outputSummary: '',
      errorMessage: null,
      workspaceActivities: [],
      todos: [],
    }),

  clearError: () => set({ errorMessage: null }),

  setComposerDraft: (value) => set({ composerDraft: value }),

  setComposerAttachments: (list) => set({ composerAttachments: list }),

  addComposerAttachment: (meta) =>
    set((state) => ({ composerAttachments: [...state.composerAttachments, meta] })),

  removeComposerAttachment: (id) =>
    set((state) => ({
      composerAttachments: state.composerAttachments.filter((attachment) => attachment.id !== id),
    })),

  bumpComposerUploading: (delta) =>
    set((state) => ({ composerUploading: Math.max(0, state.composerUploading + delta) })),

  setAutoFollow: (value) => {
    writeStoredAutoFollow(value)
    set({ autoFollow: value })
  },

  applyEvent: (event) =>
    set((state) => {
      // 重放/重连去重：只接受更新的 seq
      if (event.seq <= state.lastSeq && event.runId === state.runId) {
        return {}
      }

      const base = { lastSeq: event.seq }

      switch (event.type) {
        case 'run.started':
          return { ...base, phase: 'running', agentTitle: event.agent.title }

        case 'message.start':
          return {
            ...base,
            messages: [
              ...state.messages,
              {
                id: event.messageId,
                runId: event.runId,
                role: 'assistant',
                parts: [],
                createdAt: event.ts,
              },
            ],
          }

        case 'text.delta':
          return {
            ...base,
            messages: updateMessageParts(state.messages, event.messageId, (parts) =>
              appendDelta(parts, 'text', event.delta),
            ),
          }

        case 'reasoning.delta':
          return {
            ...base,
            messages: updateMessageParts(state.messages, event.messageId, (parts) =>
              appendDelta(parts, 'reasoning', event.delta),
            ),
          }

        case 'tool.call': {
          const isWrite = WORKSPACE_WRITE_TOOLS.has(event.toolName)
          const question = event.toolName === 'ask_user' ? parseQuestionArgs(event.callId, event.args) : null
          // 同一 callId 可能先收到参数生成中的预告事件（args 为 null），再收到执行时的正式事件：按 callId upsert 保证只有一张卡片
          const existingActivity = state.workspaceActivities.some((activity) => activity.callId === event.callId)
          return {
            ...base,
            ...(question ? { phase: 'awaiting_input' as const, pendingQuestion: question } : {}),
            ...(isWrite && !existingActivity
              ? {
                  activitiesVersion: state.activitiesVersion + 1,
                  workspaceActivities: [
                    ...state.workspaceActivities,
                    {
                      callId: event.callId,
                      toolName: event.toolName,
                      label: WRITE_TOOL_LABELS[event.toolName] ?? event.title,
                      chapterId: null,
                      deltaChars: null,
                      status: 'running' as const,
                    },
                  ],
                }
              : {}),
            messages: updateMessageParts(state.messages, event.messageId, (parts) => {
              const index = parts.findIndex((part) => part.type === 'tool-call' && part.callId === event.callId)
              if (index >= 0) {
                return parts.map((part, at) =>
                  at === index && part.type === 'tool-call'
                    ? {
                        ...part,
                        toolName: event.toolName,
                        title: event.title,
                        args: event.args ?? part.args,
                      }
                    : part,
                )
              }
              return [
                ...parts,
                {
                  type: 'tool-call',
                  callId: event.callId,
                  toolName: event.toolName,
                  title: event.title,
                  args: event.args,
                  status: 'running',
                },
              ]
            }),
          }
        }

        case 'tool.delta':
          // 参数流式生成进度：更新对应工具卡片的已生成字符数
          return {
            ...base,
            messages: updateMessageParts(state.messages, event.messageId, (parts) =>
              parts.map((part) =>
                part.type === 'tool-call' && part.callId === event.callId && part.status === 'running'
                  ? { ...part, progressChars: event.argsChars }
                  : part,
              ),
            ),
          }

        case 'tool.result': {
          const extracted = activityFromDisplay(event.display)
          const clearQuestion = state.pendingQuestion?.callId === event.callId
          // todo_write 成功后同步待办快照并递增触发版本（驱动待办区自动展开）
          const todoUpdate =
            event.ok && event.display?.kind === 'todoList'
              ? { todos: event.display.items, todosVersion: state.todosVersion + 1 }
              : {}
          return {
            ...base,
            ...(clearQuestion ? { phase: 'running' as const, pendingQuestion: null } : {}),
            ...todoUpdate,
            workspaceActivities: state.workspaceActivities.map((activity) =>
              activity.callId === event.callId
                ? {
                    ...activity,
                    status: event.ok ? ('done' as const) : ('failed' as const),
                    label: extracted.label ?? activity.label,
                    chapterId: extracted.chapterId ?? activity.chapterId,
                    deltaChars: extracted.deltaChars ?? activity.deltaChars,
                  }
                : activity,
            ),
            messages: updateMessageParts(state.messages, event.messageId, (parts) =>
              parts.map((part) =>
                part.type === 'tool-call' && part.callId === event.callId
                  ? {
                      ...part,
                      status: event.ok ? 'success' : 'failed',
                      summary: event.summary,
                      display: event.display,
                      durationMs: event.durationMs,
                    }
                  : part,
              ),
            ),
          }
        }

        case 'permission.ask':
          return {
            ...base,
            phase: 'awaiting_approval',
            pendingApproval: {
              callId: event.callId,
              toolName: event.toolName,
              title: event.title,
              args: event.args,
              allowAlways: event.allowAlways,
              expiresAt: event.expiresAt,
            },
          }

        case 'permission.resolved':
          return { ...base, phase: 'running', pendingApproval: null }

        case 'step.finish':
          return {
            ...base,
            currentTurn: event.turn,
            usage: {
              promptTokens: state.usage.promptTokens + event.usage.promptTokens,
              completionTokens: state.usage.completionTokens + event.usage.completionTokens,
              totalTokens: state.usage.totalTokens + event.usage.totalTokens,
            },
          }

        case 'run.paused':
          // 停止时正在执行的工具永远等不到 tool.result，就地收尾避免卡片一直「执行中」
          return {
            ...base,
            phase: 'paused',
            pendingApproval: null,
            pendingQuestion: null,
            messages: settleRunningToolParts(state.messages, '已停止'),
            workspaceActivities: settleRunningActivities(state.workspaceActivities),
          }

        case 'run.finished':
          return {
            ...base,
            phase: event.status,
            usage: event.usage,
            outputSummary: event.outputSummary,
            pendingApproval: null,
            pendingQuestion: null,
            messages: settleRunningToolParts(state.messages, '已中断'),
            workspaceActivities: settleRunningActivities(state.workspaceActivities),
          }

        case 'error':
          return {
            ...base,
            errorMessage: event.message,
            ...(event.recoverable
              ? {}
              : {
                  phase: 'failed' as const,
                  messages: settleRunningToolParts(state.messages, '已中断'),
                  workspaceActivities: settleRunningActivities(state.workspaceActivities),
                }),
          }

        default:
          return base
      }
    }),
}))

export function isRunActive(phase: AgentRunPhase): boolean {
  return phase === 'starting' || phase === 'running' || phase === 'awaiting_approval' || phase === 'awaiting_input'
}
