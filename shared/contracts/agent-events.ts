import type { AgentExecutionMode, EntityId } from './models.js'

/** 一次模型调用/一次 run 的 token 用量 */
export interface AgentTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 工具结果中给前端渲染的结构化数据 */
export type AgentToolDisplayPayload =
  | {
      kind: 'chapterDiff'
      chapterId: EntityId
      chapterTitle: string
      before: string
      after: string
      appliedDirectly: boolean
    }
  | { kind: 'coverImages'; images: Array<{ id: EntityId; url: string }> }
  | { kind: 'markdown'; markdown: string }
  | { kind: 'chapterRef'; chapterId: EntityId; title: string; wordCount: number }
  | { kind: 'plan'; summary: string; steps: Array<{ title: string; detail?: string }> }
  | { kind: 'planFile'; artifactId: EntityId; title: string; content: string }
  | {
      kind: 'planDiff'
      artifactId: EntityId
      title: string
      beforeTitle: string
      before: string
      after: string
    }
  | { kind: 'planRename'; artifactId: EntityId; beforeTitle: string; title: string }
  | { kind: 'planDelete'; artifactId: EntityId; title: string }
  | {
      kind: 'question'
      question: string
      options: Array<{ label: string; detail?: string }>
      /** 作者的回答：挂起期间为空，回答后随工具结果持久化 */
      answer?: string
      /** 超时或任务停止导致未获回答 */
      unanswered?: boolean
    }
  | { kind: 'uiIntent'; intent: 'open_meta' | 'open_cover' }

/** 工具调用的回滚快照（写操作自动记录） */
export interface AgentRollbackSnapshot {
  target: 'chapter' | 'novel'
  targetId: EntityId
  field: string
  previousValue: string | null
}

export interface AgentRunAgentSummary {
  type: string
  title: string
  model: string
}

export interface AgentArtifactRef {
  id: EntityId
  artifactType: string
  title: string
}

/**
 * 结构化 SSE 事件协议（前后端唯一契约）。
 * live 与 replay 同源：全部事件按 seq 持久化，重连用 Last-Event-ID 续传。
 */
export type AgentStreamEventBody =
  | { type: 'run.started'; agent: AgentRunAgentSummary; mode: AgentExecutionMode; title: string }
  | { type: 'message.start'; messageId: string; role: 'assistant' }
  | { type: 'text.delta'; messageId: string; delta: string }
  | { type: 'reasoning.delta'; messageId: string; delta: string }
  | {
      type: 'tool.call'
      messageId: string
      callId: string
      toolName: string
      title: string
      args: unknown
    }
  | {
      /** 工具参数流式生成中的进度：模型仍在产出参数（如章节正文），argsChars 为已生成的参数字符数 */
      type: 'tool.delta'
      messageId: string
      callId: string
      argsChars: number
    }
  | {
      type: 'tool.result'
      messageId: string
      callId: string
      toolName: string
      ok: boolean
      summary: string
      display?: AgentToolDisplayPayload
      durationMs: number
    }
  | {
      type: 'permission.ask'
      callId: string
      toolName: string
      title: string
      args: unknown
      /** 高危操作（发布/删除/下架）不允许"总是允许" */
      allowAlways: boolean
      expiresAt: string
    }
  | { type: 'permission.resolved'; callId: string; approved: boolean }
  | { type: 'step.finish'; turn: number; usage: AgentTokenUsage }
  | { type: 'run.paused'; reason: 'user_stop' | 'approval_timeout' }
  | {
      type: 'run.finished'
      status: 'succeeded' | 'failed' | 'cancelled'
      usage: AgentTokenUsage
      artifacts: AgentArtifactRef[]
      outputSummary: string
    }
  | { type: 'error'; code: string; message: string; recoverable: boolean }

export type AgentStreamEvent = {
  seq: number
  runId: EntityId
  ts: string
} & AgentStreamEventBody

/** 消息分部：AgentMessage.parts 的元素结构，前端按 type 分发渲染 */
export type AgentMessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; durationMs?: number }
  | {
      type: 'tool-call'
      callId: string
      toolName: string
      title: string
      args: unknown
      status: 'running' | 'success' | 'failed' | 'denied'
      summary?: string
      display?: AgentToolDisplayPayload
      durationMs?: number
      /** 参数流式生成进度（已生成的参数字符数），仅 running 态有意义 */
      progressChars?: number
      /** 写操作的回滚快照：仅服务端持久化使用，消息列表接口返回前会剥离 */
      snapshot?: AgentRollbackSnapshot
    }

export interface AgentUIMessage {
  id: string
  runId: EntityId
  role: 'user' | 'assistant'
  parts: AgentMessagePart[]
  createdAt: string
}

/** POST /api/agent/runs 新链路入参（模型自主决策，不再需要 task 类型） */
export interface StartAgentLoopRunRequest {
  sessionId: EntityId
  novelId: EntityId
  chapterId?: EntityId | null
  mode: AgentExecutionMode
  prompt: string
  selection?: {
    text: string
    start?: number
    end?: number
  } | null
}

export interface StartAgentLoopRunResponse {
  runId: EntityId
  sessionId: EntityId
  status: string
  streamUrl: string
}

export interface ResolveAgentApprovalRequest {
  callId: string
  approved: boolean
  alwaysAllow?: boolean
}

/** POST /api/agent/runs/:runId/questions：回答 ask_user 工具的挂起提问 */
export interface ResolveAgentQuestionRequest {
  callId: string
  answer: string
}
