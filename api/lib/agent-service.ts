/**
 * @deprecated legacy Agent 执行引擎（AGENT_ENGINE=legacy 时的旧链路）。
 * 新代码禁止 import 本文件；Agent 主链路统一走 ./agent/run-service.js（AGENT_ENGINE=loop）。
 * 现状（阶段 F-25）：仅写作助手（AssistPanel）的 execute/apply/rollback/sessions 短动作
 * 仍经 routes/agent.ts 调用本文件；7 个细分 action 端点已 410 下线。
 * 待写作助手迁移 loop 后，本文件与 agent-workspace-tools.ts 整体物理删除（约 3700 行）。
 */
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
  AgentRouteStatusEvent,
  AgentRuleBundle,
  AgentStoryMemoryDigest,
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
  UpdateAgentSessionRequest,
} from '../../shared/contracts/index.js'
import { prisma, DataAccessError } from './prisma.js'
import { generateTextCompletion } from './ai-service.js'
import { isDefaultSessionTitle } from './agent/session-title.js'
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
  onProgress?: (event: {
    stage: string
    type?: 'status' | 'result' | 'done'
    message: string
    runId?: string | null
    createdAt?: string
    data?: Record<string, unknown>
  }) => void
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

function emitRunProgress(
  reporter: PromptBackedRunConfig['onProgress'],
  event: {
    stage: string
    message: string
    type?: 'status' | 'result' | 'done'
    runId?: string | null
    data?: Record<string, unknown>
  },
) {
  if (!reporter) {
    return
  }

  reporter({
    ...event,
    type: event.type ?? 'status',
    createdAt: new Date().toISOString(),
  })
}

function resolveActionPlanStepReasoning(step: AgentActionPlan['steps'][number]) {
  const reasoning = step.payload?.reasoning
  return typeof reasoning === 'string' && reasoning.trim() ? reasoning.trim() : ''
}

function resolveActionPlanThinking(actionPlan: AgentActionPlan | null) {
  if (!Array.isArray(actionPlan?.thinking)) {
    return []
  }

  return actionPlan.thinking
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function describeWorkspacePlanForProgress(
  actionPlan: AgentActionPlan | null,
): Array<{ stage: 'task.step' | 'task.thinking'; message: string }> {
  if (!actionPlan?.steps.length) {
    const thinkingItems = resolveActionPlanThinking(actionPlan)
    if (thinkingItems.length > 0) {
      return thinkingItems.map((message) => ({
        stage: 'task.thinking',
        message,
      }))
    }

    return [
      {
        stage: 'task.step',
        message: '已判断本次请求暂不需要直接改动作品内容，先整理结果回复。',
      },
    ]
  }

  const leadingThinking = resolveActionPlanThinking(actionPlan).map((message) => ({
    stage: 'task.thinking' as const,
    message,
  }))

  return [
    ...leadingThinking,
    ...actionPlan.steps.flatMap((step) => {
      const messages: Array<{ stage: 'task.step' | 'task.thinking'; message: string }> = []
      const reasoning = resolveActionPlanStepReasoning(step)

      if (reasoning) {
        messages.push({
          stage: 'task.thinking',
          message: reasoning,
        })
      }

      messages.push({
        stage: 'task.step',
        message: typeof step.title === 'string' && step.title.trim() ? step.title.trim() : '按顺序执行一项工作台操作。',
      })

      return messages
    }),
  ]
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

function formatWorkspaceToolPolicy(toolPolicy: AgentWorkspaceToolPolicy): string {
  if (!toolPolicy.tools.length) {
    return '暂无可用工作台工具。'
  }

  return toolPolicy.tools
    .map((tool) => `- ${tool.toolName}｜${tool.title}｜权限=${tool.permission}｜${tool.description}`)
    .join('\n')
}

function extractWorkspacePlanEnvelope(content: string): { cleanContent: string; rawPlan: AgentActionPlan | null } {
  const match = content.match(/^\s*<workspace_plan>([\s\S]*?)<\/workspace_plan>\s*/i)
  if (!match) {
    return {
      cleanContent: content.trim(),
      rawPlan: null,
    }
  }

  const rawJson = match[1]?.trim()
  const cleanContent = content.slice(match[0].length).trim()

  if (!rawJson) {
    return {
      cleanContent,
      rawPlan: null,
    }
  }

  try {
    return {
      cleanContent,
      rawPlan: asAgentActionPlan(JSON.parse(rawJson)),
    }
  } catch {
    return {
      cleanContent,
      rawPlan: null,
    }
  }
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
    factors: Array.isArray(candidate.factors)
      ? candidate.factors.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function asAgentRuleBundle(value: unknown): AgentRuleBundle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.rules)) {
    return null
  }

  const rules = candidate.rules.filter((rule): rule is string => typeof rule === 'string')
  return {
    summary: candidate.summary,
    rules,
  }
}

function asAgentStoryMemoryDigest(value: unknown): AgentStoryMemoryDigest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.items)) {
    return null
  }

  const items = candidate.items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return []
    }

    const entry = item as Record<string, unknown>
    if (
      typeof entry.title !== 'string' ||
      typeof entry.memoryType !== 'string' ||
      typeof entry.excerpt !== 'string'
    ) {
      return []
    }

    return [
      {
        title: entry.title,
        memoryType: entry.memoryType as ProjectMemoryEntry['memoryType'],
        excerpt: entry.excerpt,
      },
    ]
  })

  return {
    summary: candidate.summary,
    items,
  }
}

function resolveDynamicWorkspaceAgentRouting(options: {
  intent: WorkspaceAgentIntent
  config: ReturnType<typeof resolveWorkspaceIntentConfig>
  input: ExecuteWorkspaceAgentInput
  ruleBundle: AgentRuleBundle
  storyMemoryDigest: AgentStoryMemoryDigest
}): {
  agentType: AgentRun['agentType']
  signals: string[]
} {
  const { intent, config, input, ruleBundle, storyMemoryDigest } = options

  if (config.task === 'generate-novel-title') {
    return {
      agentType: 'storyPlanner',
      signals: ['任务语义：当前请求更接近命名与前置规划。'],
    }
  }

  if (intent !== 'workspaceAgent' || config.agentType !== 'writingOrchestrator') {
    return {
      agentType: config.agentType,
      signals: [],
    }
  }

  const normalizedPrompt = input.prompt.replace(/\s+/g, '').toLowerCase()
  const memoryTypes = new Set(storyMemoryDigest.items.map((item) => item.memoryType))

  if (hasMultipleWorkspaceGoals(normalizedPrompt)) {
    return {
      agentType: 'writingOrchestrator',
      signals: ['任务语义：当前请求包含多个作品级动作，需要主控 Agent 串行拆解并执行。'],
    }
  }

  if (
    containsAny(normalizedPrompt, ['设定', '世界观', '人物卡', '人物关系', '背景资料', '时间线', '梳理设定', '补充背景'])
  ) {
    return {
      agentType: 'loreLibrarian',
      signals: ['任务语义：当前请求更接近设定检索与背景补全。'],
    }
  }

  if (
    containsAny(normalizedPrompt, ['润色', '改写', '重写', '优化表达', '顺一顺', '收紧', '精修', '文风']) ||
    (ruleBundle.rules.some((rule) => rule.includes('文风')) && containsAny(normalizedPrompt, ['表达', '语气', '句子']))
  ) {
    return {
      agentType: 'styleEditor',
      signals: ['任务语义：当前请求更接近局部改写与文风优化。'],
    }
  }

  if (
    containsAny(normalizedPrompt, ['规划', '大纲', '结构', '拆解', '提纲', '思路', '起名', '命名', '书名', '章节名'])
  ) {
    return {
      agentType: 'storyPlanner',
      signals: ['任务语义：当前请求更接近规划、命名或结构设计。'],
    }
  }

  if (
    containsAny(normalizedPrompt, ['一致性', '连贯', '矛盾', '逻辑', '审阅']) ||
    (memoryTypes.has('continuityRule') && containsAny(normalizedPrompt, ['检查', '看看', '对照']))
  ) {
    return {
      agentType: 'continuityEditor',
      signals: ['任务语义：当前请求更接近连续性审阅。'],
    }
  }

  return {
    agentType: 'draftWriter',
    signals:
      memoryTypes.has('stylePreference') || memoryTypes.has('chapterSummary')
        ? ['上下文信号：已有章节摘要或文风偏好，可直接交由正文写作 Agent 承接。']
        : ['任务语义：当前请求更接近正文写作与内容生成。'],
  }
}

function buildWorkspaceRouteDecision(options: {
  config: ReturnType<typeof resolveWorkspaceIntentConfig>
  targetAgentType: AgentRun['agentType']
  decisionSignals: string[]
  ruleBundle: AgentRuleBundle
  storyMemoryDigest: AgentStoryMemoryDigest
}): AgentRouteDecision {
  const { config, targetAgentType, decisionSignals, ruleBundle, storyMemoryDigest } = options
  const sourceAgent = buildExecutionAgent('writingOrchestrator')
  const targetAgent = buildExecutionAgent(targetAgentType)
  const factors = [
    ...decisionSignals,
    ruleBundle.rules[0] ? `规则依据：${clipText(ruleBundle.rules[0], 52)}` : '',
    ruleBundle.rules[1] ? `规则补充：${clipText(ruleBundle.rules[1], 52)}` : '',
    storyMemoryDigest.items[0]
      ? `记忆参考：${storyMemoryDigest.items[0].title}（${storyMemoryDigest.items[0].memoryType}）`
      : '',
  ].filter(Boolean)
  const reasonText = factors.length > 0 ? `依据：${factors.join('；')}。` : ''

  return {
    sourceAgent,
    targetAgent,
    task: config.task,
    intentLabel: config.title,
    summary:
      targetAgent.agentType === sourceAgent.agentType
        ? `${sourceAgent.title} 判断当前任务适合继续由自己直接处理。${reasonText}`
        : `${sourceAgent.title} 判断当前任务更适合交给 ${targetAgent.title} 处理。${reasonText}`,
    factors,
  }
}

function buildRouteStatusEvents(
  runId: string,
  createdAt: string,
  routeDecision: AgentRouteDecision | null,
): Array<{
  id: string
  stage: AgentRouteStatusEvent
  type: 'status'
  runId: string
  createdAt: string
  replay: true
  mode: 'replay'
  message: string
  data: Record<string, unknown>
}> {
  if (!routeDecision) {
    return []
  }

  const baseData = {
    sourceAgent: routeDecision.sourceAgent,
    targetAgent: routeDecision.targetAgent,
    task: routeDecision.task,
    intentLabel: routeDecision.intentLabel,
  }

  return [
    {
      id: `${runId}-agent-selected`,
      stage: 'agent.selected',
      type: 'status',
      runId,
      createdAt,
      replay: true,
      mode: 'replay',
      message: `${routeDecision.sourceAgent.title} 已接收当前任务，正在判断最合适的处理代理。`,
      data: baseData,
    },
    {
      id: `${runId}-route-decided`,
      stage: 'route.decided',
      type: 'status',
      runId,
      createdAt,
      replay: true,
      mode: 'replay',
      message: routeDecision.summary,
      data: baseData,
    },
    {
      id: `${runId}-specialist-started`,
      stage: 'specialist.started',
      type: 'status',
      runId,
      createdAt,
      replay: true,
      mode: 'replay',
      message:
        routeDecision.targetAgent.agentType === routeDecision.sourceAgent.agentType
          ? `${routeDecision.targetAgent.title} 已开始处理当前任务。`
          : `${routeDecision.targetAgent.title} 已接手当前任务，开始执行。`,
      data: baseData,
    },
  ]
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
  agentType: AgentRun['agentType'],
  step: {
    id: string
    toolName: AgentWorkspaceToolName
    title?: string
    target: AgentActionPlan['steps'][number]['target']
    payload: AgentActionPlan['steps'][number]['payload']
  },
): AgentActionPlan['steps'][number] | null {
  const definition = getWorkspaceToolDefinition(step.toolName)

  if (!definition) {
    return null
  }

  const permission = resolveWorkspaceToolPermission(executionMode, agentType, step.toolName)
  if (permission === 'deny') {
    return null
  }

  return {
    id: step.id,
    toolName: step.toolName,
    title: typeof step.title === 'string' && step.title.trim() ? step.title.trim() : definition.title,
    requiresConfirm: permission === 'ask',
    target: step.target,
    payload: step.payload,
  }
}

function sanitizeModelActionPlan(options: {
  rawPlan: AgentActionPlan | null
  executionMode: AgentExecutionMode
  agentType: AgentRun['agentType']
  novelId: string
  chapterId?: string | null
}): AgentActionPlan | null {
  if (!options.rawPlan) {
    return null
  }

  const sanitizedSteps: AgentActionPlan['steps'] = []
  const sanitizedThinking = Array.isArray(options.rawPlan.thinking)
    ? options.rawPlan.thinking
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 6)
    : []

  for (const rawStep of options.rawPlan.steps) {
    const normalizedTarget = {
      scope:
        rawStep.target?.scope === 'workspace' || rawStep.target?.scope === 'novel' || rawStep.target?.scope === 'chapter'
          ? rawStep.target.scope
          : 'chapter',
      novelId:
        typeof rawStep.target?.novelId === 'string' && rawStep.target.novelId.trim()
          ? rawStep.target.novelId
          : options.novelId,
      chapterId:
        typeof rawStep.target?.chapterId === 'string' && rawStep.target.chapterId.trim()
          ? rawStep.target.chapterId
          : options.chapterId ?? null,
    }

    const step = buildActionPlanStep(options.executionMode, options.agentType, {
      id: typeof rawStep.id === 'string' && rawStep.id.trim() ? rawStep.id : `step_${sanitizedSteps.length + 1}`,
      toolName: rawStep.toolName,
      title: typeof rawStep.title === 'string' ? rawStep.title : undefined,
      target: normalizedTarget,
      payload:
        rawStep.payload && typeof rawStep.payload === 'object' && !Array.isArray(rawStep.payload)
          ? rawStep.payload
          : { source: 'artifact' },
    })

    if (step) {
      sanitizedSteps.push(step)
    }
  }

  if (sanitizedSteps.length === 0) {
    return {
      mode: options.rawPlan.mode,
      summary: options.rawPlan.summary,
      thinking: sanitizedThinking,
      steps: [],
    }
  }

  return {
    mode: options.rawPlan.mode,
    summary: options.rawPlan.summary,
    thinking: sanitizedThinking,
    steps: sanitizedSteps,
  }
}

function buildWorkspaceBuiltinProtocol(options: {
  intent: WorkspaceAgentIntent
  title: string
  responseRule: string
  toolPolicy?: AgentWorkspaceToolPolicy | null
}): string[] {
  const workspaceSemanticGuide = [
    '[工作区语义包]',
    '作品是全局根对象，章节、计划文件、封面、作品元信息都从属于当前作品。',
    '章节树里的“计划”文档属于创作资料，不等于目标章节；当前打开计划文档时，仍然要以全局工作区判断用户要操作的是作品、章节还是计划。',
    '当用户要求“写第一章”“写第二章”“帮我写首章”这类正文写作时，优先判断是否需要创建真实章节实体，而不是只输出正文。',
    '如果工具能修改工作台状态，就优先走工具；正文输出只能作为写入素材，不能替代章节创建、命名、追加、元信息更新这类动作本身。',
    '执行成功的标准不是“回答看起来像完成了”，而是工作区状态真的发生了对应变化。',
  ]
  const protocol = [
    '[统一内置执行协议]',
    '你必须先读取内置执行协议，再读取用户提示；用户提示永远代表“当前需求或任务”，不是让你复述的原文。',
    '你需要先判断用户请求里包含几个独立任务；如果超过一个任务，必须拆成有先后顺序的子任务，再逐个处理。',
    '每个子任务都要先判断是否需要调用工作台接口；如果需要，只能从当前提供的工具清单中选择最匹配的一个或多个工具。',
    '你必须基于整个创作工作区来判断目标，而不是被当前打开的计划文档、目录文档或某个非章节视图绑死；当前选中内容只能作为参考，不是唯一目标。',
    '如果请求只是咨询、闲聊、解释、命名建议或纯内容输出，不要伪造接口调用，也不要把会执行的动作说成已经执行。',
    '如果请求涉及写作工作台操作，比如新建章节、覆盖正文、追加正文、改名、发布、下架、删除、打开设置或写入封面提示词，请先做任务拆解，再映射到对应工具。',
    '当用户一次性提出多个动作时，要先在内部确认依赖顺序，例如“先新建章节，再写正文”“先改名，再续写”“先规划，再执行”。',
    '如果任务是“新写一章”或“当前没有目标章节时开始写正文”，必须默认拆成“先创建空白章节 -> 再补标题 -> 再写正文”三步，而不是只输出一整段正文文本。',
    ...workspaceSemanticGuide,
    `当前任务主题：${options.title}。`,
    `当前输出要求：${options.responseRule}`,
  ]

  if (options.intent === 'workspaceAgent') {
    protocol.push('当前处于自由调度场景，你要优先理解真实意图，再决定是否需要调用工具，而不是直接开始写正文。')
  }

  if (options.toolPolicy) {
    protocol.push(
      '在输出任何用户可见内容之前，你必须先完成内部任务分析，并按下列协议输出结构化执行清单。',
      '先输出一段 <workspace_plan>...</workspace_plan>，其中内容必须是合法 JSON，结构必须满足 {"mode":"plan|execute|review","summary":"...","steps":[...]}。',
      'steps 里的每一项都必须包含 id、toolName、title、target、payload；只能使用下面工具清单中 permission 不为 deny 的 toolName。',
      '如果某一步会改动作品内容，payload 里必须补一条 reasoning，说明为什么要先做这一步，以及要处理哪一段或哪一类内容。',
      '如果当前请求不需要调用任何工作台接口，请输出 steps: []。如果某个动作需要用户确认，请照常写进 steps，系统会根据权限自动标记确认态。',
      '紧跟在 </workspace_plan> 之后，再输出真正给用户看的中文结果；不要在用户可见内容里重复 JSON、接口名或协议说明。',
      '[当前可用工作台工具]',
      formatWorkspaceToolPolicy(options.toolPolicy),
    )
  }

  return protocol
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

  // 空且未命名的会话不进入列表：只有产生过对话（lastRunAt）或已被命名的会话才保留展示
  const visible = items.filter((session) => session.lastRunAt || !isDefaultSessionTitle(session.title))

  return {
    items: visible.map(toAgentSession),
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

export async function updateAgentSessionData(
  userId: string,
  sessionId: string,
  input: UpdateAgentSessionRequest,
) {
  const session = await ensureOwnedSession(userId, sessionId)
  const nextTitle = input.title?.trim()

  if (!nextTitle) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', '请提供会话标题。')
  }

  const updatedSession = await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      title: nextTitle.slice(0, 160),
    },
  })

  return {
    session: toAgentSession(updatedSession),
  }
}

export async function deleteAgentSessionData(userId: string, sessionId: string) {
  const session = await ensureOwnedSession(userId, sessionId)

  await prisma.$transaction(async (tx) => {
    const runs = await tx.agentRun.findMany({
      where: { sessionId: session.id },
      select: { id: true },
    })
    const runIds = runs.map((run) => run.id)

    if (runIds.length > 0) {
      await tx.projectMemoryEntry.deleteMany({
        where: {
          runId: { in: runIds },
        },
      })

      await tx.agentArtifact.deleteMany({
        where: {
          runId: { in: runIds },
        },
      })

      await tx.agentRun.deleteMany({
        where: { sessionId: session.id },
      })
    }

    await tx.agentSession.delete({
      where: { id: session.id },
    })
  })

  return {
    sessionId: session.id,
    deleted: true as const,
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
        title: '创作计划',
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

function buildProjectMemoryEntryDrafts(
  config: Pick<PromptBackedRunConfig, 'agentType' | 'artifactType' | 'title' | 'memoryType'>,
  content: string,
): Array<{
  memoryType: ProjectMemoryEntry['memoryType']
  title: string
  content: string
  importance: number
}> {
  const normalizedContent = content.trim()
  if (!normalizedContent) {
    return []
  }

  const drafts: Array<{
    memoryType: ProjectMemoryEntry['memoryType']
    title: string
    content: string
    importance: number
  }> = []

  if (config.memoryType) {
    drafts.push({
      memoryType: config.memoryType,
      title: config.title,
      content: normalizedContent,
      importance: 60,
    })
  }

  const compactContent = clipText(normalizedContent, 240)
  if (!compactContent) {
    return drafts
  }

  const compactDraft =
    config.agentType === 'storyPlanner' || config.artifactType === 'chapterPlan'
      ? {
          memoryType: 'chapterSummary' as const,
          title: `${config.title} 摘要`,
          content: compactContent,
          importance: 72,
        }
      : config.agentType === 'draftWriter' ||
          config.artifactType === 'chapterDraft' ||
          config.artifactType === 'chapterContinuation'
        ? {
            memoryType: 'chapterSummary' as const,
            title: `${config.title} 摘要`,
            content: compactContent,
            importance: 58,
          }
        : config.agentType === 'continuityEditor' || config.artifactType === 'continuityReview'
          ? {
              memoryType: 'continuityRule' as const,
              title: `${config.title} 规则摘要`,
              content: compactContent,
              importance: 78,
            }
          : config.agentType === 'styleEditor'
            ? {
                memoryType: 'stylePreference' as const,
                title: `${config.title} 风格要点`,
                content: compactContent,
                importance: 74,
              }
            : config.agentType === 'loreLibrarian'
              ? {
                  memoryType: 'worldbuilding' as const,
                  title: `${config.title} 设定摘要`,
                  content: compactContent,
                  importance: 76,
                }
              : config.agentType === 'coverPromptAgent' || config.artifactType === 'coverPrompt'
                ? {
                    memoryType: 'stylePreference' as const,
                    title: `${config.title} 视觉风格`,
                    content: compactContent,
                    importance: 70,
                  }
                : null

  if (compactDraft) {
    drafts.push(compactDraft)
  }

  return drafts.filter(
    (draft, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.memoryType === draft.memoryType &&
          candidate.title === draft.title &&
          candidate.content === draft.content,
      ) === index,
  )
}

async function persistProjectMemoryEntries(options: {
  runId: string
  novelId: string
  sourceChapterId: string | null
  drafts: Array<{
    memoryType: ProjectMemoryEntry['memoryType']
    title: string
    content: string
    importance: number
  }>
}): Promise<ProjectMemoryEntry[]> {
  const { runId, novelId, sourceChapterId, drafts } = options
  if (drafts.length === 0) {
    return []
  }

  const entries = await Promise.all(
    drafts.map(async (draft) => {
      const existingEntry = await prisma.projectMemoryEntry.findFirst({
        where: {
          novelId,
          sourceChapterId,
          memoryType: draft.memoryType,
          title: draft.title,
        },
        orderBy: { updatedAt: 'desc' },
      })

      if (existingEntry) {
        return prisma.projectMemoryEntry.update({
          where: { id: existingEntry.id },
          data: {
            runId,
            content: draft.content,
            importance: Math.max(existingEntry.importance ?? 0, draft.importance),
          },
        })
      }

      return prisma.projectMemoryEntry.create({
        data: {
          runId,
          novelId,
          sourceChapterId,
          memoryType: draft.memoryType,
          title: draft.title,
          content: draft.content,
          importance: draft.importance,
        },
      })
    }),
  )

  return entries.map(toProjectMemoryEntry)
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
    emitRunProgress(config.onProgress, {
      stage: 'run.started',
      message: '已接收当前任务，正在整理本次请求。',
      runId: run.id,
    })
    emitRunProgress(config.onProgress, {
      stage: 'context.ready',
      message: '上下文已准备完成，开始组织生成内容。',
      runId: run.id,
    })
    emitRunProgress(config.onProgress, {
      stage: 'model.started',
      message: '正在生成本次结果，请稍候。',
      runId: run.id,
    })

    const rawContent = await generateTextCompletion(
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

    const initialActionPlan = asAgentActionPlan(config.artifactMetadata?.actionPlan)
    const metadataToolPolicy = asAgentWorkspaceToolPolicy(config.artifactMetadata?.toolPolicy)
    const metadataExecutionMode =
      config.artifactMetadata?.executionMode === 'plan' ||
      config.artifactMetadata?.executionMode === 'build' ||
      config.artifactMetadata?.executionMode === 'review'
        ? config.artifactMetadata.executionMode
        : null
    const extractedPlan = extractWorkspacePlanEnvelope(rawContent)
    const sanitizedModelPlan =
      metadataToolPolicy && metadataExecutionMode
        ? sanitizeModelActionPlan({
            rawPlan: extractedPlan.rawPlan,
            executionMode: metadataExecutionMode,
            agentType: config.agentType,
            novelId: config.novelId,
            chapterId: config.chapterId ?? null,
          })
        : null
    const content = extractedPlan.cleanContent || rawContent.trim()
    const artifactMetadata = {
      ...(config.artifactMetadata ?? {}),
      actionPlan: sanitizedModelPlan ?? initialActionPlan ?? null,
    }

    emitRunProgress(config.onProgress, {
      stage: 'artifact.created',
      message: '初稿已生成，正在整理结果结构。',
      runId: run.id,
    })

    const artifact = await prisma.agentArtifact.create({
      data: {
        runId: run.id,
        artifactType: config.artifactType,
        title: config.title,
        summary: config.inputSummary,
        content,
        metadata:
          ({ action: config.action, ...artifactMetadata } satisfies Record<string, unknown>) as unknown as Prisma.InputJsonValue,
      },
    })

    const memoryEntries: ProjectMemoryEntry[] = []
    const memoryDrafts = buildProjectMemoryEntryDrafts(config, content)
    if (memoryDrafts.length > 0) {
      memoryEntries.push(
        ...(await persistProjectMemoryEntries({
          runId: run.id,
          novelId: config.novelId,
          sourceChapterId: config.chapterId ?? null,
          drafts: memoryDrafts,
        })),
      )
    }

    if (memoryEntries.length > 0) {
      emitRunProgress(config.onProgress, {
        stage: 'memory.updated',
        message: '本轮关键信息已同步，正在完成收尾。',
        runId: run.id,
      })
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
    const ruleBundle =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? asAgentRuleBundle((artifactPayload.metadata as Record<string, unknown>).ruleBundle)
        : null
    const storyMemoryDigest =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? asAgentStoryMemoryDigest((artifactPayload.metadata as Record<string, unknown>).storyMemoryDigest)
        : null
    const toolPolicy =
      artifactPayload.metadata && typeof artifactPayload.metadata === 'object'
        ? asAgentWorkspaceToolPolicy((artifactPayload.metadata as Record<string, unknown>).toolPolicy)
        : null

    emitRunProgress(config.onProgress, {
      stage: 'run.completed',
      message: '结果已经准备好，马上返回当前对话。',
      runId: run.id,
    })

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
      ruleBundle,
      storyMemoryDigest,
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
    emitRunProgress(config.onProgress, {
      stage: 'run.failed',
      message,
      runId: run.id,
    })
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
        prompt: `${baseContext}\n\n任务：根据用户要求生成清晰可执行的创作计划；如果用户明确提到作品题材、世界观、人设、主线或开篇方向，就优先输出作品级计划；如果用户明确提到当前章节或某一章，再输出章节级计划。\n补充要求：${input.prompt}`,
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
        prompt: `${baseContext}\n\n选中文本：${input.selectedText}\n任务：根据要求改写上面的选中文本，只做必要修改并尽量保留未改部分，不要把当前章节整章推倒重写。\n改写要求：${input.instruction}`,
      }
    case 'polishSelection':
      return {
        summary: input.prompt ?? input.instruction ?? '润色选中文本',
        prompt: `${baseContext}\n\n选中文本：${input.selectedText}\n任务：润色上面的选中文本，在不改变剧情含义的前提下提升表达质量，只做必要修改并尽量保留未改部分。\n润色要求：${input.prompt ?? input.instruction ?? '语言更凝练、更顺滑、更有画面感。'}`,
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

function hasNovelMetaIntent(prompt: string) {
  const normalized = prompt.replace(/\s+/g, '').toLowerCase()
  return containsAny(normalized, [
    '作品介绍',
    '作品简介',
    '作品内容介绍',
    '内容介绍',
    '简介',
    '介绍页',
    '副标题',
    '标签',
    '作品信息',
  ])
}

function hasMultipleWorkspaceGoals(prompt: string) {
  const normalized = prompt.replace(/\s+/g, '').toLowerCase()
  const goalFlags = [
    containsAny(normalized, ['封面', '提示词', 'cover']),
    hasNovelMetaIntent(normalized),
    containsAny(normalized, ['书名', '作品名', '小说名', '命名', '改名']),
    containsAny(normalized, ['章节', '正文', '续写', '写正文', '新建章节']),
  ].filter(Boolean)

  return goalFlags.length > 1 || /并且|并|同时|再|然后/u.test(normalized)
}

function hasRequestedChapterOrder(prompt: string) {
  return /第[0-9零一二三四五六七八九十百两]+章/u.test(prompt)
}

function isTitleOnlyChapterPrompt(prompt: string) {
  return (
    containsAny(prompt, [
      '标题',
      '题目',
      '章节标题',
      '章节名称',
      '章节名',
      '章名',
      '加标题',
      '起标题',
      '命名',
      '改名',
    ]) &&
    !containsAny(prompt, ['正文', '内容', '续写', '扩写', '补写', '补全', '展开', '写一段', '写点', '写进去', '写入'])
  )
}

function hasChapterBodyWritingIntent(prompt: string) {
  if (isTitleOnlyChapterPrompt(prompt)) {
    return false
  }

  if (
    containsAny(prompt, [
      '帮我写',
      '给我写',
      '直接写',
      '写一下',
      '写点',
      '写一段',
      '写一章',
      '写章节',
      '写正文',
      '生成正文',
      '填充正文',
    ])
  ) {
    return true
  }

  return (
    containsAny(prompt, ['写', '起草', '生成', '续写', '扩写', '补写', '补全', '展开', '正文', '内容']) &&
    (hasRequestedChapterOrder(prompt) || containsAny(prompt, ['章节', '这章', '这一章', '本章', '下一章', '下章', '首章', '开篇']))
  )
}

function hasSelectionRewriteIntent(prompt: string) {
  return containsAny(prompt, [
    '改写',
    '重写',
    'rewrite',
    '换一种写法',
    '改成',
    '改一下',
    '改一改',
    '修改',
    '调整',
  ])
}

function hasSelectionPolishIntent(prompt: string) {
  return containsAny(prompt, [
    '润色',
    'polish',
    '优化表达',
    '更顺',
    '更流畅',
    '收紧',
    '提炼',
    '细化描写',
    '丰富描写',
    '更细致',
    '更有画面感',
  ])
}

function shouldUseChapterContentAsImplicitSelection(prompt: string) {
  const mentionsEditAction =
    hasSelectionRewriteIntent(prompt) ||
    hasSelectionPolishIntent(prompt) ||
    containsAny(prompt, ['补充', '补足', '增强', '丰富', '细化', '优化'])
  const mentionsExistingChapter = containsAny(prompt, [
    '这章',
    '这一章',
    '本章',
    '第一章',
    '第二章',
    '第三章',
    '章节',
    '正文',
    '开头',
  ])
  const mentionsPartialScope = containsAny(prompt, [
    '部分',
    '片段',
    '段落',
    '一段',
    '某段',
    '这段',
    '局部',
    '描写',
    '细节',
    '句子',
    '表达',
    '措辞',
  ])
  const disallowFullRewrite = containsAny(prompt, [
    '不要全部重写',
    '不需要全部重写',
    '不要整章重写',
    '不是全部重写',
    '不用全部重写',
    '不要全改',
  ])

  return mentionsEditAction && (mentionsExistingChapter || mentionsPartialScope || disallowFullRewrite)
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
  const prompt = input.prompt.trim().toLowerCase()
  const promptHasMultipleGoals = hasMultipleWorkspaceGoals(prompt)
  const promptHasNovelMetaIntent = hasNovelMetaIntent(prompt)
  const hintedIntent = mapActionHintToIntent(input.actionHint)
  if (hintedIntent && hintedIntent !== 'workspaceAgent') {
    if (hintedIntent === 'generateCoverPrompt' && (promptHasMultipleGoals || promptHasNovelMetaIntent)) {
      return 'workspaceAgent'
    }
    return hintedIntent
  }

  const hasSelectedText = Boolean(input.selectedText?.trim())
  const hasEditableSelection =
    hasSelectedText ||
    (Boolean(input.chapterContent?.trim()) && shouldUseChapterContentAsImplicitSelection(prompt))

  if (promptHasMultipleGoals) {
    return 'workspaceAgent'
  }

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

  if (hasEditableSelection && hasSelectionPolishIntent(prompt)) {
    return 'polishSelection'
  }

  if (hasEditableSelection && hasSelectionRewriteIntent(prompt)) {
    return 'rewriteSelection'
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

  if (hasChapterBodyWritingIntent(prompt)) {
    return 'draftChapter'
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
    (!hasChapterTarget && hasChapterBodyWritingIntent(prompt)) ||
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
    intent === 'rewriteSelection' ||
    intent === 'polishSelection' ||
    hasChapterBodyWritingIntent(prompt) ||
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

function buildChapterCreationSteps(
  input: ExecuteWorkspaceAgentInput,
  executionMode: AgentExecutionMode,
  agentType: AgentRun['agentType'],
) {
  const steps: NonNullable<AgentActionPlan['steps']> = []

  const createStep = buildActionPlanStep(executionMode, agentType, {
    id: 'create_chapter',
    toolName: 'chapter.create',
    target: {
      scope: 'novel',
      novelId: input.novelId,
      chapterId: null,
    },
    payload: {
      source: 'artifact',
      writeMode: 'create',
      reasoning: '先创建章节实体，让章节树和编辑区先出现真实目标，再继续命名和写正文。',
    },
  })

  if (createStep) {
    steps.push(createStep)
  }

  const renameStep = buildActionPlanStep(executionMode, agentType, {
    id: 'rename_chapter',
    toolName: 'chapter.rename',
    target: {
      scope: 'chapter',
      novelId: input.novelId,
      chapterId: input.chapterId ?? null,
    },
    payload: {
      source: 'artifact',
      reasoning: '新章创建后要先补齐章节标题，避免正文先落库导致章节树仍是占位标题。',
    },
  })

  if (renameStep) {
    steps.push(renameStep)
  }

  const writeStep = buildActionPlanStep(executionMode, agentType, {
    id: 'write_chapter',
    toolName: 'chapter.write',
    target: {
      scope: 'chapter',
      novelId: input.novelId,
      chapterId: input.chapterId ?? null,
    },
    payload: {
      source: 'artifact',
      writeMode: 'replace',
      reasoning: '章节实体和标题准备好后，再把正文写入目标章节，保证工作台状态与输出一致。',
    },
  })

  if (writeStep) {
    steps.push(writeStep)
  }

  return steps
}

function buildWorkspaceActionPlanFromRegistry(
  input: ExecuteWorkspaceAgentInput,
  intent: WorkspaceAgentIntent,
  executionMode: AgentExecutionMode,
  agentType: AgentRun['agentType'],
): AgentActionPlan | null {
  const prompt = input.prompt.trim().toLowerCase()
  const steps: AgentActionPlan['steps'] = []
  const hasChapterTarget = Boolean(input.chapterId)
  const wantsCover = containsAny(prompt, ['封面', '提示词', 'cover'])
  const wantsNovelMeta = hasNovelMetaIntent(prompt)

  if (shouldPlanRenameNovel(prompt, intent)) {
    const step = buildActionPlanStep(executionMode, agentType, {
      id: 'rename_novel',
      toolName: 'novel.rename',
      target: {
        scope: 'novel',
        novelId: input.novelId,
      },
      payload: {
        source: 'artifact',
        title: '',
      },
    })

    if (step) {
      steps.push(step)
    }
  }

  if (shouldPlanRenameChapter(prompt, intent) && hasChapterTarget) {
    const step = buildActionPlanStep(executionMode, agentType, {
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
    if (createChapter) {
      steps.push(...buildChapterCreationSteps(input, executionMode, agentType))
    } else {
      const appendChapter = shouldPlanAppendChapter(prompt, intent)
      const step = buildActionPlanStep(executionMode, agentType, {
        id: appendChapter ? 'append_chapter' : 'write_chapter',
        toolName: appendChapter ? 'chapter.append' : 'chapter.write',
        target: {
          scope: 'chapter',
          novelId: input.novelId,
          chapterId: input.chapterId ?? null,
        },
        payload: {
          source: 'artifact',
          writeMode: appendChapter ? 'append' : 'replace',
        },
      })

      if (step) {
        steps.push(step)
      }
    }
  }

  if (wantsNovelMeta) {
    const step = buildActionPlanStep(executionMode, agentType, {
      id: 'update_novel_meta',
      toolName: 'novel.update_meta',
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

  if (wantsCover) {
    const promptStep = buildActionPlanStep(executionMode, agentType, {
      id: 'set_cover_prompt',
      toolName: 'cover.prompt.set',
      target: {
        scope: 'novel',
        novelId: input.novelId,
      },
      payload: {
        source: 'artifact',
      },
    })

    if (promptStep) {
      steps.push(promptStep)
    }

    const generateStep = buildActionPlanStep(executionMode, agentType, {
      id: 'generate_cover',
      toolName: 'cover.generate',
      target: {
        scope: 'novel',
        novelId: input.novelId,
      },
      payload: {
        count: 1,
      },
    })

    if (generateStep) {
      steps.push(generateStep)
    }

    const applyStep = buildActionPlanStep(executionMode, agentType, {
      id: 'apply_cover',
      toolName: 'cover.apply',
      target: {
        scope: 'novel',
        novelId: input.novelId,
      },
      payload: {
        source: 'latest_generated',
      },
    })

    if (applyStep) {
      steps.push(applyStep)
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

async function buildDynamicWorkspaceActionPlan(options: {
  userId: string
  input: ExecuteWorkspaceAgentInput
  executionMode: AgentExecutionMode
  agentType: AgentRun['agentType']
  toolPolicy: AgentWorkspaceToolPolicy
  prompt: string
}) {
  const planningSystemPrompt = [
    '你是小说创作工作台里的任务规划 Agent。',
    '你只负责把当前请求拆成可执行步骤，不直接输出正文。',
    '你必须理解工作区语义：作品是根对象；计划文档是创作资料；章节写作必须以真实章节实体为目标；当前打开的计划或目录视图不能把目标锁死。',
    '你需要先给出 2 到 4 条真实的内部思考，写进 thinking 数组；每条都要具体说明你看到了什么问题、为什么这样拆，不要写泛化空话。',
    '你必须根据当前请求自行判断需要几步，每一步的标题都要贴近用户语言，不要使用泛化空话。',
    '如果用户一句话里明确提出了两个或以上动作，steps 至少要覆盖每个动作，不允许只保留其中一个。',
    '如果用户要新写一章，且当前没有明确章节实体，steps 必须至少包含 chapter.create、chapter.rename、chapter.write 三步，顺序不能颠倒。',
    '如果某一步会真正改动工作台，请把原因写进 payload.reasoning，说明为什么要先做这一步。',
    '如果步骤是 novel.rename，payload 必须直接带上最终书名 title，不要只写 source。',
    '如果步骤是 novel.update_meta，payload 必须直接带上最终要写入的 title、displayTitle、summary、tags、visibility、status 中的相关字段，而不是只写 source。',
    '如果步骤是 cover.prompt.set，payload 必须直接带上 coverPrompt 或 prompt 的最终文本。',
    '如果步骤是 cover.generate，payload 可以补 count；如果步骤是 cover.apply，payload 可以用 source=latest_generated 表示把最新生成的候选图设为当前封面。',
    '如果用户是局部改写、润色、补某一段或处理选中文本，要优先使用最小改动原则，不要默认覆盖整章。',
    '如果当前章节标题为空，且本次任务是新写章节或补完整章，请把“补齐章节标题”纳入计划，再处理正文。',
    '只输出一段 <workspace_plan>...</workspace_plan>，不要输出任何额外说明。',
    'JSON 结构必须满足 {"mode":"plan|execute|review","summary":"...","thinking":["..."],"steps":[...]}。',
    'steps 里的每一项都必须包含 id、toolName、title、target、payload。',
    'toolName 只能从下方可用工具里选择；如果不需要任何工作台动作，就输出 steps: []。',
    '[当前可用工作台工具]',
    formatWorkspaceToolPolicy(options.toolPolicy),
  ].join('\n')

  const rawPlanText = await generateTextCompletion(planningSystemPrompt, options.prompt, {
    userId: options.userId,
    action: 'agent:workspace_plan_preview',
    novelId: options.input.novelId,
    chapterId: options.input.chapterId ?? null,
    targetType: 'agentRun',
    temperature: 0.2,
  })

  const extractedPlan = extractWorkspacePlanEnvelope(rawPlanText)
  return sanitizeModelActionPlan({
    rawPlan: extractedPlan.rawPlan,
    executionMode: options.executionMode,
    agentType: options.agentType,
    novelId: options.input.novelId,
    chapterId: options.input.chapterId ?? null,
  })
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
        title: '创作计划',
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

function buildWorkspaceSystemPrompt(
  intent: WorkspaceAgentIntent,
  title: string,
  agentType: AgentRun['agentType'],
  toolPolicy?: AgentWorkspaceToolPolicy | null,
): string {
  const responseRule = buildWorkspaceResponseRule(intent)
  const common = [
    '你是小说创作工作台里的高级 Agent。',
    '请只输出对用户有用的最终结果，不要解释你的系统设定，不要暴露开发信息。',
    '如果上下文不足，请基于已给出的内容作出最稳妥的结果，并明确哪些地方是基于现有上下文的建议，而不是编造事实。',
    '你必须牢记：计划文档、目录文档和正文章节是不同对象；当前打开哪个文档不等于用户只能操作哪个对象。',
    '如果用户要改工作台状态，请优先通过规划出的工具步骤完成；正文内容只是素材，不是对工作台动作的替代。',
    '除非用户明确要求解释，否则不要说“我已经帮你创建”“我已经替你命名”“我已经写入正文”这类执行完成话术；请直接输出将被写入的标题、章节名或正文内容本身。',
    '如果用户要的是章节标题、章节命名、书名或作品名，你只能输出最终标题本身，或使用“章节标题：xxx”的单行格式；绝对不要输出说明、理由、补充建议、引用正文、代码块或任何会被误写入编辑器的句子。',
    '只有在用户明确要求撰写、续写、扩写、补写正文时，才允许输出正文段落；命名类请求绝不能混入正文内容。',
    '如果当前任务是新写一章、补完整章，或当前章节标题为空，你输出的正文必须默认采用“章节标题 + 空一行 + 正文”的结构。',
    '如果当前任务是改写、润色、修补某一段或处理选中文本，你只能输出需要替换的那一段最终文本，不要把整章重新输出。',
    '如果用户要求保存作品、发布、下架、删除、打开设置或新建章节，请把它表述成“待确认执行的操作建议”，不要伪装成已经执行完成。',
    ...buildWorkspaceBuiltinProtocol({
      intent,
      title,
      responseRule,
      toolPolicy,
    }),
  ]

  if (agentType === 'storyPlanner') {
    common.push('你当前是剧情规划 Agent，只负责命名、结构设计、提纲拆解和前置规划，不直接展开成长篇正文。')
  } else if (agentType === 'draftWriter') {
    common.push('你当前是正文写作 Agent，只负责输出可直接落回编辑器的正文内容，不承担作品发布、删除或封面设置。')
  } else if (agentType === 'continuityEditor') {
    common.push('你当前是连续性审阅 Agent，只负责指出设定冲突、人物动机和时间线问题，不直接改写正文。')
  } else if (agentType === 'styleEditor') {
    common.push('你当前是文风编辑 Agent，只负责局部改写、润色和表达优化，不负责新建章节或发布作品。')
  } else if (agentType === 'loreLibrarian') {
    common.push('你当前是设定检索 Agent，只负责梳理设定、背景资料、人物关系和时间线，不直接生成封面提示词或整章正文。')
  } else if (agentType === 'coverPromptAgent') {
    common.push('你当前是封面提示词 Agent，只负责整理封面视觉描述和生图提示词，不介入章节写作接口。')
  } else {
    common.push('你当前是主控 Agent，负责理解意图、组织上下文，并把任务交给最合适的专职 Agent。')
  }

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
      return '请输出可执行的创作计划；作品级计划要覆盖定位、世界观、角色关系、主线推进和开篇路径，章节级计划要突出冲突推进、情绪节奏和结尾钩子。'
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

function buildWorkspaceRuleBundle(options: {
  intent: WorkspaceAgentIntent
  novelSummary: string
  genre?: string
  protagonist?: string
  tone?: string
  stylePreference?: string
  chapterSummary?: string
  handoffSummary?: string | null
}): AgentRuleBundle {
  const rules = [
    options.novelSummary.trim() ? `所有输出都要围绕当前作品简介展开：${clipText(options.novelSummary.trim(), 120)}` : '',
    options.genre?.trim() ? `保持题材一致：${options.genre.trim()}` : '',
    options.protagonist?.trim() ? `不要偏离当前主角设定：${clipText(options.protagonist.trim(), 80)}` : '',
    options.tone?.trim() ? `维持当前语气与情绪基调：${clipText(options.tone.trim(), 80)}` : '',
    options.stylePreference?.trim() ? `遵守当前文风偏好：${clipText(options.stylePreference.trim(), 80)}` : '',
    options.chapterSummary?.trim() ? `承接当前章节摘要：${clipText(options.chapterSummary.trim(), 100)}` : '',
    options.handoffSummary?.trim() ? `优先延续刚确认的计划与交接内容：${clipText(options.handoffSummary.trim(), 100)}` : '',
    options.intent === 'planChapter'
      ? '当前任务先给可执行计划，不直接展开成长篇正文。'
      : options.intent === 'reviewContinuity'
        ? '当前任务优先指出设定冲突、人物动机和时间线问题，不直接改写正文。'
        : options.intent === 'generateCoverPrompt'
          ? '当前任务只整理封面画面与提示词，不扩写正文剧情。'
          : '如需写正文，请输出可直接落回编辑器的中文内容。',
  ].filter(Boolean)

  return {
    summary: `本次已注入 ${rules.length} 条作品级规则。`,
    rules,
  }
}

function buildStoryMemoryDigest(memoryEntries: ProjectMemoryEntry[]): AgentStoryMemoryDigest {
  const items = memoryEntries.slice(0, 5).map((entry) => ({
    title: entry.title,
    memoryType: entry.memoryType,
    excerpt: clipText(entry.content, 90),
  }))

  return {
    summary:
      items.length > 0
        ? `本次参考了 ${items.length} 条长期记忆。`
        : '当前还没有可复用的长期记忆摘要。',
    items,
  }
}

function selectAgentScopedMemoryEntries(
  agentType: AgentRun['agentType'],
  memoryEntries: ProjectMemoryEntry[],
): ProjectMemoryEntry[] {
  const preferredTypes: Array<ProjectMemoryEntry['memoryType']> =
    agentType === 'storyPlanner'
      ? ['novelSummary', 'chapterSummary', 'worldbuilding', 'characterCard', 'foreshadowing', 'timelineEvent']
      : agentType === 'draftWriter'
        ? ['chapterSummary', 'stylePreference', 'foreshadowing', 'timelineEvent', 'characterCard', 'novelSummary']
        : agentType === 'continuityEditor'
          ? ['continuityRule', 'timelineEvent', 'foreshadowing', 'characterCard', 'worldbuilding', 'chapterSummary']
          : agentType === 'styleEditor'
            ? ['stylePreference', 'chapterSummary', 'novelSummary', 'characterCard']
            : agentType === 'loreLibrarian'
              ? ['worldbuilding', 'characterCard', 'timelineEvent', 'foreshadowing', 'novelSummary']
              : agentType === 'coverPromptAgent'
                ? ['novelSummary', 'worldbuilding', 'characterCard', 'stylePreference']
                : ['novelSummary', 'chapterSummary', 'stylePreference', 'worldbuilding', 'characterCard']

  const preferredEntries = preferredTypes.flatMap((memoryType) =>
    memoryEntries.filter((entry) => entry.memoryType === memoryType),
  )
  const fallbackEntries = memoryEntries.filter((entry) => !preferredEntries.some((selected) => selected.id === entry.id))

  return [...preferredEntries, ...fallbackEntries].slice(0, 5)
}

function buildAgentScopedMemoryPrompt(
  agentType: AgentRun['agentType'],
  memoryEntries: ProjectMemoryEntry[],
  storyMemoryDigest: AgentStoryMemoryDigest,
): string {
  const agentLabel =
    agentType === 'storyPlanner'
      ? '剧情规划 Agent'
      : agentType === 'draftWriter'
        ? '正文写作 Agent'
        : agentType === 'continuityEditor'
          ? '连续性审阅 Agent'
          : agentType === 'styleEditor'
            ? '文风编辑 Agent'
            : agentType === 'loreLibrarian'
              ? '设定检索 Agent'
              : agentType === 'coverPromptAgent'
                ? '封面提示词 Agent'
                : '主控 Agent'

  return [
    '[当前专职 Agent 重点记忆]',
    `${agentLabel} 当前优先参考以下记忆：`,
    storyMemoryDigest.summary,
    formatStoryMemoryDigest(storyMemoryDigest),
    '',
    '[当前专职 Agent 重点长期记忆]',
    formatMemoryContext(memoryEntries),
  ].join('\n')
}

function formatRuleBundle(ruleBundle: AgentRuleBundle): string {
  if (ruleBundle.rules.length === 0) {
    return '暂无额外规则。'
  }

  return ruleBundle.rules.map((rule) => `- ${rule}`).join('\n')
}

function formatStoryMemoryDigest(storyMemoryDigest: AgentStoryMemoryDigest): string {
  if (storyMemoryDigest.items.length === 0) {
    return '暂无可引用的长期记忆摘要。'
  }

  return storyMemoryDigest.items
    .map((item) => `- ${item.title}（${item.memoryType}）：${item.excerpt}`)
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
  const ruleBundle = buildWorkspaceRuleBundle({
    intent,
    novelSummary: input.novelSummary?.trim() || novel.summary || '',
    genre: input.genre?.trim(),
    protagonist: input.protagonist?.trim(),
    tone: input.tone?.trim(),
    stylePreference: input.stylePreference?.trim(),
    chapterSummary: currentChapterSummary,
    handoffSummary: handoffArtifact?.summary ?? clipText(handoffArtifact?.content, 160),
  })
  const storyMemoryDigest = buildStoryMemoryDigest(memoryEntries)

  const prompt = [
    '[任务读取说明]',
    '请先遵守系统中的统一内置执行协议，再把下面的用户原始输入视为本次要完成的需求描述。',
    '如果用户输入里包含多个动作，请先拆分成子任务再决定执行顺序。',
    '',
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
    '[作品规则包]',
    ruleBundle.summary,
    formatRuleBundle(ruleBundle),
    '',
    '[故事记忆摘要]',
    storyMemoryDigest.summary,
    formatStoryMemoryDigest(storyMemoryDigest),
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
      ? `上一轮计划摘要：${handoffArtifact.summary ?? (clipText(handoffArtifact.content, 160) || '已确认一份章节计划。')}`
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
    '[用户原始需求]',
    input.prompt.trim(),
  ]
    .filter(Boolean)
    .join('\n')

  return {
    summary: clipText(input.prompt, 120) || resolveWorkspaceIntentConfig(intent).title,
    prompt,
    ruleBundle,
    storyMemoryDigest,
    memoryEntries,
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
  options?: {
    onProgress?: PromptBackedRunConfig['onProgress']
  },
): Promise<AgentActionResponse['data']> {
  const session = await ensureSessionForAction(userId, input.novelId, input.sessionId)
  const intent = inferWorkspaceIntent(input)
  const config = resolveWorkspaceIntentConfig(intent)
  const executionMode = toExecutionMode(config.mode)
  const builtPrompt = await buildWorkspacePrompt(userId, input, intent)
  const routing = resolveDynamicWorkspaceAgentRouting({
    intent,
    config,
    input,
    ruleBundle: builtPrompt.ruleBundle,
    storyMemoryDigest: builtPrompt.storyMemoryDigest,
  })
  const routeDecision = buildWorkspaceRouteDecision({
    config,
    targetAgentType: routing.agentType,
    decisionSignals: routing.signals,
    ruleBundle: builtPrompt.ruleBundle,
    storyMemoryDigest: buildStoryMemoryDigest(selectAgentScopedMemoryEntries(routing.agentType, builtPrompt.memoryEntries)),
  })
  const scopedMemoryEntries = selectAgentScopedMemoryEntries(routing.agentType, builtPrompt.memoryEntries)
  const scopedStoryMemoryDigest = buildStoryMemoryDigest(scopedMemoryEntries)
  const scopedPrompt = [builtPrompt.prompt, '', buildAgentScopedMemoryPrompt(routing.agentType, scopedMemoryEntries, scopedStoryMemoryDigest)].join(
    '\n',
  )
  const toolPolicy = buildWorkspaceToolPolicy(executionMode, routing.agentType)

  const fallbackActionPlan = buildWorkspaceActionPlanFromRegistry(input, intent, executionMode, routing.agentType)
  let actionPlan = fallbackActionPlan

  try {
    const plannedActionPlan = await buildDynamicWorkspaceActionPlan({
      userId,
      input,
      executionMode,
      agentType: routing.agentType,
      toolPolicy,
      prompt: scopedPrompt,
    })

    if (plannedActionPlan) {
      actionPlan = plannedActionPlan
    }
  } catch {
    actionPlan = fallbackActionPlan
  }

  const handoff = config.mode === 'plan' ? buildPlanToBuildHandoff(actionPlan) : null

  const progressPlan = describeWorkspacePlanForProgress(actionPlan)
  emitRunProgress(options?.onProgress, {
    stage: 'task.decomposed',
    message:
      actionPlan?.summary?.trim() ||
      (progressPlan.length > 1 ? `已拆出 ${progressPlan.length} 个处理步骤，准备依次完成。` : '已确认本轮只需要完成一个核心步骤。'),
    data: {
      intent,
      stepCount: actionPlan?.steps.length ?? progressPlan.length,
      targetAgentType: routing.agentType,
    },
  })

  for (const item of progressPlan) {
    emitRunProgress(options?.onProgress, {
      stage: item.stage,
      message: item.message,
      data: { intent },
    })
  }

  return executePromptBackedRun({
    userId,
    sessionId: session.id,
    novelId: input.novelId,
    chapterId: input.chapterId ?? null,
    action: config.action,
    mode: config.mode,
    agentType: routing.agentType,
    artifactType: config.artifactType,
    title: config.title,
    inputSummary: builtPrompt.summary,
    prompt: scopedPrompt,
    systemPrompt: buildWorkspaceSystemPrompt(intent, config.title, routing.agentType, toolPolicy),
    memoryType: config.memoryType,
    artifactMetadata: {
      workspaceTask: config.task,
      intentLabel: config.title,
      availableApplyStrategies: config.applyStrategies,
      actionHint: input.actionHint ?? null,
      activeAgent: buildExecutionAgent(routing.agentType),
      routeDecision,
      ruleBundle: builtPrompt.ruleBundle,
      storyMemoryDigest: scopedStoryMemoryDigest,
      executionMode,
      toolPolicy,
      actionPlan,
      handoff,
    },
    onProgress: options?.onProgress,
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
  const ruleBundle = asAgentRuleBundle(firstArtifact?.metadata?.ruleBundle)
  const storyMemoryDigest = asAgentStoryMemoryDigest(firstArtifact?.metadata?.storyMemoryDigest)
  const actionPlan = asAgentActionPlan(firstArtifact?.metadata?.actionPlan)
  const toolPolicy = asAgentWorkspaceToolPolicy(firstArtifact?.metadata?.toolPolicy)
  const stepResults =
    firstArtifact?.metadata && typeof firstArtifact.metadata === 'object'
      ? ((firstArtifact.metadata as Record<string, unknown>).stepResults as AgentActionResponse['data']['stepResults']) ?? null
      : null
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
    ruleBundle,
    storyMemoryDigest,
    executionMode,
    actionPlan,
    stepResults,
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
  const routeStatusEvents = buildRouteStatusEvents(
    data.run.id,
    data.run.createdAt,
    data.routeDecision ?? null,
  )

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
    ...routeStatusEvents,
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
      chapter: null as {
        id: string
        title: string
        summary: string | null
        content: string
        wordCount: number
        updatedAt: string
      } | null,
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
    novel: null as { id: string; coverPrompt: string | null; updatedAt: string } | null,
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
