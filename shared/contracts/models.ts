export type EntityId = string

export type AiImageSize =
  | '768x1024'
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'

export type AiProviderMode = 'mock' | 'provider' | 'fallback' | 'hybrid' | string
export type AiProviderType = 'text' | 'image'
export type UserRole = 'user' | 'author' | 'admin'
export type NovelStatus = 'draft' | 'published' | 'archived'
export type ChapterStatus = 'draft' | 'published' | 'scheduled' | 'archived'
export type Visibility = 'public' | 'followers' | 'private'
export type CommentTargetType = 'novel' | 'chapter' | 'post'
export type MessageType = 'text' | 'novelCard' | 'postCard' | 'system'
export type ConversationType = 'direct' | 'system'
export type CoverSourceType = 'upload' | 'ai_generated'
export type ContentAuditStatus = 'pending' | 'approved' | 'rejected'
export type AgentSessionStatus = 'active' | 'archived'
export type AgentRunMode = 'plan' | 'act' | 'review'
export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type AgentType =
  | 'writingOrchestrator'
  | 'storyPlanner'
  | 'draftWriter'
  | 'continuityEditor'
  | 'styleEditor'
  | 'loreLibrarian'
  | 'coverPromptAgent'
export type AgentActionKind =
  | 'planChapter'
  | 'draftChapter'
  | 'continueChapter'
  | 'rewriteSelection'
  | 'polishSelection'
  | 'reviewContinuity'
  | 'generateCoverPrompt'
export type AgentWorkspaceToolName =
  | 'novel.rename'
  | 'chapter.rename'
  | 'chapter.create'
  | 'chapter.write'
  | 'chapter.append'
  | 'novel.update_meta'
  | 'novel.publish'
  | 'novel.archive'
  | 'novel.delete'
  | 'cover.prompt.set'
  | 'workspace.open_meta'
  | 'workspace.open_cover'
export type AgentArtifactType =
  | 'chapterPlan'
  | 'chapterDraft'
  | 'chapterContinuation'
  | 'rewriteSelection'
  | 'polishSelection'
  | 'continuityReview'
  | 'coverPrompt'
export type ProjectMemoryType =
  | 'novelSummary'
  | 'worldbuilding'
  | 'characterCard'
  | 'chapterSummary'
  | 'timelineEvent'
  | 'foreshadowing'
  | 'stylePreference'
  | 'continuityRule'
export type AgentArtifactApplyStrategy = string
export type ConversationPresence = 'online' | 'offline' | 'typing' | string

export interface Pagination {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  [key: string]: unknown
}

export interface UserSummary {
  id: EntityId
  nickname: string
  avatarUrl: string | null
  profileCoverUrl?: string | null
  bio?: string | null
  role?: UserRole
  isAuthor?: boolean
  [key: string]: unknown
}

export interface User extends UserSummary {
  email: string | null
  phone: string | null
  passwordConfigured: boolean
  followerCount: number
  followingCount: number
  novelCount: number
  postCount: number
  unreadMessageCount: number
  unreadNotificationCount: number
  createdAt: string
  updatedAt: string
}

export interface AuthorSummary extends UserSummary {
  followerCount: number
  novelCount: number
  isFollowed: boolean
}

export interface TopicSummary {
  id: EntityId
  name: string
  slug: string
  postCount: number
  [key: string]: unknown
}

export interface NovelRelatedSummary {
  id: EntityId
  title: string
  coverUrl: string | null
  [key: string]: unknown
}

export interface Novel {
  id: EntityId
  title: string
  displayTitle: string | null
  slug: string
  summary: string
  categoryId: string | null
  categoryName: string | null
  tags: string[]
  status: NovelStatus
  visibility: Visibility
  coverUrl: string | null
  coverAssetId: string | null
  coverPrompt: string | null
  wordCount: number
  chapterCount: number
  commentCount: number
  favoriteCount: number
  likeCount: number
  viewCount: number
  lastChapterTitle: string | null
  lastPublishedAt: string | null
  publishedAt: string | null
  author: AuthorSummary
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface NovelCard {
  id: EntityId
  title: string
  displayTitle: string | null
  slug: string
  summary: string
  tags: string[]
  status: NovelStatus
  coverUrl: string | null
  wordCount: number
  chapterCount: number
  lastPublishedAt: string | null
  updatedAt: string
  author: {
    id: EntityId
    nickname: string
    avatarUrl: string | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface Chapter {
  id: EntityId
  novelId: EntityId
  authorId: EntityId
  title: string
  summary: string | null
  content: string
  orderIndex: number
  wordCount: number
  status: ChapterStatus
  visibility: Visibility
  commentCount: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface ChapterListItem {
  id: EntityId
  novelId: EntityId
  title: string
  summary: string | null
  orderIndex: number
  wordCount: number
  status: ChapterStatus
  visibility: Visibility
  commentCount: number
  publishedAt: string | null
  [key: string]: unknown
}

export interface Comment {
  id: EntityId
  targetType: CommentTargetType
  targetId: EntityId
  parentId: EntityId | null
  rootId: EntityId | null
  content: string
  likeCount: number
  replyCount: number
  auditStatus: ContentAuditStatus
  author: {
    id: EntityId
    nickname: string
    avatarUrl: string | null
    [key: string]: unknown
  }
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface Post {
  id: EntityId
  content: string
  excerpt: string
  topic: TopicSummary | null
  imageUrls: string[]
  relatedNovel: NovelRelatedSummary | null
  likeCount: number
  commentCount: number
  favoriteCount: number
  auditStatus: ContentAuditStatus
  author: {
    id: EntityId
    nickname: string
    avatarUrl: string | null
    [key: string]: unknown
  }
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface ConversationMemberSummary {
  id: EntityId
  nickname: string
  avatarUrl: string | null
  [key: string]: unknown
}

export interface Conversation {
  id: EntityId
  type: ConversationType
  title: string | null
  avatarUrl: string | null
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageAt: string | null
  members: ConversationMemberSummary[]
  counterpart?: ConversationMemberSummary | null
  presence?: ConversationPresence
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface Message {
  id: EntityId
  conversationId: EntityId
  senderId: EntityId
  type: MessageType
  content: string
  relatedId: EntityId | null
  createdAt: string
  [key: string]: unknown
}

export interface CoverAsset {
  id: EntityId
  novelId: EntityId | null
  ownerUserId: EntityId
  sourceType: CoverSourceType
  imageUrl: string
  prompt: string | null
  negativePrompt: string | null
  modelName: string | null
  width: number | null
  height: number | null
  createdAt: string
  [key: string]: unknown
}

export interface AiUsageLog {
  id: EntityId
  userId: EntityId
  novelId?: EntityId | null
  chapterId?: EntityId | null
  coverAssetId?: EntityId | null
  targetType: string
  targetId: EntityId | null
  providerType: AiProviderType
  providerMode: AiProviderMode
  modelName: string
  action: string
  requestTokens: number | null
  responseTokens: number | null
  durationMs: number
  createdAt: string
  [key: string]: unknown
}

export interface StatCardItem {
  id: string
  label: string
  value: string
  hint?: string
  tone?: string
  [key: string]: unknown
}

export interface ProfileShelfItem {
  id: string
  novelId?: EntityId
  title: string
  coverUrl?: string | null
  summary?: string | null
  updatedAt: string
  [key: string]: unknown
}

export interface ProfileDraftItem {
  id: string
  novelId: EntityId
  chapterId: EntityId
  title: string
  summary: string
  updatedAt: string
  statusLabel: string
  [key: string]: unknown
}

export interface ProfileActivityItem {
  id: string
  type?: string
  title?: string
  label?: string
  content?: string
  summary?: string
  createdAt?: string
  time?: string
  [key: string]: unknown
}

export interface NotificationItem {
  id: string
  title?: string
  category?: string
  content: string
  createdAt?: string
  time?: string
  read?: boolean
  [key: string]: unknown
}

export interface AuthorPageNote {
  id?: string
  label?: string
  title?: string
  content?: string
  location?: string
  activeWindow?: string
  specialties?: string[]
  joinedLabel?: string
  workbenchLine?: string
  [key: string]: unknown
}

export interface HomePagePayload {
  continueReading: NovelCard[]
  recommendedNovels: NovelCard[]
  latestUpdatedNovels: NovelCard[]
  hotTopics: TopicSummary[]
  hotPosts: Post[]
  [key: string]: unknown
}

export interface NovelDetailPayload {
  novel: Novel
  chapters: ChapterListItem[]
  topComments: Comment[]
  relatedNovels: NovelCard[]
  [key: string]: unknown
}

export interface ReaderPayload {
  novel: {
    id: EntityId
    title: string
    displayTitle: string | null
    slug: string
    coverUrl: string | null
    [key: string]: unknown
  }
  currentChapter: Chapter
  chapterList: ChapterListItem[]
  previousChapterId: EntityId | null
  nextChapterId: EntityId | null
  [key: string]: unknown
}

export interface StudioPayload {
  novel: Novel
  chapters: ChapterListItem[]
  draftChapter: Chapter | null
  coverAssets: CoverAsset[]
  [key: string]: unknown
}

export interface PostDetailPayload {
  post: Post
  comments: Comment[]
  relatedPosts: Post[]
  [key: string]: unknown
}

export interface UserMePayload {
  user: User | null
  shelf: ProfileShelfItem[]
  drafts: ProfileDraftItem[]
  authoredNovels?: Novel[]
  activities: ProfileActivityItem[]
  notifications: NotificationItem[]
  unreadMessageCount?: number
  unreadNotificationCount?: number
  recentConversations?: Conversation[]
  recentCoverAsset?: CoverAsset | null
  stats?: StatCardItem[]
  statCards?: StatCardItem[]
  [key: string]: unknown
}

export interface AuthorPagePayload {
  author: AuthorSummary
  authorNovels: NovelCard[]
  authorPosts: Post[]
  note: AuthorPageNote
  featuredNovel?: NovelCard | null
  recentNovels?: NovelCard[]
  recentPosts?: Post[]
  notes?: AuthorPageNote[]
  stats?: StatCardItem[]
  [key: string]: unknown
}

export interface AgentActionRuntimeContext {
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
  [key: string]: unknown
}

export interface AgentActionPlanStep {
  id: string
  toolName: AgentWorkspaceToolName
  title: string
  requiresConfirm: boolean
  target: {
    scope: 'workspace' | 'novel' | 'chapter'
    novelId?: EntityId
    chapterId?: EntityId | null
  }
  payload: Record<string, unknown>
}

export interface AgentActionPlan {
  mode: 'plan' | 'execute' | 'review'
  summary: string
  thinking?: string[]
  steps: AgentActionPlanStep[]
}

export type AgentExecutionMode = 'plan' | 'build' | 'review'
export type AgentExecutionAgentRole = 'primary' | 'specialist'
export type AgentRouteStatusEvent = 'agent.selected' | 'route.decided' | 'specialist.started'

export interface AgentExecutionAgent {
  agentType: AgentType
  role: AgentExecutionAgentRole
  title: string
  description: string
}

export interface AgentRouteDecision {
  sourceAgent: AgentExecutionAgent
  targetAgent: AgentExecutionAgent
  task: string
  intentLabel: string
  summary: string
  factors?: string[]
}

export interface AgentRuleBundle {
  summary: string
  rules: string[]
}

export interface AgentStoryMemoryDigestItem {
  title: string
  memoryType: ProjectMemoryType
  excerpt: string
}

export interface AgentStoryMemoryDigest {
  summary: string
  items: AgentStoryMemoryDigestItem[]
}

export interface AgentActionHandoff {
  sourceMode: AgentExecutionMode
  targetMode: AgentExecutionMode
  title: string
  summary: string
  confirmLabel: string
  actionHint?: string | null
  sourceRunId?: EntityId | null
  sourceArtifactId?: EntityId | null
}

export type AgentWorkspaceToolPermission = 'allow' | 'ask' | 'deny'

export interface AgentWorkspaceToolAvailability {
  toolName: AgentWorkspaceToolName
  title: string
  description: string
  permission: AgentWorkspaceToolPermission
}

export interface AgentWorkspaceToolPolicy {
  mode: AgentExecutionMode
  tools: AgentWorkspaceToolAvailability[]
}

export interface AgentSession {
  id: EntityId
  userId: EntityId
  novelId: EntityId
  title: string
  status: AgentSessionStatus
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface AgentRun {
  id: EntityId
  sessionId: EntityId
  userId: EntityId
  novelId: EntityId
  chapterId: EntityId | null
  mode: AgentRunMode
  action: AgentActionKind
  agentType: AgentType
  status: AgentRunStatus
  inputSummary: string | null
  outputSummary: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface AgentArtifact {
  id: EntityId
  runId: EntityId
  artifactType: AgentArtifactType
  title: string
  summary: string | null
  content: string
  metadata?: Record<string, unknown> | null
  availableApplyStrategies?: AgentArtifactApplyStrategy[]
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface ProjectMemoryEntry {
  id: EntityId
  runId: EntityId | null
  novelId: EntityId
  sourceChapterId: EntityId | null
  memoryType: ProjectMemoryType
  title: string
  content: string
  importance: number
  embeddingRef: string | null
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface AgentRunStreamPayload {
  id?: string
  type?: string
  event?: string
  stage?: string
  mode?: 'live' | 'replay' | string
  replay?: boolean
  message?: string
  delta?: string
  title?: string
  content?: string
  result?: string
  prompt?: string
  outline?: string
  createdAt?: string
  data?: Record<string, unknown>
  run?: Partial<AgentRun>
  artifact?: Partial<AgentArtifact> | null
  artifacts?: Array<Partial<AgentArtifact>>
  memoryEntries?: ProjectMemoryEntry[]
  [key: string]: unknown
}
