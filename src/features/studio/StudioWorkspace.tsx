import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, BookOpenText, BrainCircuit, ChevronLeft, FileText, FolderDown, ImagePlus, LogOut, MessageSquareText, MoreHorizontal, PenLine, RefreshCcw, Settings2, Trash2, Upload, WandSparkles } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import { useToast } from '@/components/ui/toast-context'
import { useAutoHideScrollbars } from '@/hooks/useAutoHideScrollbars'
import { updateShelfCover } from '@/features/home/local-shelf'
import { cn } from '@/lib/utils'
import { DEFAULT_AGENT2_FEATURE_FLAGS, FIXED_NOVEL_COVER_SIZE } from '../../../shared/contracts/index.js'
import type { AgentStreamEvent, Chapter, CoverAsset, Novel, StudioPayload, UserMePayload, Visibility } from '../../../shared/contracts/index.js'
import { createWritingAgentSession, createNovelWorkspace, createNovelPlanFile, createChapterDraft, deleteWritingAgentSession, deleteNovelWorkspace, deleteChapterDraft, generateCoverImages, generateCoverPrompt, getChapterContent, getStudioPayload, getWritingAgentSessionHistory, listNovelPlanFiles, listWritingAgentSessions, publishNovelWorkspace, uploadNovelCover, updateChapterDraft, updateWritingAgentSession, updateNovelMeta, updateNovelPlanFile } from './api'
import { buildFixedNovelCoverDataUrl, downloadCoverAssetImage, type NovelCoverCropState } from './cover-image'
import { getMe } from '../community/api'
import ChapterSettingsPanel from './components/ChapterSettingsPanel'
import ChapterSidebar from './components/ChapterSidebar'
import ChangeSetDrawer from './components/ChangeSetDrawer'
import MemoryReviewDrawer from './components/MemoryReviewDrawer'
import PlanSettingsPanel from './components/PlanSettingsPanel'
import { StudioSkeleton } from '@/components/ui/Skeleton'
import AgentTaskSidebar from './components/AgentTaskSidebar'
import ConfirmDialog from './components/ConfirmDialog'
import CoverPanel from './components/CoverPanel'
import EditorCanvas from './components/EditorCanvas'
import ExportDialog from './components/ExportDialog'
import { buildReviewDiff, resolveReviewHunk } from './components/diff'
import ImmersiveComposer from './components/ImmersiveComposer'
import MetaPanel from './components/MetaPanel'
import NovelCoverCropDialog from './components/NovelCoverCropDialog'
import PublishNovelDialog from './components/PublishNovelDialog'
import StudioToolbar from './components/StudioToolbar'
import WorkspaceNovelSwitcher from './components/WorkspaceNovelSwitcher'
import WorkPerspective from './components/WorkPerspective'
import IdePerspective from './components/IdePerspective'
import { AgentPanel } from './agent/components/AgentPanel'
import { WORKSPACE_WRITE_TOOLS, useAgentStore } from './agent/agentStore'
import { PanelResizeHandle } from './panel-resize'
import { useStudioPanelWidths } from './panel-widths'
import { SaveStatusPill } from './components/StudioControls'
import type { AgentArtifact, AgentLocalRollbackSnapshot, AgentRunState, ChapterDraftState, ChapterPendingReview, CoverFormState, EditableNovelStatus, EditorSelectionState, MobileView, NovelFormState, PlanPendingReview, ProjectNotesState, SaveState, ToolPanel, WorkspaceDocumentView, WorkspacePlanFile } from './types'
import { chapterStatusLabelMap } from './types'



import { buildArtifactsFromHistory, mergeRestoredArtifactsWithSnapshot, readStoredAgentWorkspace } from './lib/agent-persistence.js'
import { BOOTSTRAP_NOVEL_SUMMARY, BOOTSTRAP_NOVEL_TITLE, DEFAULT_AGENT_TASK_TITLE, DEFAULT_NOVEL_ID, STUDIO_LAST_NOVEL_STORAGE_KEY, buildAgentTaskWindowFromSession, createLocalAgentTaskWindow, dedupeAgentTaskWindows, formatDateTime, formatWordCount, getAgentWorkspaceStorageKey, isBootstrapNovel, resolveNovelTitleState, shouldDisplayListedAgentSession } from './lib/agent-session.js'
import { buildChapterDraft, buildCoverForm, buildNovelFormState, buildNovelUpdatePayload, buildProjectNotes, createIdleAgentRunState, isNovelFormDirty } from './lib/form-state.js'
import { PENDING_CHAPTER_REVIEW_STORAGE_PREFIX, PENDING_PLAN_REVIEW_STORAGE_PREFIX, buildCatalogPreview, buildChapterReviewDescription, buildPendingChapterReview, buildServerPlanFile, buildWorkspacePlanFiles, mergeCatalogContentWithChapters, readStoredPendingReview, readStoredPendingReviewList, removeChapterAndCompact, replaceChapterItem, toChapterListItem, upsertChapterItem, writeStoredPendingReview } from './lib/plan-review.js'
import type { AgentTaskWindowState, StoredAgentWorkspaceSnapshot } from './lib/workspace-types.js'
import { getPlatformCapabilities, subscribePlatformLifecycle } from './platform-capabilities.js'
export default function StudioWorkspace() {
  const { novelId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeNovelId = novelId ?? DEFAULT_NOVEL_ID
  const queryClient = useQueryClient()

  const studioQuery = useQuery({
    queryKey: ['studio', activeNovelId],
    queryFn: () => getStudioPayload(activeNovelId),
    refetchOnWindowFocus: false,
  })
  const myNovelsQuery = useQuery({
    queryKey: ['studio', 'my-novels'],
    // 复用 ['community','me'] 共享缓存，避免与外壳/个人中心重复请求 /api/users/me
    queryFn: async () => {
      const me = await queryClient.fetchQuery({
        queryKey: ['community', 'me'],
        queryFn: getMe,
        staleTime: 30_000,
      })
      return Array.isArray(me?.authoredNovels) ? me.authoredNovels : []
    },
    refetchOnWindowFocus: false,
  })

  const [currentNovel, setCurrentNovel] = useState<Novel | null>(null)
  const [novelForm, setNovelForm] = useState<NovelFormState | null>(null)
  const [projectNotes, setProjectNotes] = useState<ProjectNotesState | null>(null)
  const [coverForm, setCoverForm] = useState<CoverFormState | null>(null)
  const [coverAssets, setCoverAssets] = useState<CoverAsset[]>([])
  const [selectedCoverId, setSelectedCoverId] = useState<string | null>(null)
  const [coverGenerationBusy, setCoverGenerationBusy] = useState(false)
  const [coverGenerationProgress, setCoverGenerationProgress] = useState(0)
  const [chapters, setChapters] = useState<StudioPayload['chapters']>([])
  const [volumes, setVolumes] = useState<StudioPayload['volumes']>([])
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [activeChangeSetId, setActiveChangeSetId] = useState<string | null>(null)
  const [memoryReviewOpen, setMemoryReviewOpen] = useState(false)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [selectedTreeItemId, setSelectedTreeItemId] = useState<string | null>(null)
  const [catalogDocument, setCatalogDocument] = useState<{
    title: string
    content: string
    manualTitle: boolean
    manualContent: boolean
  } | null>(null)
  const [chapterDraft, setChapterDraft] = useState<ChapterDraftState | null>(null)
  const [chapterDirty, setChapterDirty] = useState(false)
  const [chapterSaveState, setChapterSaveState] = useState<SaveState>('idle')
  const [chapterSaveMessage, setChapterSaveMessage] = useState('内容会在停止输入后自动保存。')
  const [chapterLastSavedAt, setChapterLastSavedAt] = useState<string | null>(null)
  const [novelDirty, setNovelDirty] = useState(false)
  const [novelSaveState, setNovelSaveState] = useState<SaveState>('idle')
  const [novelLastSavedAt, setNovelLastSavedAt] = useState<string | null>(null)
  const [novelMessage, setNovelMessage] = useState('作品设置支持自动保存，也可以手动点击保存。')
  const [mobileView, setMobileView] = useState<MobileView>('assistant')
  const [workspacePerspective, setWorkspacePerspective] = useState<'work' | 'ide'>(() => {
    if (typeof window === 'undefined') return 'work'
    return window.localStorage.getItem(`chevoink:perspective:${activeNovelId}`) === 'ide' ? 'ide' : 'work'
  })
  const featureFlags = studioQuery.data?.featureFlags ?? DEFAULT_AGENT2_FEATURE_FLAGS
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  // 创作区（含沉浸创作/弹层 portal）内滚动条静止时隐藏，滚动中才显示
  useAutoHideScrollbars()
  const { panelWidths, beginPanelResize } = useStudioPanelWidths()
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel | null>(null)
  const [isImmersive, setIsImmersive] = useState(false)
  const platformCapabilities = useMemo(() => getPlatformCapabilities(), [])
  const [agentPrompt, setAgentPrompt] = useState('')
  // 惰性初始化：从快照同步恢复当前会话 id，避免跨路由返回时 AgentPanel 先以 null 挂载冲掉进行中的任务直播
  const [agentSessionId, setAgentSessionId] = useState<string | null>(() => {
    const snapshot = readStoredAgentWorkspace(activeNovelId)
    const initialTask =
      snapshot?.tasks.find((taskWindow) => taskWindow.id === snapshot.activeTaskId) ?? snapshot?.tasks[0] ?? null
    return initialTask?.sessionId ?? null
  })
  // 任务窗口同样从快照惰性恢复：挂载即落在该作品上次活跃的任务窗口，
  // 避免初始空窗口先触发快照写入效应清掉存档、或界面闪现「新任务」
  const [agentTaskWindows, setAgentTaskWindows] = useState<AgentTaskWindowState[]>(() => {
    const snapshot = readStoredAgentWorkspace(activeNovelId)
    return snapshot?.tasks.length ? snapshot.tasks : [createLocalAgentTaskWindow()]
  })
  const [activeAgentTaskWindowId, setActiveAgentTaskWindowId] = useState<string | null>(() => {
    const snapshot = readStoredAgentWorkspace(activeNovelId)
    const initialTask =
      snapshot?.tasks.find((taskWindow) => taskWindow.id === snapshot.activeTaskId) ?? snapshot?.tasks[0] ?? null
    return initialTask?.id ?? null
  })
  // 当前任务窗口状态归属的作品：切换作品后状态水合落地前，快照写入效应
  // 不得用旧作品窗口写入/删除（会污染目标作品快照），仅状态归属当前作品时才允许写
  const [agentStateNovelId, setAgentStateNovelId] = useState(activeNovelId)
  const [showAgentTaskList, setShowAgentTaskList] = useState(false)
  const [agentRunState, setAgentRunState] = useState<AgentRunState>(createIdleAgentRunState)
  const [agentArtifacts, setAgentArtifacts] = useState<AgentArtifact[]>([])
  const [activeAgentArtifactId, setActiveAgentArtifactId] = useState<string | null>(null)
  // 计划文件夹云端副本：覆盖非活跃任务窗口/历史会话的计划，刷新后不丢失
  const [serverPlanFiles, setServerPlanFiles] = useState<WorkspacePlanFile[]>([])
  const planSyncTimerRef = useRef<number | null>(null)
  const planSyncPayloadRef = useRef<{ artifactId: string; title: string; content: string } | null>(null)
  const agentRunAbortControllerRef = useRef<AbortController | null>(null)
  const coverGenerationWasActiveRef = useRef(false)
  const [editorSelection, setEditorSelection] = useState<EditorSelectionState>({
    start: 0,
    end: 0,
    text: '',
  })
  const [coverKeywords, setCoverKeywords] = useState<string[]>([])
  const [coverMessage, setCoverMessage] = useState('先整理提示词，再生成候选封面。')
  const [pendingCoverUploadFile, setPendingCoverUploadFile] = useState<File | null>(null)
  const [editorChapterSettingsOpen, setEditorChapterSettingsOpen] = useState(false)
  // 计划设置抽屉：值为计划文件 id（本地产物 id 或 server- 前缀 id）
  const [planSettingsPlanId, setPlanSettingsPlanId] = useState<string | null>(null)
  // 章节审查改为数组：Agent 连续写多章时各章审查态并存，互不覆盖（fix：新章写入导致旧审查被自动采纳）
  const [pendingChapterReviews, setPendingChapterReviews] = useState<ChapterPendingReview[]>([])
  const [pendingChapterReviewBusy, setPendingChapterReviewBusy] = useState(false)
    // 刚在哪一章完成全部定夺：仅该章展示「下一个文件」浮标，避免浏览其它未修改章节时误出现（fix）
    const [reviewHandoffChapterId, setReviewHandoffChapterId] = useState<string | null>(null)
  // 切章后收回流转浮标：只在定夺发生的那一章短暂展示
  useEffect(() => {
    setReviewHandoffChapterId(null)
  }, [selectedChapterId])
  // 计划审查条（plan/14 方案F）：plan_save 更新既有计划后非阻塞事后审，新建计划不触发
  const [pendingPlanReview, setPendingPlanReview] = useState<PlanPendingReview | null>(null)
  const [pendingPlanReviewBusy, setPendingPlanReviewBusy] = useState(false)
  // 审查态持久化：刷新页面后恢复未定夺的审查条与 diff 视图（fix2b）
  const pendingReviewHydratedNovelIdRef = useRef<string | null>(null)
  useEffect(() => {
    pendingReviewHydratedNovelIdRef.current = null
    setPendingChapterReviews(
      readStoredPendingReviewList<ChapterPendingReview>(`${PENDING_CHAPTER_REVIEW_STORAGE_PREFIX}${activeNovelId}`),
    )
    setPendingPlanReview(
      readStoredPendingReview<PlanPendingReview>(`${PENDING_PLAN_REVIEW_STORAGE_PREFIX}${activeNovelId}`),
    )
    pendingReviewHydratedNovelIdRef.current = activeNovelId
  }, [activeNovelId])
  useEffect(() => {
    if (pendingReviewHydratedNovelIdRef.current !== activeNovelId) {
      return
    }
    writeStoredPendingReview(
      `${PENDING_CHAPTER_REVIEW_STORAGE_PREFIX}${activeNovelId}`,
      pendingChapterReviews.length > 0 ? pendingChapterReviews : null,
    )
  }, [activeNovelId, pendingChapterReviews])
  useEffect(() => {
    if (pendingReviewHydratedNovelIdRef.current !== activeNovelId) {
      return
    }
    writeStoredPendingReview(`${PENDING_PLAN_REVIEW_STORAGE_PREFIX}${activeNovelId}`, pendingPlanReview)
  }, [activeNovelId, pendingPlanReview])
  const [workspaceDialog, setWorkspaceDialog] = useState<{
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'default' | 'danger'
    onConfirm: () => void | Promise<void>
  } | null>(null)
  const [workspaceDialogBusy, setWorkspaceDialogBusy] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const createChapterLockRef = useRef(false)
  const agentExecutionChapterTargetRef = useRef<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem(`chevoink:perspective:${activeNovelId}`, workspacePerspective)
  }, [activeNovelId, workspacePerspective])

  useEffect(() => {
    if (!featureFlags.dualWorkspace && workspacePerspective !== 'ide') {
      setWorkspacePerspective('ide')
    }
  }, [featureFlags.dualWorkspace, workspacePerspective])

  useEffect(() => subscribePlatformLifecycle({
    onBack: () => {
      if (workspaceDialog) setWorkspaceDialog(null)
      else if (activeChangeSetId) setActiveChangeSetId(null)
      else if (memoryReviewOpen) setMemoryReviewOpen(false)
      else if (mobileMoreOpen) setMobileMoreOpen(false)
      else if (isImmersive) setIsImmersive(false)
      else if (activeToolPanel) setActiveToolPanel(null)
      else if (mobileView !== 'assistant') setMobileView('assistant')
      else navigate('/')
    },
    onResume: () => {
      // SSE 以 seq 去重续传；这里只失效查询缓存，不重新启动 run，避免 APP 切后台造成重复写入。
      void queryClient.invalidateQueries({ queryKey: ['studio', activeNovelId] })
    },
  }), [activeChangeSetId, activeNovelId, activeToolPanel, isImmersive, memoryReviewOpen, mobileMoreOpen, mobileView, navigate, queryClient, workspaceDialog])

  useEffect(() => {
    if (!coverGenerationBusy) {
      return
    }

    coverGenerationWasActiveRef.current = true
    setCoverGenerationProgress((current) => (current > 0 && current < 99 ? current : 3))

    const interval = window.setInterval(() => {
      setCoverGenerationProgress((current) => {
        if (current < 18) {
          return Math.min(18, current + 4)
        }
        if (current < 36) {
          return Math.min(36, current + 3)
        }
        if (current < 58) {
          return Math.min(58, current + 2)
        }
        if (current < 76) {
          return Math.min(76, current + 1.4)
        }
        if (current < 90) {
          return Math.min(90, current + 0.9)
        }
        if (current < 94) {
          return Math.min(94, current + 0.24)
        }
        if (current < 97) {
          return Math.min(97, current + 0.12)
        }
        if (current < 99) {
          return Math.min(99, current + 0.05)
        }

        return 99
      })
    }, 1167)

    return () => window.clearInterval(interval)
  }, [coverGenerationBusy])

  useEffect(() => {
    if (coverGenerationBusy || !coverGenerationWasActiveRef.current) {
      return
    }

    setCoverGenerationProgress(100)
    coverGenerationWasActiveRef.current = false

    const timeout = window.setTimeout(() => {
      setCoverGenerationProgress(0)
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [coverGenerationBusy])
  const createNovelMutation = useMutation({
    mutationFn: () =>
      createNovelWorkspace({
        title: BOOTSTRAP_NOVEL_TITLE,
        summary: BOOTSTRAP_NOVEL_SUMMARY,
        tags: [],
        visibility: 'private',
        status: 'draft',
      }),
    onMutate: () => {
      resetWorkspaceDraftState()
    },
    onSuccess: (novel) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STUDIO_LAST_NOVEL_STORAGE_KEY, novel.id)
      }
      queryClient.setQueryData<Novel[]>(['studio', 'my-novels'], (current) => {
        const nextNovels = Array.isArray(current) ? current.filter((item) => item.id !== novel.id) : []
        return [novel, ...nextNovels]
      })
      queryClient.setQueryData<UserMePayload>(['community', 'me'], (current) => {
        if (!current) {
          return current
        }

        const currentAuthoredNovels = Array.isArray(current.authoredNovels) ? current.authoredNovels : []
        return {
          ...current,
          authoredNovels: [novel, ...currentAuthoredNovels.filter((item) => item.id !== novel.id)],
        }
      })
      void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
      navigate(`/studio/novel/${novel.id}`)
    },
    onError: (error: Error) => {
      // 失败必须把「正在打开作品...」收掉，否则 loading 文案会永远挂着
      setChapterSaveState('error')
      setChapterSaveMessage(error.message || '新建作品失败，请稍后重试。')
      toast.error(error.message || '新建作品失败，请稍后重试。')
    },
  })

  function applyAgentTaskWindowState(taskWindow: AgentTaskWindowState | null) {
    if (!taskWindow) {
      setActiveAgentTaskWindowId(null)
      setAgentSessionId(null)
      setAgentPrompt('')
      setAgentArtifacts([])
      setActiveAgentArtifactId(null)
      setAgentRunState(createIdleAgentRunState())
      return
    }

    const latestArtifact = taskWindow.artifacts[0] ?? null

    setActiveAgentTaskWindowId(taskWindow.id)
    setAgentSessionId(taskWindow.sessionId)
    setAgentPrompt(taskWindow.prompt)
    setAgentArtifacts(taskWindow.artifacts)
    setActiveAgentArtifactId(
      taskWindow.activeArtifactId && taskWindow.artifacts.some((artifact) => artifact.id === taskWindow.activeArtifactId)
        ? taskWindow.activeArtifactId
        : latestArtifact?.id ?? null,
    )
    setAgentRunState(
      latestArtifact
        ? {
            active: false,
            task: latestArtifact.task,
            title: latestArtifact.title || 'Agent 对话',
            statusText: '已恢复当前任务窗口。',
            activeAgent: latestArtifact.activeAgent ?? null,
            routeDecision: latestArtifact.routeDecision ?? null,
            executionMode: latestArtifact.executionMode ?? null,
          }
        : createIdleAgentRunState(),
    )
  }

  async function hydrateAgentTaskWindow(taskWindow: AgentTaskWindowState) {
    if (!taskWindow.sessionId || taskWindow.loaded) {
      return taskWindow
    }

    const historyItems = await getWritingAgentSessionHistory(taskWindow.sessionId)
    const restoredArtifacts = buildArtifactsFromHistory(historyItems)

    return {
      ...taskWindow,
      artifacts: restoredArtifacts,
      activeArtifactId: restoredArtifacts[0]?.id ?? null,
      loaded: true,
      temporary: false,
      updatedAt: new Date().toISOString(),
    }
  }

  async function loadAgentTaskWindow(taskWindowId: string) {
    const targetTaskWindow = agentTaskWindows.find((taskWindow) => taskWindow.id === taskWindowId)
    if (!targetTaskWindow) {
      return
    }

    const loadedTaskWindow = await hydrateAgentTaskWindow(targetTaskWindow)

    setAgentTaskWindows((current) =>
      current.map((taskWindow) => (taskWindow.id === taskWindowId ? loadedTaskWindow : taskWindow)),
    )
    applyAgentTaskWindowState(loadedTaskWindow)
  }

  function pruneTemporaryTaskWindows(nextActiveTaskId: string) {
    setAgentTaskWindows((current) =>
      current.filter((taskWindow) => {
        if (!taskWindow.temporary || taskWindow.id === nextActiveTaskId) {
          return true
        }

        return Boolean(taskWindow.prompt.trim()) || taskWindow.artifacts.length > 0
      }),
    )
  }

  // 切换作品时只重置树选中与目录文档；审查态交由上方水合 effect 按作品键恢复，
  // 此处若清空会在「返回创作区/刷新」时把未定夺的 diff 误判为已采纳（fix2）
  useEffect(() => {
    setSelectedTreeItemId(null)
    setCatalogDocument(null)
  }, [activeNovelId])

  useEffect(() => {
    if (!activeAgentTaskWindowId) {
      return
    }

    setAgentTaskWindows((current) =>
      current.map((taskWindow) =>
        taskWindow.id === activeAgentTaskWindowId
          ? {
              ...taskWindow,
              sessionId: agentSessionId,
              prompt: agentPrompt,
              artifacts: agentArtifacts,
              activeArtifactId: activeAgentArtifactId,
              loaded: taskWindow.loaded || agentArtifacts.length > 0 || Boolean(agentSessionId),
              temporary: taskWindow.temporary && !agentSessionId,
              firstPromptSubmitted:
                taskWindow.firstPromptSubmitted || Boolean(agentArtifacts.some((artifact) => artifact.promptText?.trim())),
              updatedAt: new Date().toISOString(),
            }
          : taskWindow,
      ),
    )
  }, [activeAgentArtifactId, activeAgentTaskWindowId, agentArtifacts, agentPrompt, agentSessionId])

  useEffect(() => {
    if (activeAgentTaskWindowId) {
      return
    }

    const fallbackTaskWindow = agentTaskWindows[0] ?? null
    if (fallbackTaskWindow) {
      applyAgentTaskWindowState(fallbackTaskWindow)
    }
  }, [activeAgentTaskWindowId, agentTaskWindows])

  useEffect(() => {
    const requestedPanel = searchParams.get('panel')

    if (!currentNovel || !requestedPanel) {
      return
    }

    if (requestedPanel === 'meta') {
      setActiveToolPanel('meta')
      setMobileView('meta')
    } else if (requestedPanel === 'cover') {
      setActiveToolPanel('cover')
      setMobileView('cover')
    }

    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('panel')
    setSearchParams(nextSearchParams, { replace: true })
  }, [currentNovel, searchParams, setSearchParams])

  // 记录最近一次由本地 setQueryData 写入缓存的 payload 对象引用：
  // 下方 studioQuery.data effect 用它区分「本地增量写入」与「真实网络拉取」，
  // 避免保存/发布等操作触发 effect 时用陈旧缓存覆盖掉 Agent 刚创建的章节（丢章 bug）
  const localStudioPayloadRef = useRef<StudioPayload | null>(null)

  useEffect(() => {
    localStudioPayloadRef.current = null
    setCurrentNovel(null)
    setNovelForm(null)
    setProjectNotes(null)
    setCoverForm(null)
    setCoverAssets([])
    setSelectedCoverId(null)
    setChapters([])
    setVolumes([])
    setSelectedChapterId(null)
    setSelectedTreeItemId(null)
    setCatalogDocument(null)
    setChapterDraft(null)
    setChapterDirty(false)
    setChapterSaveState('idle')
    setChapterSaveMessage('内容会在停止输入后自动保存。')
    setChapterLastSavedAt(null)
    setNovelDirty(false)
    setNovelSaveState('idle')
    setNovelLastSavedAt(null)
    setNovelMessage('作品设置支持自动保存，也可以手动点击保存。')
    setEditorChapterSettingsOpen(false)
  }, [activeNovelId])

  useEffect(() => {
    if (!studioQuery.data) {
      return
    }

    // 本地 setQueryData 增量写入（保存/发布/Agent 刷新等）不重置工作区状态：
    // 这些写入基于缓存做局部更新，本地 state 已经是最新，若在这里全量覆盖
    // 会把 selectedChapterId 重置、并可能用旧缓存冲掉刚同步的章节
    if (studioQuery.data === localStudioPayloadRef.current) {
      return
    }

    const payload = studioQuery.data
    const notes = buildProjectNotes(payload.novel)

    setCurrentNovel(payload.novel)
    setNovelForm(buildNovelFormState(payload.novel))
    setProjectNotes(notes)
    setCoverForm(buildCoverForm(payload.novel, notes))
    setCoverAssets(payload.coverAssets)
    setSelectedCoverId(payload.novel.coverAssetId ?? payload.coverAssets[0]?.id ?? null)
    setChapters(payload.chapters)
    setVolumes(payload.volumes)
    setSelectedChapterId(payload.draftChapter?.id ?? payload.chapters[0]?.id ?? null)
  }, [studioQuery.data])

  useEffect(() => {
    agentRunAbortControllerRef.current?.abort()
    resetAgentWorkspace()
    setShowAgentTaskList(false)
    setAgentStateNovelId(activeNovelId)

    const snapshot = readStoredAgentWorkspace(activeNovelId)
    const snapshotTasks = snapshot?.tasks.length ? snapshot.tasks : [createLocalAgentTaskWindow()]
    setAgentTaskWindows(snapshotTasks)
    setSelectedTreeItemId(snapshot?.selectedTreeItemId ?? null)
    setCatalogDocument(snapshot?.catalogDocument ?? null)

    const initialTaskWindow =
      snapshotTasks.find((taskWindow) => taskWindow.id === snapshot?.activeTaskId) ?? snapshotTasks[0] ?? null
    applyAgentTaskWindowState(initialTaskWindow)

    let cancelled = false

    void (async () => {
      try {
        const sessions = await listWritingAgentSessions(activeNovelId)
        if (cancelled) {
          return
        }

        // 服务端会话列表是唯一真相：本地快照里 sessionId 已不存在的任务窗口（会话被删除后残留）
        // 必须剔除，否则会拿着僵尸 sessionId 反复 404（拉消息/发消息都报「会话不存在或无权访问」），刷新也无法自愈
        const validSessionIds = new Set(sessions.map((session) => session.id))
        const aliveSnapshotTasks = snapshotTasks.filter(
          (taskWindow) => !taskWindow.sessionId || validSessionIds.has(taskWindow.sessionId),
        )

        if (sessions.length === 0) {
          if (aliveSnapshotTasks.length === snapshotTasks.length) {
            return
          }
          const fallbackTasks = aliveSnapshotTasks.length > 0 ? aliveSnapshotTasks : [createLocalAgentTaskWindow()]
          setAgentTaskWindows(fallbackTasks)
          applyAgentTaskWindowState(fallbackTasks[0] ?? null)
          return
        }

        const mergedTasks = dedupeAgentTaskWindows(sessions.reduce<AgentTaskWindowState[]>((current, session) => {
          const existingTask = current.find(
            (taskWindow) => taskWindow.sessionId === session.id || taskWindow.id === session.id,
          )

          if (!shouldDisplayListedAgentSession(session, Boolean(existingTask))) {
            return current
          }

          if (existingTask) {
            return current.map((taskWindow) =>
              taskWindow.sessionId === session.id || taskWindow.id === session.id
                ? {
                    ...taskWindow,
                    id: session.id,
                    sessionId: session.id,
                    title: taskWindow.customNamed ? taskWindow.title : session.title,
                    temporary: false,
                    updatedAt: session.updatedAt,
                    createdAt: session.createdAt,
                  }
                : taskWindow,
            )
          }

          return [...current, buildAgentTaskWindowFromSession(session)]
        }, dedupeAgentTaskWindows(aliveSnapshotTasks)))

        const nextTaskWindow =
          mergedTasks.find((taskWindow) => taskWindow.id === (snapshot?.activeTaskId ?? initialTaskWindow?.id)) ??
          mergedTasks[0] ??
          null

        setAgentTaskWindows(mergedTasks)
        if (!nextTaskWindow) {
          return
        }

        // 先激活任务窗口：sessionId 立即生效，Agent 面板并行拉取会话消息；
        // 历史工件（计划/大纲等）在后台补载，不再串行阻塞对话上下文首屏
        applyAgentTaskWindowState(nextTaskWindow)
        if (nextTaskWindow.loaded || !nextTaskWindow.sessionId) {
          return
        }

        const historyItems = await getWritingAgentSessionHistory(nextTaskWindow.sessionId)
        if (cancelled) {
          return
        }

        const restoredArtifacts = mergeRestoredArtifactsWithSnapshot(
          buildArtifactsFromHistory(historyItems),
          nextTaskWindow.artifacts,
        )
        const loadedTaskWindow = {
          ...nextTaskWindow,
          artifacts: restoredArtifacts,
          activeArtifactId: restoredArtifacts[0]?.id ?? null,
          loaded: true,
          temporary: false,
        }

        setAgentTaskWindows((current) =>
          current.map((taskWindow) => (taskWindow.id === loadedTaskWindow.id ? loadedTaskWindow : taskWindow)),
        )
        applyAgentTaskWindowState(loadedTaskWindow)
      } catch {
        // 保留本地快照作为回退，不在这里打断创作流程
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeNovelId])

  useEffect(() => {
    return () => {
      // 卸载时必须中止“当时最新”的请求，而不是 effect 建立时的旧 controller。
      // eslint-disable-next-line react-hooks/exhaustive-deps
      agentRunAbortControllerRef.current?.abort()
      flushPlanServerSync()
    }
  }, [])

  // 计划文件夹云端持久化：作品切换时拉取全量计划（plan_save 已落库，这里跨会话聚合）
  useEffect(() => {
    let cancelled = false
    flushPlanServerSync()
    setServerPlanFiles([])

    void listNovelPlanFiles(activeNovelId)
      .then((items) => {
        if (!cancelled) {
          setServerPlanFiles(items.map(buildServerPlanFile))
        }
      })
      .catch(() => {
        /* 拉取失败时保留本地派生的计划，不打断创作流程 */
      })

    return () => {
      cancelled = true
    }
     
  }, [activeNovelId])

  useEffect(() => {
    if (typeof window === 'undefined' || !currentNovel?.id) {
      return
    }

    window.localStorage.setItem(STUDIO_LAST_NOVEL_STORAGE_KEY, currentNovel.id)
  }, [currentNovel?.id])

  useEffect(() => {
    setNovelDirty(isNovelFormDirty(currentNovel, novelForm))
  }, [currentNovel, novelForm])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    // 任务窗口状态尚未水合到当前作品（切换后残留旧作品状态）：跳过写入，避免污染/误删当前作品快照
    if (agentStateNovelId !== activeNovelId) {
      return
    }

    const storageKey = getAgentWorkspaceStorageKey(activeNovelId)
    const meaningfulTasks = agentTaskWindows.filter(
      (taskWindow) =>
        Boolean(taskWindow.sessionId) ||
        Boolean(taskWindow.prompt.trim()) ||
        taskWindow.artifacts.length > 0 ||
        Boolean(taskWindow.activeArtifactId),
    )

    const hasAgentState = meaningfulTasks.length > 0
    if (!hasAgentState) {
      window.localStorage.removeItem(storageKey)
      return
    }

    const snapshot: StoredAgentWorkspaceSnapshot = {
      tasks: meaningfulTasks.map((taskWindow) => ({
        id: taskWindow.id,
        sessionId: taskWindow.sessionId,
        title: taskWindow.title,
        prompt: taskWindow.prompt,
        artifacts: taskWindow.artifacts,
        activeArtifactId: taskWindow.activeArtifactId,
        loaded: taskWindow.loaded,
        temporary: taskWindow.temporary,
        customNamed: taskWindow.customNamed,
        firstPromptSubmitted: taskWindow.firstPromptSubmitted,
        createdAt: taskWindow.createdAt,
        updatedAt: taskWindow.updatedAt,
      })),
      activeTaskId: activeAgentTaskWindowId,
      selectedTreeItemId,
      catalogDocument,
    }
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
  }, [activeAgentTaskWindowId, activeNovelId, agentStateNovelId, agentTaskWindows, catalogDocument, selectedTreeItemId])

  async function handleWorkspaceDialogConfirm() {
    if (!workspaceDialog) {
      return
    }

    setWorkspaceDialogBusy(true)
    try {
      await workspaceDialog.onConfirm()
      setWorkspaceDialog(null)
    } finally {
      setWorkspaceDialogBusy(false)
    }
  }

  const chapterQuery = useQuery({
    queryKey: ['studio-chapter', activeNovelId, selectedChapterId],
    queryFn: () => getChapterContent(activeNovelId, selectedChapterId as string),
    enabled: Boolean(selectedChapterId && !selectedChapterId.startsWith('local-')),
    refetchOnWindowFocus: false,
    retry: 1,
  })

  useEffect(() => {
    if (!chapterQuery.data || !selectedChapterId || chapterQuery.data.id !== selectedChapterId) {
      return
    }

    setChapterDraft(buildChapterDraft(chapterQuery.data))
    setChapterDirty(false)
    setChapterSaveState('saved')
    setChapterLastSavedAt(chapterQuery.data.updatedAt)
    setChapterSaveMessage(`已同步到 ${formatDateTime(chapterQuery.data.updatedAt)}`)
  }, [chapterQuery.data, selectedChapterId])

  useEffect(() => {
    const contentLength = chapterDraft?.content.length ?? 0
    setEditorSelection({
      start: contentLength,
      end: contentLength,
      text: '',
    })
  }, [chapterDraft?.id, chapterDraft?.content.length])

  useEffect(() => {
    if (!chapterQuery.isError) {
      return
    }

    setChapterSaveState('error')
    setChapterSaveMessage(
      chapterQuery.error instanceof Error ? chapterQuery.error.message : '章节暂时无法打开，请重试。',
    )
  }, [chapterQuery.error, chapterQuery.isError])

  const syncStudioPayload = useCallback(
    (updater: (current: StudioPayload | undefined) => StudioPayload | undefined) => {
      queryClient.setQueryData<StudioPayload>(['studio', activeNovelId], updater)
      // 标记这次缓存变更来自本地写入，studioQuery.data effect 据此跳过全量覆盖
      localStudioPayloadRef.current =
        queryClient.getQueryData<StudioPayload>(['studio', activeNovelId]) ?? null
    },
    [activeNovelId, queryClient],
  )

  // Agent Loop 写工具落库后同步工作区：直接刷新本地章节树/作品信息，
  // 同时把 fresh payload 写回 studioQuery 缓存（经 syncStudioPayload 标记，
  // 不会触发 effect 重置 selectedChapterId），避免缓存陈旧导致后续
  // 保存/发布等增量更新基于旧数据、再被 effect 覆盖回 state 时丢章
  const agentRefreshTimerRef = useRef<number | null>(null)
  const agentChangedChapterIdsRef = useRef<Set<string>>(new Set())
  const agentWorkspaceDirtyRef = useRef(false)
  const chapterQueryRefetchRef = useRef(chapterQuery.refetch)
  chapterQueryRefetchRef.current = chapterQuery.refetch
  const pendingChapterReviewsRef = useRef(pendingChapterReviews)
  pendingChapterReviewsRef.current = pendingChapterReviews
  const chaptersStateRef = useRef(chapters)
  chaptersStateRef.current = chapters
  const currentNovelStateRef = useRef(currentNovel)
  currentNovelStateRef.current = currentNovel
  const novelFormStateRef = useRef(novelForm)
  novelFormStateRef.current = novelForm
  const chapterDraftStateRef = useRef(chapterDraft)
  chapterDraftStateRef.current = chapterDraft
  const selectedChapterIdStateRef = useRef(selectedChapterId)
  selectedChapterIdStateRef.current = selectedChapterId

  // 自动追踪：Agent 写入章节时编辑器跟随跳转（用户正在手动编辑未保存时不打断）
  const agentFollowChapterRef = useRef<(chapterId: string) => void>(() => {})
  agentFollowChapterRef.current = (chapterId: string) => {
    if (!useAgentStore.getState().autoFollow) {
      return
    }
    if (chapterId === selectedChapterId || chapterDirty) {
      return
    }
    setSelectedTreeItemId(`chapter:${chapterId}`)
    setSelectedChapterId(chapterId)
    setEditorChapterSettingsOpen(false)
    setChapterDraft(null)
    setChapterSaveState('idle')
    setChapterSaveMessage('Agent 正在写这一章，已自动跟随…')
  }

  // Agent Loop 写正文后进入 IDE 式审查：用 chapterDiff 负载构造待审章节，按 chapterId upsert 进数组，
  // 编辑器随即以绿(新增)/红(删除) diff 呈现，由用户“保留/撤销”逐章定夺
  const captureAgentChapterReview = useCallback(
    (event: Extract<AgentStreamEvent, { type: 'tool.result' }>) => {
      const display = event.display
      if (!display || display.kind !== 'chapterDiff' || display.before === display.after) {
        return
      }

      const chapterListItem =
        chaptersStateRef.current.find((item) => item.id === display.chapterId) ?? null
      const draft = chapterDraftStateRef.current
      const draftMatches = draft?.id === display.chapterId ? draft : null
      const summary = draftMatches?.summary ?? chapterListItem?.summary ?? ''
      const status = draftMatches?.status ?? chapterListItem?.status ?? 'draft'
      const visibility = draftMatches?.visibility ?? chapterListItem?.visibility ?? 'private'
      const orderIndex =
        draftMatches?.orderIndex ?? chapterListItem?.orderIndex ?? chaptersStateRef.current.length + 1
      const currentReview = pendingChapterReviewsRef.current.find(
        (item) => item.chapterId === display.chapterId,
      )

      const afterState: ChapterDraftState = {
        id: display.chapterId,
        title: display.chapterTitle,
        summary,
        content: display.after,
        status,
        visibility,
        orderIndex,
        revision:
          display.revision ??
          currentReview?.after.revision ??
          draftMatches?.revision ??
          chapterListItem?.revision ??
          1,
        localOnly: false,
      }

      // 同一章节连续写入（如 chapter_write 后再 append）：保留最早的 before/回滚快照，仅推进 after；
      // 其他章节的审查态不受影响（fix：新章写入不再覆盖旧章未定夺的审查）
      if (currentReview) {
        setPendingChapterReviews((current) =>
          current.map((item) =>
            item.chapterId === display.chapterId
              ? {
                  ...item,
                  after: afterState,
                  runId: event.runId,
                  description: buildChapterReviewDescription(
                    item.before === null ? 'create' : 'replace',
                    display.chapterTitle,
                  ),
                }
              : item,
          ),
        )
        return
      }

      const isCreate = event.toolName === 'chapter_create'
      const beforeTitle = chapterListItem?.title ?? display.chapterTitle
      const rollbackSnapshot: AgentLocalRollbackSnapshot = isCreate
        ? {
            kind: 'remove_created_chapter',
            chapter: {
              id: display.chapterId,
              title: display.chapterTitle,
              summary,
              content: display.after,
              status,
              visibility,
              wordCount: display.after.length,
              updatedAt: null,
            },
            previousSelectedChapterId:
              selectedChapterIdStateRef.current === display.chapterId
                ? null
                : selectedChapterIdStateRef.current,
          }
        : {
            kind: 'restore_chapter',
            chapter: {
              id: display.chapterId,
              title: beforeTitle,
              summary,
              content: display.before,
              status,
              visibility,
              wordCount: display.before.length,
              updatedAt: null,
            },
            selectedChapterId: selectedChapterIdStateRef.current,
          }

      setPendingChapterReviews((current) => [
        ...current.filter((item) => item.chapterId !== display.chapterId),
        buildPendingChapterReview({
          before: isCreate
            ? null
            : { ...afterState, title: beforeTitle, content: display.before },
          after: afterState,
          rollbackSnapshot,
          description: buildChapterReviewDescription(
            isCreate ? 'create' : event.toolName === 'chapter_append' ? 'append' : 'replace',
            display.chapterTitle,
          ),
          runId: event.runId,
        }),
      ])
    },
    [],
  )

  const refreshWorkspaceAfterAgentWrite = useCallback(async () => {
    agentWorkspaceDirtyRef.current = false
    try {
      const payload = await getStudioPayload(activeNovelId)
      // Agent 改过书名/简介/标签后必须同步重置作品表单，否则 novelDirty 会被判为脏，
      // 1200ms 自动保存会用旧表单把 Agent 刚落库的内容覆盖回去；
      // 仅当用户自己有未保存的手动修改时才保留表单不动
      const userEditingNovelForm = isNovelFormDirty(currentNovelStateRef.current, novelFormStateRef.current)
      const previousCoverAssetId = currentNovelStateRef.current?.coverAssetId ?? null

      setChapters(payload.chapters)
      setVolumes(payload.volumes)
      // 当前打开的章节被回退删除：回落到首章或目录。
      // 失效的 selectedChapterId 会让后续发送在后端报章节 404，
      // 此前前端把它误判成会话删除而清空整段对话（P0 数据丢失事故根因）
      if (selectedChapterId && !payload.chapters.some((chapter) => chapter.id === selectedChapterId)) {
        const fallbackChapter = payload.chapters[0] ?? null
        setSelectedChapterId(fallbackChapter?.id ?? null)
        setSelectedTreeItemId(fallbackChapter ? `chapter:${fallbackChapter.id}` : 'catalog')
        setChapterDraft(null)
        setChapterDirty(false)
        setChapterSaveState('idle')
        setChapterSaveMessage(fallbackChapter ? '正在打开章节...' : '当前章节已被回退删除。')
      }
      setCurrentNovel(payload.novel)
      setCoverAssets(payload.coverAssets)
      // fresh payload 写回缓存，保持双源一致（避免丢章 bug）
      syncStudioPayload(() => payload)
      if (!userEditingNovelForm) {
        setNovelForm(buildNovelFormState(payload.novel))
        setNovelDirty(false)
      }
      if ((payload.novel.coverAssetId ?? null) !== previousCoverAssetId) {
        setSelectedCoverId(payload.novel.coverAssetId ?? payload.coverAssets[0]?.id ?? null)
        // Agent 换过封面：同步本机书架快照，书架不再停留在旧封面路径
        if (payload.novel.coverUrl) {
          updateShelfCover(payload.novel.id, payload.novel.coverUrl)
        }
      }

      // 站内其它页面（作品详情/个人中心/创作中心列表）同步看到 Agent 的修改
      void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
      void queryClient.invalidateQueries({ queryKey: ['novel-detail', activeNovelId] })

      const changedChapterIds = agentChangedChapterIdsRef.current
      agentChangedChapterIdsRef.current = new Set()
      if (selectedChapterId && changedChapterIds.has(selectedChapterId) && !chapterDirty) {
        void chapterQueryRefetchRef.current()
      }
    } catch {
      // 静默失败：run 结束或下一次写入事件仍会触发刷新
      agentWorkspaceDirtyRef.current = true
    }
  }, [activeNovelId, chapterDirty, queryClient, selectedChapterId, syncStudioPayload])

  const handleAgentStreamEvent = useCallback(
    (event: AgentStreamEvent) => {
      // plan_save：把规划文档直接写进左侧「计划」文件夹并选中，无需用户手动存入
      if (event.type === 'tool.result' && event.ok && event.display?.kind === 'planFile') {
        const display = event.display
        const planArtifact: AgentArtifact = {
          id: `plan-${display.artifactId}`,
          task: 'plan-chapter',
          type: 'chapter_plan',
          title: display.title,
          content: display.content,
          rawContent: display.content,
          createdAt: event.ts,
          status: 'ready',
          runId: event.runId,
          runStatusMode: 'none',
          backendArtifactId: display.artifactId,
          savedAsPlan: true,
        }

        setAgentArtifacts((current) => [
          planArtifact,
          ...current.filter((artifact) => artifact.backendArtifactId !== display.artifactId),
        ])
        setActiveAgentArtifactId(planArtifact.id)
        setSelectedTreeItemId(`plan:${planArtifact.id}`)
        // 同步写入云端副本，切换任务窗口/刷新后仍可见
        setServerPlanFiles((current) => [
          {
            id: `server-${display.artifactId}`,
            title: display.title,
            content: display.content.trim(),
            createdAt: event.ts,
            artifactId: `server-${display.artifactId}`,
            backendArtifactId: display.artifactId,
          },
          ...current.filter((plan) => plan.backendArtifactId !== display.artifactId),
        ])
        // 新建计划也挂审查条：空基线→全绿新增，撤销即从计划夹移除
        setPendingPlanReview({
          id: `plan-review-${display.artifactId}-${Date.now()}`,
          backendArtifactId: display.artifactId,
          title: display.title,
          beforeTitle: display.title,
          before: '',
          after: display.content,
          description: `已新建计划《${display.title}》，确认是否保留`,
          isCreate: true,
          runId: event.runId,
          createdAt: event.ts,
        })
        return
      }

      // plan_save 更新既有计划（planDiff）：先落库后审——同步新内容到计划夹，再挂出审查条供保留/撤销
      if (event.type === 'tool.result' && event.ok && event.display?.kind === 'planDiff') {
        const display = event.display
        const planArtifact: AgentArtifact = {
          id: `plan-${display.artifactId}`,
          task: 'plan-chapter',
          type: 'chapter_plan',
          title: display.title,
          content: display.after,
          rawContent: display.after,
          createdAt: event.ts,
          status: 'ready',
          runId: event.runId,
          runStatusMode: 'none',
          backendArtifactId: display.artifactId,
          savedAsPlan: true,
        }

        setAgentArtifacts((current) => [
          planArtifact,
          ...current.filter((artifact) => artifact.backendArtifactId !== display.artifactId),
        ])
        setActiveAgentArtifactId(planArtifact.id)
        setSelectedTreeItemId(`plan:${planArtifact.id}`)
        setServerPlanFiles((current) => [
          {
            id: `server-${display.artifactId}`,
            title: display.title,
            content: display.after.trim(),
            createdAt: event.ts,
            artifactId: `server-${display.artifactId}`,
            backendArtifactId: display.artifactId,
          },
          ...current.filter((plan) => plan.backendArtifactId !== display.artifactId),
        ])
        // 同一份计划连续修订：保留最早的 before，仅推进 after
        setPendingPlanReview((current) =>
          current && current.backendArtifactId === display.artifactId
            ? {
                ...current,
                title: display.title,
                after: display.after,
                runId: event.runId,
                description: `已更新计划《${display.title}》，确认是否保留本次修订`,
              }
            : {
                id: `plan-review-${display.artifactId}-${Date.now()}`,
                backendArtifactId: display.artifactId,
                title: display.title,
                beforeTitle: display.beforeTitle,
                before: display.before,
                after: display.after,
                description: `已更新计划《${display.title}》，确认是否保留本次修订`,
                runId: event.runId,
                createdAt: event.ts,
              },
        )
        return
      }

      // plan_rename：就地同步计划标题，不新建副本
      if (event.type === 'tool.result' && event.ok && event.display?.kind === 'planRename') {
        const display = event.display
        setAgentArtifacts((current) =>
          current.map((artifact) =>
            artifact.backendArtifactId === display.artifactId
              ? { ...artifact, title: display.title }
              : artifact,
          ),
        )
        setServerPlanFiles((current) =>
          current.map((plan) =>
            plan.backendArtifactId === display.artifactId ? { ...plan, title: display.title } : plan,
          ),
        )
        return
      }

      // plan_delete：从计划文件夹移除（后端已同步 savedAsPlan=false）
      if (event.type === 'tool.result' && event.ok && event.display?.kind === 'planDelete') {
        const display = event.display
        setAgentArtifacts((current) =>
          current.map((artifact) =>
            artifact.backendArtifactId === display.artifactId
              ? { ...artifact, savedAsPlan: false }
              : artifact,
          ),
        )
        setServerPlanFiles((current) =>
          current.filter((plan) => plan.backendArtifactId !== display.artifactId),
        )
        setSelectedTreeItemId((current) =>
          current && current.startsWith('plan:') ? null : current,
        )
        return
      }

      if (event.type === 'tool.result' && event.ok && event.display?.kind === 'changeSet') {
        setActiveChangeSetId(event.display.changeSetId)
      }

      if (event.type === 'tool.result' && event.ok && WORKSPACE_WRITE_TOOLS.has(event.toolName)) {
        agentWorkspaceDirtyRef.current = true
        const display = event.display as { chapterId?: unknown } | undefined
        if (display && typeof display.chapterId === 'string') {
          agentChangedChapterIdsRef.current.add(display.chapterId)
          // 自动追踪模式：跳转到 Agent 正在写的章节
          agentFollowChapterRef.current(display.chapterId)
        }

        captureAgentChapterReview(event)

        // 去抖合并连续写入（如 chapter_create 紧跟 chapter_write）
        if (agentRefreshTimerRef.current !== null) {
          window.clearTimeout(agentRefreshTimerRef.current)
        }
        agentRefreshTimerRef.current = window.setTimeout(() => {
          agentRefreshTimerRef.current = null
          void refreshWorkspaceAfterAgentWrite()
        }, 600)
        return
      }

      if (event.type === 'run.finished' && agentWorkspaceDirtyRef.current) {
        if (agentRefreshTimerRef.current !== null) {
          window.clearTimeout(agentRefreshTimerRef.current)
          agentRefreshTimerRef.current = null
        }
        void refreshWorkspaceAfterAgentWrite()
      }
    },
    [captureAgentChapterReview, refreshWorkspaceAfterAgentWrite],
  )

  useEffect(
    () => () => {
      if (agentRefreshTimerRef.current !== null) {
        window.clearTimeout(agentRefreshTimerRef.current)
      }
    },
    [],
  )

  const selectedCover = useMemo(
    () => coverAssets.find((asset) => asset.id === selectedCoverId) ?? null,
    [coverAssets, selectedCoverId],
  )
  const novelOptions = useMemo(() => {
    const source = (myNovelsQuery.data ?? []).filter((novel) => !isBootstrapNovel(novel))
    const merged = currentNovel
      ? [currentNovel, ...source]
      : source

    return Array.from(new Map(merged.map((novel) => [novel.id, novel])).values())
  }, [currentNovel, myNovelsQuery.data])

  const activeChapterListItem = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId) ?? null,
    [chapters, selectedChapterId],
  )
  const savedPlanFiles = useMemo(() => {
    const localPlans = buildWorkspacePlanFiles(agentArtifacts)
    const localBackendIds = new Set(
      localPlans.map((plan) => plan.backendArtifactId).filter((id): id is string => Boolean(id)),
    )

    // 本地（活跃任务窗口）优先，云端补齐其他窗口/历史会话的计划
    return [
      ...localPlans,
      ...serverPlanFiles.filter(
        (plan) => !plan.backendArtifactId || !localBackendIds.has(plan.backendArtifactId),
      ),
    ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  }, [agentArtifacts, serverPlanFiles])
  // 计划设置抽屉指向的计划：计划被删除/切换作品后自动收起
  const planSettingsPlan = planSettingsPlanId
    ? savedPlanFiles.find((plan) => plan.id === planSettingsPlanId) ?? null
    : null
  const catalogPreview = useMemo(
    () =>
      buildCatalogPreview(
        currentNovel?.displayTitle?.trim() || currentNovel?.title?.trim() || novelForm?.displayTitle.trim() || novelForm?.title.trim() || '当前作品',
        chapters,
      ),
    [chapters, currentNovel?.displayTitle, currentNovel?.title, novelForm?.displayTitle, novelForm?.title],
  )
  useEffect(() => {
    setCatalogDocument((current) => {
      if (!current) {
        return {
          title: catalogPreview.title,
          content: catalogPreview.content,
          manualTitle: false,
          manualContent: false,
        }
      }

      return {
        title: current.manualTitle ? current.title : catalogPreview.title,
        content: current.manualContent
          ? mergeCatalogContentWithChapters(current.content, catalogPreview.content)
          : catalogPreview.content,
        manualTitle: current.manualTitle,
        manualContent: current.manualContent,
      }
    })
  }, [catalogPreview])

  const activeWorkspaceDocument = useMemo<WorkspaceDocumentView | null>(() => {
    if (selectedTreeItemId === 'catalog') {
      return catalogDocument
        ? {
            kind: 'catalog',
            id: 'catalog',
            title: catalogDocument.title,
            content: catalogDocument.content,
            description: `${catalogPreview.description} 支持直接在正文区手动修改。`,
            editableTitle: true,
            editableContent: true,
          }
        : {
            kind: 'catalog',
            id: 'catalog',
            title: catalogPreview.title,
            content: catalogPreview.content,
            description: `${catalogPreview.description} 支持直接在正文区手动修改。`,
            editableTitle: true,
            editableContent: true,
          }
    }

    if (selectedTreeItemId?.startsWith('plan:')) {
      const targetPlan = savedPlanFiles.find((plan) => plan.id === selectedTreeItemId.slice('plan:'.length))
      if (!targetPlan) {
        return null
      }

      return {
        kind: 'plan',
        id: targetPlan.id,
        title: targetPlan.title,
        content: targetPlan.content,
        description: `已存入计划文件夹 · ${new Intl.DateTimeFormat('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(targetPlan.createdAt))} · 支持直接改名或补充计划内容。`,
        editableTitle: true,
        editableContent: true,
      }
    }

    return null
  }, [catalogDocument, catalogPreview, savedPlanFiles, selectedTreeItemId])

  // 当前计划文档命中审查态时，正文区呈现绿(新增)/红(删除) diff（与章节审查一致，fix1）
  const activePlanPendingReview = useMemo(() => {
    if (!pendingPlanReview || activeWorkspaceDocument?.kind !== 'plan') {
      return null
    }
    const targetPlan = savedPlanFiles.find((plan) => plan.id === activeWorkspaceDocument.id)
    return targetPlan?.backendArtifactId === pendingPlanReview.backendArtifactId
      ? pendingPlanReview
      : null
  }, [activeWorkspaceDocument, pendingPlanReview, savedPlanFiles])

  const latestWordCount = useMemo(() => chapterDraft?.content.trim().length ?? 0, [chapterDraft])
  const activeAgentTaskWindow = useMemo(
    () =>
      agentTaskWindows.find((taskWindow) => taskWindow.id === activeAgentTaskWindowId) ??
      agentTaskWindows[0] ??
      null,
    [activeAgentTaskWindowId, agentTaskWindows],
  )

  useEffect(() => {
    if (!selectedTreeItemId && selectedChapterId) {
      setSelectedTreeItemId(`chapter:${selectedChapterId}`)
    }
  }, [selectedChapterId, selectedTreeItemId])

  useEffect(() => {
    if (!selectedTreeItemId) {
      return
    }

    if (selectedTreeItemId === 'catalog') {
      return
    }

    if (selectedTreeItemId.startsWith('chapter:')) {
      const chapterId = selectedTreeItemId.slice('chapter:'.length)
      // Agent 刚创建的章节要等 600ms 去抖刷新后才进入本地列表，此间不回弹选中项（fix2a 自动追踪）
      if (
        !chapters.some((chapter) => chapter.id === chapterId) &&
        !agentChangedChapterIdsRef.current.has(chapterId)
      ) {
        setSelectedTreeItemId(selectedChapterId ? `chapter:${selectedChapterId}` : 'catalog')
      }
      return
    }

    if (selectedTreeItemId.startsWith('plan:')) {
      const planId = selectedTreeItemId.slice('plan:'.length)
      if (!savedPlanFiles.some((plan) => plan.id === planId)) {
        setSelectedTreeItemId(selectedChapterId ? `chapter:${selectedChapterId}` : 'catalog')
      }
    }
  }, [chapters, savedPlanFiles, selectedChapterId, selectedTreeItemId])

  function handleSelectWorkspaceNovel(novelId: string) {
    if (novelId === activeNovelId) {
      return
    }

    if (pendingChapterReviews.length > 0) {
      promptConfirmPendingChapterReview('切换作品')
      return
    }

    resetWorkspaceDraftState()
    navigate(`/studio/novel/${novelId}`)
  }

  function handleCreateWorkspaceNovel() {
    if (pendingChapterReviews.length > 0) {
      promptConfirmPendingChapterReview('新建作品')
      return
    }

    if (createNovelMutation.isPending) {
      return
    }

    resetWorkspaceDraftState()
    createNovelMutation.mutate()
  }

  function resetWorkspaceDraftState() {
    void queryClient.cancelQueries({ queryKey: ['studio-chapter'] })
    agentExecutionChapterTargetRef.current = null
    setSelectedChapterId(null)
    setSelectedTreeItemId(null)
    setChapterDraft(null)
    setChapterDirty(false)
    setChapterLastSavedAt(null)
    setChapterSaveState('idle')
    setChapterSaveMessage('正在打开作品...')
    setEditorChapterSettingsOpen(false)
    setMobileView('editor')
  }

  const chapterTitle = chapterDraft
    ? chapterDraft.localOnly
      ? '新章节草稿'
      : chapterDraft.title || `第 ${chapterDraft.orderIndex} 章`
    : '选择章节开始创作'

  function syncUpdatedNovelState(updatedNovel: Novel, message?: string) {
    setCurrentNovel(updatedNovel)
    setNovelForm(buildNovelFormState(updatedNovel))
    setNovelDirty(false)
    setNovelSaveState('saved')
    setNovelLastSavedAt(updatedNovel.updatedAt)
    setCoverForm((current) =>
      current
        ? {
            ...current,
            novelTitle: updatedNovel.title,
            summary: updatedNovel.summary,
            prompt: updatedNovel.coverPrompt ?? current.prompt,
          }
        : current,
    )

    if (message) {
      setNovelMessage(message)
    }

    syncStudioPayload((current) =>
      current ? { ...current, novel: { ...current.novel, ...updatedNovel } } : current,
    )
    void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
    void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
    // 书名/简介/标签等元信息在阅读侧多处展示，保存后同步失效，否则首页/发现页/详情页仍显示旧值
    void queryClient.invalidateQueries({ queryKey: ['home'] })
    void queryClient.invalidateQueries({ queryKey: ['discover-novels'] })
    void queryClient.invalidateQueries({ queryKey: ['novel-detail', updatedNovel.id] })
    void queryClient.invalidateQueries({ queryKey: ['reader', updatedNovel.id] })
  }

  function syncSavedChapterState(
    savedChapter: Chapter,
    options: {
      message: string
      localDraftId?: string | null
      chapterCountDelta?: number
      wordCountDelta?: number
    },
  ) {
    const chapterCountDelta = options.chapterCountDelta ?? 0
    const wordCountDelta = options.wordCountDelta ?? 0

    agentExecutionChapterTargetRef.current = savedChapter.id
    setChapters((current) => replaceChapterItem(current, options.localDraftId ?? null, toChapterListItem(savedChapter)))
    setSelectedChapterId(savedChapter.id)
    setSelectedTreeItemId(`chapter:${savedChapter.id}`)
    setChapterDraft(buildChapterDraft(savedChapter))
    setChapterDirty(false)
    setChapterSaveState('saved')
    setChapterLastSavedAt(savedChapter.updatedAt)
    setChapterSaveMessage(options.message)
    queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, savedChapter.id], savedChapter)
    setCurrentNovel((current) =>
      current
        ? {
            ...current,
            chapterCount: Math.max(0, current.chapterCount + chapterCountDelta),
            wordCount: Math.max(0, current.wordCount + wordCountDelta),
            updatedAt: savedChapter.updatedAt,
          }
        : current,
    )
    syncStudioPayload((current) =>
      current
        ? {
            ...current,
            novel: {
              ...current.novel,
              chapterCount: Math.max(0, current.novel.chapterCount + chapterCountDelta),
              wordCount: Math.max(0, current.novel.wordCount + wordCountDelta),
              updatedAt: savedChapter.updatedAt,
            },
            draftChapter:
              savedChapter.status === 'draft'
                ? savedChapter
                : current.draftChapter?.id === savedChapter.id
                  ? null
                  : current.draftChapter,
            chapters: replaceChapterItem(current.chapters, options.localDraftId ?? null, toChapterListItem(savedChapter)),
          }
        : current,
    )
    void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
    void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
    // 已发布章节的内容更新需同步失效阅读侧缓存，避免读者看到旧正文
    if (savedChapter.status === 'published') {
      void queryClient.invalidateQueries({ queryKey: ['reader', activeNovelId] })
      void queryClient.invalidateQueries({ queryKey: ['novel-detail', activeNovelId] })
    }
  }

  const saveNovelMutation = useMutation({
    mutationFn: async ({
      statusOverride,
    }: {
      reason: 'manual' | 'auto' | 'publish'
      statusOverride?: EditableNovelStatus
    }) => {
      if (!currentNovel || !novelForm) {
        throw new Error('作品信息尚未加载完成')
      }

      const payload = buildNovelUpdatePayload({
        ...novelForm,
        status: statusOverride ?? novelForm.status,
      })

      return updateNovelMeta(currentNovel.id, payload)
    },
    onMutate: ({ reason }) => {
      setNovelSaveState('saving')
      setNovelMessage(reason === 'auto' ? '正在自动保存作品设置...' : '正在保存作品设置...')
    },
    onSuccess: (updatedNovel, variables) => {
      syncUpdatedNovelState(
        updatedNovel,
        variables.reason === 'publish'
          ? `作品已发布于 ${formatDateTime(updatedNovel.updatedAt)}`
          : variables.reason === 'auto'
            ? `作品已自动保存于 ${formatDateTime(updatedNovel.updatedAt)}`
            : `作品设置已保存于 ${formatDateTime(updatedNovel.updatedAt)}`,
      )
    },
    onError: (error: Error) => {
      setNovelSaveState('error')
      setNovelMessage(error.message)
    },
  })

  const publishNovelMutation = useMutation({
    mutationFn: async ({ chapterIds, visibility }: { chapterIds: string[]; visibility: Visibility }) => {
      return publishNovelWorkspace(activeNovelId, { chapterIds, visibility })
    },
    onSuccess: ({ novel, publishedChapterIds }, variables) => {
      const publishedSet = new Set(publishedChapterIds)
      const publishedAtFallback = novel.publishedAt ?? new Date().toISOString()

      setChapters((current) =>
        current.map((item) =>
          publishedSet.has(item.id)
            ? {
                ...item,
                status: 'published' as const,
                visibility: variables.visibility,
                publishedAt: item.publishedAt ?? publishedAtFallback,
                revision: item.revision + 1,
              }
            : item,
        ),
      )
      setChapterDraft((current) =>
        current && publishedSet.has(current.id)
          ? {
              ...current,
              status: 'published',
              visibility: variables.visibility,
              revision: current.revision + 1,
            }
          : current,
      )
      syncStudioPayload((current) =>
        current
          ? {
              ...current,
              chapters: current.chapters.map((item) =>
                publishedSet.has(item.id)
                  ? {
                      ...item,
                      status: 'published' as const,
                      visibility: variables.visibility,
                      publishedAt: item.publishedAt ?? publishedAtFallback,
                      revision: item.revision + 1,
                    }
                  : item,
              ),
              draftChapter:
                current.draftChapter && publishedSet.has(current.draftChapter.id)
                  ? null
                  : current.draftChapter,
            }
          : current,
      )
      for (const chapterId of publishedChapterIds) {
        queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, chapterId], (current) =>
          current
            ? {
                ...current,
                status: 'published',
                visibility: variables.visibility,
                publishedAt: current.publishedAt ?? publishedAtFallback,
                revision: current.revision + 1,
              }
            : current,
        )
      }

      syncUpdatedNovelState(
        novel,
        publishedChapterIds.length > 0
          ? `作品已发布，${publishedChapterIds.length} 个章节已同步发布。`
          : '作品已发布。',
      )
      toast.success(
        publishedChapterIds.length > 0
          ? `发布成功，${publishedChapterIds.length} 个章节已同步发布`
          : '发布成功',
      )
      setPublishDialogOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['novel-detail', activeNovelId] })
      // 发布后失效阅读器缓存，确保目录与正文能拉到新发布的章节
      void queryClient.invalidateQueries({ queryKey: ['reader', activeNovelId] })
      void queryClient.invalidateQueries({ queryKey: ['home'] })
    },
    onError: (error: Error) => {
      setNovelSaveState('error')
      setNovelMessage(error.message)
      // 发布弹窗还开着时，底层状态条被遮挡，用 toast 把后端校验信息顶到用户眼前
      toast.error(error.message)
    },
  })

  const deleteNovelMutation = useMutation({
    mutationFn: async () => {
      await deleteNovelWorkspace(activeNovelId)
    },
    onSuccess: async () => {
      const deletedNovelId = activeNovelId
      setWorkspaceDialog(null)
      // 沉浸层是覆盖全屏的独立层，作品已经不存在了要先退出，否则会停留在空作品的写作界面
      setIsImmersive(false)
      setNovelMessage('作品已删除。')
      if (typeof window !== 'undefined') {
        const lastNovelId = window.localStorage.getItem(STUDIO_LAST_NOVEL_STORAGE_KEY)
        if (lastNovelId === deletedNovelId) {
          window.localStorage.removeItem(STUDIO_LAST_NOVEL_STORAGE_KEY)
        }
      }

      // 先把已删作品从共享缓存里清掉再导航：/studio 会按 ['community','me'] 挑入口作品，
      // 只做 invalidate 的话首帧拿到的还是旧数据，会把用户直接送回刚删掉的那部作品
      queryClient.setQueryData<UserMePayload>(['community', 'me'], (current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          authoredNovels: (current.authoredNovels ?? []).filter((item) => item.id !== deletedNovelId),
          drafts: (current.drafts ?? []).filter((item) => item.novelId !== deletedNovelId),
        }
      })
      queryClient.setQueryData<Novel[]>(['studio', 'my-novels'], (current) =>
        Array.isArray(current) ? current.filter((item) => item.id !== deletedNovelId) : current,
      )
      // 这部作品自己的各级缓存已经没有意义，直接丢弃，避开重新渲染旧快照或回头请求 404
      queryClient.removeQueries({ queryKey: ['studio', deletedNovelId] })
      queryClient.removeQueries({ queryKey: ['studio-chapter', deletedNovelId] })
      queryClient.removeQueries({ queryKey: ['novel-detail', deletedNovelId] })
      queryClient.removeQueries({ queryKey: ['reader', deletedNovelId] })

      navigate('/studio', { replace: true })
      await queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
      await queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
    },
    onError: (error: Error) => {
      setNovelSaveState('error')
      setNovelMessage(error.message)
    },
  })

  useEffect(() => {
    if (!novelDirty || !novelForm || saveNovelMutation.isPending) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      saveNovelMutation.mutate({ reason: 'auto' })
    }, 1200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [novelDirty, novelForm, saveNovelMutation])

  function handleSaveNovel() {
    if (!novelForm || saveNovelMutation.isPending) {
      return
    }

    saveNovelMutation.mutate({ reason: 'manual' })
  }

  function handleRequestNovelStatusAction(nextStatus: EditableNovelStatus) {
    if (!novelForm || saveNovelMutation.isPending || novelForm.status === nextStatus) {
      return
    }

    const actionMap: Record<
      EditableNovelStatus,
      { title: string; description: string; confirmLabel: string; tone?: 'default' | 'danger' }
    > = {
      draft: {
        title: '确认将作品状态设置为草稿',
        description: '执行后，这部作品会切回草稿状态，并自动保存当前作品设置。',
        confirmLabel: '确认设置为草稿',
      },
      published: {
        title: '确认立即上架作品',
        description: '执行后，这部作品会以已发布状态对外展示，并自动保存当前作品设置。',
        confirmLabel: '确认上架',
      },
      completed: {
        title: '是否完结？',
        description: '执行后，这部作品会标记为已完结并进入完结榜，同时自动保存当前作品设置。',
        confirmLabel: '确认完结',
      },
      archived: {
        title: '确认立即下架作品',
        description: '执行后，这部作品会切到已下架状态，并自动保存当前作品设置。',
        confirmLabel: '确认下架',
        tone: 'danger',
      },
    }

    const config = actionMap[nextStatus]
    setWorkspaceDialog({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      cancelLabel: '取消',
      tone: config.tone,
      onConfirm: () => {
        setNovelForm((current) => (current ? { ...current, status: nextStatus } : current))
      },
    })
  }

  function handleRequestNovelVisibilityAction(nextVisibility: NovelFormState['visibility']) {
    if (!novelForm || saveNovelMutation.isPending || novelForm.visibility === nextVisibility) {
      return
    }

    const actionMap: Record<
      NovelFormState['visibility'],
      { title: string; description: string; confirmLabel: string }
    > = {
      private: {
        title: '确认将作品可见范围设置为个人',
        description: '执行后，这部作品只对你自己可见，并自动保存当前作品设置。',
        confirmLabel: '确认设置为个人',
      },
      followers: {
        title: '确认将作品可见范围设置为关注可见',
        description: '执行后，这部作品只对关注你的用户可见，并自动保存当前作品设置。',
        confirmLabel: '确认设置为关注可见',
      },
      public: {
        title: '确认将作品可见范围设置为公开',
        description: '执行后，这部作品会对外公开可见，并自动保存当前作品设置。',
        confirmLabel: '确认设置为公开',
      },
    }

    const config = actionMap[nextVisibility]
    setWorkspaceDialog({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      cancelLabel: '取消',
      onConfirm: () => {
        setNovelForm((current) => (current ? { ...current, visibility: nextVisibility } : current))
      },
    })
  }

  function handlePublishNovel() {
    if (!novelForm || publishNovelMutation.isPending) {
      return
    }

    // 上架前置校验：0 章节的作品不允许发布，先引导去写第一章
    if (chapters.length === 0) {
      setWorkspaceDialog({
        title: '还不能发布这部作品',
        description: '发布前需要至少写好一个章节，并在发布时选择公开，读者才能看到这部作品。',
        confirmLabel: '我知道了',
        onConfirm: () => undefined,
      })
      return
    }

    // 上架前置校验：没有标签的作品先引导去作品设置选标签
    const tags = novelForm.tagsText
      .split(/[、/\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (tags.length === 0) {
      setWorkspaceDialog({
        title: '请先设置作品标签',
        description: '上架前需要为作品选择标签，读者才能在分类频道和搜索中找到这部作品。',
        confirmLabel: '展开作品设置',
        onConfirm: () => {
          // 沉浸层内已支持直接展开作品设置面板，无需退出沉浸
          setActiveToolPanel('meta')
          setMobileView('meta')
        },
      })
      return
    }

    // 打开发布弹窗：支持勾选需要一起发布的章节并选择可见范围（默认公开）
    setPublishDialogOpen(true)
  }

  function handleRequestDeleteNovel() {
    if (deleteNovelMutation.isPending) {
      return
    }

    if (!novelForm) {
      return
    }

    if (novelForm.status === 'published') {
      // 不把入口置灰：允许点击并用 toast 说清该去哪里下架，比一个不可点的按钮更易理解
      toast.error('已发布作品不能直接删除，请先去「作品设置」将作品下架，之后再执行删除。')
      return
    }

    setWorkspaceDialog({
      title: '确认删除作品',
      description: '仅草稿或已下架作品允许删除。删除后，这部作品的章节、Agent 记录与封面素材都会一起移除，且无法恢复。确定要删除吗？',
      confirmLabel: '确定删除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        await deleteNovelMutation.mutateAsync()
      },
    })
  }

  function promptConfirmPendingChapterReview(actionLabel: string) {
    setWorkspaceDialog({
      title: '请先确认当前正文改动',
      description: `当前章节还有待确认的正文变更，请先选择“保留”或“撤销”，再继续${actionLabel}。`,
      confirmLabel: '我知道了',
      cancelLabel: '关闭',
      onConfirm: () => undefined,
    })
  }

  const persistChapter = useCallback(
    async (reason: 'manual' | 'auto' | 'apply') => {
      if (!chapterDraft) {
        return
      }

      // 仅拦截待审查的那些章，其他章节正常保存
      if (pendingChapterReviews.some((item) => item.chapterId === chapterDraft.id)) {
        if (reason !== 'auto') {
          promptConfirmPendingChapterReview('保存当前章节')
        }
        return
      }

      if (!chapterDraft.title.trim() || !chapterDraft.content.trim()) {
        if (reason !== 'auto') {
          setChapterSaveState('error')
          setChapterSaveMessage('章节标题和正文都不能为空。')
        }
        return
      }

      setChapterSaveState('saving')
      setChapterSaveMessage(reason === 'auto' ? '正在自动保存草稿...' : '正在保存章节...')

      try {
        const localDraftId = chapterDraft.localOnly ? chapterDraft.id : null
        const payload = {
          title: chapterDraft.title.trim(),
          summary: chapterDraft.summary.trim() || undefined,
          content: chapterDraft.content,
          status: chapterDraft.status,
          visibility: chapterDraft.visibility,
          ...(chapterDraft.localOnly ? {} : { expectedRevision: chapterDraft.revision }),
        }

        const savedChapter = chapterDraft.localOnly
          ? await createChapterDraft(activeNovelId, payload)
          : await updateChapterDraft(activeNovelId, chapterDraft.id, payload)

        setChapters((current) =>
          replaceChapterItem(current, localDraftId, toChapterListItem(savedChapter)),
        )
        setSelectedChapterId(savedChapter.id)
        setChapterDraft(buildChapterDraft(savedChapter))
        setChapterDirty(false)
        setChapterSaveState('saved')
        setChapterLastSavedAt(savedChapter.updatedAt)
        setChapterSaveMessage(
          reason === 'auto'
            ? `已自动保存于 ${formatDateTime(savedChapter.updatedAt)}`
            : `已保存于 ${formatDateTime(savedChapter.updatedAt)}`,
        )
        setCurrentNovel((current) =>
          current
            ? {
                ...current,
                chapterCount: chapterDraft.localOnly ? current.chapterCount + 1 : current.chapterCount,
                updatedAt: savedChapter.updatedAt,
              }
            : current,
        )

        syncStudioPayload((current) => {
          if (!current) {
            return current
          }

          return {
            ...current,
            novel: {
              ...current.novel,
              chapterCount: chapterDraft.localOnly
                ? current.novel.chapterCount + 1
                : current.novel.chapterCount,
              updatedAt: savedChapter.updatedAt,
            },
            draftChapter:
              savedChapter.status === 'draft'
                ? savedChapter
                : current.draftChapter?.id === savedChapter.id
                  ? null
                  : current.draftChapter,
            chapters: replaceChapterItem(
              current.chapters,
              localDraftId,
              toChapterListItem(savedChapter),
            ),
          }
        })
      } catch (error) {
        setChapterSaveState('error')
        setChapterSaveMessage(error instanceof Error ? error.message : '章节保存失败，请稍后重试。')
      }
    },
    [activeNovelId, chapterDraft, pendingChapterReviews, syncStudioPayload],
  )

  useEffect(() => {
    if (!chapterDraft || !chapterDirty) {
      return
    }

    setChapterSaveState('pending')
    setChapterSaveMessage('检测到修改，正在自动保存...')
    const timer = window.setTimeout(() => {
      void persistChapter('auto')
    }, 800)

    return () => window.clearTimeout(timer)
  }, [chapterDirty, chapterDraft, persistChapter])

  const coverPromptMutation = useMutation({
    mutationFn: async () => {
      if (!coverForm) {
        throw new Error('封面参数尚未准备完成')
      }

      return generateCoverPrompt({
        novelTitle: coverForm.novelTitle.trim(),
        summary: coverForm.summary.trim(),
        genre: coverForm.genre.trim(),
        protagonist: coverForm.protagonist.trim() || undefined,
        stylePreference: coverForm.stylePreference.trim() || undefined,
      })
    },
    onSuccess: (result) => {
      setCoverForm((current) =>
        current
          ? {
              ...current,
              prompt: result.prompt,
              negativePrompt: result.negativePrompt ?? '',
            }
          : current,
      )
      setCoverKeywords(result.visualKeywords)
      setCoverMessage('提示词已生成，可继续微调后再生成封面。')
      toast.success('封面提示词已生成，可继续微调后直接生成封面。')
      setActiveToolPanel('cover')
      setMobileView('cover')
    },
    onError: (error: Error) => {
      setCoverMessage(error.message)
      toast.error(error.message || '封面提示词生成失败，请稍后重试。')
    },
  })

  const coverImageMutation = useMutation({
    mutationFn: async () => {
      if (!coverForm?.prompt.trim()) {
        throw new Error('请先生成或补充封面提示词。')
      }

      return generateCoverImages({
        prompt: coverForm.prompt,
        size: FIXED_NOVEL_COVER_SIZE,
        count: coverForm.count,
        novelId: activeNovelId,
      })
    },
    onSuccess: (result) => {
      setCoverAssets((current) => [...result.images, ...current])
      setSelectedCoverId(result.images[0]?.id ?? null)
      setCoverMessage(`候选封面已生成 ${result.images.length} 张，可先预览再设为正式封面。`)
      setActiveToolPanel('cover')
      setMobileView('cover')
      syncStudioPayload((current) =>
        current ? { ...current, coverAssets: [...result.images, ...current.coverAssets] } : current,
      )
      if (result.images.length > 0) {
        setWorkspaceDialog({
          title: '封面生成完成',
          description: `已经生成 ${result.images.length} 张封面候选图。现在可以去查看、下载，或者一键设为作品封面。`,
          confirmLabel: '去查看',
          cancelLabel: '稍后',
          onConfirm: () => {
            setActiveToolPanel('cover')
            setMobileView('cover')
          },
        })
      }
    },
    onError: (error: Error) => {
      setCoverMessage(error.message)
    },
    onMutate: () => {
      setCoverGenerationBusy(true)
    },
    onSettled: () => {
      setCoverGenerationBusy(false)
    },
  })

  const coverUploadMutation = useMutation({
    mutationFn: async (crop: NovelCoverCropState) => {
      if (!currentNovel) {
        throw new Error('作品信息尚未加载完成。')
      }

      if (!pendingCoverUploadFile) {
        throw new Error('还没有选择要上传的封面图片。')
      }

      const coverDataUrl = await buildFixedNovelCoverDataUrl(pendingCoverUploadFile, crop)
      return uploadNovelCover(currentNovel.id, { coverDataUrl })
    },
    onSuccess: ({ novel, asset }) => {
      setCoverAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
      setSelectedCoverId(asset.id)
      setCurrentNovel((current) =>
        current
          ? {
              ...novel,
              coverUrl: asset.imageUrl,
              coverAssetId: asset.id,
            }
          : current,
      )
      setCoverMessage('本地封面已按固定书封比例上传，并设为当前作品封面。')
      setActiveToolPanel('cover')
      setMobileView('cover')
      // 封面更换后同步本机书架快照与站内缓存列表，避免书架/收藏/详情继续显示旧封面
      updateShelfCover(novel.id, asset.imageUrl)
      void queryClient.invalidateQueries({ queryKey: ['novel-detail', novel.id] })
      void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
      void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['home'] })
      syncStudioPayload((current) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                ...novel,
                coverUrl: asset.imageUrl,
                coverAssetId: asset.id,
              },
              coverAssets: [asset, ...current.coverAssets.filter((item) => item.id !== asset.id)],
            }
          : current,
      )
    },
    onSettled: () => {
      setPendingCoverUploadFile(null)
    },
    onError: (error: Error) => {
      setCoverMessage(error.message)
    },
  })

  const coverSelectMutation = useMutation({
    mutationFn: async (asset: CoverAsset) => {
      if (!currentNovel) {
        throw new Error('作品信息尚未加载完成')
      }

      return updateNovelMeta(currentNovel.id, {
        coverAssetId: asset.id,
        coverPrompt: coverForm?.prompt.trim() || asset.prompt,
      })
    },
    onSuccess: (updatedNovel, asset) => {
      setCurrentNovel((current) =>
        current
          ? {
              ...updatedNovel,
              coverUrl: asset.imageUrl,
              coverAssetId: asset.id,
            }
          : current,
      )
      setSelectedCoverId(asset.id)
      setCoverMessage('作品封面已更新。')
      // 封面更换后同步本机书架快照与站内缓存列表，避免书架/收藏/详情继续显示旧封面
      updateShelfCover(updatedNovel.id, asset.imageUrl)
      void queryClient.invalidateQueries({ queryKey: ['novel-detail', updatedNovel.id] })
      void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
      void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['home'] })
      syncStudioPayload((current) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                ...updatedNovel,
                coverUrl: asset.imageUrl,
                coverAssetId: asset.id,
              },
            }
          : current,
      )
    },
    onError: (error: Error) => {
      setCoverMessage(error.message)
    },
  })

  function handleOpenCoverCropDialog(file: File) {
    setPendingCoverUploadFile(file)
  }

  function handleDownloadCoverAsset(asset: CoverAsset) {
    const baseTitle = (currentNovel?.title ?? '作品').replace(/[\\/:*?"<>|]+/g, '').trim() || '作品'
    const suffix = asset.createdAt ? new Date(asset.createdAt).toISOString().slice(0, 10) : 'cover'
    void downloadCoverAssetImage(asset.imageUrl, `${baseTitle}-封面-${suffix}.jpg`)
  }

  function guardUnsavedChanges(callback: () => void) {
    if (chapterDirty) {
      setWorkspaceDialog({
        title: '切换章节前确认',
        description: '当前章节还有未保存的修改，切换后刚才的内容可能不会保留。确定继续吗？',
        confirmLabel: '继续切换',
        cancelLabel: '先留在这里',
        onConfirm: () => {
          callback()
        },
      })
      return
    }

    callback()
  }

  function handleSelectChapter(nextChapterId: string, options?: { openSettings?: boolean }) {
    const openSettings = options?.openSettings ?? false
    setSelectedTreeItemId(`chapter:${nextChapterId}`)

    if (nextChapterId === selectedChapterId) {
      setEditorChapterSettingsOpen(openSettings)
      setMobileView('editor')

      const cachedChapter = queryClient.getQueryData<Chapter>(['studio-chapter', activeNovelId, nextChapterId])
      if (cachedChapter) {
        setChapterDraft(buildChapterDraft(cachedChapter))
        setChapterDirty(false)
        setChapterSaveState('saved')
        setChapterLastSavedAt(cachedChapter.updatedAt)
        setChapterSaveMessage(`已同步到 ${formatDateTime(cachedChapter.updatedAt)}`)
      }
      return
    }

    guardUnsavedChanges(() => {
      setSelectedChapterId(nextChapterId)
      setEditorChapterSettingsOpen(openSettings)
      setChapterDraft(null)
      setChapterSaveState('idle')
      setChapterSaveMessage('正在打开章节...')
      setMobileView('editor')
    })
  }

  async function handleCreateLocalChapter() {
    if (createChapterLockRef.current) {
      return
    }

    createChapterLockRef.current = true
    setChapterSaveState('saving')
    setChapterSaveMessage('正在创建新章节...')

    try {
      const nextOrderIndex = chapters.length + 1
      const savedChapter = await createChapterDraft(activeNovelId, {
        title: `第 ${nextOrderIndex} 章`,
        summary: '新建章节',
        content: '',
        status: 'draft',
        visibility: 'private',
      })

      queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, savedChapter.id], savedChapter)
      setChapters((current) => upsertChapterItem(current, toChapterListItem(savedChapter)))
      setSelectedChapterId(savedChapter.id)
      setChapterDraft(buildChapterDraft(savedChapter))
      setChapterDirty(false)
      setChapterSaveState('saved')
      setChapterSaveMessage(`已自动保存于 ${formatDateTime(savedChapter.updatedAt)}`)
      setChapterLastSavedAt(savedChapter.updatedAt)
      setMobileView('editor')
      setEditorChapterSettingsOpen(false)

      setCurrentNovel((current) =>
        current
          ? {
              ...current,
              chapterCount: current.chapterCount + 1,
              updatedAt: savedChapter.updatedAt,
            }
          : current,
      )

      syncStudioPayload((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          novel: {
            ...current.novel,
            chapterCount: current.novel.chapterCount + 1,
            updatedAt: savedChapter.updatedAt,
          },
          draftChapter: savedChapter.status === 'draft' ? savedChapter : current.draftChapter,
          chapters: upsertChapterItem(current.chapters, toChapterListItem(savedChapter)),
        }
      })
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(error instanceof Error ? error.message : '新章节创建失败，请稍后重试。')
    } finally {
      window.setTimeout(() => {
        createChapterLockRef.current = false
      }, 300)
    }
  }

  function handleRequestCreateChapter() {
    setWorkspaceDialog({
      title: '确认新建章节',
      description: '将会创建一个新的章节草稿。确定现在新建章节吗？',
      confirmLabel: '确认新建',
      cancelLabel: '取消',
      tone: 'default',
      onConfirm: async () => {
        await handleCreateLocalChapter()
      },
    })
  }

  function handleChapterDraftChange(next: ChapterDraftState) {
    setChapterDraft(next)
    setChapterDirty(true)
  }

  function handleEditorStatusChange(nextStatus: Chapter['status']) {
    if (!chapterDraft) {
      return
    }

    handleChapterDraftChange({ ...chapterDraft, status: nextStatus })
  }

  function handleRequestChapterStatusAction(nextStatus: Chapter['status']) {
    if (!chapterDraft || chapterDraft.status === nextStatus) {
      return
    }

    const actionMap: Record<
      Chapter['status'],
      { title: string; description: string; confirmLabel: string; tone?: 'default' | 'danger' }
    > = {
      draft: {
        title: '确认将状态设置为草稿',
        description: '执行后，这一章会切回草稿状态。',
        confirmLabel: '确认设置为草稿',
      },
      published: {
        title: '确认立即上架',
        description: '执行后，这一章会立刻切到上架状态。',
        confirmLabel: '确认上架',
      },
      scheduled: {
        title: '确认将状态设置为定时',
        description: '执行后，这一章会切到定时发布状态。',
        confirmLabel: '确认设置为定时',
      },
      archived: {
        title: '确认立即下架',
        description: '执行后，这一章会立刻从上架状态切到下架状态。',
        confirmLabel: '确认下架',
        tone: 'danger',
      },
    }

    const config = actionMap[nextStatus]
    setWorkspaceDialog({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      cancelLabel: '取消',
      tone: config.tone,
      onConfirm: () => {
        handleEditorStatusChange(nextStatus)
      },
    })
  }

  function handleRequestChapterVisibilityAction(nextVisibility: Chapter['visibility']) {
    if (!chapterDraft || chapterDraft.visibility === nextVisibility) {
      return
    }

    const actionMap: Record<
      Chapter['visibility'],
      { title: string; description: string; confirmLabel: string }
    > = {
      private: {
        title: '确认将可见范围设置为个人',
        description: '执行后，这一章只对你自己可见。',
        confirmLabel: '确认设置为个人',
      },
      followers: {
        title: '确认将可见范围设置为关注可见',
        description: '执行后，这一章只对关注你的用户可见。',
        confirmLabel: '确认设置为关注可见',
      },
      public: {
        title: '确认将可见范围设置为公开',
        description: '执行后，这一章会对外公开可见。',
        confirmLabel: '确认设置为公开',
      },
    }

    const config = actionMap[nextVisibility]
    setWorkspaceDialog({
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      cancelLabel: '取消',
      onConfirm: () => {
        handleChapterDraftChange({ ...chapterDraft, visibility: nextVisibility })
      },
    })
  }

  async function handleDeleteChapter() {
    if (!chapterDraft) {
      return
    }

    // 审查拦截仅限待审查的那些章，其他章节可自由删除
    if (pendingChapterReviews.some((item) => item.chapterId === chapterDraft.id)) {
      promptConfirmPendingChapterReview('删除章节')
      return
    }

    const deletingChapter = chapterDraft
    const currentIndex = chapters.findIndex((chapter) => chapter.id === deletingChapter.id)
    const remainingChapters = removeChapterAndCompact(chapters, deletingChapter.id)
    const fallbackChapter =
      remainingChapters[Math.min(currentIndex, remainingChapters.length - 1)] ??
      remainingChapters[remainingChapters.length - 1] ??
      null

    if (!deletingChapter.localOnly) {
      await deleteChapterDraft(activeNovelId, deletingChapter.id, deletingChapter.revision)
    }

    setChapters((current) => removeChapterAndCompact(current, deletingChapter.id))
    setSelectedChapterId(fallbackChapter?.id ?? null)
    setEditorChapterSettingsOpen(false)
    setChapterDraft(null)
    setChapterDirty(false)
    setChapterLastSavedAt(null)
    setChapterSaveState('idle')
    setChapterSaveMessage(fallbackChapter ? '正在打开章节...' : '章节已删除。')

    if (!deletingChapter.localOnly) {
      queryClient.removeQueries({
        queryKey: ['studio-chapter', activeNovelId, deletingChapter.id],
      })
      void queryClient.invalidateQueries({ queryKey: ['studio-chapter', activeNovelId] })
      setCurrentNovel((current) =>
        current
          ? {
              ...current,
              chapterCount: Math.max(0, current.chapterCount - 1),
              wordCount: Math.max(0, current.wordCount - deletingChapter.content.length),
            }
          : current,
      )
      syncStudioPayload((current) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                chapterCount: Math.max(0, current.novel.chapterCount - 1),
                wordCount: Math.max(0, current.novel.wordCount - deletingChapter.content.length),
              },
              draftChapter:
                current.draftChapter?.id === deletingChapter.id ? null : current.draftChapter,
              chapters: removeChapterAndCompact(current.chapters, deletingChapter.id),
            }
          : current,
      )
    }
  }

  function syncLocalRollbackSnapshot(snapshot?: AgentLocalRollbackSnapshot | null) {
    if (!snapshot) {
      return
    }

    if (snapshot.kind === 'restore_chapter') {
      const restoredDraft: ChapterDraftState = {
        id: snapshot.chapter.id,
        title: snapshot.chapter.title,
        summary: snapshot.chapter.summary,
        content: snapshot.chapter.content,
        status: snapshot.chapter.status,
        visibility: snapshot.chapter.visibility,
        orderIndex:
          chapters.find((chapter) => chapter.id === snapshot.chapter.id)?.orderIndex ??
          chapterDraft?.orderIndex ??
          1,
        revision:
          chapters.find((chapter) => chapter.id === snapshot.chapter.id)?.revision ??
          chapterDraft?.revision ??
          1,
        localOnly: false,
      }

      setSelectedChapterId(snapshot.selectedChapterId ?? snapshot.chapter.id)
      setChapterDraft(restoredDraft)
      setChapterDirty(false)
      setChapterSaveState('saved')
      setChapterLastSavedAt(snapshot.chapter.updatedAt)
      setChapterSaveMessage('已回退到本轮对话开始前的正文状态。')
      setChapters((current) =>
        current.map((chapter) =>
          chapter.id === snapshot.chapter.id
            ? {
                ...chapter,
                title: snapshot.chapter.title,
                summary: snapshot.chapter.summary || null,
                wordCount: snapshot.chapter.wordCount,
                status: snapshot.chapter.status,
                visibility: snapshot.chapter.visibility,
              }
            : chapter,
        ),
      )
      queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, snapshot.chapter.id], (current) =>
        current
          ? {
              ...current,
              title: snapshot.chapter.title,
              summary: snapshot.chapter.summary || null,
              content: snapshot.chapter.content,
              wordCount: snapshot.chapter.wordCount,
              status: snapshot.chapter.status,
              visibility: snapshot.chapter.visibility,
              updatedAt: snapshot.chapter.updatedAt ?? current.updatedAt,
            }
          : current,
      )
      return
    }

    const previousChapter = snapshot.previousChapter
    const restoredPreviousDraft = previousChapter
      ? {
          id: previousChapter.id,
          title: previousChapter.title,
          summary: previousChapter.summary,
          content: previousChapter.content,
          status: previousChapter.status,
          visibility: previousChapter.visibility,
          orderIndex:
            chapters.find((chapter) => chapter.id === previousChapter.id)?.orderIndex ??
            chapterDraft?.orderIndex ??
            1,
          revision:
            chapters.find((chapter) => chapter.id === previousChapter.id)?.revision ??
            chapterDraft?.revision ??
            1,
          localOnly: false,
        }
      : null

    setChapters((current) => removeChapterAndCompact(current, snapshot.chapter.id))
    queryClient.removeQueries({
      queryKey: ['studio-chapter', activeNovelId, snapshot.chapter.id],
      exact: true,
    })
    void queryClient.invalidateQueries({ queryKey: ['studio-chapter', activeNovelId] })
    setCurrentNovel((current) =>
      current
        ? {
            ...current,
            chapterCount: Math.max(0, current.chapterCount - 1),
            wordCount: Math.max(0, current.wordCount - snapshot.chapter.wordCount),
          }
        : current,
    )
    syncStudioPayload((current) =>
      current
        ? {
            ...current,
            novel: {
              ...current.novel,
              chapterCount: Math.max(0, current.novel.chapterCount - 1),
              wordCount: Math.max(0, current.novel.wordCount - snapshot.chapter.wordCount),
            },
            draftChapter:
              current.draftChapter?.id === snapshot.chapter.id
                ? previousChapter
                  ? {
                      ...current.draftChapter,
                      id: previousChapter.id,
                      title: previousChapter.title,
                      summary: previousChapter.summary || null,
                      content: previousChapter.content,
                      wordCount: previousChapter.wordCount,
                      status: previousChapter.status,
                      visibility: previousChapter.visibility,
                    }
                  : null
                : current.draftChapter,
            chapters: removeChapterAndCompact(current.chapters, snapshot.chapter.id),
          }
        : current,
    )

    if (selectedChapterId === snapshot.chapter.id || chapterDraft?.id === snapshot.chapter.id) {
      setSelectedChapterId(snapshot.previousSelectedChapterId)
      setChapterDraft(restoredPreviousDraft)
      setChapterDirty(false)
      setChapterSaveState('saved')
      setChapterLastSavedAt(previousChapter?.updatedAt ?? null)
      setChapterSaveMessage(previousChapter ? '已回退到本轮对话开始前的章节状态。' : '已回退并移除本轮新建章节。')
    }
  }

  function handleKeepPendingChapterReview(review: ChapterPendingReview) {
    if (pendingChapterReviewBusy) {
      return
    }

    setPendingChapterReviewBusy(true)
    try {
      setPendingChapterReviews((current) => current.filter((item) => item.id !== review.id))
      // 本章定夺完毕：若还有其它章待审，在当前章底部给出「下一个文件」流转入口
      setReviewHandoffChapterId(review.chapterId)
      setChapterSaveState('saved')
      setChapterSaveMessage('已保留本次正文变更。')

      if (review.artifactId) {
        updateAgentArtifact(review.artifactId, (current) => ({
          ...current,
          pendingChapterReview: null,
        }))
      }
    } finally {
      setPendingChapterReviewBusy(false)
    }
  }

  async function handleRevertPendingChapterReview(review: ChapterPendingReview) {
    if (pendingChapterReviewBusy) {
      return
    }

    setPendingChapterReviewBusy(true)
    try {
      if (review.rollbackSnapshot.kind === 'restore_chapter') {
        const restoredChapter = await updateChapterDraft(activeNovelId, review.rollbackSnapshot.chapter.id, {
          title: review.rollbackSnapshot.chapter.title,
          summary: review.rollbackSnapshot.chapter.summary.trim() || undefined,
          content: review.rollbackSnapshot.chapter.content,
          status: review.rollbackSnapshot.chapter.status,
          visibility: review.rollbackSnapshot.chapter.visibility,
          expectedRevision: review.after.revision,
        })

        syncSavedChapterState(restoredChapter, {
          message: '已撤销本次正文变更。',
          wordCountDelta: restoredChapter.wordCount - review.after.content.length,
        })
      } else {
        await deleteChapterDraft(activeNovelId, review.after.id, review.after.revision)
        syncLocalRollbackSnapshot(review.rollbackSnapshot)
      }

      setPendingChapterReviews((current) => current.filter((item) => item.id !== review.id))
      if (review.rollbackSnapshot.kind === 'restore_chapter') {
        // 整章撤销后同样给出流转入口（删除新建章的分支会切章，由切章 effect 清空）
        setReviewHandoffChapterId(review.chapterId)
      }
      if (review.artifactId) {
        updateAgentArtifact(review.artifactId, (current) => ({
          ...current,
          pendingChapterReview: null,
          replacedChapterContent: false,
          appendedToChapter: false,
        }))
      }
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(error instanceof Error ? error.message : '撤销本次正文变更失败，请稍后重试。')
    } finally {
      setPendingChapterReviewBusy(false)
    }
  }

  // Agent 面板✕图标的拒绝入口：先弹自定义确认框，确认后才真正撤销
  function handleRequestRejectPendingChapterReview(review: ChapterPendingReview) {
    if (pendingChapterReviewBusy) {
      return
    }

    const chapterTitle = review.after.title.trim() || '当前章节'
    setWorkspaceDialog({
      title: '撤销本次正文变更？',
      description:
        review.rollbackSnapshot.kind === 'remove_created_chapter'
          ? `将删除本轮新建的《${chapterTitle}》并回到写入前的状态，删除后不可恢复。`
          : `《${chapterTitle}》将恢复到本次写入前的内容，AI 新写的这部分正文会被移除。`,
      confirmLabel: '撤销变更',
      cancelLabel: '再想想',
      tone: 'danger',
      onConfirm: () => handleRevertPendingChapterReview(review),
    })
  }

  // 块级采纳（片段右下角✓）：把该变更块写进审查基线；全部块定夺完毕即视为整章保留
  function handleAcceptReviewHunk(review: ChapterPendingReview, hunkIndex: number) {
    if (pendingChapterReviewBusy) {
      return
    }

    const beforeContent = review.before?.content ?? ''
    const resolved = resolveReviewHunk(beforeContent, review.after.content, hunkIndex, 'accept')
    if (buildReviewDiff(resolved.before, review.after.content).hunkCount === 0) {
      handleKeepPendingChapterReview(review)
      return
    }

    setPendingChapterReviews((current) =>
      current.map((item) =>
        item.id === review.id
          ? { ...item, before: { ...(item.before ?? item.after), content: resolved.before } }
          : item,
      ),
    )
  }

  // 块级撤回：把该变更块从章节结果中还原并落库；全部块定夺完毕即结束审查
  async function handleRejectReviewHunk(review: ChapterPendingReview, hunkIndex: number) {
    if (pendingChapterReviewBusy) {
      return
    }

    const beforeContent = review.before?.content ?? ''
    const { hunkCount } = buildReviewDiff(beforeContent, review.after.content)
    // 本轮新建的章节只剩这一个变更块时，撤回等价于整章撤销（删除新建章节）
    if (review.rollbackSnapshot.kind === 'remove_created_chapter' && hunkCount <= 1) {
      await handleRevertPendingChapterReview(review)
      return
    }

    const resolved = resolveReviewHunk(beforeContent, review.after.content, hunkIndex, 'reject')
    setPendingChapterReviewBusy(true)
    try {
      const savedChapter = await updateChapterDraft(activeNovelId, review.after.id, {
        title: review.after.title,
        summary: review.after.summary.trim() || undefined,
        content: resolved.after,
        status: review.after.status,
        visibility: review.after.visibility,
        expectedRevision: review.after.revision,
      })

      syncSavedChapterState(savedChapter, {
        message: '已撤回该处变更。',
        wordCountDelta: savedChapter.wordCount - review.after.content.length,
      })

      if (buildReviewDiff(beforeContent, resolved.after).hunkCount === 0) {
        setPendingChapterReviews((current) => current.filter((item) => item.id !== review.id))
        // 逐块撤回至全部定夺完毕：同样给出「下一个文件」流转入口
        setReviewHandoffChapterId(review.chapterId)
        if (review.artifactId) {
          updateAgentArtifact(review.artifactId, (current) => ({
            ...current,
            pendingChapterReview: null,
          }))
        }
      } else {
        setPendingChapterReviews((current) =>
          current.map((item) =>
            item.id === review.id
              ? {
                  ...item,
                  after: {
                    ...item.after,
                    content: resolved.after,
                    revision: savedChapter.revision,
                  },
                }
              : item,
          ),
        )
      }
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(error instanceof Error ? error.message : '撤回该处变更失败，请稍后重试。')
    } finally {
      setPendingChapterReviewBusy(false)
    }
  }

  // 块级✕撤回入口：自定义弹窗确认后才真正回滚该处片段
  function handleRequestRejectReviewHunk(review: ChapterPendingReview, hunkIndex: number) {
    if (pendingChapterReviewBusy) {
      return
    }

    setWorkspaceDialog({
      title: '撤回这一处变更？',
      description: '这一处绿色/红色片段将恢复为 AI 写入前的内容，撤回后不可恢复。',
      confirmLabel: '撤回',
      cancelLabel: '再想想',
      tone: 'danger',
      onConfirm: () => handleRejectReviewHunk(review, hunkIndex),
    })
  }

  // 计划审查条（plan/14 方案F）：✓保留仅清审查态；✕撤销把云端计划回写到本次修订前
  function handleKeepPendingPlanReview() {
    if (!pendingPlanReview || pendingPlanReviewBusy) {
      return
    }
    setPendingPlanReview(null)
    setChapterSaveState('saved')
    setChapterSaveMessage(`已保留对计划《${pendingPlanReview.title}》的修订。`)
  }

  async function handleRevertPendingPlanReview() {
    if (!pendingPlanReview || pendingPlanReviewBusy) {
      return
    }

    const review = pendingPlanReview
    setPendingPlanReviewBusy(true)
    try {
      // 新建计划的撤销：直接从计划夹移除，而非回写空内容
      if (review.isCreate) {
        await updateNovelPlanFile(review.backendArtifactId, { saved: false })

        setServerPlanFiles((current) =>
          current.filter((plan) => plan.backendArtifactId !== review.backendArtifactId),
        )
        setAgentArtifacts((current) =>
          current.map((artifact) =>
            artifact.backendArtifactId === review.backendArtifactId
              ? { ...artifact, savedAsPlan: false }
              : artifact,
          ),
        )
        setSelectedTreeItemId((current) =>
          current && current.startsWith('plan:') ? null : current,
        )

        setPendingPlanReview(null)
        setChapterSaveState('saved')
        setChapterSaveMessage(`已撤销新建的计划《${review.title}》。`)
        return
      }

      await updateNovelPlanFile(review.backendArtifactId, {
        title: review.beforeTitle,
        content: review.before,
      })

      // 本地计划夹/产物列表同步回修订前的内容
      setServerPlanFiles((current) =>
        current.map((plan) =>
          plan.backendArtifactId === review.backendArtifactId
            ? { ...plan, title: review.beforeTitle, content: review.before.trim() }
            : plan,
        ),
      )
      setAgentArtifacts((current) =>
        current.map((artifact) =>
          artifact.backendArtifactId === review.backendArtifactId
            ? {
                ...artifact,
                title: review.beforeTitle,
                content: review.before,
                rawContent: review.before,
              }
            : artifact,
        ),
      )

      setPendingPlanReview(null)
      setChapterSaveState('saved')
      setChapterSaveMessage(`计划《${review.beforeTitle}》已恢复到本次修订前。`)
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(
        error instanceof Error ? error.message : '撤销计划修订失败，请稍后重试。',
      )
    } finally {
      setPendingPlanReviewBusy(false)
    }
  }

  function handleRequestRejectPendingPlanReview() {
    if (!pendingPlanReview || pendingPlanReviewBusy) {
      return
    }

    setWorkspaceDialog({
      title: pendingPlanReview.isCreate ? '撤销这份新建的计划？' : '撤销本次计划修订？',
      description: pendingPlanReview.isCreate
        ? `《${pendingPlanReview.title}》是 AI 本次新建的计划，撤销后会从计划文件夹移除。`
        : `《${pendingPlanReview.title}》将恢复到本次修订前的内容，AI 新写的这部分计划会被移除。`,
      confirmLabel: '撤销修订',
      cancelLabel: '再想想',
      tone: 'danger',
      onConfirm: () => handleRevertPendingPlanReview(),
    })
  }

  // 计划块级采纳（片段右下角✓）：把该变更块写进审查基线；全部块定夺完毕即视为整份保留
  function handleAcceptPlanReviewHunk(hunkIndex: number) {
    const review = pendingPlanReview
    if (!review || pendingPlanReviewBusy) {
      return
    }

    const resolved = resolveReviewHunk(review.before, review.after, hunkIndex, 'accept')
    if (buildReviewDiff(resolved.before, review.after).hunkCount === 0) {
      handleKeepPendingPlanReview()
      return
    }

    setPendingPlanReview({ ...review, before: resolved.before })
  }

  // 计划块级撤回：把该变更块从计划内容中还原并回写云端；全部块定夺完毕即结束审查
  async function handleRejectPlanReviewHunk(hunkIndex: number) {
    const review = pendingPlanReview
    if (!review || pendingPlanReviewBusy) {
      return
    }

    const { hunkCount } = buildReviewDiff(review.before, review.after)
    // 新建计划只剩这一个变更块时，撤回等价于撤销整份新建计划
    if (review.isCreate && hunkCount <= 1) {
      await handleRevertPendingPlanReview()
      return
    }

    const resolved = resolveReviewHunk(review.before, review.after, hunkIndex, 'reject')
    setPendingPlanReviewBusy(true)
    try {
      await updateNovelPlanFile(review.backendArtifactId, { content: resolved.after })

      // 本地计划夹/产物列表同步到撤回后的内容
      setServerPlanFiles((current) =>
        current.map((plan) =>
          plan.backendArtifactId === review.backendArtifactId
            ? { ...plan, content: resolved.after.trim() }
            : plan,
        ),
      )
      setAgentArtifacts((current) =>
        current.map((artifact) =>
          artifact.backendArtifactId === review.backendArtifactId
            ? { ...artifact, content: resolved.after, rawContent: resolved.after }
            : artifact,
        ),
      )

      if (buildReviewDiff(review.before, resolved.after).hunkCount === 0) {
        setPendingPlanReview(null)
        setChapterSaveState('saved')
        setChapterSaveMessage(`已撤回该处变更，计划《${review.title}》审查完成。`)
      } else {
        setPendingPlanReview({ ...review, after: resolved.after })
        setChapterSaveState('saved')
        setChapterSaveMessage('已撤回该处计划变更。')
      }
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(error instanceof Error ? error.message : '撤回该处计划变更失败，请稍后重试。')
    } finally {
      setPendingPlanReviewBusy(false)
    }
  }

  // 计划块级✕撤回入口：自定义弹窗确认后才真正回滚该处片段
  function handleRequestRejectPlanReviewHunk(hunkIndex: number) {
    if (!pendingPlanReview || pendingPlanReviewBusy) {
      return
    }

    setWorkspaceDialog({
      title: '撤回这一处计划变更？',
      description: '这一处绿色/红色片段将恢复为 AI 修订前的内容，撤回后不可恢复。',
      confirmLabel: '撤回',
      cancelLabel: '再想想',
      tone: 'danger',
      onConfirm: () => handleRejectPlanReviewHunk(hunkIndex),
    })
  }

  // 工作区变更头部的✓一键全部采纳：逐章保留全部待审正文，再保留待审计划
  function handleApproveAllPendingReviews() {
    if (pendingChapterReviewBusy || pendingPlanReviewBusy) {
      return
    }

    for (const review of pendingChapterReviewsRef.current) {
      if (review.artifactId) {
        updateAgentArtifact(review.artifactId, (current) => ({
          ...current,
          pendingChapterReview: null,
        }))
      }
    }
    setPendingChapterReviews([])
    handleKeepPendingPlanReview()
    setChapterSaveState('saved')
    setChapterSaveMessage('已保留本次全部变更。')
  }

  // ✕一键全部撤回：合并成一个确认框，确认后依次回滚全部待审正文与计划
  function handleRequestRejectAllPendingReviews() {
    if (pendingChapterReviewBusy || pendingPlanReviewBusy) {
      return
    }
    if (pendingChapterReviews.length === 0 && !pendingPlanReview) {
      return
    }

    setWorkspaceDialog({
      title: '撤销全部变更？',
      description: '本轮全部正文变更与计划修订都会恢复到 AI 写入前的状态，撤销后不可恢复。',
      confirmLabel: '全部撤销',
      cancelLabel: '再想想',
      tone: 'danger',
      onConfirm: async () => {
        for (const review of [...pendingChapterReviewsRef.current]) {
          await handleRevertPendingChapterReview(review)
        }
        await handleRevertPendingPlanReview()
      },
    })
  }

  function handleRetrySave() {
    void persistChapter('manual')
  }

  // 失焦即刷保存：配合 800ms 防抖，保证有改动就落盘
  function handleEditorBlurFlush() {
    if (chapterDirty) {
      void persistChapter('auto')
    }
  }

  // 审查态按章节挂载：只在对应章节激活时展示绿增红减审查视图，切走不丢状态
  const activeChapterPendingReview =
    pendingChapterReviews.find((item) => item.chapterId === selectedChapterId) ?? null

  // IDE 式审查条「文件 x/y」：按待审数组顺序给出当前章节位置（1 基）
  const reviewFileCount = pendingChapterReviews.length
  const activeReviewFileIndex = activeChapterPendingReview
    ? pendingChapterReviews.findIndex((item) => item.id === activeChapterPendingReview.id) + 1
    : 0

  // 审查条「‹ 文件 ›」与「下一个文件」浮标：在多个待审章节之间循环跳转
  function handleNavigateReviewFile(offset: 1 | -1) {
    const list = pendingChapterReviewsRef.current
    if (list.length === 0) {
      return
    }
    const currentIndex = list.findIndex((item) => item.chapterId === selectedChapterId)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + offset + list.length) % list.length
    const target = list[nextIndex]
    if (target && target.chapterId !== selectedChapterId) {
      handleSelectChapter(target.chapterId)
    }
  }

  function resetAgentWorkspace() {
    setAgentSessionId(null)
    setAgentArtifacts([])
    setActiveAgentArtifactId(null)
    setAgentRunState(createIdleAgentRunState())
    setAgentPrompt('')
  }

  function updateAgentArtifact(
    artifactId: string,
    updater: (artifact: AgentArtifact) => AgentArtifact,
  ) {
    setAgentArtifacts((current) =>
      current.map((artifact) => (artifact.id === artifactId ? updater(artifact) : artifact)),
    )
  }

  function handleCreateAgentTaskWindow() {
    if (agentRunState.active) {
      setAgentRunState((current) => ({
        ...current,
        statusText: 'AI 生成中，暂时无法切换任务窗口。',
      }))
      return
    }

    const nextTaskWindow = createLocalAgentTaskWindow()
    pruneTemporaryTaskWindows(nextTaskWindow.id)
    setAgentTaskWindows((current) => [nextTaskWindow, ...current])
    applyAgentTaskWindowState(nextTaskWindow)
    setShowAgentTaskList(true)
  }

  async function handleSelectAgentTaskWindow(taskWindowId: string) {
    if (agentRunState.active) {
      setAgentRunState((current) => ({
        ...current,
        statusText: 'AI 生成中，暂时无法切换任务窗口。',
      }))
      return
    }

    if (taskWindowId === activeAgentTaskWindowId) {
      return
    }

    pruneTemporaryTaskWindows(taskWindowId)
    await loadAgentTaskWindow(taskWindowId)
  }

  async function handleRenameAgentTaskWindow(taskWindowId: string, nextTitle: string) {
    const normalizedTitle = nextTitle.trim().slice(0, 160)
    if (!normalizedTitle) {
      return
    }

    const targetTaskWindow = agentTaskWindows.find((taskWindow) => taskWindow.id === taskWindowId)
    if (!targetTaskWindow) {
      return
    }

    setAgentTaskWindows((current) =>
      current.map((taskWindow) =>
        taskWindow.id === taskWindowId
          ? {
              ...taskWindow,
              title: normalizedTitle,
              customNamed: true,
              updatedAt: new Date().toISOString(),
            }
          : taskWindow,
      ),
    )

    if (targetTaskWindow.sessionId) {
      try {
        const updatedSession = await updateWritingAgentSession(targetTaskWindow.sessionId, {
          title: normalizedTitle,
        })
        setAgentTaskWindows((current) =>
          current.map((taskWindow) =>
            taskWindow.id === taskWindowId
              ? {
                  ...taskWindow,
                  title: updatedSession.title,
                  customNamed: true,
                  updatedAt: updatedSession.updatedAt,
                }
              : taskWindow,
          ),
        )
      } catch (error) {
        setAgentRunState((current) => ({
          ...current,
          statusText: error instanceof Error ? error.message : '任务名称更新失败，请稍后再试。',
        }))
      }
    }
  }

  function handleDeleteAgentTaskWindow(taskWindowId: string) {
    const targetTaskWindow = agentTaskWindows.find((taskWindow) => taskWindow.id === taskWindowId)
    if (!targetTaskWindow || agentRunState.active) {
      return
    }

    const hasTaskContent = Boolean(targetTaskWindow.prompt.trim()) || targetTaskWindow.artifacts.length > 0
    const taskTitle = targetTaskWindow.title.trim() || DEFAULT_AGENT_TASK_TITLE

    setWorkspaceDialog({
      title: '确认删除这个任务',
      description: targetTaskWindow.sessionId || hasTaskContent
        ? `删除后，“${taskTitle}”这轮对话、处理记录和结果都会一起移除，刷新后也不会再恢复出来。`
        : `删除后，“${taskTitle}”会从当前任务栏移除。`,
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        if (targetTaskWindow.sessionId) {
          await deleteWritingAgentSession(targetTaskWindow.sessionId)
        }

        const remainingTasks = dedupeAgentTaskWindows(
          agentTaskWindows.filter((taskWindow) => taskWindow.id !== taskWindowId),
        )
        const fallbackTaskWindow = createLocalAgentTaskWindow()
        const nextTasks = remainingTasks.length > 0 ? remainingTasks : [fallbackTaskWindow]
        const nextActiveTaskWindow =
          nextTasks.find((taskWindow) => taskWindow.id === activeAgentTaskWindowId && taskWindow.id !== taskWindowId) ??
          nextTasks[0] ??
          fallbackTaskWindow

        setAgentTaskWindows(nextTasks)

        if (nextActiveTaskWindow.id === activeAgentTaskWindowId && activeAgentTaskWindowId !== taskWindowId) {
          setAgentRunState((current) => ({
            ...current,
            statusText: '已删除这个任务。',
          }))
          return
        }

        const hydratedTaskWindow = await hydrateAgentTaskWindow(nextActiveTaskWindow)
        setAgentTaskWindows((current) =>
          current.map((taskWindow) =>
            taskWindow.id === hydratedTaskWindow.id ? hydratedTaskWindow : taskWindow,
          ),
        )
        applyAgentTaskWindowState(hydratedTaskWindow)

        if (!targetTaskWindow.sessionId && !hasTaskContent && nextTasks.length === 1) {
          setShowAgentTaskList(false)
        }
      },
    })
  }

  function handleSelectCatalogFromTree() {
    setSelectedTreeItemId('catalog')
    setMobileView('editor')
  }

  function handleSelectPlanFromTree(planId: string) {
    setSelectedTreeItemId(`plan:${planId}`)
    if (agentArtifacts.some((artifact) => artifact.id === planId)) {
      setActiveAgentArtifactId(planId)
    }
    setMobileView('editor')
  }

  function handleRequestDeletePlan(planId: string) {
    const targetPlan = savedPlanFiles.find((plan) => plan.id === planId)

    if (!targetPlan) {
      return
    }

    const targetArtifact =
      agentArtifacts.find((artifact) => artifact.id === planId && artifact.savedAsPlan) ?? null
    const planTitle = targetPlan.title.trim() || '这份计划'
    if (targetArtifact) {
      setActiveAgentArtifactId(targetArtifact.id)
    }

    setWorkspaceDialog({
      title: '确认删除这份计划',
      description: `删除后，“${planTitle}”会从左侧计划文件夹移除，但不会影响这轮 Agent 对话记录。`,
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        if (targetArtifact) {
          setAgentArtifacts((current) =>
            current.map((artifact) =>
              artifact.id === planId
                ? {
                    ...artifact,
                    savedAsPlan: false,
                  }
                : artifact,
            ),
          )
        }
        setServerPlanFiles((current) =>
          current.filter((plan) =>
            targetPlan.backendArtifactId
              ? plan.backendArtifactId !== targetPlan.backendArtifactId
              : plan.id !== planId,
          ),
        )
        // 同步云端标记，刷新后不再出现在计划文件夹
        if (targetPlan.backendArtifactId) {
          try {
            await updateNovelPlanFile(targetPlan.backendArtifactId, { saved: false })
          } catch {
            /* 云端同步失败时本地已移除，刷新后可重新删除 */
          }
        }
        setChapterSaveState('saved')
        setChapterSaveMessage('这份计划已从计划文件夹移除。')
        setAgentRunState((current) => ({
          ...current,
          statusText: '已删除这份计划。',
        }))
      },
    })
  }

  /** 手工新建空白计划：落到云端后直接选中，作者可在编辑区改名/补充内容 */
  async function handleCreatePlanFile() {
    setChapterSaveState('saving')
    setChapterSaveMessage('正在新建计划...')

    try {
      const item = await createNovelPlanFile(activeNovelId)
      const nextPlan = buildServerPlanFile(item)
      setServerPlanFiles((current) => [...current, nextPlan])
      setSelectedTreeItemId(`plan:${nextPlan.id}`)
      setMobileView('editor')
      setChapterSaveState('saved')
      setChapterSaveMessage('已新建一份空白计划，可直接改名或补充内容。')
    } catch (error) {
      setChapterSaveState('error')
      setChapterSaveMessage(error instanceof Error ? error.message : '新建计划失败，请稍后重试。')
    }
  }

  function handleRequestCreatePlan() {
    setWorkspaceDialog({
      title: '确认新建计划',
      description: '将会在计划文件夹新建一份空白计划，Agent 后续可直接读取它。确定现在新建吗？',
      confirmLabel: '确认新建',
      cancelLabel: '取消',
      tone: 'default',
      onConfirm: async () => {
        await handleCreatePlanFile()
      },
    })
  }

  /** 计划设置面板内改名：本地产物与云端列表同步更新，再去抖 PATCH */
  function handleRenamePlan(planId: string, nextTitle: string) {
    const targetPlan = savedPlanFiles.find((plan) => plan.id === planId)

    if (!targetPlan) {
      return
    }

    updateAgentArtifact(planId, (current) => ({
      ...current,
      title: nextTitle.trim() || current.title,
    }))
    setServerPlanFiles((current) =>
      current.map((plan) =>
        plan.id === planId ||
        Boolean(targetPlan.backendArtifactId && plan.backendArtifactId === targetPlan.backendArtifactId)
          ? { ...plan, title: nextTitle.trim() || plan.title }
          : plan,
      ),
    )
    if (targetPlan.backendArtifactId) {
      schedulePlanServerSync(
        targetPlan.backendArtifactId,
        nextTitle.trim() || targetPlan.title,
        targetPlan.content,
      )
    }
    setChapterSaveState('saved')
    setChapterSaveMessage('计划名称已更新。')
  }

  /** 计划编辑去抖同步云端：先替换待发送负载，800ms 无新输入后 PATCH */
  function flushPlanServerSync() {
    if (planSyncTimerRef.current !== null) {
      window.clearTimeout(planSyncTimerRef.current)
      planSyncTimerRef.current = null
    }
    const payload = planSyncPayloadRef.current
    planSyncPayloadRef.current = null
    if (payload) {
      void updateNovelPlanFile(payload.artifactId, {
        title: payload.title,
        content: payload.content,
      }).catch(() => {
        /* 同步失败不打断编辑，下次编辑会重新触发 */
      })
    }
  }

  function schedulePlanServerSync(artifactId: string, title: string, content: string) {
    if (planSyncPayloadRef.current && planSyncPayloadRef.current.artifactId !== artifactId) {
      flushPlanServerSync()
    }
    planSyncPayloadRef.current = { artifactId, title, content }
    if (planSyncTimerRef.current !== null) {
      window.clearTimeout(planSyncTimerRef.current)
    }
    planSyncTimerRef.current = window.setTimeout(() => {
      planSyncTimerRef.current = null
      flushPlanServerSync()
    }, 800)
  }

  function handleWorkspaceDocumentChange(next: { title: string; content: string }) {
    if (selectedTreeItemId === 'catalog') {
      setCatalogDocument((current) => {
        const fallbackTitle = current?.title ?? catalogPreview.title
        const nextTitle = next.title || fallbackTitle

        return {
          title: nextTitle,
          content: next.content,
          manualTitle: Boolean(nextTitle.trim()) && nextTitle.trim() !== catalogPreview.title,
          manualContent: next.content.trim() !== catalogPreview.content.trim(),
        }
      })
      setChapterSaveState('saved')
      setChapterSaveMessage('目录已更新。')
      return
    }

    if (selectedTreeItemId?.startsWith('plan:')) {
      const artifactId = selectedTreeItemId.slice('plan:'.length)
      const targetPlan = savedPlanFiles.find((plan) => plan.id === artifactId)
      updateAgentArtifact(artifactId, (current) => ({
        ...current,
        title: next.title.trim() || current.title,
        content: next.content,
        rawContent: next.content,
      }))
      setServerPlanFiles((current) =>
        current.map((plan) =>
          plan.id === artifactId ||
          Boolean(targetPlan?.backendArtifactId && plan.backendArtifactId === targetPlan.backendArtifactId)
            ? { ...plan, title: next.title.trim() || plan.title, content: next.content }
            : plan,
        ),
      )
      if (targetPlan?.backendArtifactId) {
        schedulePlanServerSync(
          targetPlan.backendArtifactId,
          next.title.trim() || targetPlan.title,
          next.content,
        )
      }
      setChapterSaveState('saved')
      setChapterSaveMessage('创作计划已更新。')
    }
  }

  function handleEnterImmersive() {
    setIsImmersive(true)
  }

  function handleOpenAssistant() {
    setActiveToolPanel('assistant')
  }

  function handleRequestDeleteChapterFromEditor() {
    if (!chapterDraft) {
      return
    }

    if (chapterDraft.status === 'published') {
      setWorkspaceDialog({
        title: '当前章节暂不可删除',
        description: '请先将章节下架后才可删除。',
        confirmLabel: '知道了',
        cancelLabel: '关闭',
        onConfirm: () => undefined,
      })
      return
    }

    setWorkspaceDialog({
      title: '确认删除章节',
      description: '章节删除后内容将会丢失，您真的确定要删除吗？',
      confirmLabel: '确定删除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        await handleDeleteChapter()
      },
    })
  }

  if (studioQuery.isError) {
    return (
      <Surface as="section" padding="lg" className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            创作中心暂时无法打开
          </h2>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">
            {studioQuery.error instanceof Error ? studioQuery.error.message : '请稍后重试。'}
          </p>
        </div>
        <Button onClick={() => studioQuery.refetch()} variant="secondary">
          <RefreshCcw className="h-4 w-4" />
          重新连接
        </Button>
      </Surface>
    )
  }

  if (studioQuery.isLoading || !novelForm || !projectNotes || !coverForm || !currentNovel) {
    return <StudioSkeleton />
  }

  const novelTitleState = resolveNovelTitleState(currentNovel)
  const novelTitle = novelTitleState.title
  const novelTitleMissing = novelTitleState.missing
  const chapterStatusLabel = chapterDraft ? chapterStatusLabelMap[chapterDraft.status] : '待开始'
  const wordCountLabel = formatWordCount(currentNovel.wordCount)
  const chapterCountLabel = `第 ${chapters.length} 章`
  const latestWordCountLabel = formatWordCount(latestWordCount)
  const coverLabel = currentNovel.coverAssetId ? '封面已设置' : '等待挑选封面'
  const novelSaveDisplayMessage =
    novelSaveState === 'saved' && novelLastSavedAt
      ? `已自动保存于 ${formatDateTime(novelLastSavedAt)}`
      : novelMessage
  const saveDisplayMessage =
    chapterSaveState === 'saved' && chapterLastSavedAt
      ? `已自动保存于 ${formatDateTime(chapterLastSavedAt)}`
      : chapterSaveMessage
  const previewTargetChapterId = selectedChapterId && !selectedChapterId.startsWith('local-')
    ? selectedChapterId
    : chapters[0]?.id
  const detailPreviewHref = `/novel/${currentNovel.id}?from=studio&returnTo=${encodeURIComponent(
    `/studio/novel/${currentNovel.id}`,
  )}`
  const previewHref = previewTargetChapterId
    ? `/novel/${currentNovel.id}/read/${previewTargetChapterId}?from=studio&returnTo=${encodeURIComponent(
        `/studio/novel/${currentNovel.id}`,
      )}`
    : undefined

  // Agent Loop 新链路：首次发送前懒创建会话，并同步任务窗口状态
  async function ensureAgentLoopSession(): Promise<string> {
    if (agentSessionId) {
      return agentSessionId
    }

    const currentTaskWindow = activeAgentTaskWindow
    const createdSession = await createWritingAgentSession(
      activeNovelId,
      currentTaskWindow?.customNamed ? currentTaskWindow.title : undefined,
    )
    setAgentSessionId(createdSession.id)
    setActiveAgentTaskWindowId(createdSession.id)
    setAgentTaskWindows((current) =>
      current.map((taskWindow) =>
        taskWindow.id === currentTaskWindow?.id
          ? {
              ...taskWindow,
              id: createdSession.id,
              sessionId: createdSession.id,
              title: taskWindow.customNamed ? taskWindow.title : createdSession.title,
              temporary: false,
              loaded: true,
              updatedAt: createdSession.updatedAt,
              createdAt: createdSession.createdAt,
            }
          : taskWindow,
      ),
    )
    return createdSession.id
  }

  function renderWritingAgent(close?: () => void, showCloseAction = true) {
    return (
      <AgentPanel
          sessionId={agentSessionId}
          novelId={activeNovelId}
          chapterId={
            selectedChapterId && !selectedChapterId.startsWith('local-') ? selectedChapterId : null
          }
          selection={editorSelection.text.trim() ? editorSelection : null}
          ensureSession={ensureAgentLoopSession}
          onStreamEvent={handleAgentStreamEvent}
          pendingReviewCount={pendingChapterReviews.length + (pendingPlanReview ? 1 : 0)}
          reviewBusy={pendingChapterReviewBusy || pendingPlanReviewBusy}
          onApproveAllReviews={handleApproveAllPendingReviews}
          onRejectAllReviews={handleRequestRejectAllPendingReviews}
          onSelectSession={(nextSessionId) => {
            setAgentSessionId(nextSessionId)
            setActiveAgentTaskWindowId(nextSessionId)
          }}
          onSessionDeleted={(deletedSessionId) => {
            // 删除会话成功后同步移除对应任务窗口，避免僵尸 sessionId 写回本地快照后反复 404
            setAgentTaskWindows((current) =>
              current.filter(
                (taskWindow) => taskWindow.sessionId !== deletedSessionId && taskWindow.id !== deletedSessionId,
              ),
            )
          }}
          onNewSession={() => {
            // 新建任务对话：建本地任务窗口并激活（sessionId 为 null，首次发送时懒创建）；
            // 不能只清空 activeAgentTaskWindowId，否则会被兜底 effect 回选第一个窗口覆盖
            const nextTaskWindow = createLocalAgentTaskWindow()
            pruneTemporaryTaskWindows(nextTaskWindow.id)
            setAgentTaskWindows((current) => [nextTaskWindow, ...current])
            applyAgentTaskWindowState(nextTaskWindow)
          }}
          onWorkspaceRollback={() => void refreshWorkspaceAfterAgentWrite()}
          onClose={showCloseAction ? close : undefined}
        />
      )
  }

  function renderAgentTaskSidebar(force = false) {
    if (!force && !showAgentTaskList) {
      return null
    }

    return (
      <AgentTaskSidebar
        taskWindows={agentTaskWindows.map((taskWindow) => ({
          id: taskWindow.id,
          title: taskWindow.title,
          updatedAt: taskWindow.updatedAt,
          temporary: taskWindow.temporary,
          prompt: taskWindow.prompt,
          artifactsCount: taskWindow.artifacts.length,
        }))}
        activeTaskWindowId={activeAgentTaskWindowId}
        taskSwitchLocked={agentRunState.active}
        fallbackDescription={chapterTitle || '查看这轮任务的完整上下文。'}
        onCreateTaskWindow={handleCreateAgentTaskWindow}
        onSelectTaskWindow={(taskWindowId) => void handleSelectAgentTaskWindow(taskWindowId)}
        onRenameTaskWindow={(taskWindowId, title) => void handleRenameAgentTaskWindow(taskWindowId, title)}
        onDeleteTaskWindow={handleDeleteAgentTaskWindow}
      />
    )
  }

  function renderCoverToolPanel(close?: () => void) {
    if (!coverForm || !currentNovel) {
      return null
    }

    return (
      <Surface as="section" padding="md" className="flex h-full min-h-0 flex-col overflow-hidden md:w-[24rem] xl:w-[26rem]">
        <CoverPanel
          coverForm={coverForm}
          coverAssets={coverAssets}
          selectedCover={selectedCover}
          currentCoverId={currentNovel.coverAssetId}
          coverKeywords={coverKeywords}
          coverMessage={coverMessage}
          generatingPrompt={coverPromptMutation.isPending}
          generatingImage={coverGenerationBusy}
          generationProgress={coverGenerationProgress}
          selectingCover={coverSelectMutation.isPending}
          formatDateTime={formatDateTime}
          onChange={setCoverForm}
          onUploadFile={handleOpenCoverCropDialog}
          onGeneratePrompt={() => coverPromptMutation.mutate()}
          onGenerateImages={() => coverImageMutation.mutate()}
          onSelectAsset={setSelectedCoverId}
          onApplyCover={() => selectedCover && coverSelectMutation.mutate(selectedCover)}
          onApplyAsset={(asset) => coverSelectMutation.mutate(asset)}
          onDownloadAsset={handleDownloadCoverAsset}
          onClose={close ?? (() => setActiveToolPanel(null))}
        />
      </Surface>
    )
  }

  function renderToolPanel() {
    if (!activeToolPanel) {
      return null
    }

    if (activeToolPanel === 'cover') {
      return renderCoverToolPanel(() => setActiveToolPanel(null))
    }

    return (
      <Surface as="section" padding="md" className="flex h-full min-h-0 flex-col overflow-hidden">
        {activeToolPanel === 'meta' && novelForm ? (
          <MetaPanel
            novelForm={novelForm}
            wordCountLabel={wordCountLabel}
            chapterCountLabel={chapterCountLabel}
            coverLabel={coverLabel}
            message={novelSaveDisplayMessage}
            saving={saveNovelMutation.isPending}
            onChange={setNovelForm}
            onRequestVisibilityAction={handleRequestNovelVisibilityAction}
            onRequestStatusAction={handleRequestNovelStatusAction}
            detailPreviewHref={detailPreviewHref}
            onOpenCover={() => setActiveToolPanel('cover')}
            onSave={handleSaveNovel}
            onClose={() => setActiveToolPanel(null)}
          />
        ) : null}
        {activeToolPanel === 'assistant' ? renderWritingAgent(() => setActiveToolPanel(null)) : null}
      </Surface>
    )
  }

  return (
    <>
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-platform={platformCapabilities.native ? 'app' : 'web'}
        data-visual-viewport={platformCapabilities.visualViewport ? 'supported' : 'fallback'}
      >
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <div className="flex shrink-0 items-center gap-2 px-0.5 pb-2 pt-1">
            {mobileView === 'cover' || mobileView === 'meta' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMobileView('assistant')}
                  className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full pl-1.5 pr-3 text-sm font-medium text-[var(--text-secondary)] transition-colors active:bg-[var(--surface-muted)]"
                >
                  <ChevronLeft className="h-5 w-5" />
                  返回
                </button>
                <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--text-primary)]">
                  {mobileView === 'cover' ? '封面工坊' : '作品设置'}
                </p>
              </>
            ) : (
              <>
                {/* 作品选择器占满剩余宽度，作品名尽量完整显示；右侧保存状态保持短标签 */}
                <div className="min-w-0 flex-1">
                  <WorkspaceNovelSwitcher
                    currentNovelId={currentNovel.id}
                    currentNovelTitle={novelTitle}
                    novels={novelOptions}
                    busy={createNovelMutation.isPending}
                    loading={myNovelsQuery.isLoading}
                    onSelectNovel={handleSelectWorkspaceNovel}
                    onCreateNovel={handleCreateWorkspaceNovel}
                    fullWidth
                  />
                </div>
              </>
            )}
            {/* 保存状态不参与压缩；已保存时只显示短文案，具体时间点击后用 toast 告知 */}
            <div className="shrink-0">
              <SaveStatusPill
                state={chapterSaveState}
                message={saveDisplayMessage}
                onRetry={handleRetrySave}
                compact
                shortMessage={chapterSaveState === 'saved' ? '已自动保存' : undefined}
                onPress={() => toast.info(saveDisplayMessage)}
              />
            </div>
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">

            {mobileView === 'editor' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <EditorCanvas
                  variant="mobile"
                  chapterDraft={chapterDraft}
                  workspaceDocument={activeWorkspaceDocument}
                  chapterLoading={chapterQuery.isLoading}
                  chapterErrorMessage={chapterQuery.isError ? chapterSaveMessage : null}
                  chapterSaveState={chapterSaveState}
                  chapterSaveMessage={saveDisplayMessage}
                  latestWordCountLabel={latestWordCountLabel}
                  selectedCommentCount={activeChapterListItem?.commentCount ?? 0}
                  onSelectionChange={setEditorSelection}
                  onSave={() => void persistChapter('manual')}
                  onEnterImmersive={handleEnterImmersive}
                  onRetryLoad={() => chapterQuery.refetch()}
                  onCreateChapter={handleRequestCreateChapter}
                  onOpenChapterSettings={() => setEditorChapterSettingsOpen(true)}
                  onOpenPlanSettings={() => {
                    if (selectedTreeItemId?.startsWith('plan:')) {
                      setPlanSettingsPlanId(selectedTreeItemId.slice('plan:'.length))
                    }
                  }}
                  onPublishNovel={handlePublishNovel}
                  novelPublished={novelForm?.status === 'published'}
                  onStatusChange={handleEditorStatusChange}
                  onChange={handleChapterDraftChange}
                  onWorkspaceDocumentChange={handleWorkspaceDocumentChange}
                  onRetrySave={handleRetrySave}
                  onEditorBlur={handleEditorBlurFlush}
                  pendingChapterReview={activeChapterPendingReview}
                  pendingChapterReviewBusy={pendingChapterReviewBusy}
                  onKeepPendingReview={() => {
                    if (activeChapterPendingReview) {
                      handleKeepPendingChapterReview(activeChapterPendingReview)
                    }
                  }}
                  onRevertPendingReview={() => {
                    if (activeChapterPendingReview) {
                      handleRequestRejectPendingChapterReview(activeChapterPendingReview)
                    }
                  }}
                  onAcceptReviewHunk={(hunkIndex) => {
                    if (activeChapterPendingReview) {
                      handleAcceptReviewHunk(activeChapterPendingReview, hunkIndex)
                    }
                  }}
                  onRejectReviewHunk={(hunkIndex) => {
                    if (activeChapterPendingReview) {
                      handleRequestRejectReviewHunk(activeChapterPendingReview, hunkIndex)
                    }
                  }}
                  reviewFileIndex={activeReviewFileIndex}
                  reviewFileCount={reviewFileCount}
                  onNavigateReviewFile={handleNavigateReviewFile}
                  pendingReviewRemaining={!activeChapterPendingReview && selectedChapterId === reviewHandoffChapterId ? reviewFileCount : 0}
                  onGoToNextReviewFile={() => handleNavigateReviewFile(1)}
                  pendingPlanReview={activePlanPendingReview}
                  pendingPlanReviewBusy={pendingPlanReviewBusy}
                  onKeepPendingPlanReview={handleKeepPendingPlanReview}
                  onRevertPendingPlanReview={handleRequestRejectPendingPlanReview}
                  onAcceptPlanReviewHunk={handleAcceptPlanReviewHunk}
                  onRejectPlanReviewHunk={handleRequestRejectPlanReviewHunk}
                />
              </div>
            ) : null}

            {mobileView === 'chapters' ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
                <ChapterSidebar
                  embedded
                  chapters={chapters}
                  volumes={volumes}
                  savedPlans={savedPlanFiles}
                  selectedChapterId={selectedChapterId}
                  selectedTreeItemId={selectedTreeItemId}
                  catalogPreview={catalogPreview}
                  novelWordCountLabel={wordCountLabel}
                  chapterCountLabel={chapterCountLabel}
                  novelTitle={novelTitle}
                  activeCoverLabel={coverLabel}
                  onSelectChapter={handleSelectChapter}
                  onSelectPlan={handleSelectPlanFromTree}
                  onOpenChapterSettings={(chapterId) => handleSelectChapter(chapterId, { openSettings: true })}
                  onOpenPlanSettings={setPlanSettingsPlanId}
                  onSelectCatalog={handleSelectCatalogFromTree}
                  onCreateChapter={handleRequestCreateChapter}
                  onCreatePlan={handleRequestCreatePlan}
                />
              </div>
            ) : null}

            {mobileView === 'assistant' ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {renderWritingAgent(undefined, false)}
              </div>
            ) : null}

            {mobileView === 'cover' ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {renderCoverToolPanel(() => setMobileView('assistant'))}
              </div>
            ) : null}

            {mobileView === 'meta' ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 pb-4">
                <MetaPanel
                  novelForm={novelForm}
                  wordCountLabel={wordCountLabel}
                  chapterCountLabel={chapterCountLabel}
                  coverLabel={coverLabel}
                  message={novelSaveDisplayMessage}
                  saving={saveNovelMutation.isPending}
                  onChange={setNovelForm}
                  onRequestVisibilityAction={handleRequestNovelVisibilityAction}
                  onRequestStatusAction={handleRequestNovelStatusAction}
                  detailPreviewHref={detailPreviewHref}
                  onOpenCover={() => setMobileView('cover')}
                  onSave={handleSaveNovel}
                  onClose={() => setMobileView('assistant')}
                />
              </div>
            ) : null}
          </div>

          {/* 软键盘打开时由 index.css 的 html.keyboard-open .studio-bottom-nav 规则隐藏，
              让 Agent 输入框自然落到收缩视口底部（键盘上方），底栏不再被顶起占位 */}
          <nav className="studio-bottom-nav flex shrink-0 items-stretch justify-around gap-1 border-t border-[var(--border-subtle)] bg-[var(--surface-default)] px-2 pb-[max(var(--safe-bottom),4px)] pt-1">
              {/* 退出创作区固定回首页：创作区常常是从章节/详情等多级页面进来的，回退一步会落回中间页 */}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] px-2 text-[11px] leading-4 text-[var(--text-tertiary)] transition-colors active:text-[var(--text-primary)]"
              >
                <LogOut className="h-5 w-5 rotate-180" />
                退出
              </button>
              {(
                [
                  { key: 'assistant', label: '工作台', icon: MessageSquareText },
                  { key: 'editor', label: '写作', icon: PenLine },
                  { key: 'chapters', label: '卷章', icon: BookOpenText },
                ] as Array<{ key: MobileView; label: string; icon: typeof PenLine }>
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setMobileView(key)
                    if (key === 'assistant') setWorkspacePerspective('work')
                    if (key === 'editor' || key === 'chapters') setWorkspacePerspective('ide')
                  }}
                  className={cn(
                    'flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] px-2 text-[11px] leading-4 transition-colors',
                    mobileView === key
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-tertiary)] active:text-[var(--text-primary)]',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMobileMoreOpen(true)}
                className={cn(
                  'flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] px-2 text-[11px] leading-4 transition-colors',
                  mobileMoreOpen || mobileView === 'cover' || mobileView === 'meta'
                    ? 'font-medium text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] active:text-[var(--text-primary)]',
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                更多
              </button>
          </nav>

          <BottomSheet
            open={mobileMoreOpen}
            onClose={() => setMobileMoreOpen(false)}
            title={novelTitleMissing ? '未命名作品' : novelTitle}
          >
            <div className="space-y-0.5 px-3 pt-1">
              {(
                [
                  { key: 'meta', label: novelTitleMissing ? '去命名作品' : '作品设置', icon: Settings2, action: () => setMobileView('meta') },
                  { key: 'cover', label: '封面工坊', icon: ImagePlus, action: () => setMobileView('cover') },
                  ...(featureFlags.memory2
                    ? [{ key: 'memory', label: '记忆审核', icon: BrainCircuit, action: () => setMemoryReviewOpen(true) }]
                    : []),
                  { key: 'publish', label: novelForm?.status === 'published' ? '更新发布' : '发布作品', icon: Upload, action: () => handlePublishNovel() },
                  { key: 'immersive', label: '沉浸创作', icon: WandSparkles, action: () => handleEnterImmersive() },
                  { key: 'detail', label: '作品页', icon: BookOpenText, action: () => navigate(detailPreviewHref) },
                  { key: 'export', label: '一键导出', icon: FolderDown, action: () => setExportDialogOpen(true) },
                  ...(previewHref
                    ? [{ key: 'preview', label: '预览阅读', icon: BookOpen, action: () => navigate(previewHref) }]
                    : []),
                  { key: 'create-chapter', label: '新建章节', icon: FileText, action: () => handleRequestCreateChapter() },
                  // 删除条件与电脑端一致：仅草稿或已下架可删，已发布时仍可点击但只给 toast 提示
                  {
                    key: 'delete-novel',
                    label: '删除作品',
                    icon: Trash2,
                    action: () => handleRequestDeleteNovel(),
                    danger: true,
                    disabled: deleteNovelMutation.isPending,
                  },
                ] as Array<{
                  key: string
                  label: string
                  icon: typeof PenLine
                  action: () => void
                  danger?: boolean
                  disabled?: boolean
                }>
              ).map(({ key, label, icon: Icon, action, danger, disabled }) => (
                <Fragment key={key}>
                  {danger ? <div className="my-1 border-t border-[var(--border-subtle)]" /> : null}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setMobileMoreOpen(false)
                      action()
                    }}
                    className={cn(
                      'flex min-h-[48px] w-full items-center gap-3 rounded-[16px] px-3 text-left text-[15px] transition-colors disabled:opacity-45',
                      danger
                        ? 'text-[rgb(153,27,27)] active:bg-[rgba(127,29,29,0.08)]'
                        : 'text-[var(--text-primary)] active:bg-[var(--surface-muted)]',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5 shrink-0',
                        danger ? 'text-[rgb(153,27,27)]' : 'text-[var(--text-secondary)]',
                      )}
                    />
                    {label}
                  </button>
                </Fragment>
              ))}
            </div>
          </BottomSheet>
        </div>

        <div className="hidden min-h-0 flex-1 flex-col lg:flex">
          <StudioToolbar
            currentNovelId={currentNovel.id}
            novelTitle={novelTitle}
            novelTitleMissing={novelTitleMissing}
            novelOptions={novelOptions}
            novelsLoading={myNovelsQuery.isLoading}
            chapterTitle={chapterTitle}
            chapterStatusLabel={chapterStatusLabel}
            wordCountLabel={latestWordCountLabel}
            saveState={chapterSaveState}
            saveMessage={saveDisplayMessage}
            onRetrySave={chapterSaveState === 'error' ? handleRetrySave : undefined}
            onOpenMeta={() => setActiveToolPanel('meta')}
            onOpenAssistant={handleOpenAssistant}
            onOpenCover={() => setActiveToolPanel('cover')}
            onEnterImmersive={handleEnterImmersive}
            onSaveNovel={handleSaveNovel}
            onPublishNovel={handlePublishNovel}
            onDeleteNovel={handleRequestDeleteNovel}
            onExport={() => setExportDialogOpen(true)}
            onSelectNovel={handleSelectWorkspaceNovel}
            onCreateNovel={handleCreateWorkspaceNovel}
            onEditNovelTitle={() => setActiveToolPanel('meta')}
            detailPreviewHref={detailPreviewHref}
            previewHref={previewHref}
            immersiveDisabled={false}
            switchingNovel={createNovelMutation.isPending}
            novelSaving={saveNovelMutation.isPending || deleteNovelMutation.isPending}
            novelDirty={novelDirty}
            novelPublished={novelForm?.status === 'published'}
            perspective={workspacePerspective}
            onPerspectiveChange={setWorkspacePerspective}
            perspectiveSwitchEnabled={featureFlags.dualWorkspace}
          />

          <div className="mt-4 min-h-0 flex-1 overflow-hidden pb-2">
            {featureFlags.dualWorkspace && workspacePerspective === 'work' ? (
              <WorkPerspective
                taskRail={<div className="h-full [&>aside]:w-full [&>aside]:border-l-0">{renderAgentTaskSidebar(true)}</div>}
                conversation={<div className="h-full min-h-0 px-5 py-4">{renderWritingAgent(undefined, false)}</div>}
                novelTitle={novelTitle}
                chapterTitle={chapterTitle}
                chapterCount={chapters.length}
                wordCount={latestWordCountLabel}
                pendingReviewCount={pendingChapterReviews.length + (pendingPlanReview ? 1 : 0)}
                activeArtifactTitle={agentArtifacts.find((artifact) => artifact.id === activeAgentArtifactId)?.title ?? null}
                onOpenIde={() => setWorkspacePerspective('ide')}
                onOpenMemoryReview={featureFlags.memory2 ? () => setMemoryReviewOpen(true) : undefined}
              />
            ) : (
            <IdePerspective treeWidth={panelWidths.tree}>
              <div className="relative min-h-0 border-r border-[var(--border-subtle)]">
                <ChapterSidebar
                  embedded
                  chapters={chapters}
                  volumes={volumes}
                  savedPlans={savedPlanFiles}
                  selectedChapterId={selectedChapterId}
                  selectedTreeItemId={selectedTreeItemId}
                  catalogPreview={catalogPreview}
                  novelWordCountLabel={wordCountLabel}
                  chapterCountLabel={chapterCountLabel}
                  novelTitle={novelTitle}
                  activeCoverLabel={coverLabel}
                  onSelectChapter={handleSelectChapter}
                  onSelectPlan={handleSelectPlanFromTree}
                  onOpenChapterSettings={(chapterId) => handleSelectChapter(chapterId, { openSettings: true })}
                  onOpenPlanSettings={setPlanSettingsPlanId}
                  onSelectCatalog={handleSelectCatalogFromTree}
                  onCreateChapter={handleRequestCreateChapter}
                  onCreatePlan={handleRequestCreatePlan}
                />
                <PanelResizeHandle
                  panel="tree"
                  side="right"
                  label="拖拽调整章节树宽度"
                  onBegin={beginPanelResize}
                />
              </div>

              <div className="min-h-0 border-r border-[var(--border-subtle)] bg-[var(--surface-default)]">
                <EditorCanvas
                  embedded
                  chapterDraft={chapterDraft}
                  workspaceDocument={activeWorkspaceDocument}
                  chapterLoading={chapterQuery.isLoading}
                  chapterErrorMessage={chapterQuery.isError ? chapterSaveMessage : null}
                  chapterSaveState={chapterSaveState}
                  chapterSaveMessage={saveDisplayMessage}
                  latestWordCountLabel={latestWordCountLabel}
                  selectedCommentCount={activeChapterListItem?.commentCount ?? 0}
                  onSelectionChange={setEditorSelection}
                  onSave={() => void persistChapter('manual')}
                  onEnterImmersive={handleEnterImmersive}
                  onRetryLoad={() => chapterQuery.refetch()}
                  onCreateChapter={handleRequestCreateChapter}
                  onOpenChapterSettings={() => setEditorChapterSettingsOpen(true)}
                  onOpenPlanSettings={() => {
                    if (selectedTreeItemId?.startsWith('plan:')) {
                      setPlanSettingsPlanId(selectedTreeItemId.slice('plan:'.length))
                    }
                  }}
                  onPublishNovel={handlePublishNovel}
                  novelPublished={novelForm?.status === 'published'}
                  onStatusChange={handleEditorStatusChange}
                  onChange={handleChapterDraftChange}
                  onWorkspaceDocumentChange={handleWorkspaceDocumentChange}
                  onRetrySave={handleRetrySave}
                  onEditorBlur={handleEditorBlurFlush}
                  pendingChapterReview={activeChapterPendingReview}
                  pendingChapterReviewBusy={pendingChapterReviewBusy}
                  onKeepPendingReview={() => {
                    if (activeChapterPendingReview) {
                      handleKeepPendingChapterReview(activeChapterPendingReview)
                    }
                  }}
                  onRevertPendingReview={() => {
                    if (activeChapterPendingReview) {
                      handleRequestRejectPendingChapterReview(activeChapterPendingReview)
                    }
                  }}
                  onAcceptReviewHunk={(hunkIndex) => {
                    if (activeChapterPendingReview) {
                      handleAcceptReviewHunk(activeChapterPendingReview, hunkIndex)
                    }
                  }}
                  onRejectReviewHunk={(hunkIndex) => {
                    if (activeChapterPendingReview) {
                      handleRequestRejectReviewHunk(activeChapterPendingReview, hunkIndex)
                    }
                  }}
                  reviewFileIndex={activeReviewFileIndex}
                  reviewFileCount={reviewFileCount}
                  onNavigateReviewFile={handleNavigateReviewFile}
                  pendingReviewRemaining={!activeChapterPendingReview && selectedChapterId === reviewHandoffChapterId ? reviewFileCount : 0}
                  onGoToNextReviewFile={() => handleNavigateReviewFile(1)}
                  pendingPlanReview={activePlanPendingReview}
                  pendingPlanReviewBusy={pendingPlanReviewBusy}
                  onKeepPendingPlanReview={handleKeepPendingPlanReview}
                  onRevertPendingPlanReview={handleRequestRejectPendingPlanReview}
                  onAcceptPlanReviewHunk={handleAcceptPlanReviewHunk}
                  onRejectPlanReviewHunk={handleRequestRejectPlanReviewHunk}
                />
              </div>

              <div className="relative flex h-full min-h-0 overflow-hidden bg-[var(--app-bg)]">
                <PanelResizeHandle
                  panel="agent"
                  side="left"
                  label="拖拽调整 Agent 对话区宽度"
                  onBegin={beginPanelResize}
                />
                <div
                  className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden px-4 py-4"
                  style={{ width: panelWidths.agent }}
                >
                  {renderWritingAgent(undefined, false)}
                </div>
                {renderAgentTaskSidebar()}
              </div>
            </IdePerspective>
            )}
          </div>

          {activeToolPanel && activeToolPanel !== 'assistant' ? (
            <div className="fixed inset-0 z-40 hidden bg-[rgba(15,23,42,0.18)] md:block" onClick={() => setActiveToolPanel(null)}>
              <div className="absolute inset-y-4 right-4 w-[24rem] max-w-[calc(100vw-2rem)] xl:w-[26rem]" onClick={(event) => event.stopPropagation()}>
                {renderToolPanel()}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {isImmersive ? (
        <ImmersiveComposer
          currentNovelId={currentNovel.id}
          novelTitle={novelTitle}
          novelTitleMissing={novelTitleMissing}
          novelOptions={novelOptions}
          novelsLoading={myNovelsQuery.isLoading}
          chapterDraft={chapterDraft}
          chapters={chapters}
          volumes={volumes}
          savedPlans={savedPlanFiles}
          selectedChapterId={selectedChapterId}
          selectedTreeItemId={selectedTreeItemId}
          catalogPreview={catalogPreview}
          workspaceDocument={activeWorkspaceDocument}
          saveState={chapterSaveState}
          saveMessage={saveDisplayMessage}
          wordCountLabel={latestWordCountLabel}
          onClose={() => setIsImmersive(false)}
          onSave={() => void persistChapter('manual')}
          onRetrySave={chapterSaveState === 'error' ? handleRetrySave : undefined}
          onSelectNovel={handleSelectWorkspaceNovel}
          onCreateNovel={handleCreateWorkspaceNovel}
          onEditNovelTitle={() => setActiveToolPanel('meta')}
          detailPreviewHref={detailPreviewHref}
          previewHref={previewHref}
          onExport={() => setExportDialogOpen(true)}
          onSelectChapter={handleSelectChapter}
          onSelectPlan={handleSelectPlanFromTree}
          onDeletePlan={handleRequestDeletePlan}
          onOpenChapterSettings={(chapterId) => handleSelectChapter(chapterId, { openSettings: true })}
          onRenamePlan={handleRenamePlan}
          onSelectCatalog={handleSelectCatalogFromTree}
          onCreateChapter={handleRequestCreateChapter}
          onCreatePlan={handleRequestCreatePlan}
          onDeleteChapter={() => void handleDeleteChapter()}
          onChange={handleChapterDraftChange}
          onWorkspaceDocumentChange={handleWorkspaceDocumentChange}
          onSelectionChange={setEditorSelection}
          pendingChapterReview={activeChapterPendingReview}
          pendingChapterReviewBusy={pendingChapterReviewBusy}
          onKeepPendingReview={() => {
            if (activeChapterPendingReview) {
              handleKeepPendingChapterReview(activeChapterPendingReview)
            }
          }}
          onRevertPendingReview={() => {
            if (activeChapterPendingReview) {
              handleRequestRejectPendingChapterReview(activeChapterPendingReview)
            }
          }}
          onAcceptReviewHunk={(hunkIndex) => {
            if (activeChapterPendingReview) {
              handleAcceptReviewHunk(activeChapterPendingReview, hunkIndex)
            }
          }}
          onRejectReviewHunk={(hunkIndex) => {
            if (activeChapterPendingReview) {
              handleRequestRejectReviewHunk(activeChapterPendingReview, hunkIndex)
            }
          }}
          reviewFileIndex={activeReviewFileIndex}
          reviewFileCount={reviewFileCount}
          onNavigateReviewFile={handleNavigateReviewFile}
          pendingReviewRemaining={!activeChapterPendingReview && selectedChapterId === reviewHandoffChapterId ? reviewFileCount : 0}
          onGoToNextReviewFile={() => handleNavigateReviewFile(1)}
          pendingPlanReview={activePlanPendingReview}
          pendingPlanReviewBusy={pendingPlanReviewBusy}
          onKeepPendingPlanReview={handleKeepPendingPlanReview}
          onRevertPendingPlanReview={handleRequestRejectPendingPlanReview}
          onAcceptPlanReviewHunk={handleAcceptPlanReviewHunk}
          onRejectPlanReviewHunk={handleRequestRejectPlanReviewHunk}
          onOpenCover={() => setActiveToolPanel((current) => (current === 'cover' ? null : 'cover'))}
          onOpenMeta={() => {
            // 与封面按钮一致：在沉浸层内直接展开/收起作品设置面板，不退出沉浸
            setActiveToolPanel((current) => (current === 'meta' ? null : 'meta'))
          }}
          onPublishNovel={handlePublishNovel}
          onDeleteNovel={handleRequestDeleteNovel}
          novelPublished={novelForm?.status === 'published'}
          novelSaving={saveNovelMutation.isPending || deleteNovelMutation.isPending}
          agentPanel={renderWritingAgent(undefined, false)}
          taskSidebar={renderAgentTaskSidebar()}
          coverPanel={renderCoverToolPanel(() => setActiveToolPanel(null))}
          showCoverPanel={activeToolPanel === 'cover'}
          metaPanel={
            novelForm ? (
              <Surface as="section" padding="md" className="flex h-full min-h-0 flex-col overflow-hidden md:w-[24rem] xl:w-[26rem]">
                <MetaPanel
                  novelForm={novelForm}
                  wordCountLabel={wordCountLabel}
                  chapterCountLabel={chapterCountLabel}
                  coverLabel={coverLabel}
                  message={novelSaveDisplayMessage}
                  saving={saveNovelMutation.isPending}
                  onChange={setNovelForm}
                  onRequestVisibilityAction={handleRequestNovelVisibilityAction}
                  onRequestStatusAction={handleRequestNovelStatusAction}
                  detailPreviewHref={detailPreviewHref}
                  onOpenCover={() => setActiveToolPanel('cover')}
                  onSave={handleSaveNovel}
                  onClose={() => setActiveToolPanel(null)}
                />
              </Surface>
            ) : null
          }
          showMetaPanel={activeToolPanel === 'meta'}
          switchingNovel={createNovelMutation.isPending}
        />
      ) : null}
      {editorChapterSettingsOpen && chapterDraft ? (
        <ChapterSettingsPanel
          chapterDraft={chapterDraft}
          onChange={handleChapterDraftChange}
          onRequestStatusAction={handleRequestChapterStatusAction}
          onRequestVisibilityAction={handleRequestChapterVisibilityAction}
          onRequestDelete={handleRequestDeleteChapterFromEditor}
          onClose={() => setEditorChapterSettingsOpen(false)}
        />
      ) : null}
      {planSettingsPlan ? (
        <PlanSettingsPanel
          plan={planSettingsPlan}
          onRename={(title) => handleRenamePlan(planSettingsPlan.id, title)}
          onRequestDelete={() => {
            setPlanSettingsPlanId(null)
            handleRequestDeletePlan(planSettingsPlan.id)
          }}
          onClose={() => setPlanSettingsPlanId(null)}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(workspaceDialog)}
        title={workspaceDialog?.title ?? ''}
        description={workspaceDialog?.description ?? ''}
        confirmLabel={workspaceDialog?.confirmLabel}
        cancelLabel={workspaceDialog?.cancelLabel}
        tone={workspaceDialog?.tone}
        busy={workspaceDialogBusy}
        onCancel={() => {
          if (workspaceDialogBusy) {
            return
          }
          setWorkspaceDialog(null)
        }}
        onConfirm={() => void handleWorkspaceDialogConfirm()}
      />
      <PublishNovelDialog
        open={publishDialogOpen}
        novelTitle={novelForm?.title ?? currentNovel?.title ?? ''}
        chapters={chapters}
        busy={publishNovelMutation.isPending}
        onCancel={() => {
          if (!publishNovelMutation.isPending) {
            setPublishDialogOpen(false)
          }
        }}
        onConfirm={(chapterIds, visibility) => publishNovelMutation.mutate({ chapterIds, visibility })}
      />
      <ExportDialog
        open={exportDialogOpen}
        novelId={currentNovel.id}
        novelTitle={novelForm?.title ?? currentNovel?.title ?? ''}
        chapters={chapters}
        onClose={() => setExportDialogOpen(false)}
      />
      <NovelCoverCropDialog
        open={Boolean(pendingCoverUploadFile)}
        file={pendingCoverUploadFile}
        busy={coverUploadMutation.isPending}
        onClose={() => {
          if (!coverUploadMutation.isPending) {
            setPendingCoverUploadFile(null)
          }
        }}
        onConfirm={(crop) => coverUploadMutation.mutate(crop)}
      />
      {featureFlags.changeSet ? <ChangeSetDrawer
        changeSetId={activeChangeSetId}
        novelId={currentNovel.id}
        chapters={chapters}
        onClose={() => setActiveChangeSetId(null)}
        onChanged={refreshWorkspaceAfterAgentWrite}
      /> : null}
      {featureFlags.memory2 ? <MemoryReviewDrawer open={memoryReviewOpen} novelId={currentNovel.id} onClose={() => setMemoryReviewOpen(false)} /> : null}
    </>
  )
}

