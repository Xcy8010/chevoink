import { buildApiUrl, apiBaseUrl } from '@/app/api-base'
import { buildAuthHeader } from '@/lib/auth-token'
import type {
  AgentActionHandoff,
  AgentActionResultPayload,
  AgentActionPlan,
  AgentArtifact as BackendAgentArtifact,
  AgentArtifactApplyStrategy,
  AgentExecutionAgent,
  AgentExecutionMode,
  AgentExecutionStepResult,
  AgentRouteDecision,
  AgentRuleBundle,
  AgentStoryMemoryDigest,
  AgentWorkspaceToolPolicy,
  AgentRunStreamPayload,
  ApiResponse,
  Chapter,
  CreateChapterRequest,
  CreateNovelRequest,
  CreateNovelResponse,
  CreateAgentSessionResponse,
  DeleteAgentSessionResponse,
  DeleteAgentRunResponse,
  DeleteNovelResponse,
  DeleteChapterResponse,
  ExecuteWorkspaceAgentRequest,
  GenerateCoverImageRequest,
  GenerateCoverImageResponse,
  GenerateCoverPromptRequest,
  GenerateCoverPromptResponse,
  GetChapterResponse,
  GetReaderResponse,
  ListAgentSessionHistoryResponse,
  ListAgentSessionsResponse,
  Novel,
  ProjectMemoryEntry,
  PublishNovelRequest,
  PublishNovelResponse,
  RollbackAgentRunResponse,
  StudioPayload,
  UploadNovelCoverRequest,
  UploadNovelCoverResponse,
  UpdateChapterRequest,
  UpdateAgentSessionRequest,
  UpdateAgentSessionResponse,
  UpdateNovelRequest,
} from '../../../shared/contracts/index.js'
import type {
  AgentArtifactType,
  AgentMemoryEntry,
  AgentRunStatusMode,
  AgentRunStatusItem,
  AgentTaskType,
} from './types'

type RequestDataOptions = RequestInit & {
  timeoutMs?: number
}

export type WritingAgentRequest = {
  action: AgentTaskType
  novelId: string
  sessionId?: string
  chapterId?: string
  prompt?: string
  novelTitle?: string
  novelSummary?: string
  chapterTitle?: string
  chapterSummary?: string
  chapterContent?: string
  selectedText?: string
  genre?: string
  protagonist?: string
  tone?: string
  stylePreference?: string
  coverSummary?: string
  handoff?: AgentActionHandoff | null
}

export type WritingAgentResultArtifact = {
  id: string
  task: AgentTaskType
  title: string
  content: string
  promptText?: string
  type: AgentArtifactType
  createdAt: string
  runId: string
  backendArtifactId: string
  availableApplyStrategies: AgentArtifactApplyStrategy[]
  actionPlan?: AgentActionPlan | null
  handoff?: AgentActionHandoff | null
  activeAgent?: AgentExecutionAgent | null
  routeDecision?: AgentRouteDecision | null
  ruleBundle?: AgentRuleBundle | null
  storyMemoryDigest?: AgentStoryMemoryDigest | null
  executionMode?: AgentExecutionMode | null
  toolPolicy?: AgentWorkspaceToolPolicy | null
  stepResults?: AgentExecutionStepResult[] | null
}

export type WritingAgentResult = {
  runId?: string | null
  sessionId?: string | null
  resolvedTask: AgentTaskType
  title: string
  content: string
  type: AgentArtifactType
  backendArtifactId?: string | null
  availableApplyStrategies: AgentArtifactApplyStrategy[]
  artifacts: WritingAgentResultArtifact[]
  streamStatuses: AgentRunStatusItem[]
  statusMode: AgentRunStatusMode
  memoryEntries: AgentMemoryEntry[]
  actionPlan?: AgentActionPlan | null
  handoff?: AgentActionHandoff | null
  activeAgent?: AgentExecutionAgent | null
  routeDecision?: AgentRouteDecision | null
  ruleBundle?: AgentRuleBundle | null
  storyMemoryDigest?: AgentStoryMemoryDigest | null
  executionMode?: AgentExecutionMode | null
  toolPolicy?: AgentWorkspaceToolPolicy | null
  stepResults?: AgentExecutionStepResult[] | null
}

type LiveAgentStatus = {
  text: string
  event: string
  createdAt?: string
}

export type ApplyWritingAgentArtifactRequest = {
  artifactId: string
  strategy: AgentArtifactApplyStrategy
  chapterId?: string
}

export type ApplyWritingAgentArtifactResult = {
  artifact: BackendAgentArtifact
  applied: boolean
  targetType: 'chapter' | 'novel'
  targetId: string
}

export type RollbackWritingAgentRunResult = RollbackAgentRunResponse['data']
export type DeleteWritingAgentRunResult = DeleteAgentRunResponse['data']
export type AgentSessionHistoryItem = AgentActionResultPayload

function normalizeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return '请求超时，请稍后再试。'
    }

    return error.message || '请求失败，请稍后再试。'
  }

  return '请求失败，请稍后再试。'
}

function normalizeResponseError(status: number, message?: string): string {
  if (status === 401 || status === 403) {
    return '登录状态已失效，请重新登录后再试。'
  }

  if (status >= 500) {
    return '服务暂时不可用，请稍后再试。'
  }

  return message || '请求失败，请稍后再试。'
}

async function requestData<T>(path: string, options?: RequestDataOptions): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs ?? 30000
  const timeoutId =
    timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeader(),
        ...(options?.headers ?? {}),
      },
      ...(timeoutMs > 0 ? { signal: controller.signal } : {}),
    })

    const rawText = await response.text()
    let result: ApiResponse<T> | null = null

    if (rawText) {
      try {
        result = JSON.parse(rawText) as ApiResponse<T>
      } catch {
        result = null
      }
    }

    if (!response.ok) {
      const message =
        result && typeof result === 'object' && 'error' in result
          ? result.error.message
          : rawText || undefined
      throw new Error(normalizeResponseError(response.status, message))
    }

    if (!result || !result.success) {
      const message =
        result && typeof result === 'object' && 'error' in result
          ? result.error.message
          : '服务返回异常，请稍后再试。'
      throw new Error(message)
    }

    return result.data
  } catch (error) {
    throw new Error(normalizeFetchError(error))
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  }
}

function normalizeAgentTask(task: string | null | undefined): AgentTaskType | null {
  switch (task) {
    case 'workspace-agent':
    case 'generate-novel-title':
    case 'generate-chapter-titles':
    case 'read-story-context':
    case 'plan-chapter':
    case 'draft-chapter':
    case 'continue-chapter':
    case 'rewrite-selection':
    case 'polish-selection':
    case 'review-continuity':
    case 'generate-cover-prompt':
      return task
    default:
      return null
  }
}

function mapBackendArtifactTypeToFrontendType(
  artifactType: BackendAgentArtifact['artifactType'],
): AgentArtifactType {
  if (artifactType === 'chapterPlan') {
    return 'chapter_plan'
  }

  if (artifactType === 'continuityReview') {
    return 'review_report'
  }

  if (artifactType === 'coverPrompt') {
    return 'cover_prompt'
  }

  return 'draft_text'
}

function deriveTaskFromArtifact(
  artifact: BackendAgentArtifact | null | undefined,
  fallbackAction: AgentTaskType,
): AgentTaskType {
  const metadataTask = normalizeAgentTask(
    artifact?.metadata && typeof artifact.metadata === 'object'
      ? String((artifact.metadata as Record<string, unknown>).workspaceTask ?? '')
      : null,
  )

  if (metadataTask) {
    return metadataTask
  }

  if (!artifact) {
    return fallbackAction
  }

  switch (artifact.artifactType) {
    case 'chapterPlan':
      return 'plan-chapter'
    case 'chapterContinuation':
      return 'continue-chapter'
    case 'rewriteSelection':
      return 'rewrite-selection'
    case 'polishSelection':
      return 'polish-selection'
    case 'continuityReview':
      return 'review-continuity'
    case 'coverPrompt':
      return 'generate-cover-prompt'
    case 'chapterDraft':
    default:
      return fallbackAction
  }
}

function getAvailableApplyStrategies(
  action: AgentTaskType,
  artifact?: BackendAgentArtifact,
): AgentArtifactApplyStrategy[] {
  if (Array.isArray(artifact?.availableApplyStrategies)) {
    return artifact.availableApplyStrategies
  }

  if (artifact?.artifactType === 'chapterDraft') {
    return ['replaceChapterContent', 'appendChapterContent']
  }

  if (artifact?.artifactType === 'chapterContinuation') {
    return ['appendChapterContent', 'replaceChapterContent']
  }

  if (artifact?.artifactType === 'rewriteSelection' || artifact?.artifactType === 'polishSelection') {
    return ['replaceChapterContent']
  }

  if (artifact?.artifactType === 'chapterPlan' || artifact?.artifactType === 'continuityReview') {
    return ['saveChapterSummary']
  }

  if (artifact?.artifactType === 'coverPrompt') {
    return ['setNovelCoverPrompt']
  }

  if (action === 'plan-chapter' || action === 'review-continuity') {
    return ['saveChapterSummary']
  }

  if (action === 'generate-cover-prompt') {
    return ['setNovelCoverPrompt']
  }

  if (action === 'draft-chapter') {
    return ['replaceChapterContent', 'appendChapterContent']
  }

  if (action === 'continue-chapter') {
    return ['appendChapterContent', 'replaceChapterContent']
  }

  if (action === 'rewrite-selection' || action === 'polish-selection') {
    return ['replaceChapterContent']
  }

  return []
}

function asBackendArtifact(value: unknown): BackendAgentArtifact | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>

  return typeof candidate.id === 'string' && typeof candidate.artifactType === 'string'
    ? (candidate as BackendAgentArtifact)
    : null
}

function extractPrimaryArtifact(payload: Record<string, unknown>): BackendAgentArtifact | null {
  const directArtifact = asBackendArtifact(payload.artifact)

  if (directArtifact) {
    return directArtifact
  }

  const payloadArtifact = asBackendArtifact(payload)

  if (payloadArtifact) {
    return payloadArtifact
  }

  if (Array.isArray(payload.artifacts)) {
    const listArtifact = asBackendArtifact(payload.artifacts[0])

    if (listArtifact) {
      return listArtifact
    }
  }

  return null
}

function mapBackendMemoryEntry(entry: ProjectMemoryEntry): AgentMemoryEntry {
  return {
    id: entry.id,
    memoryType: entry.memoryType,
    title: entry.title,
    content: entry.content,
    importance: entry.importance,
    createdAt: entry.createdAt,
  }
}

function mapBackendArtifactToWritingArtifact(
  artifact: BackendAgentArtifact,
  fallbackTask: AgentTaskType,
): WritingAgentResultArtifact {
  const task = deriveTaskFromArtifact(artifact, fallbackTask)
  const actionPlan =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).actionPlan as AgentActionPlan | null | undefined) ?? null
      : null
  const handoff =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).handoff as AgentActionHandoff | null | undefined) ?? null
      : null
  const activeAgent =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).activeAgent as AgentExecutionAgent | null | undefined) ?? null
      : null
  const routeDecision =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).routeDecision as AgentRouteDecision | null | undefined) ?? null
      : null
  const ruleBundle =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).ruleBundle as AgentRuleBundle | null | undefined) ?? null
      : null
  const storyMemoryDigest =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).storyMemoryDigest as AgentStoryMemoryDigest | null | undefined) ?? null
      : null
  const executionMode =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).executionMode as AgentExecutionMode | null | undefined) ?? null
      : null
  const toolPolicy =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).toolPolicy as AgentWorkspaceToolPolicy | null | undefined) ?? null
      : null
  const stepResults =
    artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
      ? ((artifact.metadata as Record<string, unknown>).stepResults as AgentExecutionStepResult[] | null | undefined) ?? null
      : null

  return {
    id: artifact.id,
    task,
    title: artifact.title,
    content: artifact.content,
    type: mapBackendArtifactTypeToFrontendType(artifact.artifactType),
    createdAt: artifact.createdAt,
    runId: artifact.runId,
    backendArtifactId: artifact.id,
    availableApplyStrategies: getAvailableApplyStrategies(task, artifact),
    actionPlan,
    handoff,
    activeAgent,
    routeDecision,
    ruleBundle,
    storyMemoryDigest,
    executionMode,
    toolPolicy,
    stepResults,
  }
}

function buildAgentResult(
  action: AgentTaskType,
  content: string,
  title?: string,
  artifact?: BackendAgentArtifact,
  extras?: {
    runId?: string | null
    sessionId?: string | null
    artifacts?: WritingAgentResultArtifact[]
    streamStatuses?: WritingAgentResult['streamStatuses']
    statusMode?: WritingAgentResult['statusMode']
    memoryEntries?: WritingAgentResult['memoryEntries']
    actionPlan?: AgentActionPlan | null
    handoff?: AgentActionHandoff | null
    activeAgent?: AgentExecutionAgent | null
    routeDecision?: AgentRouteDecision | null
    ruleBundle?: AgentRuleBundle | null
    storyMemoryDigest?: AgentStoryMemoryDigest | null
    executionMode?: AgentExecutionMode | null
    toolPolicy?: AgentWorkspaceToolPolicy | null
    stepResults?: AgentExecutionStepResult[] | null
  },
): WritingAgentResult {
  const resolvedTask = deriveTaskFromArtifact(artifact, action)
  const type = artifact
    ? mapBackendArtifactTypeToFrontendType(artifact.artifactType)
    : resolvedTask === 'plan-chapter'
      ? 'chapter_plan'
      : resolvedTask === 'review-continuity' || resolvedTask === 'read-story-context'
        ? 'review_report'
        : resolvedTask === 'generate-cover-prompt'
          ? 'cover_prompt'
          : 'draft_text'

  const fallbackTitle =
    resolvedTask === 'plan-chapter'
      ? '创作计划'
      : resolvedTask === 'review-continuity'
        ? '连续性审阅'
        : resolvedTask === 'generate-cover-prompt'
          ? '封面提示词'
          : resolvedTask === 'generate-novel-title'
            ? '书名提案'
            : resolvedTask === 'generate-chapter-titles'
              ? '章节名提案'
              : resolvedTask === 'read-story-context'
                ? '上下文检索'
                : resolvedTask === 'workspace-agent'
                  ? '自由调度结果'
                  : '写作结果'

  return {
    runId: extras?.runId ?? null,
    sessionId: extras?.sessionId ?? null,
    resolvedTask,
    title: title || fallbackTitle,
    content,
    type,
    backendArtifactId: artifact?.id ?? null,
    availableApplyStrategies: getAvailableApplyStrategies(resolvedTask, artifact),
    artifacts:
      extras?.artifacts ??
      (artifact ? [mapBackendArtifactToWritingArtifact(artifact, resolvedTask)] : []),
    streamStatuses: extras?.streamStatuses ?? [],
    statusMode: extras?.statusMode ?? 'none',
    memoryEntries: extras?.memoryEntries ?? [],
    activeAgent:
      extras?.activeAgent ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).activeAgent as AgentExecutionAgent | null | undefined) ?? null
        : null),
    routeDecision:
      extras?.routeDecision ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).routeDecision as AgentRouteDecision | null | undefined) ?? null
        : null),
    ruleBundle:
      extras?.ruleBundle ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).ruleBundle as AgentRuleBundle | null | undefined) ?? null
        : null),
    storyMemoryDigest:
      extras?.storyMemoryDigest ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).storyMemoryDigest as AgentStoryMemoryDigest | null | undefined) ?? null
        : null),
    executionMode:
      extras?.executionMode ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).executionMode as AgentExecutionMode | null | undefined) ?? null
        : null),
    actionPlan:
      extras?.actionPlan ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).actionPlan as AgentActionPlan | null | undefined) ?? null
        : null),
    handoff:
      extras?.handoff ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).handoff as AgentActionHandoff | null | undefined) ?? null
        : null),
    toolPolicy:
      extras?.toolPolicy ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).toolPolicy as AgentWorkspaceToolPolicy | null | undefined) ?? null
        : null),
    stepResults:
      extras?.stepResults ??
      (artifact?.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
        ? ((artifact.metadata as Record<string, unknown>).stepResults as AgentExecutionStepResult[] | null | undefined) ?? null
        : null),
  }
}

function describeAgentRunEvent(event: string, data: Record<string, unknown>): string {
  if (event === 'run.started') {
    return '已开始处理当前任务。'
  }

  if (event === 'agent.selected') {
    return '已选定处理方式，正在组织工作区上下文。'
  }

  if (event === 'route.decided') {
    return 'Chevoink Agent 已完成任务分流。'
  }

  if (event === 'specialist.started') {
    return '专职 Agent 已接手当前任务。'
  }

  if (event === 'context.ready') {
    return '上下文已准备完成，开始生成结果。'
  }

  if (event === 'model.started') {
    return '正在生成本次结果。'
  }

  if (event === 'artifact.created') {
    return '结果物已生成，正在整理可应用动作。'
  }

  if (event === 'memory.updated') {
    return '已同步本次工作记忆。'
  }

  if (event === 'run.completed') {
    return '本次任务已完成。'
  }

  if (event === 'run.failed') {
    return typeof data.message === 'string' && data.message.trim()
      ? data.message
      : '本次任务未能完成。'
  }

  if (event === 'run.snapshot') {
    return '已连接当前任务状态。'
  }

  if (event === 'run.done') {
    return '任务记录已同步。'
  }

  return '正在同步任务状态。'
}

async function listWritingAgentArtifacts(runId: string): Promise<WritingAgentResultArtifact[]> {
  const payload = await requestData<{ items: BackendAgentArtifact[] }>(`/api/agent/runs/${runId}/artifacts`)
  return payload.items.map((artifact) =>
    mapBackendArtifactToWritingArtifact(artifact, deriveTaskFromArtifact(artifact, 'workspace-agent')),
  )
}

function resolveAgentStreamUrl(url: string): string {
  try {
    return new URL(url, apiBaseUrl || window.location.origin).toString()
  } catch {
    return buildApiUrl(url)
  }
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T> | null> {
  const rawText = await response.text()

  if (!rawText) {
    return null
  }

  try {
    return JSON.parse(rawText) as ApiResponse<T>
  } catch {
    return null
  }
}

type AgentStreamReadResult = {
  sessionId: string | null
  statusMode: AgentRunStatusMode
  streamStatuses: WritingAgentResult['streamStatuses']
  primaryArtifact: BackendAgentArtifact | null
  artifacts: BackendAgentArtifact[]
  memoryEntries: AgentMemoryEntry[]
  title: string
  content: string
}

type AgentStreamHandlers = {
  onStatus?: (status: string) => void
  onStatusModeChange?: (mode: AgentRunStatusMode) => void
}

async function readAgentRunStreamResponse(
  response: Response,
  runId: string,
  handlers?: AgentStreamHandlers,
): Promise<AgentStreamReadResult> {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error('Agent 结果暂时无法读取，请稍后再试。')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = ''
  let statusMode: AgentRunStatusMode = 'none'
  let sessionId: string | null = null
  let primaryArtifact: BackendAgentArtifact | null = null
  let artifacts: BackendAgentArtifact[] = []
  let memoryEntries: AgentMemoryEntry[] = []
  let title = ''
  let content = ''
  const statuses: WritingAgentResult['streamStatuses'] = []

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
      const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())
      const eventLine = lines.find((line) => line.startsWith('event:'))
      eventName = eventLine ? eventLine.slice(6).trim() : eventName

      if (!dataLines.length) {
        continue
      }

      try {
        const payload = JSON.parse(dataLines.join('\n')) as AgentRunStreamPayload
        const nextMode = payload.mode === 'replay' || payload.replay ? 'history' : 'live'

        if (statusMode !== nextMode) {
          statusMode = nextMode
          handlers?.onStatusModeChange?.(nextMode)
        }

        if (payload.run?.sessionId) {
          sessionId = payload.run.sessionId
        }

        const stage = typeof payload.stage === 'string' ? payload.stage : eventName
        const text =
          typeof payload.message === 'string' && payload.message.trim()
            ? payload.message
            : describeAgentRunEvent(stage, payload.data ?? {})

        statuses.push({
          id: `${runId}-${statuses.length + 1}`,
          event: stage,
          text,
          createdAt: payload.createdAt || new Date().toISOString(),
        })

        if (nextMode === 'live') {
          handlers?.onStatus?.(text)
        }

        const payloadArtifact = asBackendArtifact(payload.artifact)
        if (payloadArtifact) {
          primaryArtifact = payloadArtifact
        }

        if (Array.isArray(payload.artifacts)) {
          artifacts = payload.artifacts.filter(
            (artifact): artifact is BackendAgentArtifact => asBackendArtifact(artifact) !== null,
          )
        }

        if (Array.isArray(payload.memoryEntries)) {
          memoryEntries = payload.memoryEntries.map((entry) => mapBackendMemoryEntry(entry))
        }

        if (typeof payload.title === 'string' && payload.title.trim()) {
          title = payload.title
        } else if (payloadArtifact?.title) {
          title = payloadArtifact.title
        }

        if (typeof payload.content === 'string') {
          content = payload.content
        } else if (payloadArtifact?.content) {
          content = payloadArtifact.content
        }
      } catch {
        continue
      }
    }
  }

  return {
    sessionId,
    statusMode,
    streamStatuses: statuses,
    primaryArtifact,
    artifacts,
    memoryEntries,
    title,
    content,
  }
}

async function fetchAgentRunStream(url: string): Promise<Response> {
  return fetch(resolveAgentStreamUrl(url), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'text/event-stream',
    },
  })
}

async function fetchAgentRunStreamWithSignal(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(resolveAgentStreamUrl(url), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'text/event-stream',
    },
    signal,
  })
}

async function readAgentRunStream(
  stream: NonNullable<AgentActionResultPayload['stream']>,
  runId: string,
  handlers?: AgentStreamHandlers,
  signal?: AbortSignal,
): Promise<AgentStreamReadResult> {
  if (stream.liveUrl) {
    const liveResponse = await fetchAgentRunStreamWithSignal(stream.liveUrl, signal)

    if (liveResponse.ok) {
      handlers?.onStatusModeChange?.('live')
      return readAgentRunStreamResponse(liveResponse, runId, handlers)
    }

    const liveError = await parseApiResponse<unknown>(liveResponse)
    const liveErrorMessage =
      liveError && typeof liveError === 'object' && 'error' in liveError
        ? liveError.error.message
        : undefined
    const liveErrorCode =
      liveError && typeof liveError === 'object' && 'error' in liveError
        ? liveError.error.code
        : undefined

    if (
      liveResponse.status === 409 &&
      liveErrorCode === 'AGENT_STREAM_REPLAY_REQUIRED' &&
      typeof stream.replayUrl === 'string' &&
      stream.replayUrl
    ) {
      handlers?.onStatusModeChange?.('history')
      handlers?.onStatus?.('正在同步本次处理记录...')

      const replayResponse = await fetchAgentRunStreamWithSignal(stream.replayUrl, signal)

      if (!replayResponse.ok) {
        const replayError = await parseApiResponse<unknown>(replayResponse)
        const replayErrorMessage =
          replayError && typeof replayError === 'object' && 'error' in replayError
            ? replayError.error.message
            : undefined

        throw new Error(normalizeResponseError(replayResponse.status, replayErrorMessage))
      }

      return readAgentRunStreamResponse(replayResponse, runId, handlers)
    }

    throw new Error(normalizeResponseError(liveResponse.status, liveErrorMessage))
  }

  if (stream.replayUrl) {
    handlers?.onStatusModeChange?.('history')
    handlers?.onStatus?.('正在同步本次处理记录...')
    const replayResponse = await fetchAgentRunStreamWithSignal(stream.replayUrl, signal)

    if (!replayResponse.ok) {
      const replayError = await parseApiResponse<unknown>(replayResponse)
      const replayErrorMessage =
        replayError && typeof replayError === 'object' && 'error' in replayError
          ? replayError.error.message
          : undefined

      throw new Error(normalizeResponseError(replayResponse.status, replayErrorMessage))
    }

    return readAgentRunStreamResponse(replayResponse, runId, handlers)
  }

  return {
    sessionId: null,
    statusMode: 'none',
    streamStatuses: [],
    primaryArtifact: null,
    artifacts: [],
    memoryEntries: [],
    title: '',
    content: '',
  }
}

async function readAgentEventStream(
  response: Response,
  action: AgentTaskType,
  onStatus?: (status: LiveAgentStatus) => void,
  onChunk?: (chunk: string) => void,
): Promise<WritingAgentResult> {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error('Agent 结果暂时无法读取，请稍后再试。')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let title = ''
  let primaryArtifact: BackendAgentArtifact | null = null
  const liveStatuses: WritingAgentResult['streamStatuses'] = []

  while (true) {
    const { value, done } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
      const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? ''
      const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim())

      if (!dataLines.length) {
        continue
      }

      const rawPayload = dataLines.join('\n')

      if (rawPayload === '[DONE]') {
        continue
      }

      try {
        const payload = JSON.parse(rawPayload) as Record<string, unknown>
        const eventType = typeof payload.type === 'string' ? payload.type : ''
        const payloadArtifact = extractPrimaryArtifact(payload)
        const delta =
          typeof payload.delta === 'string'
            ? payload.delta
            : typeof payload.content === 'string' && eventType === 'delta'
              ? payload.content
              : ''

        if (payloadArtifact) {
          primaryArtifact = payloadArtifact
        }

        if (typeof payload.title === 'string') {
          title = payload.title
        } else if (payloadArtifact?.title) {
          title = payloadArtifact.title
        }

        if (typeof payload.message === 'string' && payload.message.trim()) {
          const normalizedEvent = eventType === 'status' ? eventName || eventType || 'status' : eventType || eventName || 'status'
          const createdAt =
            typeof payload.createdAt === 'string' && payload.createdAt.trim()
              ? payload.createdAt
              : new Date().toISOString()

          liveStatuses.push({
            id: `live-status-${liveStatuses.length + 1}`,
            event: normalizedEvent,
            text: payload.message,
            createdAt,
          })
          onStatus?.({
            text: payload.message,
            event: normalizedEvent,
            createdAt,
          })
        }

        if (delta) {
          content += delta
          onChunk?.(delta)
        }

        if (eventType === 'result' || eventType === 'artifact') {
          const finalContent =
            typeof payloadArtifact?.content === 'string'
              ? payloadArtifact.content
              : typeof payload.content === 'string'
                ? payload.content
                : typeof payload.result === 'string'
                  ? payload.result
                  : content

          return buildAgentResult(action, finalContent, title, primaryArtifact ?? payloadArtifact ?? undefined, {
            streamStatuses: liveStatuses,
            statusMode: liveStatuses.length > 0 ? 'live' : 'none',
          })
        }
      } catch {
        content += rawPayload
        onChunk?.(rawPayload)
      }
    }
  }

  return buildAgentResult(action, content, title, primaryArtifact ?? undefined, {
    streamStatuses: liveStatuses,
    statusMode: liveStatuses.length > 0 ? 'live' : 'none',
  })
}

function buildAgentActionPath(): string {
  return '/api/agent/actions/execute'
}

function buildAgentRuntimeContext(request: WritingAgentRequest): Record<string, string> {
  const entries = Object.entries({
    novelTitle: request.novelTitle?.trim(),
    novelSummary: request.novelSummary?.trim(),
    chapterTitle: request.chapterTitle?.trim(),
    chapterSummary: request.chapterSummary?.trim(),
    chapterContent: request.chapterContent,
    selectedText: request.selectedText,
    genre: request.genre?.trim(),
    protagonist: request.protagonist?.trim(),
    tone: request.tone?.trim(),
    stylePreference: request.stylePreference?.trim(),
  }).filter(([, value]) => typeof value === 'string' && value.length > 0)

  return Object.fromEntries(entries)
}

function buildAgentActionBody(request: WritingAgentRequest): ExecuteWorkspaceAgentRequest {
  return {
    novelId: request.novelId,
    sessionId: request.sessionId,
    chapterId: request.chapterId,
    prompt: request.prompt?.trim() || '',
    selectedText: request.selectedText,
    actionHint: request.action,
    handoff: request.handoff ?? undefined,
    ...buildAgentRuntimeContext(request),
  }
}

async function tryRunAgentAction(
  request: WritingAgentRequest,
  onStatus?: (status: LiveAgentStatus) => void,
  onChunk?: (chunk: string) => void,
  onStatusModeChange?: (mode: AgentRunStatusMode) => void,
  signal?: AbortSignal,
): Promise<WritingAgentResult> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 120000)
  const abortCurrentRequest = () => controller.abort()

  signal?.addEventListener('abort', abortCurrentRequest)

  try {
    const response = await fetch(buildApiUrl(buildAgentActionPath()), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...buildAuthHeader(),
      },
      body: JSON.stringify(buildAgentActionBody(request)),
      signal: controller.signal,
    })

    if (response.status === 404 || response.status === 405) {
      throw new Error('当前任务暂时不可用，请稍后再试。')
    }

    if (!response.ok) {
      const rawText = await response.text()
      let result: ApiResponse<unknown> | null = null

      if (rawText) {
        try {
          result = JSON.parse(rawText) as ApiResponse<unknown>
        } catch {
          result = null
        }
      }

      const message =
        result && typeof result === 'object' && 'error' in result
          ? result.error.message
          : rawText || undefined

      throw new Error(normalizeResponseError(response.status, message))
    }

    const contentType = response.headers.get('content-type') ?? ''

    if (contentType.includes('text/event-stream')) {
      onStatusModeChange?.('live')
      return readAgentEventStream(response, request.action, onStatus, onChunk)
    }

    const rawText = await response.text()
    let result: ApiResponse<Record<string, unknown>> | null = null

    if (rawText) {
      try {
        result = JSON.parse(rawText) as ApiResponse<Record<string, unknown>>
      } catch {
        result = null
      }
    }

    if (!result || !result.success) {
      throw new Error('Agent 结果暂时无法读取，请稍后再试。')
    }

    const payload = result.data as AgentActionResultPayload
    const primaryArtifact = extractPrimaryArtifact(payload)
    const runId = typeof payload.run?.id === 'string' ? payload.run.id : null
    const sessionId = typeof payload.run?.sessionId === 'string' ? payload.run.sessionId : null
    const content =
      typeof primaryArtifact?.content === 'string'
        ? primaryArtifact.content
        : typeof payload.content === 'string'
          ? payload.content
          : typeof payload.result === 'string'
            ? payload.result
            : typeof payload.prompt === 'string'
              ? payload.prompt
              : typeof payload.outline === 'string'
                ? payload.outline
                : ''
    const title =
      typeof primaryArtifact?.title === 'string'
        ? primaryArtifact.title
        : typeof payload.title === 'string'
          ? payload.title
          : undefined

    const fallbackArtifacts = Array.isArray(payload.artifacts)
      ? payload.artifacts.map((artifact) => mapBackendArtifactToWritingArtifact(artifact, request.action))
      : []
    const fallbackMemoryEntries = Array.isArray(payload.memoryEntries)
      ? payload.memoryEntries.map((entry) => mapBackendMemoryEntry(entry))
      : []
    const streamResult =
      runId && payload.stream
        ? await readAgentRunStream(payload.stream, runId, {
            onStatus: onStatus
              ? (statusText) => {
                  onStatus({
                    text: statusText,
                    event: 'status',
                  })
                }
              : undefined,
            onStatusModeChange,
          }, controller.signal)
        : {
            statusMode: 'none' as const,
            streamStatuses: [] as WritingAgentResult['streamStatuses'],
            primaryArtifact: null,
            artifacts: [] as BackendAgentArtifact[],
            memoryEntries: [] as AgentMemoryEntry[],
            sessionId,
            title: '',
            content: '',
          }
    const artifacts = runId
      ? await listWritingAgentArtifacts(runId).catch(() =>
          streamResult.artifacts.length > 0
            ? streamResult.artifacts.map((artifact) =>
                mapBackendArtifactToWritingArtifact(artifact, request.action),
              )
            : fallbackArtifacts,
        )
      : fallbackArtifacts
    const finalArtifact = streamResult.primaryArtifact ?? primaryArtifact
    const finalContent =
      streamResult.content ||
      (typeof finalArtifact?.content === 'string' ? finalArtifact.content : content)
    const finalTitle =
      streamResult.title ||
      (typeof finalArtifact?.title === 'string' ? finalArtifact.title : title)
    const resolvedTask = deriveTaskFromArtifact(finalArtifact, request.action)

    return buildAgentResult(resolvedTask, finalContent, finalTitle, finalArtifact ?? undefined, {
      runId,
      sessionId: streamResult.sessionId ?? sessionId,
      artifacts,
      streamStatuses: streamResult.streamStatuses,
      statusMode: streamResult.statusMode,
      memoryEntries:
        streamResult.memoryEntries.length > 0 ? streamResult.memoryEntries : fallbackMemoryEntries,
      executionMode:
        payload.executionMode ??
        fallbackArtifacts[0]?.executionMode ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).executionMode as AgentExecutionMode | null | undefined) ?? null
          : null),
      activeAgent:
        payload.activeAgent ??
        fallbackArtifacts[0]?.activeAgent ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).activeAgent as AgentExecutionAgent | null | undefined) ?? null
          : null),
      routeDecision:
        payload.routeDecision ??
        fallbackArtifacts[0]?.routeDecision ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).routeDecision as AgentRouteDecision | null | undefined) ?? null
          : null),
      ruleBundle:
        payload.ruleBundle ??
        fallbackArtifacts[0]?.ruleBundle ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).ruleBundle as AgentRuleBundle | null | undefined) ?? null
          : null),
      storyMemoryDigest:
        payload.storyMemoryDigest ??
        fallbackArtifacts[0]?.storyMemoryDigest ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).storyMemoryDigest as AgentStoryMemoryDigest | null | undefined) ?? null
          : null),
      actionPlan:
        payload.actionPlan ??
        fallbackArtifacts[0]?.actionPlan ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).actionPlan as AgentActionPlan | null | undefined) ?? null
          : null),
      handoff:
        payload.handoff ??
        fallbackArtifacts[0]?.handoff ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).handoff as AgentActionHandoff | null | undefined) ?? null
          : null),
      toolPolicy:
        payload.toolPolicy ??
        fallbackArtifacts[0]?.toolPolicy ??
        (finalArtifact?.metadata && typeof finalArtifact.metadata === 'object' && !Array.isArray(finalArtifact.metadata)
          ? ((finalArtifact.metadata as Record<string, unknown>).toolPolicy as AgentWorkspaceToolPolicy | null | undefined) ?? null
          : null),
    })
  } finally {
    signal?.removeEventListener('abort', abortCurrentRequest)
    window.clearTimeout(timeoutId)
  }
}

export async function runWritingAgentAction(
  request: WritingAgentRequest,
  handlers?: {
    onStatus?: (status: LiveAgentStatus) => void
    onChunk?: (chunk: string) => void
    onStatusModeChange?: (mode: AgentRunStatusMode) => void
    signal?: AbortSignal
  },
): Promise<WritingAgentResult> {
  try {
    return await tryRunAgentAction(
      request,
      handlers?.onStatus,
      handlers?.onChunk,
      handlers?.onStatusModeChange,
      handlers?.signal,
    )
  } catch (error) {
    throw new Error(normalizeFetchError(error))
  }
}

export function applyWritingAgentArtifact(
  request: ApplyWritingAgentArtifactRequest,
): Promise<ApplyWritingAgentArtifactResult> {
  return requestData<ApplyWritingAgentArtifactResult>(
    `/api/agent/artifacts/${request.artifactId}/apply`,
    {
      method: 'POST',
      body: JSON.stringify({
        strategy: request.strategy,
        chapterId: request.chapterId,
      }),
      timeoutMs: 45000,
    },
  )
}

export function rollbackWritingAgentRun(runId: string): Promise<RollbackWritingAgentRunResult> {
  return requestData<RollbackWritingAgentRunResult>(`/api/agent/runs/${runId}/rollback`, {
    method: 'POST',
    timeoutMs: 45000,
  })
}

export function deleteWritingAgentRun(runId: string): Promise<DeleteWritingAgentRunResult> {
  return requestData<DeleteWritingAgentRunResult>(`/api/agent/runs/${runId}`, {
    method: 'DELETE',
    timeoutMs: 45000,
  })
}

export async function listWritingAgentSessions(novelId: string): Promise<ListAgentSessionsResponse['data']['items']> {
  const data = await requestData<ListAgentSessionsResponse['data']>(
    `/api/agent/sessions?novelId=${encodeURIComponent(novelId)}`,
  )
  return data.items
}

export async function createWritingAgentSession(
  novelId: string,
  title?: string,
): Promise<CreateAgentSessionResponse['data']['session']> {
  const data = await requestData<CreateAgentSessionResponse['data']>('/api/agent/sessions', {
    method: 'POST',
    body: JSON.stringify({
      novelId,
      title,
    }),
  })

  return data.session
}

export async function updateWritingAgentSession(
  sessionId: string,
  payload: UpdateAgentSessionRequest,
): Promise<UpdateAgentSessionResponse['data']['session']> {
  const data = await requestData<UpdateAgentSessionResponse['data']>(`/api/agent/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

  return data.session
}

export async function deleteWritingAgentSession(
  sessionId: string,
): Promise<DeleteAgentSessionResponse['data']> {
  return requestData<DeleteAgentSessionResponse['data']>(`/api/agent/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

export async function getWritingAgentSessionHistory(
  sessionId: string,
): Promise<ListAgentSessionHistoryResponse['data']['items']> {
  const data = await requestData<ListAgentSessionHistoryResponse['data']>(
    `/api/agent/sessions/${sessionId}/history`,
  )
  return data.items
}

export type NovelPlanFileItem = {
  id: string
  runId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

/** 计划文件夹：作品维度拉取已存入云端的创作计划（跨会话聚合） */
export async function listNovelPlanFiles(novelId: string): Promise<NovelPlanFileItem[]> {
  const data = await requestData<{ items: NovelPlanFileItem[] }>(
    `/api/agent/plans?novelId=${encodeURIComponent(novelId)}`,
  )
  return data.items
}

/** 计划文件夹：同步改名/改正文，saved=false 从云端文件夹移除 */
export async function updateNovelPlanFile(
  artifactId: string,
  patch: { title?: string; content?: string; saved?: boolean },
): Promise<NovelPlanFileItem> {
  const data = await requestData<{ item: NovelPlanFileItem }>(`/api/agent/plans/${artifactId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return data.item
}

export function getStudioPayload(novelId: string): Promise<StudioPayload> {
  return requestData<StudioPayload>(`/api/novels/${novelId}/studio`)
}

/** 发布作品：同时批量发布选中章节并设置可见范围 */
export async function publishNovelWorkspace(
  novelId: string,
  payload: PublishNovelRequest,
): Promise<PublishNovelResponse['data']> {
  return requestData<PublishNovelResponse['data']>(`/api/novels/${novelId}/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createNovelWorkspace(payload: CreateNovelRequest): Promise<Novel> {
  const data = await requestData<CreateNovelResponse['data']>('/api/novels', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return data.novel
}

export async function getChapterContent(novelId: string, chapterId: string): Promise<Chapter> {
  const data = await requestData<GetChapterResponse['data']>(
    `/api/novels/${novelId}/chapters/${chapterId}`,
  )

  return data.chapter
}

export async function updateNovelMeta(
  novelId: string,
  payload: UpdateNovelRequest,
): Promise<Novel> {
  const data = await requestData<{ novel: Novel }>(`/api/novels/${novelId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

  return data.novel
}

export async function uploadNovelCover(
  novelId: string,
  payload: UploadNovelCoverRequest,
): Promise<UploadNovelCoverResponse['data']> {
  return requestData<UploadNovelCoverResponse['data']>(`/api/novels/${novelId}/cover`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteNovelWorkspace(novelId: string): Promise<void> {
  await requestData<DeleteNovelResponse['data']>(`/api/novels/${novelId}`, {
    method: 'DELETE',
  })
}

export async function createChapterDraft(
  novelId: string,
  payload: CreateChapterRequest,
): Promise<Chapter> {
  const data = await requestData<{ chapter: Chapter }>(`/api/novels/${novelId}/chapters`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return data.chapter
}

export async function updateChapterDraft(
  novelId: string,
  chapterId: string,
  payload: UpdateChapterRequest,
): Promise<Chapter> {
  const data = await requestData<{ chapter: Chapter }>(
    `/api/novels/${novelId}/chapters/${chapterId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  )

  return data.chapter
}

export async function deleteChapterDraft(novelId: string, chapterId: string): Promise<void> {
  await requestData<DeleteChapterResponse['data']>(`/api/novels/${novelId}/chapters/${chapterId}`, {
    method: 'DELETE',
  })
}

export function generateCoverPrompt(
  request: GenerateCoverPromptRequest,
): Promise<GenerateCoverPromptResponse['data']> {
  return requestData<GenerateCoverPromptResponse['data']>('/api/ai/cover-prompt', {
    method: 'POST',
    body: JSON.stringify(request),
    timeoutMs: 60000,
  })
}

export function generateCoverImages(
  request: GenerateCoverImageRequest,
): Promise<GenerateCoverImageResponse['data']> {
  return requestData<GenerateCoverImageResponse['data']>('/api/ai/cover-image', {
    method: 'POST',
    body: JSON.stringify(request),
    timeoutMs: 0,
  })
}
