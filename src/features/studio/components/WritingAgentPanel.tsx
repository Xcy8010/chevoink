import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Check,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FilePlus2,
  Hash,
  ImagePlus,
  LoaderCircle,
  Mic,
  MicOff,
  PanelLeftOpen,
  RotateCcw,
  Save,
  SquarePlus,
  Sparkles,
  Square,
  Trash2,
  Upload,
  WandSparkles,
} from 'lucide-react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { type CoverAsset } from '../../../../shared/contracts/index.js'
import ImageLightbox from './ImageLightbox'

import {
  agentArtifactLabelMap,
  type AgentArtifact,
  type AgentMemoryEntry,
  type AgentRunState,
  type AgentRunStatusMode,
  type AgentRunStatusItem,
  type AgentTab,
  type AgentTaskType,
} from '../types'

type WritingAgentPanelProps = {
  activeTab: AgentTab
  activeTask: AgentTaskType
  prompt: string
  runState: AgentRunState
  runStatusMode: AgentRunStatusMode
  runStatuses: AgentRunStatusItem[]
  memoryEntries: AgentMemoryEntry[]
  artifacts: AgentArtifact[]
  activeArtifactId: string | null
  selectedTextLength: number
  canSavePlan: boolean
  canApplyCoverPrompt: boolean
  canReplaceChapter: boolean
  canAppendChapter: boolean
  supportsBackendChapterApply: boolean
  voiceInputSupported: boolean
  voiceInputActive: boolean
  novelPublished: boolean
  taskWindows: Array<{
    id: string
    title: string
    updatedAt: string
    temporary: boolean
    prompt: string
    artifactsCount: number
  }>
  activeTaskWindowId: string | null
  showTaskList: boolean
  taskSwitchLocked: boolean
  coverPreviewAssetsByArtifactId: Record<string, CoverAsset[]>
  generatingCoverArtifactId: string | null
  selectingCover: boolean
  onPromptChange: (value: string) => void
  onRun: () => void
  onStop: () => void
  onRollback: (artifactId: string) => void
  onCopyPrompt: (artifactId: string) => void
  onCopyResult: (artifactId: string) => void
  onRetryArtifact: (artifactId: string) => void
  onDeleteResult: (artifactId: string) => void
  onInsertPolishPrompt: () => void
  onToggleVoiceInput: () => void
  onExecuteWorkspaceAction: (actionId: WorkspaceActionId) => void
  onExecuteHandoff: (artifactId: string) => void
  onSelectArtifact: (artifactId: string) => void
  onCreateTaskWindow: () => void
  onToggleTaskList: () => void
  onSavePlan: (artifactId: string) => void
  onApplyCoverPrompt: (artifactId: string) => void
  onGenerateCoverFromArtifact: (artifactId: string) => void
  onOpenCoverPanel: () => void
  onDownloadCoverAsset: (asset: CoverAsset) => void
  onApplyGeneratedCoverAsset: (artifactId: string, asset: CoverAsset) => void
  onReplaceChapterContent: (artifactId: string) => void
  onAppendToChapter: (artifactId: string) => void
  onClose?: () => void
  showCloseAction?: boolean
}

type AgentAbilityItem = {
  task: AgentTaskType
  command: string
  title: string
  description: string
  aliases: string[]
}

type ArtifactSummary = {
  added: string[]
  changed: string[]
}

type LiveStepItem = {
  id: string
  label: string
  text: string
  state: 'done' | 'active' | 'success' | 'error'
}

type WorkspaceActionId =
  | 'save_novel'
  | 'publish_novel'
  | 'archive_novel'
  | 'delete_novel'
  | 'open_meta'
  | 'open_cover'
  | 'create_chapter'

type WorkspaceActionSuggestion = {
  id: WorkspaceActionId
  label: string
  description: string
  tone?: 'default' | 'danger'
}

const AGENT_INPUT_GUIDE = "您正在与Agent对话，输入“#”获得更多能力，如“#计划”，“#封面”。"

const agentAbilityItems: AgentAbilityItem[] = [
  {
    task: 'plan-chapter',
    command: '#计划',
    title: '创作计划',
    description: '可生成作品定位、世界观、角色线或章节推进计划。',
    aliases: ['计划', '章节计划', '大纲', '规划', 'jihua', 'dagang', 'plan', 'outline'],
  },
  {
    task: 'generate-cover-prompt',
    command: '#封面',
    title: '封面提示词',
    description: '整理适合封面的画面描述和视觉关键词。',
    aliases: ['封面', '封面提示词', 'fengmian', 'cover', 'poster'],
  },
  {
    task: 'generate-novel-title',
    command: '#书名',
    title: '书名提案',
    description: '根据题材和气质直接生成书名候选。',
    aliases: ['书名', '取书名', '题名', 'shuming', 'title', 'bookname'],
  },
  {
    task: 'generate-chapter-titles',
    command: '#章节名',
    title: '章节名提案',
    description: '延续当前风格补出下一组章节名。',
    aliases: ['章节名', '章名', 'chapter', 'chaptertitle', 'zhangjieming', 'zhangming'],
  },
  {
    task: 'draft-chapter',
    command: '#写作',
    title: '起草正文',
    description: '直接生成可继续编辑的正文内容。',
    aliases: ['写作', '正文', '起草', 'xiezuo', 'draft', 'write'],
  },
  {
    task: 'continue-chapter',
    command: '#续写',
    title: '续写本章',
    description: '沿着当前上下文继续往下写。',
    aliases: ['续写', '续写本章', 'xuxie', 'continue'],
  },
  {
    task: 'rewrite-selection',
    command: '#改写',
    title: '改写选中',
    description: '重组表达方式但保留原意。',
    aliases: ['改写', '重写', 'gaixie', 'rewrite'],
  },
  {
    task: 'polish-selection',
    command: '#润色',
    title: '润色选中',
    description: '优化语序、节奏和画面感。',
    aliases: ['润色', '优化', 'runse', 'polish'],
  },
  {
    task: 'read-story-context',
    command: '#上下文',
    title: '上下文检索',
    description: '读取目录、摘要和正文片段再回答。',
    aliases: ['上下文', '目录', '检索', 'shangxiawen', 'context', 'read'],
  },
  {
    task: 'review-continuity',
    command: '#审阅',
    title: '一致性审阅',
    description: '检查人物、设定和剧情衔接问题。',
    aliases: ['审阅', '审查', '一致性', 'shenyue', 'review', 'continuity'],
  },
]

function normalizeAbilityKeyword(value: string): string {
  return value.replace(/#/g, '').replace(/\s+/g, '').toLowerCase()
}

function isBuiltinAbilityKeyword(value: string): boolean {
  const normalized = normalizeAbilityKeyword(value)
  if (!normalized) {
    return false
  }

  return agentAbilityItems.some((item) =>
    [item.command, item.title, ...item.aliases].some((alias) => {
      const normalizedAlias = normalizeAbilityKeyword(alias)
      return (
        normalized === normalizedAlias ||
        normalizedAlias.startsWith(normalized) ||
        normalized.startsWith(normalizedAlias)
      )
    }),
  )
}

function getAbilityQueryFromPrompt(prompt: string, caretPosition: number): { query: string; start: number; end: number } | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, prompt.length))
  const beforeCaret = prompt.slice(0, safeCaret)
  const match = beforeCaret.match(/(^|\s)(#[^\s#]*)$/)

  if (!match) {
    return null
  }

  const token = match[2] ?? ''
  const start = safeCaret - token.length

  return {
    query: token.slice(1),
    start,
    end: safeCaret,
  }
}

function renderPromptHighlight(prompt: string) {
  const segments = prompt.split(/(#[^\s#]+)/g)

  return segments.map((segment, index) => {
    if (!segment) {
      return null
    }

    if (segment.startsWith('#') && isBuiltinAbilityKeyword(segment)) {
      return (
        <span key={`${segment}-${index}`} className="text-[#4c8dff]">
          {segment}
        </span>
      )
    }

    return <span key={`${segment}-${index}`}>{segment}</span>
  })
}

function normalizeRunStatuses(statuses: AgentRunStatusItem[]) {
  const normalized = statuses
    .map((status) => ({
      id: status.id,
      event: status.event,
      text: status.text.trim(),
    }))
    .filter((status) => Boolean(status.text))

  const shouldHideGenericStatuses = normalized.some((status) =>
    [
      'task.decomposed',
      'task.thinking',
      'task.step',
      'workspace.step.started',
      'workspace.step.completed',
      'workspace.step.failed',
      'workspace.apply.started',
      'workspace.apply.completed',
      'workspace.apply.failed',
      'workspace.apply.skipped',
    ].includes(status.event),
  )
  const filtered = shouldHideGenericStatuses
    ? normalized.filter(
        (status) =>
          ![
            'run.started',
            'context.ready',
            'model.started',
            'artifact.created',
            'memory.updated',
            'run.completed',
            'request.read',
            'agent.selected',
            'route.decided',
            'specialist.started',
          ].includes(status.event),
      )
    : normalized

  const deduped: Array<{ id: string; event: string; text: string }> = []
  for (const status of filtered.length > 0 ? filtered : normalized) {
    if (deduped[deduped.length - 1]?.text === status.text) {
      continue
    }
    deduped.push(status)
  }

  return deduped
}

function resolveStepLabel(status: Pick<AgentRunStatusItem, 'event' | 'text'>) {
  if (
    status.event === 'request.read' ||
    status.event === 'task.decomposed' ||
    status.event === 'task.thinking' ||
    status.event === 'task.step' ||
    status.event === 'agent.selected' ||
    status.event === 'route.decided' ||
    status.event === 'specialist.started'
  ) {
    return '思考'
  }

  if (status.event.startsWith('workspace.apply')) {
    return '改动'
  }

  if (status.event.startsWith('workspace.step')) {
    return '执行'
  }

  if (status.event === 'run.failed') {
    return '失败'
  }

  if (/(?:思考|分析|判断|检索|梳理|规划)/.test(status.text)) {
    return '思考'
  }

  if (/(?:写入|同步|创建|命名|修改|替换|追加|保存|执行)/.test(status.text)) {
    return '处理'
  }

  if (/(?:完成|已生成|总结|汇总)/.test(status.text)) {
    return '总结'
  }

  return '进度'
}

function buildLiveStepItems(statuses: AgentRunStatusItem[], fallbackStatusText: string, isActive: boolean): LiveStepItem[] {
  const deduped = normalizeRunStatuses(statuses)

  if (deduped.length === 0 && fallbackStatusText.trim()) {
    return [
      {
        id: 'fallback-status',
        label: '进度',
        text: fallbackStatusText.trim(),
        state: isActive ? 'active' : 'done',
      },
    ]
  }

  return deduped.map((item, index) => ({
    id: item.id,
    label: resolveStepLabel(item),
    text: item.text,
    state:
      item.event === 'run.failed'
        ? 'error'
        : item.event === 'workspace.apply.completed'
          ? 'success'
          : index === deduped.length - 1
            ? isActive
              ? 'active'
              : 'done'
            : 'done',
  }))
}

function buildExecutionSummary(artifact: AgentArtifact, summary: ArtifactSummary) {
  if (artifact.actionSummary?.trim()) {
    return artifact.actionSummary.trim()
  }

  const segments: string[] = []

  if (summary.added.length > 0) {
    segments.push(`新增了${summary.added.join('、')}`)
  }

  if (summary.changed.length > 0) {
    segments.push(`完成了${summary.changed.join('、')}`)
  }

  if (segments.length === 0) {
    return ''
  }

  return `本次${segments.join('，')}。`
}

function resolveStepResultStateLabel(status: NonNullable<AgentArtifact['stepResults']>[number]['status']) {
  switch (status) {
    case 'running':
      return '执行中'
    case 'success':
      return '已完成'
    case 'failed':
      return '失败'
    case 'skipped':
      return '已跳过'
    default:
      return '待执行'
  }
}

function resolveStepResultStateClass(status: NonNullable<AgentArtifact['stepResults']>[number]['status']) {
  switch (status) {
    case 'running':
      return 'text-[var(--text-primary)]'
    case 'success':
      return 'text-[#166534]'
    case 'failed':
      return 'text-[#b91c1c]'
    case 'skipped':
      return 'text-[var(--text-secondary)]'
    default:
      return 'text-[var(--text-secondary)]'
  }
}

function findAbilityTokenRange(prompt: string, caretPosition: number): { start: number; end: number; token: string } | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, prompt.length))
  const matches = Array.from(prompt.matchAll(/#[^\s#]+/g))
  const matchedToken = matches.find((match) => {
    const start = match.index ?? 0
    const end = start + match[0].length
    return safeCaret >= start && safeCaret <= end
  })

  if (!matchedToken) {
    return null
  }

  const token = matchedToken[0]
  if (!isBuiltinAbilityKeyword(token)) {
    return null
  }

  const start = matchedToken.index ?? 0
  return {
    start,
    end: start + token.length,
    token,
  }
}

function defaultTabForTask(task: AgentTaskType): AgentTab {
  if (task === 'plan-chapter' || task === 'generate-novel-title' || task === 'generate-chapter-titles') {
    return 'plan'
  }

  if (task === 'review-continuity' || task === 'read-story-context') {
    return 'review'
  }

  if (task === 'generate-cover-prompt') {
    return 'cover'
  }

  return 'write'
}

function insertHashCommand(prompt: string): string {
  const trimmedEnd = prompt.replace(/\s+$/, '')

  if (!trimmedEnd) {
    return '#'
  }

  if (trimmedEnd.endsWith('#')) {
    return `${trimmedEnd} `
  }

  return `${trimmedEnd} #`
}

function buildArtifactSummary(artifact: AgentArtifact): ArtifactSummary {
  const added =
    artifact.renamedNovel && !artifact.replacedChapterContent && !artifact.appendedToChapter
      ? ['作品命名结果']
      : artifact.renamedChapter && !artifact.replacedChapterContent && !artifact.appendedToChapter
      ? ['章节标题结果']
      : [agentArtifactLabelMap[artifact.type]]
  const changed: string[] = []

  if ((artifact.memoryEntries?.length ?? 0) > 0) {
    added.push(`${artifact.memoryEntries?.length ?? 0} 条上下文记忆`)
  }

  if (artifact.savedAsPlan) {
    changed.push('已存入计划文件夹')
  }

  if (artifact.catalogUpdated) {
    changed.push('已同步目录')
  }

  if (artifact.replacedChapterContent) {
    changed.push('已覆盖正文')
  }

  if (artifact.appendedToChapter) {
    changed.push('已追加到正文')
  }

  if (artifact.renamedNovel) {
    changed.push('已命名作品')
  }

  if (artifact.renamedChapter) {
    changed.push('已命名章节')
  }

  if (artifact.appliedToCover) {
    changed.push('已写入封面提示词')
  }

  return {
    added,
    changed,
  }
}

function hasPromptIntent(promptText: string, keywords: string[]) {
  return keywords.some((keyword) => promptText.includes(keyword))
}

function resolveWorkspaceActionSuggestions(
  promptText: string,
  novelPublished: boolean,
): WorkspaceActionSuggestion[] {
  const normalized = promptText.replace(/\s+/g, '')
  const suggestions: WorkspaceActionSuggestion[] = []

  if (hasPromptIntent(normalized, ['保存作品', '保存一下作品', '保存当前作品', '保存这部作品'])) {
    suggestions.push({
      id: 'save_novel',
      label: '保存作品',
      description: '把当前作品设置立即保存一次。',
    })
  }

  if (hasPromptIntent(normalized, ['发布作品', '上架作品', '发布这部作品', '上架这部作品'])) {
    suggestions.push({
      id: 'publish_novel',
      label: novelPublished ? '重新确认发布' : '发布作品',
      description: novelPublished ? '作品已经发布，可再次确认当前发布状态。' : '把当前作品切换为已发布状态。',
    })
  }

  if (hasPromptIntent(normalized, ['下架作品', '撤下作品', '归档作品', '把作品下架'])) {
    suggestions.push({
      id: 'archive_novel',
      label: '下架作品',
      description: '把当前作品切换为已下架状态。',
    })
  }

  if (hasPromptIntent(normalized, ['删除作品', '删掉作品', '把这部作品删了', '移除作品'])) {
    suggestions.push({
      id: 'delete_novel',
      label: '删除作品',
      description: '删除整部作品及其章节、封面和 Agent 记录。',
      tone: 'danger',
    })
  }

  if (hasPromptIntent(normalized, ['作品设置', '编辑作品', '修改简介', '修改标签', '修改可见范围'])) {
    suggestions.push({
      id: 'open_meta',
      label: '打开作品设置',
      description: '打开作品设置侧栏，继续修改标题、简介和发布方式。',
    })
  }

  if (hasPromptIntent(normalized, ['打开封面', '封面面板', '设置封面', '去封面'])) {
    suggestions.push({
      id: 'open_cover',
      label: '打开封面面板',
      description: '去封面区生成、挑选或替换当前作品封面。',
    })
  }

  if (hasPromptIntent(normalized, ['新建章节', '创建章节', '加一章', '开一章'])) {
    suggestions.push({
      id: 'create_chapter',
      label: '新建章节',
      description: '为当前作品新建一个章节草稿。',
    })
  }

  return suggestions
}

export default function WritingAgentPanel({
  activeTab,
  activeTask,
  prompt,
  runState,
  runStatuses,
  memoryEntries,
  artifacts,
  activeArtifactId,
  selectedTextLength,
  canSavePlan,
  canApplyCoverPrompt,
  canReplaceChapter,
  canAppendChapter,
  supportsBackendChapterApply,
  voiceInputSupported,
  voiceInputActive,
  novelPublished,
  taskWindows,
  activeTaskWindowId,
  showTaskList,
  taskSwitchLocked,
  coverPreviewAssetsByArtifactId,
  generatingCoverArtifactId,
  selectingCover,
  onPromptChange,
  onRun,
  onStop,
  onRollback,
  onCopyPrompt,
  onCopyResult,
  onRetryArtifact,
  onDeleteResult,
  onInsertPolishPrompt,
  onToggleVoiceInput,
  onExecuteWorkspaceAction,
  onExecuteHandoff,
  onSelectArtifact,
  onCreateTaskWindow,
  onToggleTaskList,
  onSavePlan,
  onApplyCoverPrompt,
  onGenerateCoverFromArtifact,
  onOpenCoverPanel,
  onDownloadCoverAsset,
  onApplyGeneratedCoverAsset,
  onReplaceChapterContent,
  onAppendToChapter,
  onClose,
  showCloseAction = false,
}: WritingAgentPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [caretPosition, setCaretPosition] = useState(prompt.length)
  const [collapsedProcessArtifacts, setCollapsedProcessArtifacts] = useState<Record<string, boolean>>({})
  // 点击封面候选图后全屏放大查看，支持下载
  const [previewCoverAsset, setPreviewCoverAsset] = useState<CoverAsset | null>(null)
  const canSubmitPrompt = prompt.trim().length > 0
  const activeArtifact =
    artifacts.find((artifact) => artifact.id === activeArtifactId) ?? artifacts[0] ?? null
  const activeTaskWindow =
    taskWindows.find((taskWindow) => taskWindow.id === activeTaskWindowId) ?? taskWindows[0] ?? null
  const activeTaskWindowTitle = activeTaskWindow?.title?.trim() || '新任务'
  const canApplyReplaceChapter = Boolean(
    activeArtifact?.availableApplyStrategies?.includes('replaceChapterContent') && canReplaceChapter,
  )
  const canApplyAppendChapter = Boolean(
    activeArtifact?.availableApplyStrategies?.includes('appendChapterContent') && canAppendChapter,
  )
  const canApplyPlan = Boolean(
    activeArtifact?.availableApplyStrategies?.includes('saveChapterSummary') &&
      canSavePlan &&
      !activeArtifact?.savedAsPlan,
  )
  const canApplyCover = Boolean(
    activeArtifact?.availableApplyStrategies?.includes('setNovelCoverPrompt') && canApplyCoverPrompt,
  )
  const needsSavedChapterBeforeApply = Boolean(
    activeArtifact &&
      activeArtifact.type !== 'cover_prompt' &&
      !supportsBackendChapterApply &&
      activeArtifact.availableApplyStrategies?.some((strategy) =>
        ['replaceChapterContent', 'appendChapterContent', 'saveChapterSummary'].includes(strategy),
      ),
  )
  const activeAbilityQuery = useMemo(
    () => getAbilityQueryFromPrompt(prompt, caretPosition),
    [caretPosition, prompt],
  )
  const matchedAbilities = useMemo(() => {
    const normalizedQuery = normalizeAbilityKeyword(activeAbilityQuery?.query ?? '')
    const sorted = [...agentAbilityItems].sort((left, right) => {
      const leftScore =
        Number(left.task === activeTask) * 4 +
        Number(defaultTabForTask(left.task) === activeTab) * 2 +
        Number(left.task === 'polish-selection' && selectedTextLength > 0)
      const rightScore =
        Number(right.task === activeTask) * 4 +
        Number(defaultTabForTask(right.task) === activeTab) * 2 +
        Number(right.task === 'polish-selection' && selectedTextLength > 0)

      return rightScore - leftScore
    })

    if (!normalizedQuery) {
      return sorted.slice(0, 6)
    }

    return sorted.filter((item) =>
      [item.command, item.title, ...item.aliases].some((alias) => {
        const normalizedAlias = normalizeAbilityKeyword(alias)
        return normalizedAlias.includes(normalizedQuery) || normalizedQuery.includes(normalizedAlias)
      }),
    )
  }, [activeAbilityQuery?.query, activeTab, activeTask, selectedTextLength])
  const conversationArtifacts = useMemo(
    () =>
      [...artifacts].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [artifacts],
  )
  useEffect(() => {
    if (!scrollContainerRef.current) {
      return
    }

    const container = scrollContainerRef.current
    // 用户上滑离开底部时不强制弹回，贴底（80px 内）才自动跟随新消息
    if (container.scrollHeight - container.scrollTop - container.clientHeight >= 80) {
      return
    }
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      })
    })
  }, [activeArtifact?.content, activeArtifact?.id, artifacts.length, runState.active, runStatuses.length])

  function syncCaretPosition() {
    const nextPosition = textareaRef.current?.selectionStart ?? prompt.length
    setCaretPosition(nextPosition)
  }

  function handlePromptChange(nextValue: string) {
    onPromptChange(nextValue)
    requestAnimationFrame(() => {
      syncCaretPosition()
    })
  }

  function handleInsertAbility(command: string) {
    const query = activeAbilityQuery
    const textarea = textareaRef.current

    if (!query || !textarea) {
      const nextPrompt = insertHashCommand(prompt)
      onPromptChange(nextPrompt)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        const nextCaretPosition = nextPrompt.length
        textareaRef.current?.setSelectionRange(nextCaretPosition, nextCaretPosition)
        setCaretPosition(nextCaretPosition)
      })
      return
    }

    const before = prompt.slice(0, query.start)
    const after = prompt.slice(query.end)
    const prefix = before && !/\s$/.test(before) ? `${before} ` : before
    const suffix = after && !after.startsWith(' ') ? ` ${after}` : after
    const inserted = `${command} `
    const nextPrompt = `${prefix}${inserted}${suffix}`.trimStart()
    const nextCaretPosition = prefix.length + inserted.length

    onPromptChange(nextPrompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaretPosition, nextCaretPosition)
      setCaretPosition(nextCaretPosition)
    })
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Backspace' && event.key !== 'Delete') {
      return
    }

    const textarea = textareaRef.current
    if (!textarea || textarea.selectionStart !== textarea.selectionEnd) {
      return
    }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const caret = event.key === 'Backspace' ? selectionStart : selectionEnd
    const tokenRange =
      findAbilityTokenRange(prompt, caret) ??
      (event.key === 'Backspace' ? findAbilityTokenRange(prompt, Math.max(0, caret - 1)) : null)

    if (!tokenRange) {
      return
    }

    const atTokenEdge =
      event.key === 'Backspace'
        ? caret === tokenRange.end || caret === tokenRange.end + 1
        : caret === tokenRange.start

    if (!atTokenEdge) {
      return
    }

    event.preventDefault()
    const before = prompt.slice(0, tokenRange.start).replace(/\s+$/, '')
    const after = prompt.slice(tokenRange.end).replace(/^\s+/, '')
    const spacer = before && after ? ' ' : ''
    const nextPrompt = `${before}${spacer}${after}`
    const nextCaretPosition = before.length + spacer.length

    onPromptChange(nextPrompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaretPosition, nextCaretPosition)
      setCaretPosition(nextCaretPosition)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-secondary)]">Chevoink Agent</p>
          <p className="mt-1 truncate text-sm text-[var(--text-primary)]">{activeTaskWindowTitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleTaskList}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
              showTaskList ? 'border-[var(--border-strong)] text-[var(--text-primary)]' : '',
            )}
            aria-label={showTaskList ? '隐藏任务列表' : '显示任务列表'}
            title={showTaskList ? '隐藏任务列表' : '显示任务列表'}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCreateTaskWindow}
            disabled={taskSwitchLocked}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="新建任务窗口"
            title="新建任务窗口"
          >
            <SquarePlus className="h-4 w-4" />
          </button>
          {showCloseAction && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              aria-label="关闭助手面板"
              title="关闭助手面板"
            >
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex flex-1 overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1"
        >
          <div className="flex min-h-full flex-col gap-5 pb-4">
            {conversationArtifacts.map((artifact) => {
              const isActiveArtifact = activeArtifact?.id === artifact.id
              const isStreamingArtifact = artifact.status === 'streaming'
              const canRollbackArtifact = Boolean(artifact.runId) && !runState.active
              const canCopyPromptArtifact = Boolean(artifact.promptText?.trim())
              const canCopyArtifact = Boolean((artifact.rawContent ?? artifact.content).trim())
              const canDeleteArtifact = Boolean(artifact.id)
              const canRetryArtifact = Boolean(artifact.promptText?.trim()) && !runState.active
              const artifactStatuses = isActiveArtifact ? runStatuses : artifact.runStatuses ?? []
              const summary = buildArtifactSummary({
                ...artifact,
                memoryEntries: artifact.memoryEntries ?? (isActiveArtifact ? memoryEntries : []),
              })
              const processItems = buildLiveStepItems(
                artifactStatuses,
                isStreamingArtifact ? runState.statusText || '正在整理当前请求...' : '',
                isStreamingArtifact,
              )
              const processCollapsed = isStreamingArtifact ? false : (collapsedProcessArtifacts[artifact.id] ?? false)
              const visibleProcessItems = processCollapsed ? [] : processItems
              const canToggleProcess = !isStreamingArtifact && processItems.length > 1
              const executionSummary = !isStreamingArtifact ? buildExecutionSummary(artifact, summary) : ''
              const planThinking = artifact.actionPlan?.thinking?.filter((item) => item.trim()) ?? []
              const planSteps = artifact.actionPlan?.steps ?? []
              const stepResults = artifact.stepResults ?? []
              const showPlanSection = Boolean(artifact.actionPlan?.summary?.trim() || planThinking.length > 0 || planSteps.length > 0)
              const showStepResultSection = stepResults.length > 0
              const autoAppliedToWorkspace = Boolean(
                artifact.replacedChapterContent ||
                  artifact.appendedToChapter ||
                  artifact.renamedChapter ||
                  artifact.renamedNovel ||
                  artifact.savedAsPlan ||
                  artifact.appliedToCover,
              )
              const showInlineSummary = Boolean(executionSummary)
              const showInlineContent =
                !isStreamingArtifact && !autoAppliedToWorkspace && !artifact.actionSummary?.trim() && Boolean(artifact.content.trim())
              const showApplyActions =
                isActiveArtifact &&
                (canApplyReplaceChapter ||
                  canApplyAppendChapter ||
                  canApplyPlan ||
                  canApplyCover ||
                  needsSavedChapterBeforeApply)
              const workspaceActions = artifact.promptText?.trim()
                ? resolveWorkspaceActionSuggestions(artifact.promptText.trim(), novelPublished)
                : []
              const coverPreviewAssets = coverPreviewAssetsByArtifactId[artifact.id] ?? []
              const canGenerateCoverFromArtifact =
                artifact.type === 'cover_prompt' &&
                Boolean(artifact.appliedToCover || artifact.availableApplyStrategies?.includes('setNovelCoverPrompt'))
              const isGeneratingCoverFromArtifact = generatingCoverArtifactId === artifact.id
              const hasGeneratedCoverPreview = coverPreviewAssets.length > 0
              const shouldShowGenerateCoverCta =
                !isStreamingArtifact &&
                canGenerateCoverFromArtifact &&
                !isGeneratingCoverFromArtifact &&
                !hasGeneratedCoverPreview
              const shouldShowCoverGeneratingState =
                !isStreamingArtifact && canGenerateCoverFromArtifact && isGeneratingCoverFromArtifact
              const shouldShowViewGeneratedCoverCta =
                !isStreamingArtifact && canGenerateCoverFromArtifact && hasGeneratedCoverPreview

              return (
                <div key={artifact.id} className="space-y-3">
                {artifact.promptText?.trim() ? (
                  <div className="group/user-message flex justify-end">
                    <div className="mr-2 flex items-center self-center">
                        <div className="group/user-actions inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onRollback(artifact.id)}
                            disabled={!canRollbackArtifact}
                            className="inline-flex h-5 w-5 items-center justify-center text-[#9ca3af] transition-colors hover:text-[#6b7280] disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label="回退本轮对话"
                            title="回退本轮对话"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex max-w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-all duration-150 group-hover/user-actions:max-w-16 group-hover/user-actions:opacity-100 group-focus-within/user-actions:max-w-16 group-focus-within/user-actions:opacity-100">
                            <button
                              type="button"
                              onClick={() => onCopyPrompt(artifact.id)}
                              disabled={!canCopyPromptArtifact}
                              className="inline-flex h-5 w-5 items-center justify-center text-[#9ca3af] transition-colors hover:text-[#6b7280] disabled:cursor-not-allowed disabled:opacity-35"
                              aria-label="复制这条对话"
                              title="复制这条对话"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteResult(artifact.id)}
                              disabled={!canDeleteArtifact}
                              className="inline-flex h-5 w-5 items-center justify-center text-[#9ca3af] transition-colors hover:text-[#6b7280] disabled:cursor-not-allowed disabled:opacity-35"
                              aria-label="删除当前结果"
                              title="删除当前结果"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    <button
                      type="button"
                      onClick={() => onSelectArtifact(artifact.id)}
                      className="max-w-[82%] rounded-[20px] bg-[#101114] px-4 py-3 text-left text-sm leading-7 text-white transition-colors hover:bg-[#17191f]"
                    >
                      {artifact.promptText}
                    </button>
                  </div>
                ) : null}

                <div className="min-w-0 space-y-2">
                  {(processItems.length > 0 || showInlineSummary || showInlineContent) && (
                    <div className="space-y-2.5">
                      {processItems.length > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">
                            处理过程
                          </p>
                          {canToggleProcess ? (
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedProcessArtifacts((current) => ({
                                  ...current,
                                  [artifact.id]: !processCollapsed,
                                }))
                              }
                              className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                            >
                              {processCollapsed ? '展开' : '收起'}
                              {processCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onSelectArtifact(artifact.id)}
                        className="w-full border-none bg-transparent px-0 py-0 text-left"
                      >
                        <div className="space-y-2.5">
                          {processCollapsed ? (
                            <div className="flex items-start gap-3">
                              <span className="mt-1.5 h-2 w-2 rounded-full bg-[var(--border-strong)]" />
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">
                                  处理过程
                                </p>
                                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                                  已收起本轮 {processItems.length} 条过程，点击“展开”查看完整过程。
                                </p>
                              </div>
                            </div>
                          ) : visibleProcessItems.length > 0 ? (
                            <div className="space-y-2.5">
                            {isStreamingArtifact ? (
                              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                <span>{runState.statusText || '正在处理当前请求...'}</span>
                              </div>
                            ) : null}
                            {visibleProcessItems.map((step) => (
                              <div key={step.id} className="flex items-start gap-3">
                                <span
                                  className={cn(
                                    'mt-1.5 h-2 w-2 rounded-full',
                                    step.state === 'active'
                                      ? 'bg-[var(--text-primary)] animate-pulse'
                                      : step.state === 'error'
                                          ? 'bg-[#dc2626]'
                                          : 'bg-[var(--border-strong)]',
                                  )}
                                />
                                <div className="min-w-0 space-y-0.5">
                                  <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">
                                    {step.label}
                                  </p>
                                  <p
                                    className={cn(
                                      'text-sm leading-6',
                                      step.state === 'error'
                                        ? 'text-[#b91c1c]'
                                        : step.state === 'active'
                                          ? 'text-[var(--text-primary)]'
                                          : 'text-[var(--text-secondary)]',
                                    )}
                                  >
                                    {step.text}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                          ) : null}

                          {showInlineSummary ? (
                            <p className="text-sm leading-7 text-[var(--text-primary)]">{executionSummary}</p>
                          ) : null}

                          {showPlanSection ? (
                            <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3">
                              <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">任务规划</p>
                              {artifact.actionPlan?.summary?.trim() ? (
                                <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{artifact.actionPlan.summary.trim()}</p>
                              ) : null}
                              {planThinking.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">思考判断</p>
                                  {planThinking.map((item, index) => (
                                    <div key={`${artifact.id}-thinking-${index}`} className="flex items-start gap-3">
                                      <span className="mt-1.5 h-2 w-2 rounded-full bg-[var(--border-strong)]" />
                                      <p className="text-sm leading-6 text-[var(--text-secondary)]">{item}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {planSteps.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">执行计划</p>
                                  {planSteps.map((step) => (
                                    <div key={step.id} className="flex items-start gap-3">
                                      <span className="mt-1.5 h-2 w-2 rounded-full bg-[var(--text-primary)]" />
                                      <div className="min-w-0 space-y-0.5">
                                        <p className="text-sm leading-6 text-[var(--text-primary)]">{step.title}</p>
                                        {typeof step.payload?.reasoning === 'string' && step.payload.reasoning.trim() ? (
                                          <p className="text-xs leading-5 text-[var(--text-secondary)]">{step.payload.reasoning.trim()}</p>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {showStepResultSection ? (
                            <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3">
                              <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">执行结果</p>
                              <div className="mt-3 space-y-2.5">
                                {stepResults.map((step) => (
                                  <div key={`${artifact.id}-${step.stepId}`} className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <p className="text-sm leading-6 text-[var(--text-primary)]">{step.title}</p>
                                      {step.resultSummary?.trim() ? (
                                        <p className="text-xs leading-5 text-[var(--text-secondary)]">{step.resultSummary.trim()}</p>
                                      ) : null}
                                      {step.errorMessage?.trim() ? (
                                        <p className="text-xs leading-5 text-[#b91c1c]">{step.errorMessage.trim()}</p>
                                      ) : null}
                                    </div>
                                    <span className={cn('shrink-0 text-xs font-medium leading-6', resolveStepResultStateClass(step.status))}>
                                      {resolveStepResultStateLabel(step.status)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {showInlineContent ? (
                            <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-primary)]">
                              {artifact.content}
                            </pre>
                          ) : null}
                        </div>
                      </button>
                    </div>
                  )}

                  {!isStreamingArtifact && (canCopyArtifact || canRetryArtifact) ? (
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => onCopyResult(artifact.id)}
                        disabled={!canCopyArtifact}
                        className="inline-flex h-5 w-5 items-center justify-center text-[#9ca3af] transition-colors hover:text-[#6b7280] disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="复制当前回复"
                        title="复制当前回复"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRetryArtifact(artifact.id)}
                        disabled={!canRetryArtifact}
                        className="inline-flex h-5 w-5 items-center justify-center text-[#9ca3af] transition-colors hover:text-[#6b7280] disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label="重试当前任务"
                        title="重试当前任务"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}

                  {showApplyActions ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {canApplyReplaceChapter ? (
                        <Button onClick={() => onReplaceChapterContent(artifact.id)} variant="secondary" size="sm">
                          覆盖正文
                        </Button>
                      ) : null}
                      {canApplyAppendChapter ? (
                        <Button onClick={() => onAppendToChapter(artifact.id)} variant="ghost" size="sm">
                          追加到末尾
                        </Button>
                      ) : null}
                      {artifact.type !== 'cover_prompt' && canApplyPlan ? (
                        <Button onClick={() => onSavePlan(artifact.id)} variant="ghost" size="sm">
                          <WandSparkles className="h-4 w-4" />
                          存为计划
                        </Button>
                      ) : null}
                      {artifact.type === 'cover_prompt' && canApplyCover ? (
                        <Button onClick={() => onApplyCoverPrompt(artifact.id)} variant="ghost" size="sm">
                          <Sparkles className="h-4 w-4" />
                          写入封面
                        </Button>
                      ) : null}
                      {needsSavedChapterBeforeApply ? (
                        <span className="text-xs text-[var(--text-secondary)]">请先保存章节，再同步结果。</span>
                      ) : null}
                    </div>
                  ) : null}

                  {shouldShowGenerateCoverCta ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        onClick={() => onGenerateCoverFromArtifact(artifact.id)}
                        variant="secondary"
                        size="sm"
                        disabled={isGeneratingCoverFromArtifact}
                      >
                        {isGeneratingCoverFromArtifact ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        {artifact.appliedToCover ? '立即生成' : '写入并立即生成'}
                      </Button>
                    </div>
                  ) : null}

                  {shouldShowCoverGeneratingState ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button variant="secondary" size="sm" disabled>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        图片正在生成
                      </Button>
                    </div>
                  ) : null}

                  {shouldShowViewGeneratedCoverCta ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button onClick={onOpenCoverPanel} variant="secondary" size="sm">
                        <ImagePlus className="h-4 w-4" />
                        查看图片
                      </Button>
                    </div>
                  ) : null}

                  {!isStreamingArtifact && coverPreviewAssets.length > 0 ? (
                    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-secondary)]">封面候选</p>
                        <Button
                          onClick={() => onGenerateCoverFromArtifact(artifact.id)}
                          variant="ghost"
                          size="sm"
                          disabled={isGeneratingCoverFromArtifact}
                        >
                          {isGeneratingCoverFromArtifact ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <ImagePlus className="h-4 w-4" />
                          )}
                          重新生成
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {coverPreviewAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50"
                          >
                            <button
                              type="button"
                              onClick={() => setPreviewCoverAsset(asset)}
                              className="block aspect-[3/4] w-full cursor-zoom-in overflow-hidden bg-[var(--surface-muted)]"
                              aria-label="放大查看这张封面"
                            >
                              <img src={asset.imageUrl} alt="封面候选图" className="h-full w-full object-cover transition hover:opacity-90" />
                            </button>
                            <div className="space-y-2 px-3 py-3">
                              <p className="line-clamp-3 text-xs leading-6 text-[var(--text-secondary)]">
                                {asset.prompt ?? '这张封面候选图已生成，可以直接下载或设为作品封面。'}
                              </p>
                              <div className="grid grid-cols-1 gap-2">
                                <Button
                                  onClick={() => onApplyGeneratedCoverAsset(artifact.id, asset)}
                                  size="sm"
                                  className="min-w-0 justify-center px-3 text-sm leading-none"
                                  disabled={selectingCover}
                                >
                                  {selectingCover ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  设为封面
                                </Button>
                                <Button
                                  onClick={() => onDownloadCoverAsset(asset)}
                                  variant="secondary"
                                  size="sm"
                                  className="min-w-0 justify-center px-3 text-sm leading-none"
                                >
                                  <Download className="h-4 w-4" />
                                  下载
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!isStreamingArtifact && artifact.handoff?.targetMode === 'build' ? (
                    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3">
                      <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-secondary)]">继续执行</p>
                      <div className="mt-2 space-y-2">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{artifact.handoff.title}</p>
                        <p className="text-sm leading-6 text-[var(--text-secondary)]">{artifact.handoff.summary}</p>
                        <Button
                          onClick={() => onExecuteHandoff(artifact.id)}
                          variant="secondary"
                          size="sm"
                          disabled={runState.active}
                        >
                          {artifact.handoff.confirmLabel}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {!isStreamingArtifact && workspaceActions.length > 0 ? (
                    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3">
                      <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-secondary)]">待确认执行</p>
                      <div className="mt-2 space-y-2">
                        {workspaceActions.map((action) => {
                          const Icon =
                            action.id === 'save_novel'
                              ? Save
                              : action.id === 'publish_novel'
                                ? Upload
                                : action.id === 'archive_novel'
                                  ? Archive
                                  : action.id === 'delete_novel'
                                    ? Trash2
                                    : action.id === 'open_meta'
                                      ? PanelLeftOpen
                                      : action.id === 'open_cover'
                                        ? ImagePlus
                                        : FilePlus2

                          return (
                            <button
                              key={`${artifact.id}-${action.id}`}
                              type="button"
                              onClick={() => onExecuteWorkspaceAction(action.id)}
                              className={cn(
                                'flex w-full items-start gap-3 rounded-[14px] border px-3 py-3 text-left transition-colors',
                                action.tone === 'danger'
                                  ? 'border-[rgba(127,29,29,0.18)] bg-[rgba(127,29,29,0.04)] hover:bg-[rgba(127,29,29,0.08)]'
                                  : 'border-[var(--border-subtle)] bg-[var(--surface-muted)]/54 hover:bg-[var(--surface-muted)]',
                              )}
                            >
                              <span
                                className={cn(
                                  'mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-[12px]',
                                  action.tone === 'danger'
                                    ? 'bg-[rgba(127,29,29,0.1)] text-[rgb(127,29,29)]'
                                    : 'bg-[var(--surface-default)] text-[var(--text-secondary)]',
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span
                                  className={cn(
                                    'block text-sm font-medium',
                                    action.tone === 'danger'
                                      ? 'text-[rgb(127,29,29)]'
                                      : 'text-[var(--text-primary)]',
                                  )}
                                >
                                  {action.label}
                                </span>
                                <span className="mt-1 block text-xs leading-6 text-[var(--text-secondary)]">
                                  {action.description}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)]/80 pt-4">
        <div className="relative">
          {activeAbilityQuery ? (
            <div className="absolute bottom-full left-0 z-20 mb-3 w-full max-w-[28rem] overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2 shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
              <div className="flex max-h-[18rem] flex-col gap-1 overflow-y-auto">
                {matchedAbilities.length > 0 ? (
                  matchedAbilities.map((ability) => (
                    <button
                      key={ability.command}
                      type="button"
                      onClick={() => handleInsertAbility(ability.command)}
                      className="rounded-[16px] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#4c8dff]">{ability.command}</span>
                        <span className="text-sm text-[var(--text-primary)]">{ability.title}</span>
                      </div>
                      <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">{ability.description}</p>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[16px] px-3 py-3 text-sm text-[var(--text-secondary)]">
                    没有找到匹配能力，继续输入中文、拼音或英文都可以联想。
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/72 px-3 py-3">
            <div className="relative min-h-[92px] rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-1 py-1">
              <div className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 text-sm leading-7">
                {prompt ? (
                  <div className="whitespace-pre-wrap break-words text-[var(--text-primary)]">
                    {renderPromptHighlight(prompt)}
                  </div>
                ) : (
                  <div className="text-[var(--text-secondary)]">{AGENT_INPUT_GUIDE}</div>
                )}
              </div>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(event) => handlePromptChange(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                onClick={syncCaretPosition}
                onKeyUp={syncCaretPosition}
                onSelect={syncCaretPosition}
                rows={4}
                className="relative z-10 w-full resize-none bg-transparent px-4 py-3 text-sm leading-7 text-transparent outline-none caret-[var(--text-primary)]"
                style={{ caretColor: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleInsertAbility('#')}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              aria-label="插入 # 指令"
              title="插入 # 指令"
            >
              <Hash className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onInsertPolishPrompt}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              aria-label="插入润色提示词"
              title="插入润色提示词"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToggleVoiceInput}
              disabled={!voiceInputSupported}
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-default)] disabled:cursor-not-allowed disabled:opacity-40',
                voiceInputActive
                  ? 'border-[var(--accent-border)] bg-[var(--surface-default)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
              )}
              aria-label={voiceInputActive ? '停止语音输入' : '开始语音输入'}
              title={
                voiceInputSupported
                  ? voiceInputActive
                    ? '停止语音输入'
                    : '开始语音输入'
                  : '当前浏览器暂不支持语音输入'
              }
            >
              {voiceInputActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={runState.active ? onStop : onRun}
              disabled={!runState.active && !canSubmitPrompt}
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-default)] disabled:cursor-not-allowed',
                runState.active
                  ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)] hover:bg-[var(--surface-contrast-hover)]'
                  : canSubmitPrompt
                    ? 'bg-[#22c55e] text-white hover:bg-[#16a34a]'
                    : 'bg-[#166534] text-white/75',
              )}
              aria-label={runState.active ? '暂停当前任务' : '发送当前任务'}
              title={runState.active ? '暂停当前任务' : '发送当前任务'}
            >
              {runState.active ? <Square className="h-4 w-4 fill-current" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {previewCoverAsset ? (
        <ImageLightbox
          src={previewCoverAsset.imageUrl}
          alt="封面候选图"
          downloadName={`封面候选-${previewCoverAsset.id}.jpg`}
          onClose={() => setPreviewCoverAsset(null)}
        />
      ) : null}
    </div>
  )
}
