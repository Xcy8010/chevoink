import type {
  AiImageSize,
  AgentActionHandoff,
  AgentActionPlan,
  AgentArtifactApplyStrategy,
  AgentExecutionAgent,
  AgentExecutionMode,
  AgentRouteDecision,
  AgentRuleBundle,
  AgentStoryMemoryDigest,
  AgentWorkspaceToolPolicy,
  ChapterStatus,
  GenerateOutlineRequest,
  ProjectMemoryType,
  Visibility,
} from '../../../shared/contracts/index.js'

export type EditableNovelStatus = 'draft' | 'published' | 'archived'
export type AssistMode = 'draft' | 'outline' | 'continue' | 'rewrite' | 'polish' | 'summarize'
export type MobileView = 'editor' | 'chapters' | 'assistant' | 'cover' | 'meta'
export type ToolPanel = 'meta' | 'assistant' | 'cover'
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
export type AgentTab = 'plan' | 'write' | 'review' | 'cover'
export type AgentTaskType =
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
export type AgentArtifactType = 'chapter_plan' | 'draft_text' | 'review_report' | 'cover_prompt'

export type NovelFormState = {
  title: string
  displayTitle: string
  summary: string
  tagsText: string
  visibility: Visibility
  status: EditableNovelStatus
}

export type ProjectNotesState = {
  genre: string
  protagonist: string
  tone: string
  outlineLength: NonNullable<GenerateOutlineRequest['targetLength']>
  stylePreference: string
}

export type ChapterDraftState = {
  id: string
  title: string
  summary: string
  content: string
  status: ChapterStatus
  visibility: Visibility
  orderIndex: number
  localOnly: boolean
}

export type AssistantResultState = {
  mode: AssistMode
  content: string
  summary?: string
  createdAt: string
}

export type AgentMessage = {
  id: string
  role: 'user' | 'assistant' | 'status'
  content: string
  createdAt: string
  mode?: AssistMode
  tone?: 'neutral' | 'success' | 'error'
}

export type AgentProgressState = {
  active: boolean
  title: string
  steps: string[]
  currentStep: number
}

export type SavedSuggestion = {
  id: string
  title: string
  content: string
  createdAt: string
}

export type AgentArtifact = {
  id: string
  task: AgentTaskType
  type: AgentArtifactType
  title: string
  content: string
  rawContent?: string
  promptText?: string
  createdAt: string
  status: 'streaming' | 'ready'
  runId?: string | null
  sessionId?: string | null
  runStatusMode?: AgentRunStatusMode
  runStatuses?: AgentRunStatusItem[]
  memoryEntries?: AgentMemoryEntry[]
  backendArtifactId?: string | null
  availableApplyStrategies?: AgentArtifactApplyStrategy[]
  savedAsPlan?: boolean
  appliedToCover?: boolean
  replacedChapterContent?: boolean
  appendedToChapter?: boolean
  renamedNovel?: boolean
  renamedChapter?: boolean
  actionSummary?: string
  actionPlan?: AgentActionPlan | null
  handoff?: AgentActionHandoff | null
  activeAgent?: AgentExecutionAgent | null
  routeDecision?: AgentRouteDecision | null
  ruleBundle?: AgentRuleBundle | null
  storyMemoryDigest?: AgentStoryMemoryDigest | null
  executionMode?: AgentExecutionMode | null
  toolPolicy?: AgentWorkspaceToolPolicy | null
  localRollbackSnapshot?: AgentLocalRollbackSnapshot | null
  pendingChapterReview?: ChapterPendingReview | null
}

export type AgentRunState = {
  active: boolean
  task: AgentTaskType | null
  title: string
  statusText: string
  activeAgent?: AgentExecutionAgent | null
  routeDecision?: AgentRouteDecision | null
  executionMode?: AgentExecutionMode | null
}

export type AgentRunStatusItem = {
  id: string
  event: string
  text: string
  createdAt: string
}

export type AgentRunStatusMode = 'none' | 'live' | 'history'

export type AgentMemoryEntry = {
  id: string
  memoryType: ProjectMemoryType
  title: string
  content: string
  importance: number
  createdAt: string
}

export type AgentLocalRollbackChapterSnapshot = {
  id: string
  title: string
  summary: string
  content: string
  status: ChapterStatus
  visibility: Visibility
  wordCount: number
  updatedAt: string | null
}

export type AgentLocalRollbackSnapshot =
  | {
      kind: 'restore_chapter'
      chapter: AgentLocalRollbackChapterSnapshot
      selectedChapterId: string | null
    }
  | {
      kind: 'remove_created_chapter'
      chapter: AgentLocalRollbackChapterSnapshot
      previousSelectedChapterId: string | null
      previousChapter?: AgentLocalRollbackChapterSnapshot | null
    }

export type ChapterPendingReview = {
  id: string
  chapterId: string
  artifactId?: string | null
  runId?: string | null
  before: ChapterDraftState | null
  after: ChapterDraftState
  rollbackSnapshot: AgentLocalRollbackSnapshot
  description: string
  createdAt: string
}

export type EditorSelectionState = {
  start: number
  end: number
  text: string
}

export type CoverFormState = {
  novelTitle: string
  summary: string
  genre: string
  protagonist: string
  stylePreference: string
  prompt: string
  negativePrompt: string
  size: AiImageSize
  count: number
}

export const visibilityLabelMap: Record<Visibility, string> = {
  public: '公开',
  followers: '仅关注者',
  private: '仅自己',
}

export const chapterStatusLabelMap: Record<ChapterStatus, string> = {
  draft: '草稿',
  published: '已发布',
  scheduled: '定时发布',
  archived: '已下架',
}

export const novelStatusLabelMap: Record<EditableNovelStatus, string> = {
  draft: '草稿箱',
  published: '公开连载',
  archived: '已下架',
}

export const assistModeLabelMap: Record<AssistMode, string> = {
  draft: '帮写',
  outline: '大纲',
  continue: '续写',
  rewrite: '改写',
  polish: '润色',
  summarize: '摘要',
}

export const assistRunLabelMap: Record<AssistMode, string> = {
  draft: '开始帮写',
  outline: '生成大纲',
  continue: '开始续写',
  rewrite: '开始改写',
  polish: '开始润色',
  summarize: '生成摘要',
}

export const assistPromptLabelMap: Record<AssistMode, string> = {
  draft: '帮写要求',
  outline: '大纲要求',
  continue: '续写要求',
  rewrite: '改写要求',
  polish: '润色要求',
  summarize: '摘要要求',
}

export const assistPromptPlaceholderMap: Record<AssistMode, string> = {
  draft: '例如：帮我写这一章开场，先写主角在失重舱醒来，氛围压抑克制。',
  outline: '例如：这一卷强调政治阴谋和身份反转，节奏中速，结尾留悬念。',
  continue: '例如：继续往下写，重点放在门外脚步逼近和主角的心理变化。',
  rewrite: '例如：改成更冷静、更电影感的叙述，不要太解释。',
  polish: '例如：保留情节不变，把语言再收紧一点，增强画面感。',
  summarize: '例如：提炼这一章主线推进、情绪节点和钩子。',
}

export const agentTabLabelMap: Record<AgentTab, string> = {
  plan: '计划',
  write: '写作',
  review: '审阅',
  cover: '封面',
}

export const agentTaskLabelMap: Record<AgentTaskType, string> = {
  'workspace-agent': '自由调度',
  'generate-novel-title': '书名提案',
  'generate-chapter-titles': '章节名提案',
  'read-story-context': '上下文检索',
  'plan-chapter': '章节计划',
  'draft-chapter': '起草正文',
  'continue-chapter': '续写本章',
  'rewrite-selection': '改写选中',
  'polish-selection': '润色选中',
  'review-continuity': '一致性审阅',
  'generate-cover-prompt': '封面提示词',
}

export const agentArtifactLabelMap: Record<AgentArtifactType, string> = {
  chapter_plan: '章节计划',
  draft_text: '正文结果',
  review_report: '审阅结果',
  cover_prompt: '封面提示词',
}

export const agentMemoryTypeLabelMap: Record<ProjectMemoryType, string> = {
  novelSummary: '作品摘要',
  worldbuilding: '世界设定',
  characterCard: '角色设定',
  chapterSummary: '章节摘要',
  timelineEvent: '时间线',
  foreshadowing: '伏笔',
  stylePreference: '风格偏好',
  continuityRule: '一致性规则',
}

export const imageSizeLabelMap: Record<AiImageSize, string> = {
  '768x1024': '便携竖版',
  '1024x1024': '方形预览',
  '1024x1536': '标准封面',
  '1536x1024': '横幅构图',
}

export const supportedAgentTaskMap: Record<AgentTab, AgentTaskType[]> = {
  plan: ['generate-novel-title', 'generate-chapter-titles', 'plan-chapter'],
  write: ['workspace-agent', 'draft-chapter', 'continue-chapter', 'rewrite-selection', 'polish-selection'],
  review: ['read-story-context', 'review-continuity'],
  cover: ['generate-cover-prompt'],
}

export const supportedAgentTasks = Object.values(supportedAgentTaskMap).flat()

export function isSupportedAgentTask(task: AgentTaskType): boolean {
  return supportedAgentTasks.includes(task)
}
