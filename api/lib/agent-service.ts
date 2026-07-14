import type { Prisma } from '@prisma/client'
import type {
  AgentActionKind,
  AgentActionHandoff,
  AgentActionPlan,
  AgentActionResponse,
  AgentArtifact,
  AgentArtifactApplyStrategy,
  AgentExecutionAgent,
  AgentExecutionMode,
  AgentRouteDecision,
  AgentWorkspaceToolName,
  AgentWorkspaceToolPolicy,
  AgentRun,
  AgentRunMode,
  AgentSession,
  ApplyAgentArtifactRequest,
  ContinueChapterRequest,
  CreateAgentRunRequest,
  CreateAgentSessionRequest,
  DraftChapterRequest,
  ExecuteWorkspaceAgentRequest,
  GenerateAgentCoverPromptRequest,
  PlanChapterRequest,
  PolishSelectionRequest,
  ProjectMemoryEntry,
  ReviewContinuityRequest,
  RewriteSelectionRequest,
} from '../../shared/contracts/index.js'
import { prisma, DataAccessError } from './prisma.js'
import { generateTextCompletion } from './ai-service.js'
import {
  buildWorkspaceToolPolicy,
  getWorkspaceToolDefinition,
  resolveWorkspaceToolPermission,
} from './agent-workspace-tools.js'

type AgentActionInput =
  | ({ kind: 'planChapter' } & PlanChapterRequest)
  | ({ kind: 'draftChapter' } & DraftChapterRequest)
  | ({ kind: 'continueChapter' } & ContinueChapterRequest)
  | ({ kind: 'rewriteSelection' } & RewriteSelectionRequest)
  | ({ kind: 'polishSelection' } & PolishSelectionRequest)
  | ({ kind: 'reviewContinuity' } & ReviewContinuityRequest)
  | ({ kind: 'generateCoverPrompt' } & GenerateAgentCoverPromptRequest)

type WorkspaceAgentIntent =
  | 'workspaceAgent'
  | 'generateNovelTitle'
  | 'generateChapterTitles'
  | 'readStoryContext'
  | 'planChapter'
  | 'draftChapter'
  | 'continueChapter'
  | 'rewriteSelection'
  | 'polishSelection'
  | 'reviewContinuity'
  | 'generateCoverPrompt'

type WorkspaceTaskName =
  | 'workspace-agent'
  | 'generate-novel-title'
  | 'generate-chapter-titles'
  | 'read-story-context'
  | 'plan-chapter'
  | 'draft-chapter'
  | 'continue-chapter'
  | 'rewrite-selection'
  | 'polish-selection'
  | 'review-continuity'
  | 'generate-cover-prompt'

type ExecuteWorkspaceAgentInput = ExecuteWorkspaceAgentRequest

type PromptBackedRunConfig = {
  userId: string
  sessionId: string
  novelId: string
  chapterId?: string | null
  action: AgentActionKind
  mode: AgentRunMode
  agentType: AgentRun['agentType']
  artifactType: AgentArtifact['artifactType']
  title: string
  inputSummary: string
  prompt: string
  systemPrompt?: string
  memoryType?: ProjectMemoryEntry['memoryType']
  artifactMetadata?: Record<string, unknown>
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  return typeof value === 'string' ? value : value.toISOString()
}

function clipText(value: string | null | undefined, maxLength: number): string {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return ''
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function asMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asAgentActionPlan(value: unknown): AgentActionPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const plan = value as Record<string, unknown>
  if (
    (plan.mode !== 'plan' && plan.mode !== 'execute' && plan.mode !== 'review') ||
    typeof plan.summary !== 'string' ||
    !Array.isArray(plan.steps)
  ) {
    return null
  }

  return plan as unknown as AgentActionPlan
}

function asAgentWorkspaceToolPolicy(value: unknown): AgentWorkspaceToolPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const policy = value as Record<string, unknown>
  if (
    (policy.mode !== 'plan' && policy.mode !== 'build' && policy.mode !== 'review') ||
    !Array.isArray(policy.tools)
  ) {
    return null
  }

  return policy as unknown as AgentWorkspaceToolPolicy
}

function asAgentExecutionAgent(value: unknown): AgentExecutionAgent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const validAgentType = [
    'writingOrchestrator',
    'storyPlanner',
    'draftWriter',
    'continuityEditor',
    'styleEditor',
    'loreLibrarian',
    'coverPromptAgent',
  ].includes(String(candidate.agentType))

  if (!validAgentType || (candidate.role !== 'primary' && candidate.role !== 'specialist')) {
    return null
  }

  if (typeof candidate.title !== 'string' || typeof candidate.description !== 'string') {
    return null
  }

  return candidate as unknown as AgentExecutionAgent
}

function buildExecutionAgent(agentType: AgentRun['agentType']): AgentExecutionAgent {
  switch (agentType) {
    case 'writingOrchestrator':
      return {
        agentType,
        role: 'primary',
        title: '主控 Agent',
        description: '负责理解当前指令、组织工作区上下文，并决定交给哪个专职代理处理。',
      }
    case 'storyPlanner':
      return {
        agentType,
        role: 'specialist',
        title: '剧情规划 Agent',
        description: '负责章节规划、结构拆解、书名与章节名提案等前置设计任务。',
      }
    case 'draftWriter':
      return {
        agentType,
        role: 'specialist',
        title: '正文写作 Agent',
        description: '负责起草正文、续写章节，并把可执行写作结果交回工作台。',
      }
    case 'continuityEditor':
      return {
        agentType,
        role: 'specialist',
        title: '连续性审阅 Agent',
        description: '负责检查设定冲突、时间线问题和章节之间的连续性。',
      }
    case 'styleEditor':
      return {
        agentType,
        role: 'specialist',
        title: '文风编辑 Agent',
        description: '负责改写、润色和局部表达优化，不直接承担全章规划。',
      }
    case 'loreLibrarian':
      return {
        agentType,
        role: 'specialist',
        title: '设定检索 Agent',
        description: '负责读取作品上下文、设定摘要和历史记忆，为当前任务补全背景。',
      }
    case 'coverPromptAgent':
      return {
        agentType,
        role: 'specialist',
        title: '封面提示词 Agent',
        description: '负责整理封面画面描述和视觉提示词，不介入正文写作接口。',
      }
  }
}

function asAgentRouteDecision(value: unknown): AgentRouteDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const sourceAgent = asAgentExecutionAgent(candidate.sourceAgent)
  const targetAgent = asAgentExecutionAgent(candidate.targetAgent)

  if (!sourceAgent || !targetAgent) {
    return null
  }

  if (
    typeof candidate.task !== 'string' ||
    typeof candidate.intentLabel !== 'string' ||
    typeof candidate.summary !== 'string'
  ) {
    return null
  }

  return {
    sourceAgent,
    targetAgent,
    task: candidate.task,
    intentLabel: candidate.intentLabel,
    summary: candidate.summary,
  }
}

function buildWorkspaceRouteDecision(config: ReturnType<typeof resolveWorkspaceIntentConfig>): AgentRouteDecision {
  const sourceAgent = buildExecutionAgent('writingOrchestrator')
  const targetAgent = buildExecutionAgent(config.agentType)

  return {
    sourceAgent,
    targetAgent,
    task: config.task,
    intentLabel: config.title,
    summary:
      targetAgent.agentType === sourceAgent.agentType
        ? `${sourceAgent.title} 判断当前任务适合继续由自己直接处理。`
        : `${sourceAgent.title} 判断当前任务更适合交给 ${targetAgent.title} 处理。`,
  }
}

function resolveBuildActionHintFromPlan(actionPlan: AgentActionPlan): ExecuteWorkspaceAgentRequest['actionHint'] {
  return actionPlan.steps.some((step) =>
    ['chapter.create', 'chapter.write', 'chapter.append'].includes(step.toolName),
  )
    ? 'draft-chapter'
    : 'workspace-agent'
}

function buildPlanToBuildHandoff(
  actionPlan: AgentActionPlan | null,
  runId?: string | null,
  artifactId?: string | null,
): AgentActionHandoff | null {
  if (!actionPlan || actionPlan.mode !== 'plan' || actionPlan.steps.length === 0) {
    return null
  }

  return {
    sourceMode: 'plan',
    targetMode: 'build',
    title: '按这份计划开始执行',
    summary: '确认后会把刚才的规划直接交给执行模式，不需要你重新解释需求。',
    confirmLabel: '确认执行计划',
    actionHint: resolveBuildActionHintFromPlan(actionPlan),
    sourceRunId: runId ?? null,
    sourceArtifactId: artifactId ?? null,
  }
}

function buildActionPlanStep(
  executionMode: AgentExecutionMode,
  step: {
    id: string
    toolName: AgentWorkspaceToolName
    target: AgentActionPlan['steps'][number]['target']
    payload: AgentActionPlan['steps'][number]['payload']
  },
): AgentActionPlan['steps'][number] | null {
  const definition = getWorkspaceToolDefinition(step.toolName)

  if (!definition) {
    return null
  }

  const permission = resolveWorkspaceToolPermission(executionMode, step.toolName)
  if (permission === 'deny') {
    return null
  }

  return {
    id: step.id,
    toolName: step.toolName,
    title: definition.title,
    requiresConfirm: permission === 'ask',
    target: step.target,
    payload: step.payload,
  }
}

function hydrateHandoffSource(
  handoff: AgentActionHandoff | null,
  runId: string,
  artifactId: string,
): AgentActionHandoff | null {
  if (!handoff) {
    return null
  }

  return {
    ...handoff,
    sourceRunId: handoff.sourceRunId ?? runId,
    sourceArtifactId: handoff.sourceArtifactId ?? artifactId,
  }
}

function defaultArtifactApplyStrategies(
  artifactType: AgentArtifact['artifactType'],
): AgentArtifactApplyStrategy[] {
  if (artifactType === 'chapterDraft') {
    return ['replaceChapterContent', 'appendChapterContent']
  }

  if (artifactType === 'chapterContinuation') {
    return ['appendChapterContent', 'replaceChapterContent']
  }

  if (artifactType === 'rewriteSelection' || artifactType === 'polishSelection') {
    return ['replaceChapterContent']
  }

  if (artifactType === 'chapterPlan' || artifactType === 'continuityReview') {
    return ['saveChapterSummary']
  }

  if (artifactType === 'coverPrompt') {
    return ['setNovelCoverPrompt']
  }

  return []
}

function resolveArtifactApplyStrategies(record: {
  artifactType: AgentArtifact['artifactType']
  metadata?: Record<string, unknown> | null
}): AgentArtifactApplyStrategy[] {
  const metadata = record.metadata ?? null

  if (Array.isArray(metadata?.availableApplyStrategies)) {
    return metadata.availableApplyStrategies.filter(
      (strategy): strategy is AgentArtifactApplyStrategy => typeof strategy === 'string',
    )
  }

  const task = typeof metadata?.workspaceTask === 'string' ? metadata.workspaceTask : null
  if (
    task === 'generate-novel-title' ||
    task === 'generate-chapter-titles' ||
    task === 'read-story-context' ||
    task === 'workspace-agent'
  ) {
    return []
  }

  return defaultArtifactApplyStrategies(record.artifactType)
}

function toAgentSession(record: any): AgentSession {
  return {
    id: record.id,
    userId: record.userId,
    novelId: record.novelId,
    title: record.title,
    status: record.status,
    lastRunAt: toIso(record.lastRunAt),
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

function toAgentRun(record: any): AgentRun {
  return {
    id: record.id,
    sessionId: record.sessionId,
    userId: record.userId,
    novelId: record.novelId,
    chapterId: record.chapterId ?? null,
    mode: record.mode,
    action: record.action,
    agentType: record.agentType,
    status: record.status,
    inputSummary: record.inputSummary ?? null,
    outputSummary: record.outputSummary ?? null,
    errorMessage: record.errorMessage ?? null,
    startedAt: toIso(record.startedAt),
    finishedAt: toIso(record.finishedAt),
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

function toAgentArtifact(record: any): AgentArtifact {
  const metadata = asMetadataRecord(record.metadata)

  return {
    id: record.id,
    runId: record.runId,
    artifactType: record.artifactType,
    title: record.title,
    summary: record.summary ?? null,
    content: record.content,
    metadata,
    availableApplyStrategies: resolveArtifactApplyStrategies({
      artifactType: record.artifactType,
      metadata,
    }),
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

function toProjectMemoryEntry(record: any): ProjectMemoryEntry {
  return {
    id: record.id,
    runId: record.runId ?? null,
    novelId: record.novelId,
    sourceChapterId: record.sourceChapterId ?? null,
    memoryType: record.memoryType,
    title: record.title,
    content: record.content,
    importance: record.importance ?? 50,
    embeddingRef: record.embeddingRef ?? null,
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
  }
}

function toExecutionMode(mode: AgentRunMode): AgentExecutionMode {
  if (mode === 'act') {
    return 'build'
  }

  return mode
}

function asAgentActionHandoff(value: unknown): AgentActionHandoff | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentActionHandoff>
  if (
    (candidate.sourceMode !== 'plan' && candidate.sourceMode !== 'build' && candidate.sourceMode !== 'review') ||
    (candidate.targetMode !== 'plan' && candidate.targetMode !== 'build' && candidate.targetMode !== 'review') ||
    typeof candidate.title !== 'string' ||
    typeof candidate.summary !== 'string' ||
    typeof candidate.confirmLabel !== 'string'
  ) {
    return null
  }

  return candidate as AgentActionHandoff
}

function getArtifactMetadataWithSnapshot(
  metadata: Record<string, unknown> | null,
  snapshot: Record<string, unknown>,
): Prisma.InputJsonValue {
  const existingSnapshots = Array.isArray(metadata?.rollbackSnapshots)
    ? metadata.rollbackSnapshots.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    : []

  return {
    ...(metadata ?? {}),
    rollbackSnapshots: [...existingSnapshots, snapshot],
    lastAppliedAt: typeof snapshot.appliedAt === 'string' ? snapshot.appliedAt : new Date().toISOString(),
    lastAppliedStrategy: typeof snapshot.strategy === 'string' ? snapshot.strategy : null,
  } as Prisma.InputJsonValue
}

function getArtifactRollbackSnapshots(metadata: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!Array.isArray(metadata?.rollbackSnapshots)) {
    return []
  }

  return metadata.rollbackSnapshots.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
  )
}

async function ensureOwnedNovel(userId: string, novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
  })

  if (!novel) {
    throw new DataAccessError(404, 'NOVEL_NOT_FOUND', '未找到作品。')
  }

  if (novel.authorId !== userId) {
    throw new DataAccessError(403, 'NOVEL_FORBIDDEN', '当前账号无权访问该作品。')
  }

  return novel
}

async function ensureOwnedSession(userId: string, sessionId: string) {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
  })

  if (!session) {
    throw new DataAccessError(404, 'AGENT_SESSION_NOT_FOUND', '未找到会话。')
  }

  if (session.userId !== userId) {
    throw new DataAccessError(403, 'AGENT_SESSION_FORBIDDEN', '当前账号无权访问该会话。')
  }

  return session
}

async function ensureOwnedRun(userId: string, runId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
  })

  if (!run) {
    throw new DataAccessError(404, 'AGENT_RUN_NOT_FOUND', '未找到运行记录。')
  }

  if (run.userId !== userId) {
    throw new DataAccessError(403, 'AGENT_RUN_FORBIDDEN', '当前账号无权访问该运行记录。')
  }

  return run
}

async function ensureOwnedArtifact(userId: string, artifactId: string) {
  const artifact = await prisma.agentArtifact.findUnique({
    where: { id: artifactId },
    include: {
      run: true,
    },
  })

  if (!artifact) {
    throw new DataAccessError(404, 'AGENT_ARTIFACT_NOT_FOUND', '未找到结果物。')
  }

  if (artifact.run.userId !== userId) {
    throw new DataAccessError(403, 'AGENT_ARTIFACT_FORBIDDEN', '当前账号无权访问该结果物。')
  }

  return artifact
}

export async function listAgentSessionsData(userId: string, novelId?: string) {
  const items = await prisma.agentSession.findMany({
    where: {
      userId,
      ...(novelId ? { novelId } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
  })

  return {
    items: items.map(toAgentSession),
  }
}

export async function createAgentSessionData(userId: string, input: CreateAgentSessionRequest) {
  const novel = await ensureOwnedNovel(userId, input.novelId)

  const session = await prisma.agentSession.create({
    data: {
      userId,
      novelId: input.novelId,
      title: input.title?.trim() || `${novel.title} 写作会话`,
      status: 'active',
    },
  })

  return {
    session: toAgentSession(session),
  }
}

async function ensureSessionForAction(userId: string, novelId: string, sessionId?: string) {
  if (sessionId) {
    const session = await ensureOwnedSession(userId, sessionId)
    if (session.novelId !== novelId) {
      throw new DataAccessError(400, 'AGENT_SESSION_NOVEL_MISMATCH', '会话与作品不匹配。')
    }
    return session
  }

  const novel = await ensureOwnedNovel(userId, novelId)
  return prisma.agentSession.create({
    data: {
      userId,
      novelId,
      title: `${novel.title} 写作会话`,
      status: 'active',
    },
  })
}

function resolveActionConfig(kind: AgentActionKind): {
  mode: AgentRunMode
  agentType: AgentRun['agentType']
  artifactType: AgentArtifact['artifactType']
  title: string
  memoryType?: ProjectMemoryEntry['memoryType']
} {
  switch (kind) {
    case 'planChapter':
      return {
        mode: 'plan',
        agentType: 'storyPlanner',
        artifactType: 'chapterPlan',
        title: '章节计划',
        memoryType: 'chapterSummary',
      }
    case 'draftChapter':
      return {
        mode: 'act',
        agentType: 'draftWriter',
        artifactType: 'chapterDraft',
        title: '正文草稿',
      }
    case 'continueChapter':
      return {
        mode: 'act',
        agentType: 'draftWriter',
        artifactType: 'chapterContinuation',
        title: '续写结果',
      }
    case 'rewriteSelection':
      return {
        mode: 'act',
        agentType: 'styleEditor',
        artifactType: 'rewriteSelection',
        title: '改写结果',
      }
    case 'polishSelection':
      return {
        mode: 'review',
        agentType: 'styleEditor',
        artifactType: 'polishSelection',
        title: '润色结果',
      }
    case 'reviewContinuity':
      return {
        mode: 'review',
        agentType: 'continuityEditor',
        artifactType: 'continuityReview',
        title: '连续性审阅',
        memoryType: 'continuityRule',
      }
    case 'generateCoverPrompt':
      return {
        mode: 'act',
        agentType: 'coverPromptAgent',
        artifactType: 'coverPrompt',
        title: '封面提示词',
        memoryType: 'stylePreference',
      }
  }
}

function buildDefaultSystemPrompt(title: string): string {
  return [
    '你是小说创作工作台中的专业写作 Agent。',
    `本次任务主题：${title}。`,
    '请直接输出可交付的中文结果，不要输出开发说明、系统提示或多余免责声明。',
  ].join('\n')
}

async function executePromptBackedRun(config: PromptBackedRunConfig): Promise<AgentActionResponse['data']> {
  const run = await prisma.agentRun.create({
    data: {
      sessionId: config.sessionId,
      userId: config.userId,
      novelId: config.novelId,
      chapterId: config.chapterId ?? null,
      mode: config.mode,
      action: config.action,
      agentType: config.agentType,
      status: 'running',
      inputSummary: config.inputSummary,
      startedAt: new Date(),
    },
  })

  try {
    const content = await generateTextCompletion(
      config.systemPrompt ?? buildDefaultSystemPrompt(config.title),
      config.prompt,
      {
        userId: config.userId,
        action:
          typeof config.artifactMetadata?.workspaceTask === 'string'
            ? `agent:${config.artifactMetadata.workspaceTask}`
            : `agent:${config.action}`,
        novelId: config.novelId,
        chapterId: config.chapterId ?? null,
        targetType: 'agentRun',
        targetId: run.id,
      },
    )

    const artifact = await prisma.agentArtifact.create({
      data: {
        runId: run.id,
        artifactType: config.artifactType,
        title: config.title,
        summary: config.inputSummary,
        content,
        metadata: {
          action: config.action,
          ...(config.artifactMetadata ?? {}),
        },
      },
    })

    const memoryEntries: ProjectMemoryEntry[] = []
    if (config.memoryType) {
      const entry = await prisma.projectMemoryEntry.create({
        data: {
          runId: run.id,
          novelId: config.novelId,
          sourceChapterId: config.chapterId ?? null,
          memoryType: config.memoryType,
          title: config.title,
          content,
          importance: 60,
        },
      })
      memoryEntries.push(toProjectMemoryEntry(entry))
    }

    const completedRun = await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        outputSummary: clipText(content, 160),
        finishedAt: new Date(),
      },
    })

    await prisma.agentSession.update({
      where: { id: config.sessionId },
      data: {
        lastRunAt: new Date(),
      },
    })

    const artifactPayload = toAgentArtifact(artifact)
    const executionMode =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? ((artifactPayload.metadata as Record<string, unknown>).executionMode as AgentExecutionMode | null | undefined) ?? null
        : null
    const handoff =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? hydrateHandoffSource(
            asAgentActionHandoff((artifactPayload.metadata as Record<string, unknown>).handoff),
            run.id,
            artifact.id,
          )
        : null
    const actionPlan =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? asAgentActionPlan((artifactPayload.metadata as Record<string, unknown>).actionPlan)
        : null
    const activeAgent =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? asAgentExecutionAgent((artifactPayload.metadata as Record<string, unknown>).activeAgent)
        : buildExecutionAgent(completedRun.agentType)
    const routeDecision =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? asAgentRouteDecision((artifactPayload.metadata as Record<string, unknown>).routeDecision)
        : null
    const toolPolicy =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? asAgentWorkspaceToolPolicy((artifactPayload.metadata as Record<string, unknown>).toolPolicy)
        : null

    return {
      run: toAgentRun(completedRun),
      artifacts: [artifactPayload],
      memoryEntries,
      artifact: artifactPayload,
      title: artifactPayload.title,
      content: artifactPayload.content,
      summary: artifactPayload.summary,
      artifactType: artifactPayload.artifactType,
      activeAgent,
      routeDecision,
      executionMode,
      actionPlan,
      handoff,
      toolPolicy,
      stream: {
        liveUrl: `/api/agent/runs/${run.id}/stream`,
        replayUrl: `/api/agent/runs/${run.id}/stream`,
      },
      result: artifactPayload.content,
      prompt: artifactPayload.artifactType === 'coverPrompt' ? artifactPayload.content : undefined,
      outline: artifactPayload.artifactType === 'chapterPlan' ? artifactPayload.content : undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent 执行失败。'
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
      },
    })
    throw error
  }
}

async function buildActionPrompt(userId: string, input: AgentActionInput) {
  const novel = await ensureOwnedNovel(userId, input.novelId)
  const chapter =
    'chapterId' in input && input.chapterId
      ? await prisma.chapter.findUnique({ where: { id: input.chapterId } })
      : null

  if (chapter && chapter.novelId !== novel.id) {
    throw new DataAccessError(400, 'CHAPTER_NOVEL_MISMATCH', '章节与作品不匹配。')
  }

  const runtimeContext = {
    novelTitle: 'novelTitle' in input ? input.novelTitle : undefined,
    novelSummary: 'novelSummary' in input ? input.novelSummary : undefined,
    genre: 'genre' in input ? input.genre : undefined,
    stylePreference: 'stylePreference' in input ? input.stylePreference : undefined,
    chapterTitle: 'chapterTitle' in input ? input.chapterTitle : undefined,
    chapterSummary: 'chapterSummary' in input ? input.chapterSummary : undefined,
    chapterContent: 'chapterContent' in input ? input.chapterContent : undefined,
  }

  const baseContext = [
    `作品标题：${runtimeContext.novelTitle ?? novel.title}`,
    `作品简介：${runtimeContext.novelSummary ?? novel.summary}`,
    runtimeContext.genre ? `题材：${runtimeContext.genre}` : '',
    runtimeContext.stylePreference ? `风格偏好：${runtimeContext.stylePreference}` : '',
    chapter ? `章节标题：${runtimeContext.chapterTitle ?? chapter.title}` : '',
    chapter?.summary ? `章节摘要：${runtimeContext.chapterSummary ?? chapter.summary}` : '',
    runtimeContext.chapterContent
      ? `章节正文：${runtimeContext.chapterContent}`
      : chapter?.content
        ? `章节正文：${chapter.content}`
        : '',
  ]
    .filter(Boolean)
    .join('\n')

  switch (input.kind) {
    case 'planChapter':
      return {
        summary: input.prompt,
        prompt: `${baseContext}\n\n任务：围绕当前章节生成清晰可执行的写作计划。\n补充要求：${input.prompt}`,
      }
    case 'draftChapter':
      return {
        summary: input.prompt,
        prompt: `${baseContext}\n\n任务：根据已有设定直接起草正文，输出可直接落回编辑器的中文内容。\n补充要求：${input.prompt}`,
      }
    case 'continueChapter':
      return {
        summary: input.prompt ?? '继续当前章节',
        prompt: `${baseContext}\n\n任务：自然续写当前章节，保持人物、情绪和语气一致。\n补充要求：${input.prompt ?? '请承接前文继续写下去。'}`,
      }
    case 'rewriteSelection':
      return {
        summary: input.instruction,
        prompt: `${baseContext}\n\n选中文本：${input.selectedText}\n任务：根据要求改写上面的选中文本。\n改写要求：${input.instruction}`,
      }
    case 'polishSelection':
      return {
        summary: input.prompt ?? input.instruction ?? '润色选中文本',
        prompt: `${baseContext}\n\n选中文本：${input.selectedText}\n任务：润色上面的选中文本，在不改变剧情含义的前提下提升表达质量。\n润色要求：${input.prompt ?? input.instruction ?? '语言更凝练、更顺滑、更有画面感。'}`,
      }
    case 'reviewContinuity':
      return {
        summary: input.prompt,
        prompt: `${baseContext}\n\n任务：审阅设定一致性、人物动机和情节衔接，指出问题并给出建议。\n补充要求：${input.prompt}`,
      }
    case 'generateCoverPrompt':
      return {
        summary: input.prompt ?? '生成封面提示词',
        prompt: `${baseContext}\n\n任务：为当前作品生成中文封面提示词，突出题材、氛围、人物和画面中心。\n补充要求：${input.prompt ?? '请直接输出适合生图模型使用的提示词。'}`,
      }
  }
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

function mapActionHintToIntent(actionHint?: string): WorkspaceAgentIntent | null {
  switch (actionHint) {
    case 'workspace-agent':
      return 'workspaceAgent'
    case 'generate-novel-title':
      return 'generateNovelTitle'
    case 'generate-chapter-titles':
      return 'generateChapterTitles'
    case 'read-story-context':
      return 'readStoryContext'
    case 'plan-chapter':
      return 'planChapter'
    case 'draft-chapter':
      return 'draftChapter'
    case 'continue-chapter':
      return 'continueChapter'
    case 'rewrite-selection':
      return 'rewriteSelection'
    case 'polish-selection':
      return 'polishSelection'
    case 'review-continuity':
      return 'reviewContinuity'
    case 'generate-cover-prompt':
      return 'generateCoverPrompt'
    default:
      return null
  }
}

function inferWorkspaceIntent(input: ExecuteWorkspaceAgentInput): WorkspaceAgentIntent {
  const hintedIntent = mapActionHintToIntent(input.actionHint)
  if (hintedIntent && hintedIntent !== 'workspaceAgent') {
    return hintedIntent
  }

  const prompt = input.prompt.trim().toLowerCase()
  const hasSelectedText = Boolean(input.selectedText?.trim())

  if (
    containsAny(prompt, ['书名', '作品名', '小说名']) &&
    containsAny(prompt, ['起', '取', '想', '生成', '命名', '候选', '帮我想'])
  ) {
    return 'generateNovelTitle'
  }

  if (
    containsAny(prompt, ['章节名', '章名', '目录名', '小节名', '分章']) &&
    containsAny(prompt, ['起', '取', '想', '生成', '命名', '候选', '列'])
  ) {
    return 'generateChapterTitles'
  }

  if (containsAny(prompt, ['给章节命名', '帮我给章节命名', '给这章命名', '给这一章命名', '给本章命名', '改章节名', '改章名'])) {
    return 'generateChapterTitles'
  }

  if (
    containsAny(prompt, ['章节名称', '章节标题', '目录', '片段', '正文片段', '章节内容', '各章']) &&
    containsAny(prompt, ['读取', '查看', '列出', '梳理', '总结', '读', '看看', '分析'])
  ) {
    return 'readStoryContext'
  }

  if (containsAny(prompt, ['封面', '提示词', 'cover'])) {
    return 'generateCoverPrompt'
  }

  if (containsAny(prompt, ['审阅', '审查', '一致性', '连贯', '矛盾', '时间线', '设定冲突', '逻辑问题'])) {
    return 'reviewContinuity'
  }

  if (containsAny(prompt, ['计划', '章纲', '大纲', '规划', '拆解', '结构'])) {
    return 'planChapter'
  }

  if (containsAny(prompt, ['创建章节', '新建章节', '新增章节', '加一章', '开一章'])) {
    return 'draftChapter'
  }

  if (containsAny(prompt, ['续写', '接着写', '继续写', '往下写', '后续'])) {
    return 'continueChapter'
  }

  if (
    containsAny(prompt, [
      '写一下',
      '写点',
      '写一下里面内容',
      '写里面内容',
      '里面内容',
      '写点内容',
      '章节内容',
      '这章内容',
      '这一章内容',
      '本章内容',
      '写正文',
      '生成正文',
      '填充正文',
      '帮我写',
      '直接写',
      '写入正文',
      '写进去',
    ])
  ) {
    return 'draftChapter'
  }

  if (
    hasSelectedText &&
    containsAny(prompt, ['润色', 'polish', '优化表达', '更顺', '更流畅', '收紧', '提炼'])
  ) {
    return 'polishSelection'
  }

  if (
    hasSelectedText &&
    containsAny(prompt, ['改写', '重写', 'rewrite', '换一种写法', '改成'])
  ) {
    return 'rewriteSelection'
  }

  return hintedIntent ?? 'draftChapter'
}

function shouldPlanRenameNovel(prompt: string, intent: WorkspaceAgentIntent) {
  return (
    intent === 'generateNovelTitle' ||
    (containsAny(prompt, ['书名', '作品名', '小说名']) &&
      containsAny(prompt, ['命名', '改名', '起名', '取名', '帮我想', '换个名字']))
  )
}

function shouldPlanRenameChapter(prompt: string, intent: WorkspaceAgentIntent) {
  return (
    intent === 'generateChapterTitles' ||
    containsAny(prompt, ['给章节命名', '帮我给章节命名', '给这章命名', '给这一章命名', '给本章命名', '改章节名', '改章名'])
  )
}

function shouldPlanCreateChapter(prompt: string, intent: WorkspaceAgentIntent, hasChapterTarget: boolean) {
  return (
    containsAny(prompt, ['创建章节', '新建章节', '新增章节', '加一章', '开一章']) ||
    (!hasChapterTarget && (intent === 'draftChapter' || intent === 'continueChapter'))
  )
}

function shouldPlanAppendChapter(prompt: string, intent: WorkspaceAgentIntent) {
  return (
    intent === 'continueChapter' ||
    containsAny(prompt, ['续写', '接着写', '继续写', '往下写', '后续', '追加', '补写'])
  )
}

function shouldPlanWriteChapter(prompt: string, intent: WorkspaceAgentIntent) {
  return (
    intent === 'draftChapter' ||
    intent === 'continueChapter' ||
    containsAny(prompt, [
      '写一下',
      '写点',
      '写一下里面内容',
      '写里面内容',
      '里面内容',
      '写点内容',
      '章节内容',
      '这章内容',
      '这一章内容',
      '本章内容',
      '写正文',
      '生成正文',
      '填充正文',
      '帮我写',
      '直接写',
      '写入正文',
      '写进去',
    ])
  )
}

function buildWorkspaceActionPlan(input: ExecuteWorkspaceAgentInput, intent: WorkspaceAgentIntent): AgentActionPlan | null {
  const prompt = input.prompt.trim().toLowerCase()
  const steps: AgentActionPlan['steps'] = []
  const hasChapterTarget = Boolean(input.chapterId)

  if (shouldPlanRenameNovel(prompt, intent)) {
    steps.push({
      id: 'rename_novel',
      toolName: 'novel.rename',
      title: '命名当前作品',
      requiresConfirm: false,
      target: {
        scope: 'novel',
        novelId: input.novelId,
      },
      payload: {
        source: 'artifact',
      },
    })
  }

  if (shouldPlanRenameChapter(prompt, intent) && hasChapterTarget) {
    steps.push({
      id: 'rename_chapter',
      toolName: 'chapter.rename',
      title: '命名当前章节',
      requiresConfirm: false,
      target: {
        scope: 'chapter',
        novelId: input.novelId,
        chapterId: input.chapterId ?? null,
      },
      payload: {
        source: 'artifact',
      },
    })
  }

  if (shouldPlanWriteChapter(prompt, intent)) {
    const createChapter = shouldPlanCreateChapter(prompt, intent, hasChapterTarget)
    const appendChapter = !createChapter && shouldPlanAppendChapter(prompt, intent)

    steps.push({
      id: createChapter ? 'create_chapter' : appendChapter ? 'append_chapter' : 'write_chapter',
      toolName: createChapter ? 'chapter.create' : appendChapter ? 'chapter.append' : 'chapter.write',
      title: createChapter ? '新建章节并写入正文' : appendChapter ? '追加当前章节正文' : '写入当前章节正文',
      requiresConfirm: false,
      target: {
        scope: createChapter ? 'novel' : 'chapter',
        novelId: input.novelId,
        chapterId: createChapter ? null : input.chapterId ?? null,
      },
      payload: {
        source: 'artifact',
        writeMode: createChapter ? 'create' : appendChapter ? 'append' : 'replace',
      },
    })
  }

  if (steps.length === 0) {
    return null
  }

  const mode: AgentActionPlan['mode'] =
    intent === 'planChapter' ? 'plan' : intent === 'reviewContinuity' || intent === 'readStoryContext' ? 'review' : 'execute'

  return {
    mode,
    summary: `计划执行 ${steps.length} 个动作：${steps.map((step) => step.title).join('、')}。`,
    steps,
  }
}

function buildWorkspaceActionPlanFromRegistry(
  input: ExecuteWorkspaceAgentInput,
  intent: WorkspaceAgentIntent,
  executionMode: AgentExecutionMode,
): AgentActionPlan | null {
  const prompt = input.prompt.trim().toLowerCase()
  const steps: AgentActionPlan['steps'] = []
  const hasChapterTarget = Boolean(input.chapterId)

  if (shouldPlanRenameNovel(prompt, intent)) {
    const step = buildActionPlanStep(executionMode, {
      id: 'rename_novel',
      toolName: 'novel.rename',
      target: {
        scope: 'novel',
        novelId: input.novelId,
      },
      payload: {
        source: 'artifact',
      },
    })

    if (step) {
      steps.push(step)
    }
  }

  if (shouldPlanRenameChapter(prompt, intent) && hasChapterTarget) {
    const step = buildActionPlanStep(executionMode, {
      id: 'rename_chapter',
      toolName: 'chapter.rename',
      target: {
        scope: 'chapter',
        novelId: input.novelId,
        chapterId: input.chapterId ?? null,
      },
      payload: {
        source: 'artifact',
      },
    })

    if (step) {
      steps.push(step)
    }
  }

  if (shouldPlanWriteChapter(prompt, intent)) {
    const createChapter = shouldPlanCreateChapter(prompt, intent, hasChapterTarget)
    const appendChapter = !createChapter && shouldPlanAppendChapter(prompt, intent)
    const step = buildActionPlanStep(executionMode, {
      id: createChapter ? 'create_chapter' : appendChapter ? 'append_chapter' : 'write_chapter',
      toolName: createChapter ? 'chapter.create' : appendChapter ? 'chapter.append' : 'chapter.write',
      target: {
        scope: createChapter ? 'novel' : 'chapter',
        novelId: input.novelId,
        chapterId: createChapter ? null : input.chapterId ?? null,
      },
      payload: {
        source: 'artifact',
        writeMode: createChapter ? 'create' : appendChapter ? 'append' : 'replace',
      },
    })

    if (step) {
      steps.push(step)
    }
  }

  if (steps.length === 0) {
    return null
  }

  return {
    mode: executionMode === 'build' ? 'execute' : executionMode,
    summary: `计划执行 ${steps.length} 个动作：${steps.map((step) => step.title).join('、')}。`,
    steps,
  }
}

function resolveWorkspaceIntentConfig(intent: WorkspaceAgentIntent): {
  action: AgentActionKind
  mode: AgentRunMode
  agentType: AgentRun['agentType']
  artifactType: AgentArtifact['artifactType']
  title: string
  task: WorkspaceTaskName
  memoryType?: ProjectMemoryEntry['memoryType']
  applyStrategies: AgentArtifactApplyStrategy[]
} {
  switch (intent) {
    case 'generateNovelTitle':
      return {
        action: 'draftChapter',
        mode: 'act',
        agentType: 'writingOrchestrator',
        artifactType: 'chapterDraft',
        title: '书名提案',
        task: 'generate-novel-title',
        applyStrategies: [],
      }
    case 'generateChapterTitles':
      return {
        action: 'draftChapter',
        mode: 'act',
        agentType: 'storyPlanner',
        artifactType: 'chapterDraft',
        title: '章节名提案',
        task: 'generate-chapter-titles',
        applyStrategies: [],
      }
    case 'readStoryContext':
      return {
        action: 'reviewContinuity',
        mode: 'review',
        agentType: 'loreLibrarian',
        artifactType: 'continuityReview',
        title: '上下文检索',
        task: 'read-story-context',
        applyStrategies: [],
      }
    case 'planChapter':
      return {
        action: 'planChapter',
        mode: 'plan',
        agentType: 'storyPlanner',
        artifactType: 'chapterPlan',
        title: '章节计划',
        task: 'plan-chapter',
        memoryType: 'chapterSummary',
        applyStrategies: ['saveChapterSummary'],
      }
    case 'continueChapter':
      return {
        action: 'continueChapter',
        mode: 'act',
        agentType: 'draftWriter',
        artifactType: 'chapterContinuation',
        title: '续写结果',
        task: 'continue-chapter',
        applyStrategies: ['appendChapterContent', 'replaceChapterContent'],
      }
    case 'rewriteSelection':
      return {
        action: 'rewriteSelection',
        mode: 'act',
        agentType: 'styleEditor',
        artifactType: 'rewriteSelection',
        title: '改写结果',
        task: 'rewrite-selection',
        applyStrategies: ['replaceChapterContent'],
      }
    case 'polishSelection':
      return {
        action: 'polishSelection',
        mode: 'review',
        agentType: 'styleEditor',
        artifactType: 'polishSelection',
        title: '润色结果',
        task: 'polish-selection',
        applyStrategies: ['replaceChapterContent'],
      }
    case 'reviewContinuity':
      return {
        action: 'reviewContinuity',
        mode: 'review',
        agentType: 'continuityEditor',
        artifactType: 'continuityReview',
        title: '连续性审阅',
        task: 'review-continuity',
        memoryType: 'continuityRule',
        applyStrategies: ['saveChapterSummary'],
      }
    case 'generateCoverPrompt':
      return {
        action: 'generateCoverPrompt',
        mode: 'act',
        agentType: 'coverPromptAgent',
        artifactType: 'coverPrompt',
        title: '封面提示词',
        task: 'generate-cover-prompt',
        memoryType: 'stylePreference',
        applyStrategies: ['setNovelCoverPrompt'],
      }
    case 'workspaceAgent':
      return {
        action: 'draftChapter',
        mode: 'act',
        agentType: 'writingOrchestrator',
        artifactType: 'chapterDraft',
        title: '自由调度结果',
        task: 'workspace-agent',
        applyStrategies: [],
      }
    case 'draftChapter':
    default:
      return {
        action: 'draftChapter',
        mode: 'act',
        agentType: 'draftWriter',
        artifactType: 'chapterDraft',
        title: '正文草稿',
        task: 'draft-chapter',
        applyStrategies: ['replaceChapterContent', 'appendChapterContent'],
      }
  }
}

function buildWorkspaceSystemPrompt(intent: WorkspaceAgentIntent, title: string): string {
  const common = [
    '你是小说创作工作台里的高级 Agent。',
    '你既能写正文，也能起书名、起章节名、梳理目录、读取章节片段、审阅一致性、生成封面提示词。',
    '请只输出对用户有用的最终结果，不要解释你的系统设定，不要暴露开发信息。',
    '如果上下文不足，请基于已给出的内容作出最稳妥的结果，并明确哪些地方是基于现有上下文的建议，而不是编造事实。',
    '除非用户明确要求解释，否则不要说“我已经帮你创建”“我已经替你命名”“我已经写入正文”这类执行完成话术；请直接输出将被写入的标题、章节名或正文内容本身。',
    '如果用户要求保存作品、发布、下架、删除、打开设置或新建章节，请把它表述成“待确认执行的操作建议”，不要伪装成已经执行完成。',
  ]

  if (intent === 'generateNovelTitle') {
    common.push('当前任务是“起书名”。请优先给出 6 到 10 个可用书名，每个书名后附一句定位说明。')
  } else if (intent === 'generateChapterTitles') {
    common.push('当前任务是“起章节名”。请优先给出一组可直接使用的章节标题，并保持命名风格统一。')
  } else if (intent === 'readStoryContext') {
    common.push('当前任务是“读取上下文”。只能根据提供的目录、摘要和正文片段回答，不得伪造未提供的正文。')
  } else if (intent === 'generateCoverPrompt') {
    common.push('当前任务是“生成封面提示词”。请直接给适合生图模型使用的中文提示词，不要输出多套解释。')
  } else if (intent === 'reviewContinuity') {
    common.push('当前任务是“审阅一致性”。请使用清晰分点，优先指出设定冲突、人物动机和时间线问题。')
  } else if (intent === 'workspaceAgent') {
    common.push('当前任务是“自由调度”。如果用户只是寒暄、询问你是谁、确认你能做什么，或没有明确创作目标，请用简短自然的中文直接回答，不要擅自开始写正文、续写剧情或伪造章节内容。')
  } else {
    common.push(`当前任务主题：${title}。如果用户要求的是正文，就直接给可落回编辑器的正文。`)
  }

  return common.join('\n')
}

function buildWorkspaceResponseRule(intent: WorkspaceAgentIntent): string {
  switch (intent) {
    case 'generateNovelTitle':
      return '请输出“推荐书名 + 一句话定位”，必要时再补充 3 个更商业化的备选。'
    case 'generateChapterTitles':
      return '请输出 6 到 10 个章节名建议，按推荐顺序排列，必要时附一句章节推进说明。'
    case 'readStoryContext':
      return '优先回答用户想看的目录、章节名或正文片段；引用片段时只使用已提供内容。'
    case 'planChapter':
      return '请输出可执行的章节计划，突出冲突推进、情绪节奏和结尾钩子。'
    case 'continueChapter':
      return '请续写正文，保证承接自然，避免重复前文。'
    case 'rewriteSelection':
      return '请只输出改写后的文本，不要附加说明。'
    case 'polishSelection':
      return '请只输出润色后的文本，不要附加说明。'
    case 'reviewContinuity':
      return '请按“问题 - 影响 - 建议”的方式输出。'
    case 'generateCoverPrompt':
      return '请直接输出一段可用的封面提示词，必要时另起一行给负面提示词。'
    case 'workspaceAgent':
      return '请根据用户真实意图直接完成任务；如果用户只是闲聊、确认身份或询问能力，请简短回答，不要擅自输出正文。遇到作品级操作时，请明确说明需要用户确认后再执行。'
    case 'draftChapter':
    default:
      return '请输出可直接使用的中文内容；如果用户要求直接新建章节或写入正文，请直接给“章节标题 + 正文内容”或直接给正文，不要描述你已经执行了哪些操作。'
  }
}

function formatChapterCatalog(chapters: Array<{ orderIndex: number; title: string; summary: string | null }>): string {
  if (chapters.length === 0) {
    return '暂无已保存章节。'
  }

  return chapters
    .map((chapter) => {
      const title = clipText(chapter.title || `第 ${chapter.orderIndex} 章`, 36)
      const summary = clipText(chapter.summary, 70)
      return summary
        ? `- 第 ${chapter.orderIndex} 章《${title}》：${summary}`
        : `- 第 ${chapter.orderIndex} 章《${title}》`
    })
    .join('\n')
}

function formatChapterSnippets(
  chapters: Array<{ orderIndex: number; title: string; content: string }>,
): string {
  if (chapters.length === 0) {
    return '暂无可读取的正文片段。'
  }

  return chapters
    .map((chapter) => {
      const snippet = clipText(chapter.content, 220)
      return [`[第 ${chapter.orderIndex} 章 ${chapter.title || '未命名章节'}]`, snippet || '正文为空。'].join('\n')
    })
    .join('\n\n')
}

function formatMemoryContext(entries: ProjectMemoryEntry[]): string {
  if (entries.length === 0) {
    return '暂无已沉淀的项目记忆。'
  }

  return entries
    .map((entry) => `- ${entry.title}（${entry.memoryType}，重要度 ${entry.importance}）：${clipText(entry.content, 120)}`)
    .join('\n')
}

function formatRecentRuns(runs: AgentRun[]): string {
  if (runs.length === 0) {
    return '暂无最近会话记录。'
  }

  return runs
    .map((run) => `- ${run.action}：${clipText(run.inputSummary ?? run.outputSummary ?? '', 80) || '未记录摘要'}`)
    .join('\n')
}

async function buildWorkspacePrompt(userId: string, input: ExecuteWorkspaceAgentInput, intent: WorkspaceAgentIntent) {
  const novel = await ensureOwnedNovel(userId, input.novelId)
  const chapter =
    input.chapterId
      ? await prisma.chapter.findUnique({
          where: { id: input.chapterId },
        })
      : null

  if (chapter && chapter.novelId !== novel.id) {
    throw new DataAccessError(400, 'CHAPTER_NOVEL_MISMATCH', '章节与作品不匹配。')
  }

  const chapters = await prisma.chapter.findMany({
    where: { novelId: novel.id },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      orderIndex: true,
    },
  })

  const recentMemoryRecords = await prisma.projectMemoryEntry.findMany({
    where: { novelId: novel.id },
    orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    take: 8,
  })

  const recentRunRecords = await prisma.agentRun.findMany({
    where: {
      novelId: novel.id,
      userId,
      status: 'completed',
    },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })

  const memoryEntries = recentMemoryRecords.map(toProjectMemoryEntry)
  const recentRuns = recentRunRecords.map(toAgentRun)
  const currentChapterTitle = clipText(input.chapterTitle?.trim() || chapter?.title || '', 50)
  const currentChapterSummary = clipText(input.chapterSummary?.trim() || chapter?.summary || '', 180)
  const currentChapterContent = input.chapterContent ?? chapter?.content ?? ''
  const handoffArtifactRecord = input.handoff?.sourceArtifactId
    ? await prisma.agentArtifact.findUnique({
        where: { id: input.handoff.sourceArtifactId },
        include: {
          run: true,
        },
      })
    : input.handoff?.sourceRunId
      ? await prisma.agentArtifact.findFirst({
          where: { runId: input.handoff.sourceRunId },
          orderBy: { createdAt: 'asc' },
          include: {
            run: true,
          },
        })
      : null

  if (handoffArtifactRecord) {
    if (handoffArtifactRecord.run.userId !== userId || handoffArtifactRecord.run.novelId !== novel.id) {
      throw new DataAccessError(403, 'AGENT_HANDOFF_FORBIDDEN', '当前计划交接无权访问。')
    }
  }

  const handoffArtifact = handoffArtifactRecord ? toAgentArtifact(handoffArtifactRecord) : null
  const chapterCatalog = formatChapterCatalog(chapters)
  const relevantSnippets = formatChapterSnippets(
    chapters
      .filter((item) => item.content.trim())
      .slice(Math.max(0, chapters.length - 6))
      .map((item) => ({
        orderIndex: item.orderIndex,
        title: item.title,
        content:
          chapter && item.id === chapter.id && currentChapterContent.trim()
            ? currentChapterContent
            : item.content,
      })),
  )

  const prompt = [
    `当前意图：${resolveWorkspaceIntentConfig(intent).title}`,
    `输出规则：${buildWorkspaceResponseRule(intent)}`,
    '',
    '[作品信息]',
    `作品标题：${input.novelTitle?.trim() || novel.title}`,
    `作品简介：${input.novelSummary?.trim() || novel.summary || '暂无简介'}`,
    input.genre?.trim() ? `题材：${input.genre.trim()}` : '',
    input.protagonist?.trim() ? `主角信息：${input.protagonist.trim()}` : '',
    input.tone?.trim() ? `语气要求：${input.tone.trim()}` : '',
    input.stylePreference?.trim() ? `风格偏好：${input.stylePreference.trim()}` : '',
    '',
    '[当前章节]',
    currentChapterTitle ? `当前章节标题：${currentChapterTitle}` : '当前未绑定已保存章节。',
    currentChapterSummary ? `当前章节摘要：${currentChapterSummary}` : '',
    currentChapterContent.trim()
      ? `当前章节正文：${clipText(currentChapterContent, 1800)}`
      : '当前章节正文：暂无正文。',
    '',
    '[章节目录]',
    chapterCatalog,
    '',
    '[可引用正文片段]',
    relevantSnippets,
    '',
    '[长期记忆]',
    formatMemoryContext(memoryEntries),
    '',
    '[最近处理记录]',
    formatRecentRuns(recentRuns),
    '',
    '[用户选中文本]',
    input.selectedText?.trim() ? input.selectedText.trim() : '未提供选中文本。',
    '',
    handoffArtifact && input.handoff?.sourceMode === 'plan' && input.handoff?.targetMode === 'build'
      ? '[已确认的 Plan 交接]'
      : '',
    handoffArtifact && input.handoff?.sourceMode === 'plan' && input.handoff?.targetMode === 'build'
      ? `交接说明：${input.handoff.summary || '现在请不要重复规划，直接进入执行。'}`
      : '',
    handoffArtifact && input.handoff?.sourceMode === 'plan' && input.handoff?.targetMode === 'build'
      ? `涓婁竴杞鍒掓憳瑕侊細${handoffArtifact.summary ?? (clipText(handoffArtifact.content, 160) || '宸茬‘璁や竴浠界珷鑺傝鍒掋€?')}`
      : '',
    handoffArtifact && input.handoff?.sourceMode === 'plan' && input.handoff?.targetMode === 'build'
      ? `上一轮计划全文：\n${handoffArtifact.content}`
      : '',
    handoffArtifact && input.handoff?.sourceMode === 'plan' && input.handoff?.targetMode === 'build'
      ? '当前处于 Build 模式，请直接产出可执行结果，不要重复输出规划或解释。'
      : '',
    handoffArtifact && input.handoff?.sourceMode === 'plan' && input.handoff?.targetMode === 'build'
      ? ''
      : '',
    '[用户指令]',
    input.prompt.trim(),
  ]
    .filter(Boolean)
    .join('\n')

  return {
    summary: clipText(input.prompt, 120) || resolveWorkspaceIntentConfig(intent).title,
    prompt,
  }
}

export async function executeAgentActionData(
  userId: string,
  input: AgentActionInput,
): Promise<AgentActionResponse['data']> {
  const session = await ensureSessionForAction(userId, input.novelId, input.sessionId)
  const config = resolveActionConfig(input.kind)
  const builtPrompt = await buildActionPrompt(userId, input)

  return executePromptBackedRun({
    userId,
    sessionId: session.id,
    novelId: input.novelId,
    chapterId: 'chapterId' in input ? input.chapterId ?? null : null,
    action: input.kind,
    mode: config.mode,
    agentType: config.agentType,
    artifactType: config.artifactType,
    title: config.title,
    inputSummary: builtPrompt.summary,
    prompt: builtPrompt.prompt,
    memoryType: config.memoryType,
    artifactMetadata: {
      activeAgent: buildExecutionAgent(config.agentType),
      executionMode: toExecutionMode(config.mode),
    },
  })
}

export async function executeWorkspaceAgentData(
  userId: string,
  input: ExecuteWorkspaceAgentInput,
): Promise<AgentActionResponse['data']> {
  const session = await ensureSessionForAction(userId, input.novelId, input.sessionId)
  const intent = inferWorkspaceIntent(input)
  const config = resolveWorkspaceIntentConfig(intent)
  const executionMode = toExecutionMode(config.mode)
  const toolPolicy = buildWorkspaceToolPolicy(executionMode)
  const routeDecision = buildWorkspaceRouteDecision(config)
  const builtPrompt = await buildWorkspacePrompt(userId, input, intent)
  const actionPlan = buildWorkspaceActionPlanFromRegistry(input, intent, executionMode)
  const handoff = config.mode === 'plan' ? buildPlanToBuildHandoff(actionPlan) : null

  return executePromptBackedRun({
    userId,
    sessionId: session.id,
    novelId: input.novelId,
    chapterId: input.chapterId ?? null,
    action: config.action,
    mode: config.mode,
    agentType: config.agentType,
    artifactType: config.artifactType,
    title: config.title,
    inputSummary: builtPrompt.summary,
    prompt: builtPrompt.prompt,
    systemPrompt: buildWorkspaceSystemPrompt(intent, config.title),
    memoryType: config.memoryType,
    artifactMetadata: {
      workspaceTask: config.task,
      intentLabel: config.title,
      availableApplyStrategies: config.applyStrategies,
      actionHint: input.actionHint ?? null,
      activeAgent: buildExecutionAgent(config.agentType),
      routeDecision,
      executionMode,
      toolPolicy,
      actionPlan,
      handoff,
    },
  })
}

function buildAgentRunResultPayload(
  run: Awaited<ReturnType<typeof ensureOwnedRun>>,
  artifacts: Awaited<ReturnType<typeof prisma.agentArtifact.findMany>>,
  memoryEntries: Awaited<ReturnType<typeof prisma.projectMemoryEntry.findMany>>,
): AgentActionResponse['data'] {
  const artifactItems = artifacts.map(toAgentArtifact)
  const memoryItems = memoryEntries.map(toProjectMemoryEntry)
  const firstArtifact = artifactItems[0] ?? null
  const executionMode =
    firstArtifact?.metadata && typeof firstArtifact.metadata === 'object'
      ? ((firstArtifact.metadata as Record<string, unknown>).executionMode as AgentExecutionMode | null | undefined) ?? null
      : null
  const activeAgent =
    asAgentExecutionAgent(firstArtifact?.metadata?.activeAgent) ?? buildExecutionAgent(run.agentType)
  const routeDecision = asAgentRouteDecision(firstArtifact?.metadata?.routeDecision)
  const actionPlan = asAgentActionPlan(firstArtifact?.metadata?.actionPlan)
  const toolPolicy = asAgentWorkspaceToolPolicy(firstArtifact?.metadata?.toolPolicy)
  const handoff = hydrateHandoffSource(
    asAgentActionHandoff(firstArtifact?.metadata?.handoff),
    run.id,
    firstArtifact?.id ?? '',
  )

  return {
    run: toAgentRun(run),
    artifacts: artifactItems,
    memoryEntries: memoryItems,
    artifact: firstArtifact,
    title: firstArtifact?.title ?? 'Agent 结果',
    content: firstArtifact?.content ?? '',
    summary: firstArtifact?.summary ?? null,
    artifactType: firstArtifact?.artifactType ?? null,
    activeAgent,
    routeDecision,
    executionMode,
    actionPlan,
    handoff,
    toolPolicy,
    stream: {
      liveUrl: `/api/agent/runs/${run.id}/stream`,
      replayUrl: `/api/agent/runs/${run.id}/stream`,
    },
    result: firstArtifact?.content ?? '',
    prompt: run.inputSummary ?? undefined,
    outline: firstArtifact?.artifactType === 'chapterPlan' ? firstArtifact.content : undefined,
  }
}

export async function getAgentRunData(userId: string, runId: string) {
  const run = await ensureOwnedRun(userId, runId)
  const [artifacts, memoryEntries] = await prisma.$transaction([
    prisma.agentArtifact.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.projectMemoryEntry.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return {
    ...buildAgentRunResultPayload(run, artifacts, memoryEntries),
  }
}

export async function listAgentSessionHistoryData(userId: string, sessionId: string) {
  await ensureOwnedSession(userId, sessionId)

  const runs = await prisma.agentRun.findMany({
    where: {
      sessionId,
    },
    orderBy: [{ createdAt: 'asc' }],
  })

  if (runs.length === 0) {
    return {
      items: [],
    }
  }

  const runIds = runs.map((run) => run.id)
  const [artifacts, memoryEntries] = await prisma.$transaction([
    prisma.agentArtifact.findMany({
      where: {
        runId: {
          in: runIds,
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    }),
    prisma.projectMemoryEntry.findMany({
      where: {
        runId: {
          in: runIds,
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    }),
  ])

  const artifactMap = new Map<string, typeof artifacts>()
  for (const artifact of artifacts) {
    const existing = artifactMap.get(artifact.runId) ?? []
    existing.push(artifact)
    artifactMap.set(artifact.runId, existing)
  }

  const memoryMap = new Map<string, typeof memoryEntries>()
  for (const entry of memoryEntries) {
    if (!entry.runId) {
      continue
    }

    const existing = memoryMap.get(entry.runId) ?? []
    existing.push(entry)
    memoryMap.set(entry.runId, existing)
  }

  return {
    items: runs.map((run) =>
      buildAgentRunResultPayload(run, artifactMap.get(run.id) ?? [], memoryMap.get(run.id) ?? []),
    ),
  }
}

export async function createAgentRunData(userId: string, input: CreateAgentRunRequest) {
  const session = await ensureOwnedSession(userId, input.sessionId)

  const mappedInput: AgentActionInput = {
    kind: input.action,
    novelId: session.novelId,
    sessionId: session.id,
    chapterId: input.chapterId,
    prompt: input.prompt,
    selectedText: input.selectedText,
    novelTitle: input.runtimeContext?.novelTitle,
    novelSummary: input.runtimeContext?.novelSummary,
    chapterTitle: input.runtimeContext?.chapterTitle,
    chapterSummary: input.runtimeContext?.chapterSummary,
    chapterContent: input.runtimeContext?.chapterContent,
    genre: input.runtimeContext?.genre,
    protagonist: input.runtimeContext?.protagonist,
    tone: input.runtimeContext?.tone,
    stylePreference: input.runtimeContext?.stylePreference,
    instruction:
      input.action === 'rewriteSelection' || input.action === 'polishSelection'
        ? input.prompt
        : undefined,
  } as AgentActionInput

  return executeAgentActionData(userId, mappedInput)
}

export async function listAgentArtifactsData(userId: string, runId: string) {
  await ensureOwnedRun(userId, runId)
  const items = await prisma.agentArtifact.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
  })

  return {
    items: items.map(toAgentArtifact),
  }
}

export async function streamAgentRunData(userId: string, runId: string) {
  const data = await getAgentRunData(userId, runId)
  return [
    {
      stage: 'run.snapshot',
      type: 'status',
      runId: data.run.id,
      run: data.run,
      status: data.run.status,
      createdAt: data.run.createdAt,
      replay: true,
      mode: 'replay',
    },
    {
      stage: 'run.result',
      type: 'result',
      runId: data.run.id,
      run: data.run,
      status: data.run.status,
      createdAt: data.run.updatedAt,
      replay: true,
      mode: 'replay',
      artifact: data.artifact,
      artifacts: data.artifacts,
      memoryEntries: data.memoryEntries,
      title: data.title,
      content: data.content,
      summary: data.summary,
      result: data.result,
      prompt: data.prompt,
      outline: data.outline,
    },
    {
      stage: 'run.done',
      type: 'done',
      runId: data.run.id,
      run: data.run,
      status: data.run.status,
      createdAt: data.run.updatedAt,
      replay: true,
      mode: 'replay',
    },
  ]
}

export async function applyAgentArtifactData(
  userId: string,
  artifactId: string,
  input: ApplyAgentArtifactRequest,
) {
  const artifact = await ensureOwnedArtifact(userId, artifactId)
  const run = await ensureOwnedRun(userId, artifact.runId)
  const artifactMetadata = asMetadataRecord(artifact.metadata)

  if (artifact.artifactType === 'coverPrompt') {
    const novel = await ensureOwnedNovel(userId, run.novelId)
    const strategy = input.strategy ?? 'setNovelCoverPrompt'
    const appliedAt = new Date().toISOString()
    const rollbackSnapshot = {
      targetType: 'novel',
      targetId: novel.id,
      strategy,
      appliedAt,
      novel: {
        coverPrompt: novel.coverPrompt ?? null,
      },
    }

    const [, updatedNovel, updatedArtifact] = await prisma.$transaction([
      prisma.novel.update({
        where: { id: novel.id },
        data: {
          coverPrompt: artifact.content,
        },
      }),
      prisma.novel.findUniqueOrThrow({
        where: { id: novel.id },
      }),
      prisma.agentArtifact.update({
        where: { id: artifact.id },
        data: {
          metadata: getArtifactMetadataWithSnapshot(artifactMetadata, rollbackSnapshot),
        },
      }),
    ])

    return {
      artifact: toAgentArtifact(updatedArtifact),
      applied: true,
      strategy,
      targetType: 'novel' as const,
      targetId: updatedNovel.id,
      novel: {
        id: updatedNovel.id,
        coverPrompt: updatedNovel.coverPrompt ?? null,
        updatedAt: toIso(updatedNovel.updatedAt) ?? new Date().toISOString(),
      },
      chapter: null,
    }
  }

  const targetChapterId = input.chapterId ?? run.chapterId
  if (!targetChapterId) {
    throw new DataAccessError(400, 'AGENT_APPLY_CHAPTER_REQUIRED', '请先指定章节。')
  }

  const chapter = await prisma.chapter.findUnique({
    where: { id: targetChapterId },
  })

  if (!chapter || chapter.novelId !== run.novelId) {
    throw new DataAccessError(404, 'CHAPTER_NOT_FOUND', '未找到章节。')
  }

  let nextContent = chapter.content
  let nextSummary = chapter.summary ?? null
  let strategy = input.strategy ?? 'replaceChapterContent'

  if (artifact.artifactType === 'chapterContinuation') {
    nextContent = `${chapter.content}\n\n${artifact.content}`.trim()
    strategy = input.strategy ?? 'appendChapterContent'
  } else if (artifact.artifactType === 'chapterPlan' || artifact.artifactType === 'continuityReview') {
    nextSummary = artifact.content
    strategy = input.strategy ?? 'saveChapterSummary'
  } else {
    nextContent = artifact.content
  }

  const appliedAt = new Date().toISOString()
  const rollbackSnapshot = {
    targetType: 'chapter',
    targetId: chapter.id,
    strategy,
    appliedAt,
    chapter: {
      title: chapter.title,
      summary: chapter.summary ?? null,
      content: chapter.content,
      wordCount: chapter.wordCount ?? chapter.content.length,
    },
  }

  const [, updatedChapter, updatedArtifact] = await prisma.$transaction([
    prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        content: nextContent,
        summary: nextSummary,
        wordCount: nextContent.length,
      },
    }),
    prisma.chapter.findUniqueOrThrow({
      where: { id: chapter.id },
    }),
    prisma.agentArtifact.update({
      where: { id: artifact.id },
      data: {
        metadata: getArtifactMetadataWithSnapshot(artifactMetadata, rollbackSnapshot),
      },
    }),
  ])

  return {
    artifact: toAgentArtifact(updatedArtifact),
    applied: true,
    strategy,
    targetType: 'chapter' as const,
    targetId: updatedChapter.id,
    chapter: {
      id: updatedChapter.id,
      title: updatedChapter.title,
      summary: updatedChapter.summary ?? null,
      content: updatedChapter.content,
      wordCount: updatedChapter.wordCount ?? updatedChapter.content.length,
      updatedAt: toIso(updatedChapter.updatedAt) ?? new Date().toISOString(),
    },
    novel: null,
  }
}

export async function rollbackAgentRunData(userId: string, runId: string) {
  const run = await ensureOwnedRun(userId, runId)
  const latestRun = await prisma.agentRun.findFirst({
    where: {
      sessionId: run.sessionId,
    },
    orderBy: [{ createdAt: 'desc' }],
  })

  if (latestRun?.id !== run.id) {
    throw new DataAccessError(409, 'AGENT_RUN_ROLLBACK_CONFLICT', '请先回退更新的一轮对话。')
  }

  const artifacts = await prisma.agentArtifact.findMany({
    where: { runId },
    orderBy: [{ createdAt: 'desc' }],
  })

  let restoredChapter:
    | {
        id: string
        title: string
        summary: string | null
        content: string
        wordCount: number
        updatedAt: string
      }
    | null = null
  let restoredNovel:
    | {
        id: string
        coverPrompt: string | null
        updatedAt: string
      }
    | null = null

  await prisma.$transaction(async (tx) => {
    for (const artifact of artifacts) {
      const metadata = asMetadataRecord(artifact.metadata)
      const rollbackSnapshots = getArtifactRollbackSnapshots(metadata).reverse()

      for (const snapshot of rollbackSnapshots) {
        if (snapshot.targetType === 'novel' && typeof snapshot.targetId === 'string') {
          const previousCoverPrompt =
            snapshot.novel && typeof snapshot.novel === 'object' && !Array.isArray(snapshot.novel)
              ? typeof (snapshot.novel as Record<string, unknown>).coverPrompt === 'string' ||
                (snapshot.novel as Record<string, unknown>).coverPrompt === null
                ? ((snapshot.novel as Record<string, unknown>).coverPrompt as string | null)
                : null
              : null

          const restored = await tx.novel.update({
            where: { id: snapshot.targetId },
            data: {
              coverPrompt: previousCoverPrompt,
            },
          })

          restoredNovel = {
            id: restored.id,
            coverPrompt: restored.coverPrompt ?? null,
            updatedAt: toIso(restored.updatedAt) ?? new Date().toISOString(),
          }
        }

        if (snapshot.targetType === 'chapter' && typeof snapshot.targetId === 'string') {
          const chapterSnapshot =
            snapshot.chapter && typeof snapshot.chapter === 'object' && !Array.isArray(snapshot.chapter)
              ? (snapshot.chapter as Record<string, unknown>)
              : null

          if (!chapterSnapshot) {
            continue
          }

          const restored = await tx.chapter.update({
            where: { id: snapshot.targetId },
            data: {
              content: typeof chapterSnapshot.content === 'string' ? chapterSnapshot.content : '',
              summary:
                typeof chapterSnapshot.summary === 'string' || chapterSnapshot.summary === null
                  ? (chapterSnapshot.summary as string | null)
                  : null,
              wordCount:
                typeof chapterSnapshot.wordCount === 'number'
                  ? chapterSnapshot.wordCount
                  : typeof chapterSnapshot.content === 'string'
                    ? chapterSnapshot.content.length
                    : 0,
            },
          })

          restoredChapter = {
            id: restored.id,
            title: restored.title,
            summary: restored.summary ?? null,
            content: restored.content,
            wordCount: restored.wordCount ?? restored.content.length,
            updatedAt: toIso(restored.updatedAt) ?? new Date().toISOString(),
          }
        }
      }
    }

    await tx.projectMemoryEntry.deleteMany({
      where: { runId },
    })

    await tx.agentArtifact.deleteMany({
      where: { runId },
    })

    await tx.agentRun.delete({
      where: { id: runId },
    })

    const previousRun = await tx.agentRun.findFirst({
      where: {
        sessionId: run.sessionId,
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    await tx.agentSession.update({
      where: { id: run.sessionId },
      data: {
        lastRunAt: previousRun?.createdAt ?? null,
      },
    })
  })

  return {
    runId,
    sessionId: run.sessionId,
    rolledBack: true as const,
    chapter: restoredChapter,
    novel: restoredNovel,
  }
}

export async function deleteAgentRunData(userId: string, runId: string) {
  const run = await ensureOwnedRun(userId, runId)

  await prisma.$transaction(async (tx) => {
    await tx.projectMemoryEntry.deleteMany({
      where: { runId },
    })

    await tx.agentArtifact.deleteMany({
      where: { runId },
    })

    await tx.agentRun.delete({
      where: { id: runId },
    })

    const previousRun = await tx.agentRun.findFirst({
      where: {
        sessionId: run.sessionId,
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    await tx.agentSession.update({
      where: { id: run.sessionId },
      data: {
        lastRunAt: previousRun?.createdAt ?? null,
      },
    })
  })

  return {
    runId,
    sessionId: run.sessionId,
    deleted: true as const,
  }
}
