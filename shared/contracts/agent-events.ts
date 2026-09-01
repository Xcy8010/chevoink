import type { AgentAttachmentMeta } from './agent-attachments.js'
import type { AgentExecutionMode, EntityId } from './models.js'

/** 任务待办项：todo_write 工具全量维护，驱动 Agent 面板待办清单与循环防早停 */
export interface AgentTodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** 一次模型调用/一次 run 的 token 用量 */
export interface AgentTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 模型仍在生成写工具参数时的只读正文预览；只存在事件流，不提前落库。 */
export interface AgentToolDraft {
  kind: 'chapter' | 'plan'
  toolName: string
  targetId?: EntityId
  title?: string
  content: string
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
      /** 工具写入成功后的章节版本；旧持久化事件可能缺省。 */
      revision?: number
    }
  | { kind: 'coverImages'; images: Array<{ id: EntityId; url: string }> }
  | {
      /** view_image 视觉旁路结果：被查看的图片（可展开、点击放大）+ 视觉模型描述 */
      kind: 'viewedImage'
      images: Array<{ id: string; url: string }>
      description: string
    }
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
  | {
      /** 一键导出完成：前端渲染下载卡片，downloadUrl 需带会话 cookie 拉取 zip */
      kind: 'exportReady'
      downloadUrl: string
      fileName: string
      detail: string
    }
  | { kind: 'todoList'; items: AgentTodoItem[] }
  | {
      /** 子 Agent 内嵌执行报告：subagent_run 工具卡片内嵌展示（无独立任务窗口） */
      kind: 'subagentReport'
      subagentRunId: EntityId
      subagentName: string
      role: string
      triggerCondition?: string
      status: 'running' | 'success' | 'failed' | 'denied'
      report: string
      steps: number
      durationMs?: number
      usage?: AgentTokenUsage
    }
  | {
      kind: 'storyCompiler'
      compilationId?: EntityId
      phase: 'charter' | 'prepare' | 'beat' | 'write' | 'check' | 'repair' | 'commit'
      title: string
      detail: string
      items: string[]
      errorCount?: number
      warningCount?: number
    }
  | {
      kind: 'researchDossier'
      dossierId: EntityId
      title: string
      detail: string
      reused: boolean
      sourceCount: number
      items: string[]
    }
  | {
      kind: 'firstThreePrototype'
      prototypeId: EntityId
      title: string
      detail: string
      items: string[]
    }
  | {
      kind: 'qualityReport'
      reportId: EntityId
      chapterId: EntityId
      chapterRevision: number
      status: 'analyzing' | 'needs_repair' | 'passed' | 'repaired' | 'stale' | 'failed'
      repairRound: number
      findings: Array<{
        id: EntityId
        signal: string
        label: string
        severity: 'advisory' | 'warning' | 'error'
        evidence: string
        explanation: string
        suggestion: string
        disposition: 'pending' | 'selected' | 'repaired'
        authorFeedback?: 'accepted' | 'rejected' | null
      }>
    }
  | {
      kind: 'changeSet'
      changeSetId: EntityId
      status: 'draft' | 'approved' | 'applying' | 'applied' | 'conflicted' | 'failed' | 'rolled_back'
      patchCount: number
      selectedCount: number
      patches: Array<{
        id: EntityId
        chapterId: EntityId
        field: string
        beforePreview: string
        afterPreview: string
        selected: boolean
      }>
    }
  | {
      kind: 'webSearch'
      query: string
      provider: string
      results: Array<{ title: string; url: string; snippet: string; source: string }>
    }
  | {
      /** 站内作品搜索：已上架他作 + 本人未公开作品（isOwn 标记），供 platform_novel_read 深读定位 */
      kind: 'platformNovelSearch'
      query: string
      results: Array<{
        id: string
        title: string
        authorName: string
        isOwn: boolean
        published: boolean
        wordCount: number
      }>
    }
  | {
      /** 站内作品查看：介绍/分类/标签/章节元信息（含本人未公开作品） */
      kind: 'platformNovel'
      title: string
      authorName: string
      isOwn: boolean
      published: boolean
      tags: string[]
      summary: string
      chapterCount: number
      wordCount: number
      chapterTitle?: string
    }

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
  | {
      type: 'skill.route'
      phase: string
      candidates: Array<{ id: string; name: string; version: string }>
      selected: Array<{ id: string; name: string; version: string }>
      reasonCodes: string[]
      confidence: number
      estimatedTokens: number
      skippedReason?: string
    }
  | { type: 'message.start'; messageId: string; role: 'assistant' }
  | { type: 'text.delta'; messageId: string; delta: string }
  | { type: 'text.final'; messageId: string; text: string; asReasoning: boolean }
  | { type: 'reasoning.delta'; messageId: string; delta: string }
  | {
      type: 'tool.call'
      messageId: string
      callId: string
      toolName: string
      title: string
      args: unknown
      /** 该调用是否未经用户挂起审批即自动批准（AGENT_AUTO_APPROVE 或白名单短路时为 true）；旧事件无此字段 */
      autoApproved?: boolean
      /** 非 undefined 表示这是子 Agent 内嵌执行内部的工具调用，值为所属 subagent_run 调用的 callId */
      subagentCallId?: string
    }
  | {
      /** 子 Agent 内嵌执行进度：实时展示当前步骤（模型正在做什么） */
      type: 'subagent.progress'
      messageId: string
      /** 所属 subagent_run 调用的 callId */
      callId: string
      step: number
      message: string
    }
  | {
      /** 工具参数流式生成中的进度：模型仍在产出参数（如章节正文），argsChars 为已生成的参数字符数 */
      type: 'tool.delta'
      messageId: string
      callId: string
      argsChars: number
      /** chapter/plan 长文本参数的增量预览，前端据此逐字显示并锁定编辑器。 */
      draft?: AgentToolDraft
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
      /** 非 undefined 表示这是子 Agent 内嵌执行内部的工具调用，值为所属 subagent_run 调用的 callId */
      subagentCallId?: string
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
      /** 写入结果已经过作者审查并明确采纳；普通执行成功只表示“已完成”。 */
      accepted?: boolean
      /** 参数流式生成进度（已生成的参数字符数），仅 running 态有意义 */
      progressChars?: number
      /** 写操作的回滚快照：仅服务端持久化使用，消息列表接口返回前会剥离 */
      snapshot?: AgentRollbackSnapshot
      /** 非 undefined 表示该工具调用属于某个子 Agent 内嵌执行，值为所属 subagent_run 调用的 callId */
      subagentCallId?: string
      /** 子 Agent 内嵌执行实时进度（仅 subagent_run 容器卡片持有，来自 subagent.progress 事件） */
      subagentProgress?: { step: number; message: string }
    }
  | {
      /** 用户消息附件（图片/文件）：additive union，旧消息不含该成员时所有分发点安全跳过 */
      type: 'attachment'
      kind: 'image' | 'file'
      name: string
      url: string
      size?: number
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
  /** 本轮附带附件元数据（先经 POST /api/agent/attachments 落盘，run 只带元数据） */
  attachments?: AgentAttachmentMeta[]
  creativeFreedom?: CreativeFreedom
  qualityMode?: import('./story-compiler-contracts.js').StoryCompilerMode
  /** 内置模型档位；用户侧永不接触真实供应商 model id。 */
  modelTier?: import('./credits.js').CreditModelTier
  /** 自定义模型配置 id；仅 modelTier=custom 时生效，后端校验归属。 */
  customModelId?: EntityId
  /** 用户为当前模型选择的推理强度；后端按该模型允许档位校验，不信任客户端。 */
  reasoningEffort?: import('./credits.js').ModelReasoningEffort
  /** 服务端子 Agent 调度使用；普通创作请求保持 orchestrator。 */
  agentProfile?: 'orchestrator' | 'research' | 'continuity' | 'quality' | 'lore'
  /** 单次子任务硬预算；服务端还会与全局预算取较小值。 */
  tokenBudget?: number
}

export type CreativeFreedom = 'stable' | 'balanced' | 'bold'

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
