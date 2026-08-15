﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, BookOpenText, ChevronLeft, FileText, ImagePlus, LogOut, MessageSquareText, MoreHorizontal, PenLine, RefreshCcw, Settings2, Trash2, Upload, WandSparkles } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import { useToast } from '@/components/ui/Toast'
import { useAutoHideScrollbars } from '@/hooks/useAutoHideScrollbars'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { FIXED_NOVEL_COVER_SIZE } from '../../../shared/contracts/index.js'
import type {
  AgentActionHandoff,
  AgentActionPlan,
  AgentActionPlanStep,
  AgentExecutionAgent,
  AgentExecutionMode,
  AgentExecutionStepResult,
  AgentRouteDecision,
  AgentRuleBundle,
  AgentStoryMemoryDigest,
  AgentStreamEvent,
  AgentWorkspaceToolPolicy,
  Chapter,
  CoverAsset,
  Novel,
  AgentSession,
  StudioPayload,
  UpdateNovelRequest,
  UserMePayload,
  Visibility,
} from '../../../shared/contracts/index.js'
import {
  applyWritingAgentArtifact,
  createWritingAgentSession,
  createNovelWorkspace,
  createNovelPlanFile,
  createChapterDraft,
  deleteWritingAgentRun,
  deleteWritingAgentSession,
  deleteNovelWorkspace,
  deleteChapterDraft,
  generateCoverImages,
  generateCoverPrompt,
  getChapterContent,
  getStudioPayload,
  getWritingAgentSessionHistory,
  listNovelPlanFiles,
  listWritingAgentSessions,
  publishNovelWorkspace,
  rollbackWritingAgentRun,
  runWritingAgentAction,
  uploadNovelCover,
  type AgentSessionHistoryItem,
  updateChapterDraft,
  updateWritingAgentSession,
  updateNovelMeta,
  updateNovelPlanFile,
  type NovelPlanFileItem,
} from './api'
import { buildFixedNovelCoverDataUrl, downloadCoverAssetImage, type NovelCoverCropState } from './cover-image'
import { getMe } from '../community/api'
import ChapterSettingsPanel from './components/ChapterSettingsPanel'
import ChapterSidebar from './components/ChapterSidebar'
import PlanSettingsPanel from './components/PlanSettingsPanel'
import { StudioSkeleton } from '@/components/ui/Skeleton'
import AgentTaskSidebar from './components/AgentTaskSidebar'
import ConfirmDialog from './components/ConfirmDialog'
import CoverPanel from './components/CoverPanel'
import EditorCanvas from './components/EditorCanvas'
import { buildReviewDiff, resolveReviewHunk } from './components/diff'
import ImmersiveComposer from './components/ImmersiveComposer'
import MetaPanel from './components/MetaPanel'
import NovelCoverCropDialog from './components/NovelCoverCropDialog'
import PublishNovelDialog from './components/PublishNovelDialog'
import StudioToolbar from './components/StudioToolbar'
import WorkspaceNovelSwitcher from './components/WorkspaceNovelSwitcher'
import WritingAgentPanel from './components/WritingAgentPanel'
import { AgentPanel } from './agent/components/AgentPanel'
import { WORKSPACE_WRITE_TOOLS, useAgentStore } from './agent/agentStore'
import { PanelResizeHandle, useStudioPanelWidths } from './panel-resize'
import { SaveStatusPill } from './components/StudioControls'
import type {
  AgentArtifact,
  AgentLocalRollbackChapterSnapshot,
  AgentLocalRollbackSnapshot,
  AgentRunState,
  AgentRunStatusMode,
  AgentRunStatusItem,
  AgentTab,
  AgentTaskType,
  ChapterDraftState,
  ChapterPendingReview,
  CoverFormState,
  EditableNovelStatus,
  EditorSelectionState,
  MobileView,
  NovelFormState,
  PlanPendingReview,
  ProjectNotesState,
  SaveState,
  ToolPanel,
  WorkspaceDocumentView,
  WorkspacePlanFile,
} from './types'
import {
  agentTaskLabelMap,
  chapterStatusLabelMap,
} from './types'

const DEFAULT_NOVEL_ID = 'novel-aurora'
// 新建默认名；旧名「我的第一部作品」保留识别，兼容存量引导作品
const BOOTSTRAP_NOVEL_TITLE = '未命名作品'
const BOOTSTRAP_NOVEL_TITLES = new Set([BOOTSTRAP_NOVEL_TITLE, '我的第一部作品'])
const BOOTSTRAP_NOVEL_SUMMARY = '先创建一部作品，再继续完善简介、章节和封面。'
const AGENT_WORKSPACE_STORAGE_PREFIX = 'studio-agent-workspace'
const STUDIO_LAST_NOVEL_STORAGE_KEY = 'studio-last-novel-id'
const AGENT_TASK_TITLE_MIN_LENGTH = 6
const AGENT_TASK_TITLE_MAX_LENGTH = 12
const DEFAULT_AGENT_TASK_TITLE = '新任务'
type AgentTaskWindowState = {
  id: string
  sessionId: string | null
  title: string
  prompt: string
  artifacts: AgentArtifact[]
  activeArtifactId: string | null
  loaded: boolean
  temporary: boolean
  customNamed: boolean
  firstPromptSubmitted: boolean
  createdAt: string
  updatedAt: string
}

type StoredAgentTaskWindowSnapshot = {
  id: string
  sessionId: string | null
  title: string
  prompt: string
  artifacts: AgentArtifact[]
  activeArtifactId: string | null
  loaded: boolean
  temporary: boolean
  customNamed: boolean
  firstPromptSubmitted: boolean
  createdAt: string
  updatedAt: string
}

type StoredAgentWorkspaceSnapshot = {
  tasks: StoredAgentTaskWindowSnapshot[]
  activeTaskId: string | null
  selectedTreeItemId?: string | null
  catalogDocument?: {
    title: string
    content: string
    manualTitle: boolean
    manualContent: boolean
  } | null
}

type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function formatWordCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)} 万字`
  }

  return `${value} 字`
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '待更新'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function resolveNovelTitleState(novel: Novel): { title: string; missing: boolean } {
  const displayTitle = novel.displayTitle?.trim()

  if (displayTitle) {
    return {
      title: displayTitle,
      missing: false,
    }
  }

  const title = novel.title?.trim() ?? ''
  if (title && !BOOTSTRAP_NOVEL_TITLES.has(title)) {
    return {
      title,
      missing: false,
    }
  }

  return {
    title: '还没给这部作品命名',
    missing: true,
  }
}

function isBootstrapNovel(novel: Pick<Novel, 'title' | 'displayTitle' | 'summary' | 'chapterCount' | 'wordCount'>) {
  return (
    !novel.displayTitle?.trim() &&
    BOOTSTRAP_NOVEL_TITLES.has(novel.title) &&
    novel.summary === BOOTSTRAP_NOVEL_SUMMARY &&
    novel.chapterCount === 0 &&
    novel.wordCount === 0
  )
}

function stripLeadingListMarker(value: string) {
  return value
    .trim()
    .replace(/^[\-\*\u2022]\s*/, '')
    .replace(/^\d+[\.\、\)]\s*/, '')
    .replace(/^[一二三四五六七八九十]+[\.\、]\s*/, '')
}

function extractQuotedTitle(value: string) {
  const match = value.match(/[《“"]([^》”"]+)[》”"]/)
  return match?.[1]?.trim() || null
}

function extractNovelTitleCandidate(content: string): string | null {
  const genericTitleCandidates = new Set([
    '推荐书名与定位',
    '推荐书名',
    '书名与定位',
    '作品名与定位',
    '小说名与定位',
    '最佳书名',
    '建议书名',
    '命名方案',
    '书名方案',
  ])
  const lines = content
    .split('\n')
    .map((line) => stripLeadingListMarker(line))
    .filter(Boolean)

  for (const line of lines) {
    const quoted = extractQuotedTitle(line)
    if (quoted && !genericTitleCandidates.has(quoted)) {
      return quoted
    }

    const normalized = line
      .replace(/^\*{1,2}|\*{1,2}$/g, '')
      .replace(/^(推荐书名|书名|作品名|小说名|命名方案|最佳书名|建议书名)[:：]\s*/, '')
      .split(/\s[-|｜]\s|[（(]/)[0]
      .trim()

    if (normalized && normalized.length <= 24 && !genericTitleCandidates.has(normalized)) {
      return normalized
    }
  }

  return null
}

function extractExplicitNovelTitleFromPrompt(promptText: string): string | null {
  const normalized = promptText.trim()
  if (!normalized) {
    return null
  }

  const quotedMatches = Array.from(normalized.matchAll(/[《“"]([^》”"\n]{1,24})[》”"]/g))
  if (quotedMatches.length > 0 && /改成|改为|命名为|起名为|取名为|叫做|叫|换成/u.test(normalized)) {
    const quoted = quotedMatches.at(-1)?.[1]?.trim()
    if (quoted) {
      return quoted
    }
  }

  const directPatterns = [
    /(?:把|将)?(?:作品|作品名|作品名字|书名|小说名|这部作品|这本书|这篇小说)(?:的)?(?:名字|名称|名)?(?:改成|改为|命名为|起名为|取名为|叫做|叫|换成)\s*([^\n，。！？；]{1,24})$/u,
    /(?:改成|改为|命名为|起名为|取名为|叫做|叫|换成)\s*([^\n，。！？；]{1,24})$/u,
  ]

  for (const pattern of directPatterns) {
    const match = normalized.match(pattern)
    const candidate = match?.[1]?.trim()
    if (!candidate) {
      continue
    }

    const cleaned = candidate
      .replace(/[》”"]$/u, '')
      .replace(/[。！？；，,.]$/u, '')
      .trim()

    if (
      cleaned &&
      cleaned.length <= 24 &&
      !/^(一个名|一个名字|名字|书名|作品名|小说名)$/u.test(cleaned)
    ) {
      return cleaned
    }
  }

  return null
}

function extractChapterTitleCandidate(content: string, fallbackOrder: number): string | null {
  const parsed = extractChapterDraftFromContent(content, fallbackOrder)
  const parsedTitle = parsed?.title?.trim()

  if (parsedTitle && parsedTitle !== `第 ${fallbackOrder} 章`) {
    return parsedTitle
  }

  const lines = content
    .split('\n')
    .map((line) => stripLeadingListMarker(line))
    .filter(Boolean)

  for (const line of lines) {
    const labeledTitleMatch = line.match(/^(?:推荐章节名|章节标题|章节名称|章节名|标题|本章标题|建议标题)[:：]\s*(.+)$/)
    if (labeledTitleMatch?.[1]?.trim()) {
      return formatGeneratedChapterTitle(labeledTitleMatch[1].trim(), fallbackOrder)
    }

    const chapterHeadingMatch = line.match(/^(第\s*[0-9一二三四五六七八九十百零]+\s*章(?:\s*[:：\-]\s*.+)?)$/)
    if (chapterHeadingMatch?.[1]?.trim() && chapterHeadingMatch[1].trim() !== `第 ${fallbackOrder} 章`) {
      return formatGeneratedChapterTitle(chapterHeadingMatch[1].trim(), fallbackOrder)
    }
  }

  for (const line of lines) {
    const quoted = extractQuotedTitle(line)
    if (quoted && quoted.length <= 40) {
      return quoted
    }

    const normalized = line
      .replace(/^(推荐章节名|章节标题|章节名称|章节名|标题|本章标题|建议标题)[:：]\s*/, '')
      .split(/\s[-|｜]\s|[（(]/)[0]
      .trim()

    if (normalized && normalized.length <= 40 && !/[，。！？；：]/.test(normalized)) {
      return normalized
    }
  }

  return null
}

function extractFallbackChapterTitleFromBody(content: string, fallbackOrder: number): string | null {
  const normalized = stripLeadingAssistantPreface(content)
  const preparedContent = prepareWritableChapterContent(normalized, fallbackOrder)
  const paragraphs = preparedContent
    .split('\n')
    .map((line) => stripLeadingListMarker(line).trim())
    .filter(Boolean)

  for (const paragraph of paragraphs) {
    const quoted = extractQuotedTitle(paragraph)
    if (quoted && quoted.length >= 2 && quoted.length <= 18) {
      return formatGeneratedChapterTitle(quoted, fallbackOrder)
    }

    const firstSentence = paragraph.split(/[。！？；]/u)[0]?.trim() ?? ''
    if (!firstSentence) {
      continue
    }

    const cleanedSentence = firstSentence
      .replace(/^没有回答[。！]?\s*/u, '')
      .replace(/^以下(?:是|为)?(?:正文|章节正文|本章正文)?[:：]?\s*/u, '')
      .trim()

    if (!cleanedSentence) {
      continue
    }

    const clauseCandidates = [
      cleanedSentence.split(/[，、：]/u)[0]?.trim() ?? '',
      cleanedSentence,
    ].filter(Boolean)

    for (const clause of clauseCandidates) {
      const compact = clause.replace(/\s+/g, '')
      if (!compact) {
        continue
      }

      if (compact.length >= 2 && compact.length <= 18 && /[\u4e00-\u9fa5]/u.test(compact)) {
        return formatGeneratedChapterTitle(compact, fallbackOrder)
      }
    }
  }

  return null
}

function resolveChapterTitleFromContent(content: string, fallbackOrder: number): string | null {
  return extractChapterTitleCandidate(content, fallbackOrder) ?? extractFallbackChapterTitleFromBody(content, fallbackOrder)
}

function formatGeneratedChapterTitle(rawTitle: string, fallbackOrder: number) {
  const normalized = stripLeadingListMarker(rawTitle).replace(/^#{1,6}\s*/, '').trim()

  if (!normalized) {
    return `第 ${fallbackOrder} 章`
  }

  const chapterHeadingMatch = normalized.match(/^(第\s*[0-9一二三四五六七八九十百零]+\s*章)(?:\s*[:：\-]\s*(.+))?$/)
  if (chapterHeadingMatch) {
    const chapterPrefix = chapterHeadingMatch[1].trim()
    const chapterName = chapterHeadingMatch[2]?.trim()
    return chapterName ? `${chapterPrefix}：${chapterName}` : chapterPrefix
  }

  return `第 ${fallbackOrder} 章：${normalized}`
}

function extractChapterDraftFromContent(content: string, fallbackOrder: number) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return null
  }

  const firstLine = stripLeadingListMarker(lines[0]).replace(/^#{1,6}\s*/, '').trim()
  const labeledTitleMatch = firstLine.match(/^(?:章节标题|章节名|标题)[:：]\s*(.+)$/)
  const chapterHeadingMatch = firstLine.match(/^(第\s*[0-9一二三四五六七八九十百零]+\s*章)(?:\s*[:：\-]\s*(.+))?$/)

  if (labeledTitleMatch || chapterHeadingMatch) {
    const rawTitle = labeledTitleMatch?.[1] ?? firstLine
    const body = content
      .split('\n')
      .slice(1)
      .join('\n')
      .trim()

    return {
      title: formatGeneratedChapterTitle(rawTitle.trim(), fallbackOrder),
      content: body,
    }
  }

  return {
    title: `第 ${fallbackOrder} 章`,
    content: content.trim(),
  }
}

function isLikelyStandaloneTitleResult(content: string, fallbackOrder: number) {
  const normalized = stripLeadingAssistantPreface(content)
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return false
  }

  const candidateTitle = extractChapterTitleCandidate(normalized, fallbackOrder)
  if (!candidateTitle) {
    return false
  }

  const parsed = extractChapterDraftFromContent(normalized, fallbackOrder)
  if (parsed?.content.trim() === '') {
    return true
  }

  if (lines.length === 1) {
    const compact = lines[0].replace(/\s+/g, '').trim()
    return compact.length > 0 && compact.length <= 40 && !/[，。！？；：]/.test(compact)
  }

  if (
    lines.length === 2 &&
    /^第\s*[0-9一二三四五六七八九十百零]+\s*章$/u.test(lines[0]) &&
    lines[1].length <= 40 &&
    !/[，。！？；：]/.test(lines[1])
  ) {
    return true
  }

  return false
}

function stripCodeFenceWrapper(content: string) {
  const trimmed = content.trim()

  if (!trimmed.startsWith('```') || !trimmed.endsWith('```')) {
    return trimmed
  }

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
}

function stripLeadingAssistantPreface(content: string) {
  const normalized = stripCodeFenceWrapper(content)

  const explicitPrefacePatterns = [
    /^(?:抱歉|不好意思)[^\n]{0,80}?(?:以下|下面)是(?:完整的)?(?:章节|正文)内容[：:]\s*/u,
    /^(?:以下|下面)是(?:完整的)?(?:章节|正文)内容[：:]\s*/u,
    /^(?:我来(?:直接)?|我已经(?:为你)?|这就)(?:补上|整理|写出|给出)[^\n]{0,80}?[：:]\s*/u,
  ]

  for (const pattern of explicitPrefacePatterns) {
    if (pattern.test(normalized)) {
      return normalized.replace(pattern, '').trim()
    }
  }

  const headingMatches = [
    normalized.search(/(^|\n)#{1,6}\s+/),
    normalized.search(/(^|\n)第\s*[0-9一二三四五六七八九十百零]+\s*章[^\n]*/),
    normalized.search(/(^|\n)(?:章节标题|章节名|标题)[:：]/),
  ].filter((index) => index > 0)

  const firstHeadingIndex = headingMatches.length > 0 ? Math.min(...headingMatches) : -1
  if (firstHeadingIndex > 0) {
    const prefix = normalized.slice(0, firstHeadingIndex)
    if (
      containsAnyKeyword(prefix, ['抱歉', '不好意思', '以下是', '下面是', '完整的章节内容', '正文内容', '我来', '我已经'])
    ) {
      return normalized.slice(firstHeadingIndex).trim()
    }
  }

  return normalized
}

function isLikelyConversationalWriteback(content: string) {
  const normalized = stripCodeFenceWrapper(content).trim()

  if (!normalized) {
    return false
  }

  const compact = normalized.replace(/\s+/g, '')
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const firstLine = lines[0] ?? ''
  const hasBodyLikeStructure =
    lines.length >= 3 ||
    /[\n]/.test(normalized) ||
    /[“”"『「」』]/.test(normalized) ||
    /(?:忽然|随后|此刻|这时|然后|门外|脚步|空气|目光|声音)/.test(normalized)

  if (
    /^(?:标题|章节标题|章节名|书名|作品名)[:：]\s*[^\n]{1,40}$/u.test(firstLine) ||
    /^《[^》\n]{1,40}》$/u.test(firstLine)
  ) {
    return true
  }

  if (hasBodyLikeStructure || compact.length > 120) {
    return [
      /当前正文的第?[一1二2三3四4五5六6七7八8九9十0]+行/u,
      /如果你觉得[^。！？\n]{0,80}(?:不合适|不满意|可以|想要)/u,
      /可以直接告诉我[^。！？\n]{0,80}/u,
      /我来给出修改后的完整/u,
      /已经写进去了/u,
      /不需要做任何操作/u,
    ].some((pattern) => pattern.test(normalized))
  }

  return [
    /^(?:抱歉|不好意思)[^。！？\n]{0,80}(?:标题|章节名|书名|作品名|这一章|这章)/u,
    /^(?:可以|建议|推荐|不如)[^。！？\n]{0,50}(?:叫|命名为|取名为)/u,
    /^(?:以下|下面|这里是)[^。！？\n]{0,60}(?:标题|章节名|书名|作品名|正文|内容)/u,
    /^(?:我(?:来|给你|先|已经)|这就)[^。！？\n]{0,60}(?:标题|章节名|书名|作品名|整理|补上|给出)/u,
    /^(?:当前正文的第?[一1二2三3四4五5六6七7八8九9十0]+行就是)/u,
    /^(?:如果你觉得|如果保持现在的状态)/u,
  ].some((pattern) => pattern.test(compact))
}

function prepareWritableChapterContent(content: string, fallbackOrder: number) {
  const normalized = stripLeadingAssistantPreface(content)

  if (isLikelyConversationalWriteback(normalized)) {
    return ''
  }

  const parsed = extractChapterDraftFromContent(normalized, fallbackOrder)

  if (parsed?.content && parsed.content.trim() && parsed.content.trim() !== normalized) {
    return parsed.content.trim()
  }

  return normalized
}

function prepareWritableChapterDraft(content: string, fallbackOrder: number) {
  const normalized = stripLeadingAssistantPreface(content)

  if (isLikelyConversationalWriteback(normalized)) {
    return null
  }

  if (isLikelyStandaloneTitleResult(normalized, fallbackOrder)) {
    return {
      title: extractChapterTitleCandidate(normalized, fallbackOrder) ?? '',
      content: '',
    }
  }

  const parsed = extractChapterDraftFromContent(normalized, fallbackOrder)
  return {
    title: parsed?.title?.trim() || '',
    content: parsed ? parsed.content.trim() : normalized,
  }
}

function isGenericChapterTitle(title: string, fallbackOrder: number) {
  const normalized = title.replace(/\s+/g, '').trim()

  if (!normalized) {
    return true
  }

  return (
    normalized === `第${fallbackOrder}章` ||
    normalized === `第${fallbackOrder}章：第${fallbackOrder}章` ||
    /^第[0-9一二三四五六七八九十百零]+章$/.test(normalized)
  )
}

function resolveChapterTitleForWrite(currentTitle: string, generatedTitle: string, fallbackOrder: number) {
  const normalizedCurrent = currentTitle.trim()
  const normalizedGenerated = generatedTitle.trim()

  if (
    normalizedGenerated &&
    normalizedGenerated !== `第 ${fallbackOrder} 章` &&
    (!normalizedCurrent || isGenericChapterTitle(normalizedCurrent, fallbackOrder))
  ) {
    return normalizedGenerated
  }

  return normalizedCurrent || normalizedGenerated || `第 ${fallbackOrder} 章`
}

function replaceSelectionContentPrecisely(options: {
  currentContent: string
  replacement: string
  selection: EditorSelectionState
}) {
  const { currentContent, replacement, selection } = options
  const selectedText = selection.text.trim()

  if (selection.end > selection.start && currentContent.slice(selection.start, selection.end) === selection.text) {
    return `${currentContent.slice(0, selection.start)}${replacement}${currentContent.slice(selection.end)}`.trim()
  }

  if (selectedText) {
    const selectedIndex = currentContent.indexOf(selection.text)
    if (selectedIndex >= 0) {
      return `${currentContent.slice(0, selectedIndex)}${replacement}${currentContent.slice(selectedIndex + selection.text.length)}`.trim()
    }
  }

  return null
}

function containsAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword))
}

function hasPromptNovelMetaIntent(promptText: string) {
  return containsAnyKeyword(promptText, [
    '作品简介',
    '作品介绍',
    '作品内容介绍',
    '内容介绍',
    '简介',
    '介绍页',
    '副标题',
    '标签',
    '作品信息',
  ])
}

function hasMultipleWorkspaceGoals(promptText: string) {
  const normalized = promptText.trim().replace(/\s+/g, '')
  if (!normalized) {
    return false
  }

  const goalFlags = [
    containsAnyKeyword(normalized, ['封面', '提示词', 'cover']),
    hasPromptNovelMetaIntent(normalized),
    hasNovelNamingIntent(normalized),
    hasChapterBodyWritingIntent(normalized) || containsAnyKeyword(normalized, ['章节', '正文', '续写']),
  ].filter(Boolean)

  return goalFlags.length > 1 || /并且|并|同时|再|然后/u.test(normalized)
}

function hasPromptRewriteIntent(promptText: string) {
  return containsAnyKeyword(promptText, [
    '改写',
    '重写',
    '改一下',
    '改一改',
    '修改',
    '调整',
    '改成',
    '改下',
    '修一下',
  ])
}

function hasPromptPolishIntent(promptText: string) {
  return containsAnyKeyword(promptText, [
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

function shouldUseChapterContentAsImplicitSelection(promptText: string) {
  const normalized = promptText.trim().replace(/\s+/g, '')
  if (!normalized) {
    return false
  }

  const mentionsEditAction =
    hasPromptRewriteIntent(normalized) ||
    hasPromptPolishIntent(normalized) ||
    containsAnyKeyword(normalized, ['补充', '补足', '增强', '丰富', '细化', '优化'])
  const mentionsExistingChapter = containsAnyKeyword(normalized, [
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
  const mentionsPartialScope = containsAnyKeyword(normalized, [
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
  const disallowFullRewrite = containsAnyKeyword(normalized, [
    '不要全部重写',
    '不需要全部重写',
    '不要整章重写',
    '不是全部重写',
    '不用全部重写',
    '不要全改',
  ])

  return mentionsEditAction && (mentionsExistingChapter || mentionsPartialScope || disallowFullRewrite)
}

function resolveAgentSelectedText(promptText: string, selectedText?: string | null, chapterContent?: string | null) {
  const explicitSelection = selectedText?.trim() ?? ''
  if (explicitSelection) {
    return explicitSelection
  }

  const normalizedChapterContent = chapterContent?.trim() ?? ''
  if (!normalizedChapterContent) {
    return ''
  }

  return shouldUseChapterContentAsImplicitSelection(promptText) ? normalizedChapterContent : ''
}

function hasNovelNamingIntent(promptText: string) {
  const normalized = promptText.replace(/\s+/g, '')
  const mentionsNovelSubject = containsAnyKeyword(normalized, [
    '书名',
    '作品名',
    '小说名',
    '作品',
    '小说',
    '这本书',
    '这部作品',
    '这篇小说',
  ])
  const mentionsNamingAction = containsAnyKeyword(normalized, [
    '命名',
    '命个名',
    '命一个名',
    '起名',
    '起个名',
    '起个名字',
    '取名',
    '取个名',
    '取个名字',
    '改名',
    '改个名',
    '改个名字',
    '换个名字',
    '想个名字',
  ])
  const requestsMultipleOptions = containsAnyKeyword(normalized, ['候选', '备选', '多个', '几个', '建议', '方案'])
  const mentionsChapterContext = containsAnyKeyword(normalized, [
    '章节',
    '章名',
    '章节名',
    '章节标题',
    '这章',
    '本章',
    '这一章',
  ])

  return (mentionsNovelSubject && mentionsNamingAction) || (
    containsAnyKeyword(normalized, ['书名', '作品名', '小说名']) &&
    !requestsMultipleOptions &&
    !mentionsChapterContext
  )
}

function parseChapterOrderToken(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized)
  }

  const numerals = new Map([
    ['零', 0],
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5],
    ['六', 6],
    ['七', 7],
    ['八', 8],
    ['九', 9],
  ])

  let result = 0
  let current = 0

  for (const char of normalized) {
    if (char === '十') {
      result += (current || 1) * 10
      current = 0
      continue
    }

    if (char === '百') {
      result += (current || 1) * 100
      current = 0
      continue
    }

    const numeric = numerals.get(char)
    if (numeric === undefined) {
      return null
    }

    current = numeric
  }

  return result + current || null
}

function extractRequestedChapterOrder(promptText: string) {
  const normalized = promptText.replace(/\s+/g, '')
  const match = normalized.match(/第([0-9零一二三四五六七八九十百两]+)章/u)

  if (!match) {
    return null
  }

  return parseChapterOrderToken(match[1])
}

function resolveRequestedChapterOrder(promptText: string, chapterCount: number) {
  const explicitOrder = extractRequestedChapterOrder(promptText)
  if (explicitOrder && explicitOrder > 0) {
    return explicitOrder
  }

  const normalized = promptText.replace(/\s+/g, '')
  if (containsAnyKeyword(normalized, ['下一章', '下章'])) {
    return Math.max(1, chapterCount + 1)
  }

  return Math.max(1, chapterCount + 1)
}

function resolveRequestedExistingChapterId(
  promptText: string,
  chapters: StudioPayload['chapters'],
) {
  const requestedOrder = extractRequestedChapterOrder(promptText)
  if (!requestedOrder) {
    return null
  }

  return chapters.find((chapter) => chapter.orderIndex === requestedOrder)?.id ?? null
}

function shouldAutoRenameNovel(promptText: string, task: AgentTaskType) {
  if (task !== 'generate-novel-title' && task !== 'workspace-agent') {
    return false
  }

  return hasNovelNamingIntent(promptText)
}

function shouldAutoRenameChapter(promptText: string, task: AgentTaskType) {
  const normalized = promptText.trim()

  if (task !== 'generate-chapter-titles' && task !== 'workspace-agent') {
    return false
  }

  return (
    containsAnyKeyword(normalized, [
      '章节标题',
      '章节名称',
      '章节名',
      '章名',
      '加标题',
      '起标题',
      '给章节命名',
      '帮我给章节命名',
      '给这章命名',
      '给这一章命名',
      '给本章命名',
      '改章节名',
      '改章名',
    ]) &&
    !containsAnyKeyword(normalized, ['候选', '备选', '多个', '几个', '建议', '方案', '目录', '全部章节', '所有章节'])
  )
}

function isTitleOnlyChapterRequest(promptText: string, task: AgentTaskType) {
  const normalized = promptText.trim()

  if (task !== 'generate-chapter-titles' && task !== 'workspace-agent') {
    return false
  }

  const titleIntentKeywords = [
    '标题',
    '题目',
    '章节标题',
    '章节名称',
    '章节名',
    '章名',
    '给第二章加标题',
    '给这章加标题',
    '给这一章加标题',
    '给本章加标题',
    '给第二章起标题',
    '给这章起标题',
    '给这一章起标题',
    '给本章起标题',
    '命名',
    '改名',
  ]
  const bodyIntentKeywords = [
    '正文',
    '内容',
    '续写',
    '扩写',
    '补写',
    '补全',
    '展开',
    '写一段',
    '写点',
    '写进去',
    '写入',
  ]

  return containsAnyKeyword(normalized, titleIntentKeywords) && !containsAnyKeyword(normalized, bodyIntentKeywords)
}

function shouldAutoCreateChapter(
  promptText: string,
  currentChapterOrder?: number | null,
  chapterCount?: number,
  chapters?: StudioPayload['chapters'],
) {
  const normalized = promptText.replace(/\s+/g, '')
  const explicitCreateKeywords = ['创建章节', '新建章节', '新增章节', '加一章', '开一章']
  const bodyIntentKeywords = ['写', '起草', '生成', '续写', '扩写', '正文', '内容']

  if (containsAnyKeyword(normalized, explicitCreateKeywords)) {
    return true
  }

  const chapterOrder = extractRequestedChapterOrder(normalized)
  if (chapterOrder === null) {
    return containsAnyKeyword(normalized, ['下一章', '下章']) && containsAnyKeyword(normalized, bodyIntentKeywords)
  }

  if (!containsAnyKeyword(normalized, bodyIntentKeywords)) {
    return false
  }

  if (chapters?.length) {
    const chapterExists = chapters.some((chapter) => chapter.orderIndex === chapterOrder)
    if (!chapterExists) {
      return true
    }
  }

  const baselineOrder = Math.max(currentChapterOrder ?? 0, chapterCount ?? 0)
  return chapterOrder > baselineOrder
}

function hasChapterBodyWritingIntent(promptText: string) {
  const normalized = promptText.trim().replace(/\s+/g, '')

  if (!normalized) {
    return false
  }

  const bodyIntentKeywords = [
    '写',
    '起草',
    '生成',
    '续写',
    '扩写',
    '补写',
    '补全',
    '展开',
    '正文',
    '内容',
  ]
  const chapterTargetKeywords = ['章节', '这章', '这一章', '本章', '下一章', '下章', '首章', '开篇']
  const directWriteKeywords = [
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
  ]

  if (isTitleOnlyChapterRequest(normalized, 'workspace-agent')) {
    return false
  }

  if (containsAnyKeyword(normalized, directWriteKeywords)) {
    return true
  }

  return (
    containsAnyKeyword(normalized, bodyIntentKeywords) &&
    (extractRequestedChapterOrder(normalized) !== null || containsAnyKeyword(normalized, chapterTargetKeywords))
  )
}

function shouldAutoWriteChapter(promptText: string, task: AgentTaskType) {
  const normalized = promptText.trim()

  if (task === 'continue-chapter') {
    return true
  }

  if (isTitleOnlyChapterRequest(normalized, task)) {
    return false
  }

  const explicitWriteKeywords = [
    '写进',
    '写入',
    '直接写',
    '写一下',
    '写点',
    '帮我写',
    '续写',
    '扩写',
    '补写',
    '在里面写',
    '里面内容',
    '写里面内容',
    '写一下里面内容',
    '写点内容',
    '章节内容',
    '这章内容',
    '这一章内容',
    '本章内容',
    '写正文',
    '正文内容',
    '写这章',
    '写这一章',
    '写本章',
    '生成正文',
    '填充正文',
    '多写一点',
    '多写一些',
    '再写一点',
    '再写一些',
    '补充内容',
    '扩充内容',
    '丰富内容',
    '展开写',
    '展开这一章',
    '补全这一章',
  ]

  if (task === 'draft-chapter') {
    return (
      containsAnyKeyword(normalized, explicitWriteKeywords) ||
      !containsAnyKeyword(normalized, ['章节名', '章名', '书名', '作品名', '小说名', '计划', '大纲', '目录', '封面', '提示词'])
    )
  }

  if (task !== 'workspace-agent') {
    return false
  }

  return containsAnyKeyword(normalized, explicitWriteKeywords) || hasChapterBodyWritingIntent(normalized)
}

type AutoApplyAgentResult =
  | { applied: false; reason?: string }
  | {
      applied: true
      message: string
      patch: Partial<AgentArtifact>
    }

type AgentExecutionStep =
  & {
    stepId: string
    toolName: AgentActionPlanStep['toolName']
    title: string
    target: AgentActionPlanStep['target']
  }
  & (
    | { kind: 'rename_novel'; titleOverride?: string }
    | { kind: 'create_chapter' }
    | { kind: 'rename_chapter' }
    | { kind: 'update_novel_meta'; payload: UpdateNovelRequest }
    | { kind: 'set_cover_prompt'; prompt: string }
    | { kind: 'generate_cover'; prompt?: string; count?: number }
    | { kind: 'apply_cover'; source?: 'latest_generated' | 'selected' }
    | { kind: 'open_meta' }
    | { kind: 'open_cover' }
    | {
        kind: 'write_chapter'
        forceWriteMode?: 'create' | 'append' | 'replace'
      }
  )

function buildExecutionStepBase(
  stepId: string,
  toolName: AgentActionPlanStep['toolName'],
  title: string,
  target: AgentActionPlanStep['target'],
) {
  return {
    stepId,
    toolName,
    title,
    target,
  }
}

function resolveWriteStepFromApplyStrategies(availableApplyStrategies?: string[] | null): AgentExecutionStep | null {
  if (!availableApplyStrategies?.length) {
    return null
  }

  for (const strategy of availableApplyStrategies) {
    if (strategy === 'appendChapterContent') {
      return {
        ...buildExecutionStepBase('fallback-append-chapter', 'chapter.append', '将最新内容追加到目标章节', {
          scope: 'chapter',
        }),
        kind: 'write_chapter',
        forceWriteMode: 'append',
      }
    }

    if (strategy === 'replaceChapterContent') {
      return {
        ...buildExecutionStepBase('fallback-write-chapter', 'chapter.write', '将最新正文写入目标章节', {
          scope: 'chapter',
        }),
        kind: 'write_chapter',
        forceWriteMode: 'replace',
      }
    }
  }

  return null
}

function buildNewChapterExecutionSteps() {
  return [
    {
      ...buildExecutionStepBase('fallback-create-chapter', 'chapter.create', '先创建空白章节', {
        scope: 'novel',
      }),
      kind: 'create_chapter' as const,
    },
    {
      ...buildExecutionStepBase('fallback-rename-chapter', 'chapter.rename', '补齐章节标题', {
        scope: 'chapter',
      }),
      kind: 'rename_chapter' as const,
    },
    {
      ...buildExecutionStepBase('fallback-write-chapter', 'chapter.write', '将正文写入新章节', {
        scope: 'chapter',
      }),
      kind: 'write_chapter' as const,
      forceWriteMode: 'replace' as const,
    },
  ]
}

function resolveFallbackExecutionPlanFromTask(
  task: AgentTaskType,
  availableApplyStrategies?: string[] | null,
  options?: {
    hasSelectedPersistedChapter?: boolean
    hasAnyChapter?: boolean
  },
) {
  const strategyWriteStep = resolveWriteStepFromApplyStrategies(availableApplyStrategies)
  const hasSelectedPersistedChapter = options?.hasSelectedPersistedChapter ?? false
  const hasAnyChapter = options?.hasAnyChapter ?? false

  switch (task) {
    case 'generate-novel-title':
      return {
        steps: [
          {
            ...buildExecutionStepBase('fallback-rename-novel', 'novel.rename', '同步作品命名', {
              scope: 'novel',
            }),
            kind: 'rename_novel' as const,
          },
        ],
      }
    case 'generate-chapter-titles':
      return {
        steps: [
          {
            ...buildExecutionStepBase('fallback-rename-chapter', 'chapter.rename', '同步章节标题', {
              scope: 'chapter',
            }),
            kind: 'rename_chapter' as const,
          },
        ],
      }
    case 'continue-chapter':
      return {
        steps: strategyWriteStep
          ? [strategyWriteStep]
          : hasSelectedPersistedChapter || hasAnyChapter
            ? [
                {
                  ...buildExecutionStepBase('fallback-append-chapter', 'chapter.append', '将最新内容追加到目标章节', {
                    scope: 'chapter',
                  }),
                  kind: 'write_chapter' as const,
                  forceWriteMode: 'append' as const,
                },
              ]
            : buildNewChapterExecutionSteps(),
      }
    case 'draft-chapter':
      return {
        steps: strategyWriteStep
          ? [strategyWriteStep]
          : hasSelectedPersistedChapter
            ? [
                {
                  ...buildExecutionStepBase('fallback-write-chapter', 'chapter.write', '将正文写入当前章节', {
                    scope: 'chapter',
                  }),
                  kind: 'write_chapter' as const,
                  forceWriteMode: 'replace' as const,
                },
              ]
            : buildNewChapterExecutionSteps(),
      }
    case 'rewrite-selection':
    case 'polish-selection':
      return {
        steps: [
          strategyWriteStep ?? {
            ...buildExecutionStepBase('fallback-rewrite-selection', 'chapter.write', '将修改内容写回当前章节', {
              scope: 'chapter',
            }),
            kind: 'write_chapter' as const,
            forceWriteMode: 'replace' as const,
          },
        ],
      }
    case 'workspace-agent':
      return {
        steps: [],
      }
    default:
      return {
        steps: strategyWriteStep ? [strategyWriteStep] : [],
      }
  }
}

function getAgentWorkspaceStorageKey(novelId: string) {
  return `${AGENT_WORKSPACE_STORAGE_PREFIX}:${novelId}`
}

function createLocalAgentTaskWindow(overrides?: Partial<AgentTaskWindowState>): AgentTaskWindowState {
  const createdAt = overrides?.createdAt ?? new Date().toISOString()

  return {
    id: overrides?.id ?? `local-agent-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: overrides?.sessionId ?? null,
    title: overrides?.title?.trim() || DEFAULT_AGENT_TASK_TITLE,
    prompt: overrides?.prompt ?? '',
    artifacts: overrides?.artifacts ?? [],
    activeArtifactId: overrides?.activeArtifactId ?? overrides?.artifacts?.[0]?.id ?? null,
    loaded: overrides?.loaded ?? false,
    temporary: overrides?.temporary ?? true,
    customNamed: overrides?.customNamed ?? false,
    firstPromptSubmitted: overrides?.firstPromptSubmitted ?? false,
    createdAt,
    updatedAt: overrides?.updatedAt ?? createdAt,
  }
}

function buildAgentTaskWindowFromSession(session: AgentSession): AgentTaskWindowState {
  return createLocalAgentTaskWindow({
    id: session.id,
    sessionId: session.id,
    title: session.title,
    temporary: false,
    loaded: false,
    customNamed: session.title.trim() !== DEFAULT_AGENT_TASK_TITLE && !session.title.includes('写作会话'),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  })
}

function getAgentTaskWindowTimestamp(taskWindow: Pick<AgentTaskWindowState, 'updatedAt' | 'createdAt'>) {
  const timestamp = new Date(taskWindow.updatedAt || taskWindow.createdAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function choosePreferredAgentTaskWindow(
  left: AgentTaskWindowState,
  right: AgentTaskWindowState,
): AgentTaskWindowState {
  const preferredByTime =
    getAgentTaskWindowTimestamp(right) > getAgentTaskWindowTimestamp(left) ? right : left
  const alternate = preferredByTime === right ? left : right

  return {
    ...alternate,
    ...preferredByTime,
    title: preferredByTime.customNamed ? preferredByTime.title : alternate.customNamed ? alternate.title : preferredByTime.title,
    prompt:
      preferredByTime.prompt.trim().length >= alternate.prompt.trim().length ? preferredByTime.prompt : alternate.prompt,
    artifacts:
      preferredByTime.artifacts.length >= alternate.artifacts.length ? preferredByTime.artifacts : alternate.artifacts,
    activeArtifactId: preferredByTime.activeArtifactId ?? alternate.activeArtifactId,
    loaded: preferredByTime.loaded || alternate.loaded,
    temporary: preferredByTime.temporary && alternate.temporary,
    customNamed: preferredByTime.customNamed || alternate.customNamed,
    firstPromptSubmitted: preferredByTime.firstPromptSubmitted || alternate.firstPromptSubmitted,
  }
}

function dedupeAgentTaskWindows(taskWindows: AgentTaskWindowState[]) {
  const deduped = new Map<string, AgentTaskWindowState>()

  for (const taskWindow of taskWindows) {
    const key = taskWindow.sessionId ? `session:${taskWindow.sessionId}` : `local:${taskWindow.id}`
    const existingTaskWindow = deduped.get(key)

    if (!existingTaskWindow) {
      deduped.set(key, taskWindow)
      continue
    }

    deduped.set(key, choosePreferredAgentTaskWindow(existingTaskWindow, taskWindow))
  }

  return Array.from(deduped.values()).sort(
    (left, right) => getAgentTaskWindowTimestamp(right) - getAgentTaskWindowTimestamp(left),
  )
}

function shouldDisplayListedAgentSession(
  session: Pick<AgentSession, 'title' | 'lastRunAt'>,
  hasLocalMatch: boolean,
) {
  if (hasLocalMatch) {
    return true
  }

  const normalizedTitle = session.title.trim()
  return Boolean(session.lastRunAt) || (normalizedTitle && normalizedTitle !== DEFAULT_AGENT_TASK_TITLE)
}

function deriveAgentTaskTitle(promptText: string, artifacts: AgentArtifact[]) {
  const normalized = promptText.replace(/\s+/g, '')
  const keywordPairs: Array<[RegExp, string]> = [
    [/封面.*简介|简介.*封面/u, '封面简介设定'],
    [/封面/u, '封面设计任务'],
    [/简介|介绍页|作品介绍/u, '作品介绍完善'],
    [/书名|作品名|小说名|命名/u, '作品命名调整'],
    [/计划|大纲|规划|世界观|设定|主线/u, '创作计划整理'],
    [/续写|起草|正文|第[一二三四五六七八九十0-9]+章/u, '章节写作推进'],
    [/润色|改写/u, '正文润改处理'],
    [/审阅|一致性|设定/u, '设定审阅整理'],
  ]

  const matched = keywordPairs.find(([pattern]) => pattern.test(normalized))
  const baseTitle = matched?.[1] ?? artifacts[0]?.title ?? (promptText.trim() || DEFAULT_AGENT_TASK_TITLE)
  const compact = baseTitle
    .replace(/[，。！？、,.!?:：；;“”"'‘’《》【】（）()\[\]\-_\s]/g, '')
    .trim()

  if (compact.length >= AGENT_TASK_TITLE_MIN_LENGTH) {
    return compact.slice(0, AGENT_TASK_TITLE_MAX_LENGTH)
  }

  const promptCompact = promptText
    .replace(/[，。！？、,.!?:：；;“”"'‘’《》【】（）()\[\]\-_\s]/g, '')
    .trim()

  if (promptCompact.length >= AGENT_TASK_TITLE_MIN_LENGTH) {
    return promptCompact.slice(0, AGENT_TASK_TITLE_MAX_LENGTH)
  }

  return `${DEFAULT_AGENT_TASK_TITLE}${artifacts.length > 0 ? '会话' : ''}`.slice(0, AGENT_TASK_TITLE_MAX_LENGTH)
}

function readStoredAgentWorkspace(novelId: string): StoredAgentWorkspaceSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(getAgentWorkspaceStorageKey(novelId))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as
      | (StoredAgentWorkspaceSnapshot & {
          sessionId?: string | null
          prompt?: string
          artifacts?: AgentArtifact[]
          activeArtifactId?: string | null
        })
      | null

    const tasks = Array.isArray(parsed?.tasks)
      ? parsed.tasks
          .filter((task): task is StoredAgentTaskWindowSnapshot => Boolean(task && typeof task === 'object'))
          .map((task) =>
            createLocalAgentTaskWindow({
              ...task,
              id: typeof task.id === 'string' ? task.id : undefined,
              sessionId: typeof task.sessionId === 'string' ? task.sessionId : null,
              title: typeof task.title === 'string' ? task.title : DEFAULT_AGENT_TASK_TITLE,
              prompt: typeof task.prompt === 'string' ? task.prompt : '',
              artifacts: Array.isArray(task.artifacts) ? task.artifacts : [],
              activeArtifactId: typeof task.activeArtifactId === 'string' ? task.activeArtifactId : null,
              loaded: Boolean(task.loaded),
              temporary: Boolean(task.temporary),
              customNamed: Boolean(task.customNamed),
              firstPromptSubmitted: Boolean(task.firstPromptSubmitted),
            }),
          )
      : Array.isArray(parsed?.artifacts)
        ? [
            createLocalAgentTaskWindow({
              id: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
              sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
              title: DEFAULT_AGENT_TASK_TITLE,
              prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
              artifacts: parsed.artifacts,
              activeArtifactId: typeof parsed.activeArtifactId === 'string' ? parsed.activeArtifactId : null,
              loaded: true,
              temporary: !parsed.sessionId,
            }),
          ]
        : []

    return {
      tasks,
      activeTaskId: typeof parsed?.activeTaskId === 'string' ? parsed.activeTaskId : tasks[0]?.id ?? null,
      selectedTreeItemId: typeof parsed?.selectedTreeItemId === 'string' ? parsed.selectedTreeItemId : null,
      catalogDocument:
        parsed?.catalogDocument && typeof parsed.catalogDocument === 'object'
          ? {
              title: typeof parsed.catalogDocument.title === 'string' ? parsed.catalogDocument.title : '目录',
              content: typeof parsed.catalogDocument.content === 'string' ? parsed.catalogDocument.content : '',
              manualTitle: Boolean(parsed.catalogDocument.manualTitle),
              manualContent: Boolean(parsed.catalogDocument.manualContent),
            }
          : null,
    }
  } catch {
    return null
  }
}

function mapHistoryActionToTask(action: AgentSessionHistoryItem['run']['action']): AgentTaskType {
  switch (action) {
    case 'planChapter':
      return 'plan-chapter'
    case 'draftChapter':
      return 'draft-chapter'
    case 'continueChapter':
      return 'continue-chapter'
    case 'rewriteSelection':
      return 'rewrite-selection'
    case 'polishSelection':
      return 'polish-selection'
    case 'reviewContinuity':
      return 'review-continuity'
    case 'generateCoverPrompt':
      return 'generate-cover-prompt'
    default:
      return 'workspace-agent'
  }
}

function mapHistoryArtifactType(
  artifactType: AgentSessionHistoryItem['artifacts'][number]['artifactType'],
): AgentArtifact['type'] {
  switch (artifactType) {
    case 'chapterPlan':
      return 'chapter_plan'
    case 'coverPrompt':
      return 'cover_prompt'
    case 'continuityReview':
      return 'review_report'
    default:
      return 'draft_text'
  }
}

function asArtifactActionPlan(value: unknown): AgentActionPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentActionPlan>
  if (
    (candidate.mode !== 'plan' && candidate.mode !== 'execute' && candidate.mode !== 'review') ||
    typeof candidate.summary !== 'string' ||
    !Array.isArray(candidate.steps)
  ) {
    return null
  }

  return candidate as AgentActionPlan
}

function asArtifactHandoff(value: unknown): AgentActionHandoff | null {
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

function asArtifactExecutionMode(value: unknown): AgentExecutionMode | null {
  return value === 'plan' || value === 'build' || value === 'review' ? value : null
}

function asArtifactExecutionAgent(value: unknown): AgentExecutionAgent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentExecutionAgent>
  if (
    (candidate.agentType !== 'writingOrchestrator' &&
      candidate.agentType !== 'storyPlanner' &&
      candidate.agentType !== 'draftWriter' &&
      candidate.agentType !== 'continuityEditor' &&
      candidate.agentType !== 'styleEditor' &&
      candidate.agentType !== 'loreLibrarian' &&
      candidate.agentType !== 'coverPromptAgent') ||
    (candidate.role !== 'primary' && candidate.role !== 'specialist') ||
    typeof candidate.title !== 'string' ||
    typeof candidate.description !== 'string'
  ) {
    return null
  }

  return candidate as AgentExecutionAgent
}

function asArtifactRouteDecision(value: unknown): AgentRouteDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentRouteDecision>
  if (
    !asArtifactExecutionAgent(candidate.sourceAgent) ||
    !asArtifactExecutionAgent(candidate.targetAgent) ||
    typeof candidate.task !== 'string' ||
    typeof candidate.intentLabel !== 'string' ||
    typeof candidate.summary !== 'string'
  ) {
    return null
  }

  return candidate as AgentRouteDecision
}

function buildHistoryStatusItems(
  actionPlan: AgentActionPlan | null,
  routeDecision: AgentRouteDecision | null,
  runId: string,
  createdAt: string,
): AgentRunStatusItem[] {
  const thinkingItems = Array.isArray(actionPlan?.thinking)
    ? actionPlan.thinking
        .map((item, index) =>
          typeof item === 'string' && item.trim()
            ? {
                id: `${runId}-thinking-${index + 1}`,
                event: 'task.thinking',
                text: item.trim(),
                createdAt,
              }
            : null,
        )
        .filter((item): item is AgentRunStatusItem => Boolean(item))
    : []
  const stepItems =
    actionPlan?.steps.flatMap((step, index) => {
      const reasoning =
        typeof step.payload?.reasoning === 'string' && step.payload.reasoning.trim()
          ? [
              {
                id: `${runId}-step-thinking-${index + 1}`,
                event: 'task.thinking',
                text: step.payload.reasoning.trim(),
                createdAt,
              } satisfies AgentRunStatusItem,
            ]
          : []

      const title =
        typeof step.title === 'string' && step.title.trim() ? step.title.trim() : '按顺序执行一项工作台操作。'

      return [
        ...reasoning,
        {
          id: `${runId}-step-${index + 1}`,
          event: 'task.step',
          text: title,
          createdAt,
        } satisfies AgentRunStatusItem,
      ]
    }) ?? []

  if (thinkingItems.length > 0 || stepItems.length > 0) {
    return [
      ...(actionPlan?.summary?.trim()
        ? [
            {
              id: `${runId}-task-summary`,
              event: 'task.decomposed',
              text: actionPlan.summary.trim(),
              createdAt,
            } satisfies AgentRunStatusItem,
          ]
        : []),
      ...thinkingItems,
      ...stepItems,
    ]
  }

  if (!routeDecision) {
    return []
  }

  return [
    {
      id: `${runId}-route-decided`,
      event: 'route.decided',
      text: routeDecision.summary,
      createdAt,
    },
  ]
}

function asArtifactToolPolicy(value: unknown): AgentWorkspaceToolPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentWorkspaceToolPolicy>
  if (
    (candidate.mode !== 'plan' && candidate.mode !== 'build' && candidate.mode !== 'review') ||
    !Array.isArray(candidate.tools)
  ) {
    return null
  }

  return candidate as AgentWorkspaceToolPolicy
}

function asArtifactRuleBundle(value: unknown): AgentRuleBundle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentRuleBundle>
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.rules)) {
    return null
  }

  return candidate as AgentRuleBundle
}

function asArtifactStoryMemoryDigest(value: unknown): AgentStoryMemoryDigest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Partial<AgentStoryMemoryDigest>
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.items)) {
    return null
  }

  return candidate as AgentStoryMemoryDigest
}

function mapRunModeToExecutionMode(mode: 'plan' | 'act' | 'review'): AgentExecutionMode {
  return mode === 'act' ? 'build' : mode
}

function buildArtifactsFromHistory(items: AgentSessionHistoryItem[]): AgentArtifact[] {
  return items.flatMap((item) => {
    const task = mapHistoryActionToTask(item.run.action)
    const promptText =
      typeof item.prompt === 'string' && item.prompt.trim() ? item.prompt : item.run.inputSummary ?? ''

    return item.artifacts.map((artifact) => {
      const actionPlan =
        item.actionPlan ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactActionPlan((artifact.metadata as Record<string, unknown>).actionPlan)
          : null)
      const handoff =
        item.handoff ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactHandoff((artifact.metadata as Record<string, unknown>).handoff)
          : null)
      const executionMode =
        item.executionMode ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactExecutionMode((artifact.metadata as Record<string, unknown>).executionMode)
          : mapRunModeToExecutionMode(item.run.mode))
      const toolPolicy =
        item.toolPolicy ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactToolPolicy((artifact.metadata as Record<string, unknown>).toolPolicy)
          : null)
      const activeAgent =
        item.activeAgent ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactExecutionAgent((artifact.metadata as Record<string, unknown>).activeAgent)
          : null)
      const routeDecision =
        item.routeDecision ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactRouteDecision((artifact.metadata as Record<string, unknown>).routeDecision)
          : null)
      const ruleBundle =
        item.ruleBundle ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactRuleBundle((artifact.metadata as Record<string, unknown>).ruleBundle)
          : null)
      const storyMemoryDigest =
        item.storyMemoryDigest ??
        (artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata)
          ? asArtifactStoryMemoryDigest((artifact.metadata as Record<string, unknown>).storyMemoryDigest)
          : null)
      const routeStatuses = buildHistoryStatusItems(actionPlan, routeDecision, item.run.id, item.run.createdAt)

      return {
        id: `history-${item.run.id}-${artifact.id}`,
        task,
        type: mapHistoryArtifactType(artifact.artifactType),
        title: artifact.title,
        content: artifact.content,
        rawContent: artifact.content,
        // plan_save 落库时在 metadata 标记 savedAsPlan，刷新后据此恢复到计划文件夹
        savedAsPlan:
          artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata) &&
          (artifact.metadata as Record<string, unknown>).savedAsPlan === true
            ? true
            : undefined,
        promptText,
        createdAt: artifact.createdAt,
        status: item.run.status === 'running' ? 'streaming' : 'ready',
        runId: item.run.id,
        sessionId: item.run.sessionId,
        runStatusMode: item.run.status === 'running' ? 'live' : 'history',
        runStatuses: routeStatuses,
        memoryEntries: item.memoryEntries.map((entry) => ({
          id: entry.id,
          memoryType: entry.memoryType,
          title: entry.title,
          content: entry.content,
          importance: entry.importance,
          createdAt: entry.createdAt,
        })),
        backendArtifactId: artifact.id,
        availableApplyStrategies: Array.isArray(artifact.availableApplyStrategies)
          ? artifact.availableApplyStrategies
          : undefined,
        actionPlan,
        handoff,
        activeAgent,
        routeDecision,
        ruleBundle,
        storyMemoryDigest,
        executionMode,
        toolPolicy,
      }
    })
  })
}

function buildNovelFormState(novel: Novel): NovelFormState {
  return {
    title: novel.title,
    displayTitle: novel.displayTitle ?? '',
    summary: novel.summary,
    tagsText: novel.tags.join(' / '),
    visibility: novel.visibility,
    // 四种状态原样保留：此前折叠成 published/draft 二选一，completed 会在保存后回退成 draft
    status: novel.status,
  }
}

function mergeRestoredArtifactsWithSnapshot(
  restoredArtifacts: AgentArtifact[],
  snapshotArtifacts: AgentArtifact[],
): AgentArtifact[] {
  if (snapshotArtifacts.length === 0) {
    return restoredArtifacts
  }

  const snapshotByBackendArtifactId = new Map(
    snapshotArtifacts
      .filter((artifact) => typeof artifact.backendArtifactId === 'string' && artifact.backendArtifactId)
      .map((artifact) => [artifact.backendArtifactId as string, artifact]),
  )

  return restoredArtifacts.map((artifact) => {
    const snapshotArtifact =
      (artifact.backendArtifactId ? snapshotByBackendArtifactId.get(artifact.backendArtifactId) : null) ??
      snapshotArtifacts.find(
        (candidate) =>
          candidate.runId === artifact.runId &&
          candidate.promptText === artifact.promptText &&
          candidate.createdAt === artifact.createdAt,
      ) ??
      null

    if (!snapshotArtifact) {
      return artifact
    }

    const snapshotStatuses =
      Array.isArray(snapshotArtifact.runStatuses) && snapshotArtifact.runStatuses.length > 0
        ? snapshotArtifact.runStatuses
        : null
    const snapshotMemoryEntries =
      Array.isArray(snapshotArtifact.memoryEntries) && snapshotArtifact.memoryEntries.length > 0
        ? snapshotArtifact.memoryEntries
        : null
    const snapshotApplyStrategies = Array.isArray(snapshotArtifact.availableApplyStrategies)
      ? snapshotArtifact.availableApplyStrategies
      : artifact.availableApplyStrategies

    return {
      ...artifact,
      content: snapshotArtifact.content?.trim() ? snapshotArtifact.content : artifact.content,
      rawContent: snapshotArtifact.rawContent ?? artifact.rawContent ?? artifact.content,
      runStatusMode: snapshotArtifact.runStatusMode ?? artifact.runStatusMode,
      runStatuses: snapshotStatuses ?? artifact.runStatuses,
      memoryEntries: snapshotMemoryEntries ?? artifact.memoryEntries,
      availableApplyStrategies: snapshotApplyStrategies,
      replacedChapterContent: snapshotArtifact.replacedChapterContent ?? artifact.replacedChapterContent,
      appendedToChapter: snapshotArtifact.appendedToChapter ?? artifact.appendedToChapter,
      renamedNovel: snapshotArtifact.renamedNovel ?? artifact.renamedNovel,
      renamedChapter: snapshotArtifact.renamedChapter ?? artifact.renamedChapter,
      savedAsPlan: snapshotArtifact.savedAsPlan ?? artifact.savedAsPlan,
      catalogUpdated: snapshotArtifact.catalogUpdated ?? artifact.catalogUpdated,
      appliedToCover: snapshotArtifact.appliedToCover ?? artifact.appliedToCover,
      coverPreviewAssetIds: snapshotArtifact.coverPreviewAssetIds ?? artifact.coverPreviewAssetIds,
      actionSummary: snapshotArtifact.actionSummary ?? artifact.actionSummary,
      handoff: snapshotArtifact.handoff ?? artifact.handoff,
      activeAgent: snapshotArtifact.activeAgent ?? artifact.activeAgent,
      routeDecision: snapshotArtifact.routeDecision ?? artifact.routeDecision,
      ruleBundle: snapshotArtifact.ruleBundle ?? artifact.ruleBundle,
      storyMemoryDigest: snapshotArtifact.storyMemoryDigest ?? artifact.storyMemoryDigest,
      executionMode: snapshotArtifact.executionMode ?? artifact.executionMode,
      toolPolicy: snapshotArtifact.toolPolicy ?? artifact.toolPolicy,
      actionPlan: snapshotArtifact.actionPlan ?? artifact.actionPlan,
    }
  })
}

function buildNovelUpdatePayload(novelForm: NovelFormState): UpdateNovelRequest {
  return {
    title: novelForm.title.trim(),
    displayTitle: novelForm.displayTitle.trim() || undefined,
    summary: novelForm.summary.trim(),
    tags: novelForm.tagsText
      .split(/[、/\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    visibility: novelForm.visibility,
    status: novelForm.status,
  }
}

function isNovelFormDirty(currentNovel: Novel | null, novelForm: NovelFormState | null) {
  if (!currentNovel || !novelForm) {
    return false
  }

  return JSON.stringify(buildNovelUpdatePayload(novelForm)) !== JSON.stringify(buildNovelUpdatePayload(buildNovelFormState(currentNovel)))
}

function buildProjectNotes(novel: Novel): ProjectNotesState {
  return {
    genre: novel.categoryName ?? '科幻',
    protagonist: '',
    tone: '克制、悬疑、留白充足',
    outlineLength: 'medium',
    stylePreference: '克制电影感',
  }
}

function createIdleAgentRunState(): AgentRunState {
  return {
    active: false,
    task: null,
    title: '',
    statusText: '',
    activeAgent: null,
    routeDecision: null,
    executionMode: null,
  }
}

function resolveExecutionAgentForTask(task: AgentTaskType): AgentExecutionAgent {
  switch (task) {
    case 'plan-chapter':
    case 'generate-chapter-titles':
      return {
        agentType: 'storyPlanner',
        role: 'specialist',
        title: '剧情规划 Agent',
        description: '负责章节规划、结构拆解、书名与章节名提案等前置设计任务。',
      }
    case 'draft-chapter':
    case 'continue-chapter':
      return {
        agentType: 'draftWriter',
        role: 'specialist',
        title: '正文写作 Agent',
        description: '负责起草正文、续写章节，并把可执行写作结果交回工作台。',
      }
    case 'rewrite-selection':
    case 'polish-selection':
      return {
        agentType: 'styleEditor',
        role: 'specialist',
        title: '文风编辑 Agent',
        description: '负责改写、润色和局部表达优化，不直接承担全章规划。',
      }
    case 'review-continuity':
      return {
        agentType: 'continuityEditor',
        role: 'specialist',
        title: '连续性审阅 Agent',
        description: '负责检查设定冲突、时间线问题和章节之间的连续性。',
      }
    case 'read-story-context':
      return {
        agentType: 'loreLibrarian',
        role: 'specialist',
        title: '设定检索 Agent',
        description: '负责读取作品上下文、设定摘要和历史记忆，为当前任务补全背景。',
      }
    case 'generate-cover-prompt':
      return {
        agentType: 'coverPromptAgent',
        role: 'specialist',
        title: '封面提示词 Agent',
        description: '负责整理封面画面描述和视觉提示词，不介入正文写作接口。',
      }
    case 'generate-novel-title':
    case 'workspace-agent':
    default:
      return {
        agentType: 'writingOrchestrator',
        role: 'primary',
        title: 'Chevoink Agent',
        description: '负责理解当前指令、组织工作区上下文，并决定交给哪个专职代理处理。',
      }
  }
}

function resolveExecutionRouteDecisionForTask(task: AgentTaskType): AgentRouteDecision {
  const sourceAgent = resolveExecutionAgentForTask('workspace-agent')
  const targetAgent = resolveExecutionAgentForTask(task)
  const intentLabel = agentTaskLabelMap[task]

  return {
    sourceAgent,
    targetAgent,
    task,
    intentLabel,
    summary:
      sourceAgent.agentType === targetAgent.agentType
        ? `${sourceAgent.title} 判断当前任务适合继续由自己直接处理。`
        : `${sourceAgent.title} 已将当前任务路由给 ${targetAgent.title}。`,
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

const agentPromptCommandMap: Record<string, AgentTaskType> = {
  '#自由': 'workspace-agent',
  '#书名': 'generate-novel-title',
  '#取书名': 'generate-novel-title',
  '#章节名': 'generate-chapter-titles',
  '#章名': 'generate-chapter-titles',
  '#目录': 'read-story-context',
  '#上下文': 'read-story-context',
  '#计划': 'plan-chapter',
  '#章节计划': 'plan-chapter',
  '#写作': 'draft-chapter',
  '#起草': 'draft-chapter',
  '#正文': 'draft-chapter',
  '#续写': 'continue-chapter',
  '#改写': 'rewrite-selection',
  '#润色': 'polish-selection',
  '#审阅': 'review-continuity',
  '#审查': 'review-continuity',
  '#封面': 'generate-cover-prompt',
  '#封面提示词': 'generate-cover-prompt',
}

function inferAgentTaskFromPromptWithoutCommand(
  promptText: string,
  options?: {
    selectedText?: string | null
    chapterContent?: string | null
  },
): AgentTaskType | null {
  const normalized = promptText.trim().replace(/\s+/g, '')

  if (!normalized) {
    return null
  }

  const hasEditableSelection = Boolean(resolveAgentSelectedText(normalized, options?.selectedText, options?.chapterContent))

  if (hasNovelNamingIntent(normalized)) {
    return 'generate-novel-title'
  }

  if (hasMultipleWorkspaceGoals(normalized)) {
    return 'workspace-agent'
  }

  if (hasPromptNovelMetaIntent(normalized)) {
    return 'workspace-agent'
  }

  if (shouldAutoRenameChapter(normalized, 'workspace-agent')) {
    return 'generate-chapter-titles'
  }

  if (
    containsAnyKeyword(normalized, ['章节名称', '章节标题', '目录', '片段', '正文片段', '章节内容', '各章']) &&
    containsAnyKeyword(normalized, ['读取', '查看', '列出', '梳理', '总结', '读', '看看', '分析'])
  ) {
    return 'read-story-context'
  }

  if (containsAnyKeyword(normalized, ['封面', '提示词', 'cover'])) {
    return 'generate-cover-prompt'
  }

  if (containsAnyKeyword(normalized, ['审阅', '审查', '一致性', '连贯', '矛盾', '时间线', '设定冲突', '逻辑问题'])) {
    return 'review-continuity'
  }

  if (hasEditableSelection && hasPromptPolishIntent(normalized)) {
    return 'polish-selection'
  }

  if (hasEditableSelection && hasPromptRewriteIntent(normalized)) {
    return 'rewrite-selection'
  }

  if (containsAnyKeyword(normalized, ['计划', '章纲', '大纲', '规划', '拆解', '结构', '世界观', '人设', '主线', '开篇'])) {
    return 'plan-chapter'
  }

  if (containsAnyKeyword(normalized, ['续写', '接着写', '继续写', '往下写', '后续'])) {
    return 'continue-chapter'
  }

  if (hasChapterBodyWritingIntent(normalized)) {
    return 'draft-chapter'
  }

  if (containsAnyKeyword(normalized, ['创建章节', '新建章节', '新增章节', '加一章', '开一章'])) {
    return 'draft-chapter'
  }

  return null
}

function resolveAgentCommandFromPrompt(
  rawPrompt: string,
  fallbackTask: AgentTaskType,
  options?: {
    selectedText?: string | null
    chapterContent?: string | null
  },
): {
  task: AgentTaskType
  tab: AgentTab
  prompt: string
  commandLabel: string | null
} {
  const normalizedPrompt = rawPrompt.trim()
  const matchedCommands = normalizedPrompt.match(/#[^\s#]+/g) ?? []
  const resolvedCommand = matchedCommands.find((command) => agentPromptCommandMap[command]) ?? null
  const inferredTask = resolvedCommand
    ? null
    : inferAgentTaskFromPromptWithoutCommand(normalizedPrompt, {
        selectedText: options?.selectedText,
        chapterContent: options?.chapterContent,
      })
  const task = resolvedCommand ? agentPromptCommandMap[resolvedCommand] : (inferredTask ?? fallbackTask)

  return {
    task,
    tab: defaultTabForTask(task),
    prompt: normalizedPrompt.replace(/#[^\s#]+/g, ' ').replace(/\s+/g, ' ').trim(),
    commandLabel: resolvedCommand,
  }
}

function defaultPromptForAgentTask(task: AgentTaskType): string | undefined {
  if (task === 'workspace-agent') {
    return '请根据我的提示词自行判断最合适的创作能力，并直接给出结果。'
  }

  if (task === 'generate-novel-title') {
    return '请根据作品设定给出一组可用的书名候选，并附一句定位说明。'
  }

  if (task === 'generate-chapter-titles') {
    return '请结合当前作品内容，生成一组统一风格的章节名候选。'
  }

  if (task === 'read-story-context') {
    return '请读取当前作品的章节目录、摘要和正文片段，并回答我的问题。'
  }

  if (task === 'plan-chapter') {
    return '请根据我的要求生成清晰可执行的创作计划；如果我说的是作品、题材、世界观、人设或主线，就给作品级计划；如果我说的是某一章，再给章节级计划。'
  }

  if (task === 'draft-chapter') {
    return '请结合当前章节信息直接起草正文，保持叙事连贯、语言克制，结果可直接落回正文。'
  }

  if (task === 'rewrite-selection') {
    return '请在保留原意的前提下重写选中内容，让表达更顺、更有画面感。'
  }

  if (task === 'polish-selection') {
    return '请在不改变剧情含义的前提下润色当前内容，只做必要修改，让表达更细致、更顺滑。'
  }

  if (task === 'review-continuity') {
    return '请审阅当前章节的人物动机、设定一致性和情节衔接，并给出可执行建议。'
  }

  return undefined
}

function artifactTypeForTask(task: AgentTaskType): AgentArtifact['type'] {
  if (task === 'plan-chapter') {
    return 'chapter_plan'
  }

  if (task === 'review-continuity' || task === 'read-story-context') {
    return 'review_report'
  }

  if (task === 'generate-cover-prompt') {
    return 'cover_prompt'
  }

  return 'draft_text'
}
function buildCoverForm(novel: Novel, notes: ProjectNotesState): CoverFormState {
  return {
    novelTitle: novel.title,
    summary: novel.summary,
    genre: notes.genre,
    protagonist: notes.protagonist,
    stylePreference: notes.stylePreference,
    prompt: novel.coverPrompt ?? '',
    negativePrompt: '',
    size: FIXED_NOVEL_COVER_SIZE,
    count: 1,
  }
}

function buildChapterDraft(chapter: Chapter): ChapterDraftState {
  return {
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary ?? '',
    content: chapter.content,
    status: chapter.status,
    visibility: chapter.visibility,
    orderIndex: chapter.orderIndex,
    localOnly: false,
  }
}

// Agent 审查态持久化：刷新/重开页面后恢复未定夺的章节与计划审查（按作品键控）
const PENDING_CHAPTER_REVIEW_STORAGE_PREFIX = 'chevoink-pending-chapter-review:'
const PENDING_PLAN_REVIEW_STORAGE_PREFIX = 'chevoink-pending-plan-review:'

function readStoredPendingReview<T extends { id: string }>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as T
    return parsed && typeof parsed === 'object' && typeof parsed.id === 'string' ? parsed : null
  } catch {
    return null
  }
}

// 章节审查已改为多章并存的数组；兼容历史遗留的单对象存储格式
function readStoredPendingReviewList<T extends { id: string }>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as T[] | T | null
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item) => item && typeof item === 'object' && typeof item.id === 'string',
      )
    }
    return parsed && typeof parsed === 'object' && typeof parsed.id === 'string' ? [parsed] : []
  } catch {
    return []
  }
}

function writeStoredPendingReview(key: string, review: unknown) {
  try {
    if (review) {
      window.localStorage.setItem(key, JSON.stringify(review))
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // localStorage 不可用/超限时静默降级为内存态
  }
}

function buildWorkspacePlanFiles(artifacts: AgentArtifact[]): WorkspacePlanFile[] {
  return artifacts
    .filter((artifact) => artifact.savedAsPlan)
    .map((artifact) => ({
      id: artifact.id,
      title: artifact.title?.trim() || '创作计划',
      content: (artifact.rawContent ?? artifact.content).trim(),
      createdAt: artifact.createdAt,
      artifactId: artifact.id,
      backendArtifactId: artifact.backendArtifactId ?? null,
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

/** 云端计划列表项 → 计划文件视图：id 加 server- 前缀避免与本地产物 id 碰撞 */
function buildServerPlanFile(item: NovelPlanFileItem): WorkspacePlanFile {
  return {
    id: `server-${item.id}`,
    title: item.title.trim() || '创作计划',
    content: item.content.trim(),
    createdAt: item.createdAt,
    artifactId: `server-${item.id}`,
    backendArtifactId: item.id,
  }
}

function isGenericPlanTitle(title: string) {
  const normalized = title.trim()

  if (!normalized) {
    return true
  }

  return ['章节计划', '创作计划', '计划', 'Agent 对话', '生成结果'].includes(normalized)
}

function buildDefaultPlanTitle(
  artifact: Pick<AgentArtifact, 'title' | 'promptText' | 'createdAt'>,
  chapters: StudioPayload['chapters'],
  currentChapterDraft?: ChapterDraftState | null,
) {
  const currentTitle = artifact.title.trim()
  if (!isGenericPlanTitle(currentTitle)) {
    return currentTitle
  }

  const requestedOrder = artifact.promptText ? extractRequestedChapterOrder(artifact.promptText) : null
  if (requestedOrder) {
    const targetChapter = chapters.find((chapter) => chapter.orderIndex === requestedOrder)
    const chapterTitle = targetChapter?.title.trim()
    if (chapterTitle) {
      return `${chapterTitle}计划`
    }

    return `第 ${requestedOrder} 章计划`
  }

  const currentChapterTitle = currentChapterDraft?.title.trim()
  if (currentChapterTitle) {
    return `${currentChapterTitle}计划`
  }

  const promptTitle = (artifact.promptText ?? '')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/[，。！？、,.!?:：；;“”"'‘’《》【】（）()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(请|帮我|麻烦|给我|我想|想要|生成|整理|做一份|写一份|规划一份)\s*/u, '')
    .trim()

  if (promptTitle) {
    const compactPromptTitle = promptTitle.replace(/\s+/g, '')
    const normalizedPromptTitle = compactPromptTitle.endsWith('计划')
      ? compactPromptTitle
      : `${compactPromptTitle}计划`
    return normalizedPromptTitle.slice(0, 18)
  }

  return `创作计划 ${formatDateTime(artifact.createdAt)}`
}

function buildCatalogPreview(novelTitle: string, chapters: StudioPayload['chapters']) {
  const normalizedTitle = novelTitle.trim() || '当前作品'

  if (chapters.length === 0) {
    return {
      title: '目录',
      description: `《${normalizedTitle}》的目录文件会放在这里。`,
      content: ['《' + normalizedTitle + '》目录', '', '当前还没有已保存章节。', '写入第一章或重命名章节后，这里会自动更新。'].join('\n'),
    }
  }

  return {
    title: '目录',
    description: `共 ${chapters.length} 章，写新章节或修改章节标题后会自动更新。`,
    content: [
      `《${normalizedTitle}》目录`,
      '',
      ...chapters.map((chapter) => {
        const title = chapter.title.trim() || `第 ${chapter.orderIndex} 章`
        const summary = chapter.summary?.trim()
        return summary
          ? `第 ${chapter.orderIndex} 章  ${title}\n摘要：${summary}`
          : `第 ${chapter.orderIndex} 章  ${title}`
      }),
    ].join('\n\n'),
  }
}

function mergeCatalogContentWithChapters(currentContent: string, nextCatalogContent: string) {
  const normalizedCurrent = currentContent.trim()
  if (!normalizedCurrent) {
    return nextCatalogContent
  }

  const lines = normalizedCurrent.split('\n')
  const firstChapterLineIndex = lines.findIndex((line) =>
    /^第\s*[0-9零一二三四五六七八九十百两]+\s*章/u.test(line.trim()),
  )

  if (firstChapterLineIndex < 0) {
    return [normalizedCurrent, '', nextCatalogContent.split('\n').slice(2).join('\n')].filter(Boolean).join('\n')
  }

  const prefix = lines.slice(0, firstChapterLineIndex).join('\n').trimEnd()
  const generatedChapterSection = nextCatalogContent.split('\n').slice(2).join('\n')

  return [prefix, generatedChapterSection].filter(Boolean).join('\n\n')
}

function shouldMarkCatalogUpdated(options: {
  createdChapter?: boolean
  renamedChapter?: boolean
  previousTitle?: string | null
  nextTitle?: string | null
}) {
  if (options.createdChapter || options.renamedChapter) {
    return true
  }

  const previousTitle = options.previousTitle?.trim() ?? ''
  const nextTitle = options.nextTitle?.trim() ?? ''
  return Boolean(nextTitle) && previousTitle !== nextTitle
}

function buildRollbackSnapshotFromChapter(chapter: Chapter): AgentLocalRollbackChapterSnapshot {
  return {
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary ?? '',
    content: chapter.content,
    status: chapter.status,
    visibility: chapter.visibility,
    wordCount: chapter.wordCount ?? chapter.content.length,
    updatedAt: chapter.updatedAt,
  }
}

function buildRollbackSnapshotFromDraft(chapter: ChapterDraftState): AgentLocalRollbackChapterSnapshot {
  return {
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary,
    content: chapter.content,
    status: chapter.status,
    visibility: chapter.visibility,
    wordCount: chapter.content.length,
    updatedAt: null,
  }
}

function cloneChapterDraftState(chapter: ChapterDraftState): ChapterDraftState {
  return {
    ...chapter,
  }
}

function buildPendingChapterReview(options: {
  before: ChapterDraftState | null
  after: ChapterDraftState
  rollbackSnapshot: AgentLocalRollbackSnapshot
  description: string
  artifactId?: string | null
  runId?: string | null
}): ChapterPendingReview {
  return {
    id: `chapter-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chapterId: options.after.id,
    artifactId: options.artifactId ?? null,
    runId: options.runId ?? null,
    before: options.before ? cloneChapterDraftState(options.before) : null,
    after: cloneChapterDraftState(options.after),
    rollbackSnapshot: options.rollbackSnapshot,
    description: options.description,
    createdAt: new Date().toISOString(),
  }
}

function buildChapterReviewDescription(
  mode: 'create' | 'append' | 'replace',
  chapterTitle: string,
) {
  if (mode === 'create') {
    return `已创建新章节《${chapterTitle}》并写入正文，请确认是否采纳。`
  }

  if (mode === 'append') {
    return `已将新内容追加到《${chapterTitle}》，请确认是否采纳。`
  }

  return `已更新《${chapterTitle}》的正文内容，请确认是否采纳。`
}

function isChapterContentApplyStrategy(
  strategy: 'replaceChapterContent' | 'appendChapterContent' | 'saveChapterSummary' | 'setNovelCoverPrompt',
) {
  return strategy === 'replaceChapterContent' || strategy === 'appendChapterContent'
}

function toChapterListItem(chapter: Chapter): StudioPayload['chapters'][number] {
  return {
    id: chapter.id,
    novelId: chapter.novelId,
    title: chapter.title,
    summary: chapter.summary,
    orderIndex: chapter.orderIndex,
    wordCount: chapter.wordCount,
    status: chapter.status,
    visibility: chapter.visibility,
    commentCount: chapter.commentCount,
    publishedAt: chapter.publishedAt,
  }
}

function upsertChapterItem(
  current: StudioPayload['chapters'],
  item: StudioPayload['chapters'][number],
): StudioPayload['chapters'] {
  const next = current.filter((chapter) => chapter.id !== item.id)
  next.push(item)
  return next.sort((left, right) => left.orderIndex - right.orderIndex)
}

function replaceChapterItem(
  current: StudioPayload['chapters'],
  previousId: string | null,
  item: StudioPayload['chapters'][number],
): StudioPayload['chapters'] {
  const next = current.filter((chapter) => chapter.id !== item.id && chapter.id !== previousId)
  next.push(item)
  return next.sort((left, right) => left.orderIndex - right.orderIndex)
}

function removeChapterItem(
  current: StudioPayload['chapters'],
  chapterId: string,
): StudioPayload['chapters'] {
  return current.filter((chapter) => chapter.id !== chapterId)
}

function toAppliedChapterSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return ''
  }

  return normalized.length > 500 ? `${normalized.slice(0, 497)}...` : normalized
}

// Agent Loop 引擎开关：与后端 AGENT_ENGINE 对应，设为 legacy 时回退旧面板链路
const agentLoopEnabled =
  ((import.meta.env.VITE_AGENT_ENGINE as string | undefined) ?? 'loop') !== 'legacy'

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
  const [generatingCoverArtifactId, setGeneratingCoverArtifactId] = useState<string | null>(null)
  const [applyingGeneratedCoverArtifactId, setApplyingGeneratedCoverArtifactId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<StudioPayload['chapters']>([])
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  // 创作区（含沉浸创作/弹层 portal）内滚动条静止时隐藏，滚动中才显示
  useAutoHideScrollbars()
  const { panelWidths, beginPanelResize } = useStudioPanelWidths()
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel | null>(null)
  const [isImmersive, setIsImmersive] = useState(false)
  const [agentTab, setAgentTab] = useState<AgentTab>('write')
  const [agentTask, setAgentTask] = useState<AgentTaskType>('workspace-agent')
  const [agentPrompt, setAgentPrompt] = useState('')
  // 惰性初始化：从快照同步恢复当前会话 id，避免跨路由返回时 AgentPanel 先以 null 挂载冲掉进行中的任务直播
  const [agentSessionId, setAgentSessionId] = useState<string | null>(() => {
    const snapshot = readStoredAgentWorkspace(activeNovelId)
    const initialTask =
      snapshot?.tasks.find((taskWindow) => taskWindow.id === snapshot.activeTaskId) ?? snapshot?.tasks[0] ?? null
    return initialTask?.sessionId ?? null
  })
  const [agentTaskWindows, setAgentTaskWindows] = useState<AgentTaskWindowState[]>([
    createLocalAgentTaskWindow(),
  ])
  const [activeAgentTaskWindowId, setActiveAgentTaskWindowId] = useState<string | null>(null)
  const [showAgentTaskList, setShowAgentTaskList] = useState(false)
  const [agentRunState, setAgentRunState] = useState<AgentRunState>(createIdleAgentRunState)
  const [agentRunStatusMode, setAgentRunStatusMode] = useState<AgentRunStatusMode>('none')
  const [agentRunStatuses, setAgentRunStatuses] = useState<AgentRunStatusItem[]>([])
  const [agentArtifacts, setAgentArtifacts] = useState<AgentArtifact[]>([])
  const [activeAgentArtifactId, setActiveAgentArtifactId] = useState<string | null>(null)
  // 计划文件夹云端副本：覆盖非活跃任务窗口/历史会话的计划，刷新后不丢失
  const [serverPlanFiles, setServerPlanFiles] = useState<WorkspacePlanFile[]>([])
  const planSyncTimerRef = useRef<number | null>(null)
  const planSyncPayloadRef = useRef<{ artifactId: string; title: string; content: string } | null>(null)
  const agentRunAbortControllerRef = useRef<AbortController | null>(null)
  const coverGenerationWasActiveRef = useRef(false)
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const [voiceInputActive, setVoiceInputActive] = useState(false)
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
  const voiceInputSupported =
    typeof window !== 'undefined' &&
    Boolean(
      ((window as Window & { SpeechRecognition?: new () => BrowserSpeechRecognition }).SpeechRecognition ??
        (window as Window & { webkitSpeechRecognition?: new () => BrowserSpeechRecognition })
          .webkitSpeechRecognition) &&
        navigator.mediaDevices?.getUserMedia,
    )

  function applyAgentTaskWindowState(taskWindow: AgentTaskWindowState | null) {
    if (!taskWindow) {
      setActiveAgentTaskWindowId(null)
      setAgentSessionId(null)
      setAgentPrompt('')
      setAgentArtifacts([])
      setActiveAgentArtifactId(null)
      setAgentRunState(createIdleAgentRunState())
      setAgentRunStatusMode('none')
      setAgentRunStatuses([])
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
    setAgentRunStatusMode(latestArtifact?.runStatusMode ?? 'none')
    setAgentRunStatuses(latestArtifact?.runStatuses ?? [])
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
    setSelectedChapterId(payload.draftChapter?.id ?? payload.chapters[0]?.id ?? null)
  }, [studioQuery.data])

  useEffect(() => {
    agentRunAbortControllerRef.current?.abort()
    voiceRecognitionRef.current?.stop()
    setVoiceInputActive(false)
    resetAgentWorkspace()
    setShowAgentTaskList(false)

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
      voiceRecognitionRef.current?.stop()
      agentRunAbortControllerRef.current?.abort()
      flushPlanServerSync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [activeAgentTaskWindowId, activeNovelId, agentTaskWindows, catalogDocument, selectedTreeItemId])

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

      const afterState: ChapterDraftState = {
        id: display.chapterId,
        title: display.chapterTitle,
        summary,
        content: display.after,
        status,
        visibility,
        orderIndex,
        localOnly: false,
      }

      // 同一章节连续写入（如 chapter_write 后再 append）：保留最早的 before/回滚快照，仅推进 after；
      // 其他章节的审查态不受影响（fix：新章写入不再覆盖旧章未定夺的审查）
      const currentReview = pendingChapterReviewsRef.current.find(
        (item) => item.chapterId === display.chapterId,
      )
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
  const coverPreviewAssetsByArtifactId = useMemo(() => {
    const coverAssetById = new Map(coverAssets.map((asset) => [asset.id, asset]))
    const previews: Record<string, CoverAsset[]> = {}

    for (const artifact of agentArtifacts) {
      const assetIds = artifact.coverPreviewAssetIds ?? []
      const assets = assetIds
        .map((assetId) => coverAssetById.get(assetId))
        .filter((asset): asset is CoverAsset => Boolean(asset))

      if (assets.length > 0) {
        previews[artifact.id] = assets
      }
    }

    return previews
  }, [agentArtifacts, coverAssets])
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
  const hasActiveChapterTreeSelection = !selectedTreeItemId || selectedTreeItemId.startsWith('chapter:')
  const agentSelectedChapterId = hasActiveChapterTreeSelection ? selectedChapterId : null
  const agentChapterDraft = hasActiveChapterTreeSelection ? chapterDraft : null
  const agentActiveChapterListItem = hasActiveChapterTreeSelection ? activeChapterListItem : null
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
  const activeAgentArtifact = useMemo(
    () => agentArtifacts.find((artifact) => artifact.id === activeAgentArtifactId) ?? agentArtifacts[0] ?? null,
    [activeAgentArtifactId, agentArtifacts],
  )
  const selectedTextLength = editorSelection.end - editorSelection.start

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
  const activeArtifactRunStatusMode = activeAgentArtifact?.runStatusMode ?? agentRunStatusMode
  const activeArtifactRunStatuses = activeAgentArtifact?.runStatuses ?? agentRunStatuses
  const activeArtifactMemoryEntries = activeAgentArtifact?.memoryEntries ?? []

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

  async function resolvePersistedAgentChapterTarget(options?: {
    preferCached?: boolean
    promptText?: string
  }): Promise<ChapterDraftState | null> {
    const preferCached = options?.preferCached ?? false
    const requestedChapterId = options?.promptText
      ? resolveRequestedExistingChapterId(options.promptText, chapters)
      : null
    const targetChapterId = requestedChapterId ?? agentExecutionChapterTargetRef.current ?? agentSelectedChapterId

    if (!targetChapterId || targetChapterId.startsWith('local-')) {
      return agentChapterDraft && !agentChapterDraft.localOnly ? agentChapterDraft : null
    }

    const cachedChapter = queryClient.getQueryData<Chapter>(['studio-chapter', activeNovelId, targetChapterId])
    if (preferCached && cachedChapter) {
      return buildChapterDraft(cachedChapter)
    }

    if (agentChapterDraft && !agentChapterDraft.localOnly && agentChapterDraft.id === targetChapterId) {
      return agentChapterDraft
    }

    if (cachedChapter) {
      return buildChapterDraft(cachedChapter)
    }

    const fetchedChapter = await getChapterContent(activeNovelId, targetChapterId)
    queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, targetChapterId], fetchedChapter)
    return buildChapterDraft(fetchedChapter)
  }

  function resolveTagListFromActionPlanPayload(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
      const tags = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)

      return tags.length > 0 ? tags : undefined
    }

    if (typeof value === 'string') {
      const tags = value
        .split(/[、,，/\n]+/)
        .map((item) => item.trim())
        .filter(Boolean)

      return tags.length > 0 ? tags : undefined
    }

    return undefined
  }

  function resolveNovelMetaUpdateFromActionPlanPayload(payload: Record<string, unknown>): UpdateNovelRequest | null {
    const nextPayload: UpdateNovelRequest = {}
    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    const displayTitle = typeof payload.displayTitle === 'string' ? payload.displayTitle.trim() : ''
    const summary =
      typeof payload.summary === 'string'
        ? payload.summary.trim()
        : typeof payload.novelSummary === 'string'
          ? payload.novelSummary.trim()
          : ''
    const tags = resolveTagListFromActionPlanPayload(payload.tags ?? payload.tagNames)
    const visibility =
      payload.visibility === 'public' || payload.visibility === 'followers' || payload.visibility === 'private'
        ? payload.visibility
        : undefined
    const status =
      payload.status === 'draft' || payload.status === 'published' || payload.status === 'completed' || payload.status === 'archived'
        ? payload.status
        : undefined
    const coverPrompt = typeof payload.coverPrompt === 'string' ? payload.coverPrompt.trim() : ''

    if (title) {
      nextPayload.title = title
    }

    if (displayTitle) {
      nextPayload.displayTitle = displayTitle
    }

    if (summary) {
      nextPayload.summary = summary
    }

    if (tags?.length) {
      nextPayload.tags = tags
    }

    if (visibility) {
      nextPayload.visibility = visibility
    }

    if (status) {
      nextPayload.status = status
    }

    if (coverPrompt) {
      nextPayload.coverPrompt = coverPrompt
    }

    return Object.keys(nextPayload).length > 0 ? nextPayload : null
  }

function extractNovelSummaryFromContent(content: string): string | null {
  const normalized = stripCodeFenceWrapper(content).trim()
  if (!normalized) {
    return null
  }

  const lines = normalized
    .split('\n')
    .map((line) => stripLeadingListMarker(line).trim())
    .filter(Boolean)

  for (const line of lines) {
    const labeledMatch = line.match(/^(?:作品简介|作品介绍|作品内容介绍|内容介绍|简介|介绍页)[:：]\s*(.+)$/u)
    if (labeledMatch?.[1]?.trim()) {
      return labeledMatch[1].trim()
    }
  }

  return lines.join('\n').trim() || null
}

function resolveNovelMetaUpdateFromContent(promptText: string, content: string): UpdateNovelRequest | null {
  if (!hasPromptNovelMetaIntent(promptText)) {
    return null
  }

  const summary = extractNovelSummaryFromContent(content)
  if (!summary) {
    return null
  }

  return {
    summary,
  }
}

  function resolveNovelRenameTitleFromActionPlanPayload(payload: Record<string, unknown>) {
    const title = typeof payload.title === 'string' ? payload.title.trim() : ''
    return title || null
  }

  function resolveCoverPromptFromActionPlanPayload(payload: Record<string, unknown>) {
    const prompt =
      typeof payload.coverPrompt === 'string'
        ? payload.coverPrompt.trim()
        : typeof payload.prompt === 'string'
          ? payload.prompt.trim()
          : ''

    return prompt || null
  }

  function resolveCoverGenerationPayload(payload: Record<string, unknown>) {
    const prompt =
      typeof payload.coverPrompt === 'string'
        ? payload.coverPrompt.trim()
        : typeof payload.prompt === 'string'
          ? payload.prompt.trim()
          : ''
    const count =
      typeof payload.count === 'number' && Number.isFinite(payload.count)
        ? Math.max(1, Math.min(4, Math.round(payload.count)))
        : 1
    const source: 'latest_generated' | 'selected' | undefined =
      payload.source === 'latest_generated' || payload.source === 'selected'
        ? payload.source
        : undefined

    return {
      prompt: prompt || undefined,
      count,
      source,
    }
  }

  function mapActionPlanToExecutionSteps(actionPlan?: AgentActionPlan | null, toolPolicy?: AgentWorkspaceToolPolicy | null) {
    if (!actionPlan?.steps.length || actionPlan.mode !== 'execute') {
      return {
        steps: [] as AgentExecutionStep[],
        blockedReason: undefined as string | undefined,
      }
    }

    const steps: AgentExecutionStep[] = []
    const blockedTitles: string[] = []

    for (const step of actionPlan.steps) {
      const permission = toolPolicy?.tools.find((tool) => tool.toolName === step.toolName)?.permission
      if (step.requiresConfirm || permission === 'ask' || permission === 'deny') {
        blockedTitles.push(step.title)
        continue
      }

      const base = buildExecutionStepBase(step.id, step.toolName, step.title, step.target)

      switch (step.toolName) {
        case 'novel.rename':
          steps.push({
            ...base,
            kind: 'rename_novel',
            titleOverride: resolveNovelRenameTitleFromActionPlanPayload(step.payload) ?? undefined,
          })
          break
        case 'novel.update_meta': {
          const payload = resolveNovelMetaUpdateFromActionPlanPayload(step.payload)
          if (payload) {
            steps.push({ ...base, kind: 'update_novel_meta', payload })
          }
          break
        }
        case 'chapter.rename':
          steps.push({ ...base, kind: 'rename_chapter' })
          break
        case 'chapter.create':
          steps.push({ ...base, kind: 'create_chapter' })
          break
        case 'chapter.append':
          steps.push({ ...base, kind: 'write_chapter', forceWriteMode: 'append' })
          break
        case 'chapter.write':
          steps.push({ ...base, kind: 'write_chapter', forceWriteMode: 'replace' })
          break
        case 'cover.prompt.set': {
          const prompt = resolveCoverPromptFromActionPlanPayload(step.payload)
          if (prompt) {
            steps.push({ ...base, kind: 'set_cover_prompt', prompt })
          }
          break
        }
        case 'cover.generate': {
          const payload = resolveCoverGenerationPayload(step.payload)
          steps.push({
            ...base,
            kind: 'generate_cover',
            prompt: payload.prompt,
            count: payload.count,
          })
          break
        }
        case 'cover.apply': {
          const payload = resolveCoverGenerationPayload(step.payload)
          steps.push({
            ...base,
            kind: 'apply_cover',
            source: payload.source ?? 'latest_generated',
          })
          break
        }
        case 'workspace.open_meta':
          steps.push({ ...base, kind: 'open_meta' })
          break
        case 'workspace.open_cover':
          steps.push({ ...base, kind: 'open_cover' })
          break
        default:
          break
      }
    }

    return {
      steps,
      blockedReason:
        blockedTitles.length > 0
          ? `这次计划里的 ${blockedTitles.join('、')} 需要确认后才能执行，因此我没有自动改动工作台。`
          : undefined,
    }
  }

  function buildAgentExecutionPlan(
    promptText: string,
    task: AgentTaskType,
    content: string,
    availableApplyStrategies?: string[] | null,
    actionPlan?: AgentActionPlan | null,
    toolPolicy?: AgentWorkspaceToolPolicy | null,
  ): { steps: AgentExecutionStep[]; blockedReason?: string } {
    const plannedExecution = mapActionPlanToExecutionSteps(actionPlan, toolPolicy)
    if (actionPlan) {
      const fallbackNovelMetaPayload = resolveNovelMetaUpdateFromContent(promptText, content)
      if (plannedExecution.steps.length === 0 && !plannedExecution.blockedReason) {
        if (fallbackNovelMetaPayload) {
          return {
            steps: [
              {
                ...buildExecutionStepBase('fallback-update-novel-meta', 'novel.update_meta', '同步作品简介', {
                  scope: 'novel',
                }),
                kind: 'update_novel_meta',
                payload: fallbackNovelMetaPayload,
              },
            ],
          }
        }

        return resolveFallbackExecutionPlanFromTask(task, availableApplyStrategies, {
          hasSelectedPersistedChapter: Boolean(agentChapterDraft && !agentChapterDraft.localOnly),
          hasAnyChapter: chapters.length > 0,
        })
      }

      const includesCreateStep = plannedExecution.steps.some((step) => step.kind === 'create_chapter')
      const includesWriteStep = plannedExecution.steps.some((step) => step.kind === 'write_chapter')
      const includesRenameStep = plannedExecution.steps.some((step) => step.kind === 'rename_chapter')

      if (includesCreateStep && shouldAutoWriteChapter(promptText, task)) {
        const expandedSteps = plannedExecution.steps.flatMap((step): AgentExecutionStep[] =>
          step.kind === 'create_chapter'
            ? [
                step,
                ...(includesRenameStep ? [] : [buildNewChapterExecutionSteps()[1]]),
                ...(includesWriteStep ? [] : [buildNewChapterExecutionSteps()[2]]),
              ]
            : [step],
        )

        return {
          ...plannedExecution,
          steps: expandedSteps,
        }
      }

      return plannedExecution
    }

    const fallbackNovelMetaPayload = resolveNovelMetaUpdateFromContent(promptText, content)
    if (fallbackNovelMetaPayload) {
      return {
        steps: [
          {
            ...buildExecutionStepBase('fallback-update-novel-meta', 'novel.update_meta', '同步作品简介', {
              scope: 'novel',
            }),
            kind: 'update_novel_meta',
            payload: fallbackNovelMetaPayload,
          },
        ],
      }
    }

    if (shouldAutoRenameNovel(promptText, task)) {
      return {
        steps: [
          {
            ...buildExecutionStepBase('fallback-rename-novel', 'novel.rename', '同步作品命名', {
              scope: 'novel',
            }),
            kind: 'rename_novel',
          },
        ],
      }
    }

    if (isTitleOnlyChapterRequest(promptText, task)) {
      return {
        steps: [
          {
            ...buildExecutionStepBase('fallback-rename-chapter', 'chapter.rename', '同步章节标题', {
              scope: 'chapter',
            }),
            kind: 'rename_chapter',
          },
        ],
      }
    }

    if (
      shouldAutoCreateChapter(
        promptText,
        agentChapterDraft?.orderIndex ?? agentActiveChapterListItem?.orderIndex ?? null,
        chapters.length,
        chapters,
      ) &&
      shouldAutoWriteChapter(promptText, task)
    ) {
      return {
        steps: buildNewChapterExecutionSteps(),
      }
    }

    return resolveFallbackExecutionPlanFromTask(task, availableApplyStrategies, {
      hasSelectedPersistedChapter: Boolean(agentChapterDraft && !agentChapterDraft.localOnly),
      hasAnyChapter: chapters.length > 0,
    })
  }

  function mergeAutoApplyResults(results: Array<Extract<AutoApplyAgentResult, { applied: true }>>): AutoApplyAgentResult {
    if (results.length === 0) {
      return { applied: false }
    }

    const messages = results.map((result) => result.message)
    const summaries = results
      .map((result) => result.patch.actionSummary)
      .filter((summary): summary is string => Boolean(summary?.trim()))

    return {
      applied: true,
      message: messages.join('；'),
      patch: {
        ...results.reduce<Partial<AgentArtifact>>((accumulator, result) => ({ ...accumulator, ...result.patch }), {}),
        actionSummary: summaries.join('\n'),
        content: summaries.join('\n'),
      },
    }
  }

  function buildPendingStepResults(steps: AgentExecutionStep[]): AgentExecutionStepResult[] {
    return steps.map((step) => ({
      stepId: step.stepId,
      toolName: step.toolName,
      title: step.title,
      status: 'pending',
      target: step.target,
      resultSummary: null as string | null,
      errorMessage: null as string | null,
      startedAt: null as string | null,
      finishedAt: null as string | null,
    }))
  }

  function buildBlockedStepResults(actionPlan?: AgentActionPlan | null): AgentExecutionStepResult[] {
    if (!actionPlan?.steps.length) {
      return []
    }

    return actionPlan.steps.map((step) => ({
      stepId: step.id,
      toolName: step.toolName,
      title: step.title,
      status: 'skipped',
      target: step.target,
      resultSummary: null as string | null,
      errorMessage: step.requiresConfirm ? '该步骤需要确认后才能执行。' : '当前策略不允许自动执行该步骤。',
      startedAt: null as string | null,
      finishedAt: null as string | null,
    }))
  }

  function resolveExecutionStepStartMessage(step: AgentExecutionStep, promptText: string) {
    switch (step.kind) {
      case 'rename_novel':
        return '正在同步作品命名。'
      case 'create_chapter':
        return `正在先创建第 ${resolveRequestedChapterOrder(promptText, chapters.length)} 章空白章节。`
      case 'rename_chapter':
        return '正在同步章节标题。'
      case 'update_novel_meta':
        return '正在同步作品简介、标签与展示信息。'
      case 'set_cover_prompt':
        return '正在把封面提示词写入当前作品。'
      case 'generate_cover':
        return '正在根据当前作品信息生成封面候选图。'
      case 'apply_cover':
        return '正在把最新封面替换到当前作品。'
      case 'open_meta':
        return '正在打开作品设置。'
      case 'open_cover':
        return '正在打开封面面板。'
      case 'write_chapter':
        return step.forceWriteMode === 'append'
          ? '正在把新内容追加到目标章节。'
          : '正在把正文写入目标章节。'
      default:
        return '正在同步工作台改动。'
    }
  }

  async function renameNovelFromAgent(
    content: string,
    promptText: string,
    titleOverride?: string | null,
  ): Promise<AutoApplyAgentResult> {
    if (!currentNovel) {
      return { applied: false }
    }

    const nextTitle =
      titleOverride?.trim() ||
      extractExplicitNovelTitleFromPrompt(promptText) ||
      extractNovelTitleCandidate(content)
    if (!nextTitle) {
      return { applied: false }
    }

    const updatedNovel = await updateNovelMeta(currentNovel.id, { title: nextTitle })
    syncUpdatedNovelState(updatedNovel, `作品已命名为《${nextTitle}》。`)
    return {
      applied: true,
      message: `已将作品命名为《${nextTitle}》。`,
      patch: {
        renamedNovel: true,
        availableApplyStrategies: [],
        actionSummary: `我已经把当前作品命名为《${nextTitle}》。`,
        content: `我已经把当前作品命名为《${nextTitle}》。`,
        rawContent: content,
      },
    }
  }

  async function updateNovelMetaFromAgent(payload: UpdateNovelRequest): Promise<AutoApplyAgentResult> {
    if (!currentNovel) {
      return { applied: false }
    }

    const updatedNovel = await updateNovelMeta(currentNovel.id, payload)
    const updatedFields = [
      payload.title ? '书名' : null,
      payload.displayTitle ? '展示标题' : null,
      payload.summary ? '作品简介' : null,
      payload.tags?.length ? '标签' : null,
      payload.visibility ? '可见范围' : null,
      payload.status ? '发布状态' : null,
      payload.coverPrompt ? '封面提示词' : null,
    ].filter((item): item is string => Boolean(item))
    const fieldLabel = updatedFields.length > 0 ? updatedFields.join('、') : '作品信息'
    const summary = `我已经更新了当前作品的${fieldLabel}。`

    syncUpdatedNovelState(updatedNovel, `作品${fieldLabel}已同步。`)
    return {
      applied: true,
      message: `已更新当前作品的${fieldLabel}。`,
      patch: {
        renamedNovel: Boolean(payload.title),
        appliedToCover: Boolean(payload.coverPrompt),
        availableApplyStrategies: [],
        actionSummary: summary,
        content: summary,
      },
    }
  }

  async function setCoverPromptFromAgent(prompt: string): Promise<AutoApplyAgentResult> {
    if (!currentNovel || !prompt.trim()) {
      return { applied: false }
    }

    const updatedNovel = await updateNovelMeta(currentNovel.id, { coverPrompt: prompt.trim() })
    syncUpdatedNovelState(updatedNovel, '封面提示词已同步到当前作品。')
    setActiveToolPanel('cover')
    setMobileView('cover')

    return {
      applied: true,
      message: '已写入当前作品的封面提示词。',
      patch: {
        appliedToCover: true,
        availableApplyStrategies: [],
        actionSummary: '我已经把新的封面提示词写入当前作品。',
        content: '我已经把新的封面提示词写入当前作品。',
      },
    }
  }

  async function generateCoverCandidatesFromAgent(options?: {
    prompt?: string
    count?: number
    focusToolPanel?: boolean
  }): Promise<
    AutoApplyAgentResult & {
      generatedAssets?: CoverAsset[]
    }
  > {
    const prompt = options?.prompt?.trim() || coverForm?.prompt.trim() || currentNovel?.coverPrompt?.trim() || ''
    if (!prompt) {
      return {
        applied: false,
        reason: '当前还没有可用于生图的封面提示词，所以我没有直接生成封面。',
      }
    }

    setCoverGenerationBusy(true)
    try {
      const result = await generateCoverImages({
        prompt,
        size: FIXED_NOVEL_COVER_SIZE,
        count: Math.max(1, Math.min(4, options?.count ?? 1)),
        novelId: activeNovelId,
      })

      setCoverAssets((current) => [...result.images, ...current])
      setSelectedCoverId(result.images[0]?.id ?? null)
      setCoverMessage(`Agent 已生成 ${result.images.length} 张封面候选图，并正在继续处理后续步骤。`)
      if (options?.focusToolPanel !== false) {
        setActiveToolPanel('cover')
        setMobileView('cover')
      }
      syncStudioPayload((current) =>
        current ? { ...current, coverAssets: [...result.images, ...current.coverAssets] } : current,
      )

      if (result.images.length === 0) {
        return {
          applied: false,
          reason: '这次没有成功生成新的封面候选图。',
          generatedAssets: [],
        }
      }

      setWorkspaceDialog({
        title: '封面生成完成',
        description: `我已经生成了 ${result.images.length} 张封面候选图。现在可以去查看、下载，或者一键设为作品封面。`,
        confirmLabel: '去查看',
        cancelLabel: '稍后',
        onConfirm: () => {
          setActiveToolPanel('cover')
          setMobileView('cover')
        },
      })

      return {
        applied: true,
        message: `已生成 ${result.images.length} 张封面候选图。`,
        patch: {
          appliedToCover: true,
          availableApplyStrategies: [],
          coverPreviewAssetIds: result.images.map((asset) => asset.id),
          actionSummary: `我已经生成了 ${result.images.length} 张新的封面候选图。`,
          content: `我已经生成了 ${result.images.length} 张新的封面候选图。`,
        },
        generatedAssets: result.images,
      }
    } finally {
      setCoverGenerationBusy(false)
    }
  }

  async function applyCoverAssetFromAgent(asset: CoverAsset | null, promptOverride?: string): Promise<AutoApplyAgentResult> {
    if (!asset) {
      return {
        applied: false,
        reason: '当前还没有可应用的封面候选图，所以我没有直接替换正式封面。',
      }
    }

    if (!currentNovel) {
      return { applied: false }
    }

    const updatedNovel = await updateNovelMeta(currentNovel.id, {
      coverAssetId: asset.id,
      coverPrompt: promptOverride?.trim() || coverForm?.prompt.trim() || asset.prompt || undefined,
    })

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
    setCoverMessage('Agent 已将最新封面设为当前作品封面。')
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

    return {
      applied: true,
      message: '已将最新封面设为当前作品封面。',
      patch: {
        appliedToCover: true,
        availableApplyStrategies: [],
        actionSummary: '我已经把最新生成的封面设为当前作品封面。',
        content: '我已经把最新生成的封面设为当前作品封面。',
      },
    }
  }

  function openMetaPanelFromAgent(): AutoApplyAgentResult {
    setActiveToolPanel('meta')
    setMobileView('meta')

    return {
      applied: true,
      message: '已打开作品设置。',
      patch: {
        availableApplyStrategies: [],
        actionSummary: '我已经打开作品设置，您可以继续调整简介、标签和发布方式。',
        content: '我已经打开作品设置，您可以继续调整简介、标签和发布方式。',
      },
    }
  }

  function openCoverPanelFromAgent(): AutoApplyAgentResult {
    setActiveToolPanel('cover')
    setMobileView('cover')

    return {
      applied: true,
      message: '已打开封面面板。',
      patch: {
        availableApplyStrategies: [],
        actionSummary: '我已经打开封面面板，您可以继续生成、挑选或替换作品封面。',
        content: '我已经打开封面面板，您可以继续生成、挑选或替换作品封面。',
      },
    }
  }

  async function renameChapterFromAgent(content: string, promptText: string): Promise<AutoApplyAgentResult> {
    const targetChapter = await resolvePersistedAgentChapterTarget({ preferCached: true, promptText })

    if (!targetChapter) {
      return { applied: false }
    }

    const fallbackOrder = targetChapter.orderIndex || chapters.length + 1
    const extractedTitle = resolveChapterTitleFromContent(content, fallbackOrder)
    if (!extractedTitle) {
      return {
        applied: true,
        message: '这次正文里没有独立标题，我先保留章节序号并继续写入正文。',
        patch: {
          availableApplyStrategies: [],
          actionSummary: '这次正文里没有独立标题，我已保留章节序号并继续处理正文写入。',
          content: '这次正文里没有独立标题，我已保留章节序号并继续处理正文写入。',
          rawContent: content,
        },
      }
    }

    const nextTitle = resolveChapterTitleForWrite(targetChapter.title, extractedTitle ?? '', fallbackOrder)
    if (!nextTitle) {
      return { applied: false }
    }

    if (nextTitle === targetChapter.title.trim()) {
      return {
        applied: true,
        message: `当前章节已是《${nextTitle}》。`,
        patch: {
          renamedChapter: true,
          actionSummary: `我确认当前章节标题已经是《${nextTitle}》。`,
          content: `我确认当前章节标题已经是《${nextTitle}》。`,
          rawContent: content,
          availableApplyStrategies: [],
          localRollbackSnapshot: null,
        },
      }
    }

    const localRollbackSnapshot = getRollbackSnapshotForChapter(targetChapter.id)
    const savedChapter = await updateChapterDraft(activeNovelId, targetChapter.id, {
      content: targetChapter.content,
      title: nextTitle,
      summary: targetChapter.summary.trim() || undefined,
      status: targetChapter.status,
      visibility: targetChapter.visibility,
    })

    syncSavedChapterState(savedChapter, {
      message: `Agent 已将当前章节命名为《${nextTitle}》。`,
      wordCountDelta: 0,
    })
    return {
      applied: true,
      message: `已将当前章节命名为《${nextTitle}》。`,
      patch: {
        renamedChapter: true,
        catalogUpdated: shouldMarkCatalogUpdated({
          renamedChapter: true,
          previousTitle: targetChapter.title,
          nextTitle,
        }),
        actionSummary: `我已经把当前章节命名为《${nextTitle}》。`,
        content: `我已经把当前章节命名为《${nextTitle}》。`,
        rawContent: content,
        availableApplyStrategies: [],
        localRollbackSnapshot: localRollbackSnapshot
          ? {
              kind: 'restore_chapter',
              chapter: localRollbackSnapshot,
              selectedChapterId: selectedChapterId ?? targetChapter.id,
            }
          : null,
      },
    }
  }

  async function createEmptyChapterFromAgent(promptText: string): Promise<AutoApplyAgentResult> {
    const requestedOrder = resolveRequestedChapterOrder(promptText, chapters.length)
    const placeholderTitle = `第 ${requestedOrder} 章`
    const localDraftId = agentChapterDraft?.localOnly ? agentChapterDraft.id : null
    const previousChapterSnapshot =
      agentChapterDraft && !agentChapterDraft.localOnly ? buildRollbackSnapshotFromDraft(agentChapterDraft) : null
    const savedChapter = await createChapterDraft(activeNovelId, {
      title: placeholderTitle,
      summary: agentChapterDraft?.summary.trim() || undefined,
      content: '',
      status: agentChapterDraft?.status ?? 'draft',
      visibility: agentChapterDraft?.visibility ?? 'private',
    })

    syncSavedChapterState(savedChapter, {
      message: 'Agent 已先创建空白章节。',
      localDraftId,
      chapterCountDelta: localDraftId ? 0 : 1,
      wordCountDelta: 0,
    })

    return {
      applied: true,
      message: `已先创建空白章节《${savedChapter.title}》。`,
      patch: {
        catalogUpdated: shouldMarkCatalogUpdated({ createdChapter: true }),
        availableApplyStrategies: [],
        actionSummary: `我已经先创建空白章节《${savedChapter.title}》。`,
        content: `我已经先创建空白章节《${savedChapter.title}》。`,
        localRollbackSnapshot: {
          kind: 'remove_created_chapter',
          chapter: buildRollbackSnapshotFromChapter(savedChapter),
          previousSelectedChapterId: selectedChapterId,
          previousChapter: previousChapterSnapshot,
        },
      },
    }
  }

  async function createChapterFromAgent(content: string, promptText: string): Promise<AutoApplyAgentResult> {
    const requestedOrder = resolveRequestedChapterOrder(promptText, chapters.length)
    const preparedDraft = prepareWritableChapterDraft(content, requestedOrder)
    if (!preparedDraft?.content.trim()) {
      return { applied: false }
    }
    const createResult = await createEmptyChapterFromAgent(promptText)
    if (!createResult.applied) {
      return createResult
    }

    const createdChapter = await resolvePersistedAgentChapterTarget({ preferCached: true, promptText })
    if (!createdChapter) {
      return { applied: false, reason: '空白章节已创建，但没有定位到新章节，暂时无法继续写入正文。' }
    }

    let workingChapter = createdChapter
    const targetOrder = createdChapter.orderIndex || requestedOrder
    const extractedTitle = resolveChapterTitleFromContent(content, targetOrder)
    const actionResults: Array<Extract<AutoApplyAgentResult, { applied: true }>> = [createResult]

    if (extractedTitle) {
      const nextTitle = resolveChapterTitleForWrite(workingChapter.title, extractedTitle, targetOrder)
      if (nextTitle && nextTitle !== workingChapter.title.trim()) {
        const renamedChapter = await updateChapterDraft(activeNovelId, workingChapter.id, {
          content: workingChapter.content,
          title: nextTitle,
          summary: workingChapter.summary.trim() || undefined,
          status: workingChapter.status,
          visibility: workingChapter.visibility,
        })
        workingChapter = buildChapterDraft(renamedChapter)
        syncSavedChapterState(renamedChapter, {
          message: `Agent 已将新章节命名为《${nextTitle}》。`,
          wordCountDelta: 0,
        })
        actionResults.push({
          applied: true,
          message: `已将新章节命名为《${nextTitle}》。`,
          patch: {
            renamedChapter: true,
            catalogUpdated: shouldMarkCatalogUpdated({
              renamedChapter: true,
              previousTitle: createdChapter.title,
              nextTitle,
            }),
            availableApplyStrategies: [],
            actionSummary: `我已经把新章节命名为《${nextTitle}》。`,
            content: `我已经把新章节命名为《${nextTitle}》。`,
            rawContent: content,
          },
        })
      }
    }

    const savedChapter = await updateChapterDraft(activeNovelId, workingChapter.id, {
      content: preparedDraft.content,
      title: resolveChapterTitleForWrite(workingChapter.title, preparedDraft.title, targetOrder),
      summary: workingChapter.summary.trim() || undefined,
      status: workingChapter.status,
      visibility: workingChapter.visibility,
    })
    const nextDraft = buildChapterDraft(savedChapter)
    const review = buildPendingChapterReview({
      before: null,
      after: nextDraft,
      rollbackSnapshot: createResult.patch.localRollbackSnapshot as AgentLocalRollbackSnapshot,
      description: buildChapterReviewDescription('create', savedChapter.title),
    })

    syncSavedChapterState(savedChapter, {
      message: 'Agent 已将正文写入新章节。',
      wordCountDelta: savedChapter.wordCount - workingChapter.content.length,
    })
    upsertPendingChapterReview(review)
    actionResults.push({
      applied: true,
      message: `已将正文写入新章节《${savedChapter.title}》。`,
      patch: {
        replacedChapterContent: true,
        availableApplyStrategies: [],
        actionSummary: `我已经把正文写入新章节《${savedChapter.title}》。`,
        content: `我已经把正文写入新章节《${savedChapter.title}》。`,
        rawContent: content,
        localRollbackSnapshot: review.rollbackSnapshot,
        pendingChapterReview: review,
      },
    })

    return mergeAutoApplyResults(actionResults)
  }

  async function writeAgentContentIntoChapter(
    content: string,
    task: AgentTaskType,
    promptText: string,
    options?: {
      forceWriteMode?: 'create' | 'append' | 'replace'
    },
  ): Promise<AutoApplyAgentResult> {
    const normalizedContent = content.trim()
    if (!normalizedContent) {
      return { applied: false }
    }

    const forceWriteMode = options?.forceWriteMode

    if (forceWriteMode === 'create') {
      return createChapterFromAgent(content, promptText)
    }

    const targetChapter = await resolvePersistedAgentChapterTarget({ preferCached: true, promptText })
    if (!targetChapter) {
      if (task === 'draft-chapter' || task === 'continue-chapter') {
        return createChapterFromAgent(content, promptText)
      }

      return { applied: false }
    }

    const fallbackOrder = targetChapter.orderIndex || chapters.length + 1
    const preparedDraft = prepareWritableChapterDraft(content, fallbackOrder)
    if (!preparedDraft) {
      return { applied: false }
    }

    if (!preparedDraft.content.trim() && preparedDraft.title.trim()) {
      return renameChapterFromAgent(content, promptText)
    }

    const append =
      forceWriteMode === 'append'
        ? true
        : forceWriteMode === 'replace'
          ? false
          : task === 'continue-chapter'
    const preciseReplacement =
      editorSelection.text.trim() && !append
        ? replaceSelectionContentPrecisely({
            currentContent: targetChapter.content,
            replacement: preparedDraft.content,
            selection: editorSelection,
          })
        : null
    if (!append && editorSelection.text.trim() && (task === 'rewrite-selection' || task === 'polish-selection') && !preciseReplacement) {
      return { applied: false, reason: '这次没有定位到选中的正文片段，所以我没有直接覆盖整章。' }
    }

    const nextContent = preciseReplacement
      ? preciseReplacement
      : append
        ? `${targetChapter.content.trim() ? `${targetChapter.content.trim()}\n\n` : ''}${preparedDraft.content}`.trim()
        : preparedDraft.content
    const resolvedGeneratedTitle = preparedDraft.title.trim() || resolveChapterTitleFromContent(content, fallbackOrder) || ''
    const nextTitle = resolveChapterTitleForWrite(targetChapter.title, resolvedGeneratedTitle, fallbackOrder)

    const localRollbackSnapshot = getRollbackSnapshotForChapter(targetChapter.id)
    const savedChapter = await updateChapterDraft(activeNovelId, targetChapter.id, {
      content: nextContent,
      title: nextTitle,
      summary: targetChapter.summary.trim() || undefined,
      status: targetChapter.status,
      visibility: targetChapter.visibility,
    })
    const nextDraft = buildChapterDraft(savedChapter)
    const rollbackSnapshot = localRollbackSnapshot
      ? {
          kind: 'restore_chapter' as const,
          chapter: localRollbackSnapshot,
          selectedChapterId: selectedChapterId ?? targetChapter.id,
        }
      : null
    const review =
      rollbackSnapshot
        ? buildPendingChapterReview({
            before: cloneChapterDraftState(targetChapter),
            after: nextDraft,
            rollbackSnapshot,
            description: buildChapterReviewDescription(append ? 'append' : 'replace', savedChapter.title),
          })
        : null

    syncSavedChapterState(savedChapter, {
      message: append ? 'Agent 已把最新内容追加到当前章节。' : 'Agent 已把最新内容写入当前章节。',
      wordCountDelta: savedChapter.wordCount - targetChapter.content.length,
    })
    upsertPendingChapterReview(review)
    return {
      applied: true,
      message: append ? '已把最新内容追加到当前章节。' : '已把最新内容写入当前章节。',
      patch: {
        replacedChapterContent: append ? undefined : true,
        appendedToChapter: append ? true : undefined,
        catalogUpdated: shouldMarkCatalogUpdated({
          previousTitle: targetChapter.title,
          nextTitle,
        }),
        availableApplyStrategies: [],
        actionSummary: append
          ? `我已经把最新生成的内容追加到《${savedChapter.title}》里。`
          : `我已经把最新生成的正文写入《${savedChapter.title}》。`,
        content: append
          ? `我已经把最新生成的内容追加到《${savedChapter.title}》里。`
          : `我已经把最新生成的正文写入《${savedChapter.title}》。`,
        rawContent: content,
        localRollbackSnapshot: rollbackSnapshot,
        pendingChapterReview: review,
      },
    }
  }

  async function attemptAutoApplyAgentResult(
    artifactId: string,
    promptText: string,
    task: AgentTaskType,
    content: string,
    availableApplyStrategies?: string[] | null,
    actionPlan?: AgentActionPlan | null,
    toolPolicy?: AgentWorkspaceToolPolicy | null,
  ): Promise<{
    autoApplyResult: AutoApplyAgentResult
    stepResults: AgentExecutionStepResult[]
  }> {
    const executionPlan = buildAgentExecutionPlan(
      promptText,
      task,
      content,
      availableApplyStrategies,
      actionPlan,
      toolPolicy,
    )
    agentExecutionChapterTargetRef.current = resolveRequestedExistingChapterId(promptText, chapters) ?? agentSelectedChapterId
    if (executionPlan.blockedReason) {
      return {
        autoApplyResult: { applied: false, reason: executionPlan.blockedReason },
        stepResults: buildBlockedStepResults(actionPlan),
      }
    }

    const plannedSteps = executionPlan.steps
    if (plannedSteps.length === 0) {
      return {
        autoApplyResult: { applied: false },
        stepResults: [],
      }
    }

    const appliedResults: Array<Extract<AutoApplyAgentResult, { applied: true }>> = []
    let latestGeneratedCoverAsset: CoverAsset | null = null
    let latestCoverPrompt = coverForm?.prompt.trim() || currentNovel?.coverPrompt?.trim() || ''
    let stepResults = buildPendingStepResults(plannedSteps)
    updateAgentArtifact(artifactId, (artifact) => ({
      ...artifact,
      stepResults,
    }))

    const updateStepResult = (
      stepId: string,
      updater: (current: AgentExecutionStepResult) => AgentExecutionStepResult,
    ) => {
      stepResults = stepResults.map((item) => (item.stepId === stepId ? updater(item) : item))
      updateAgentArtifact(artifactId, (artifact) => ({
        ...artifact,
        stepResults,
      }))
    }

    for (const step of plannedSteps) {
      const startedAt = new Date().toISOString()
      const statusMessage = resolveExecutionStepStartMessage(step, promptText)

      updateStepResult(step.stepId, (current) => ({
        ...current,
        status: 'running',
        startedAt,
        errorMessage: null,
      }))
      appendAgentRunStatus(statusMessage, 'workspace.step.started', artifactId)

      let result: AutoApplyAgentResult

      try {
        switch (step.kind) {
          case 'rename_novel':
            result = await renameNovelFromAgent(content, promptText, step.titleOverride)
            break
          case 'create_chapter':
            result = await createEmptyChapterFromAgent(promptText)
            break
          case 'rename_chapter':
            result = await renameChapterFromAgent(content, promptText)
            break
          case 'update_novel_meta':
            result = await updateNovelMetaFromAgent(step.payload)
            break
          case 'set_cover_prompt':
            result = await setCoverPromptFromAgent(step.prompt)
            latestCoverPrompt = step.prompt.trim()
            break
          case 'generate_cover': {
            const generationResult = await generateCoverCandidatesFromAgent({
              prompt: step.prompt ?? latestCoverPrompt,
              count: step.count,
            })
            result = generationResult
            latestGeneratedCoverAsset = generationResult.applied
              ? generationResult.generatedAssets?.[0] ?? null
              : latestGeneratedCoverAsset
            if (step.prompt?.trim()) {
              latestCoverPrompt = step.prompt.trim()
            }
            break
          }
          case 'apply_cover':
            result = await applyCoverAssetFromAgent(
              step.source === 'selected' ? selectedCover ?? latestGeneratedCoverAsset : latestGeneratedCoverAsset ?? selectedCover,
              latestCoverPrompt,
            )
            break
          case 'open_meta':
            result = openMetaPanelFromAgent()
            break
          case 'open_cover':
            result = openCoverPanelFromAgent()
            break
          case 'write_chapter':
            result = await writeAgentContentIntoChapter(content, task, promptText, {
              forceWriteMode: step.forceWriteMode,
            })
            break
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '执行该步骤时发生未知错误。'
        const finishedAt = new Date().toISOString()
        updateStepResult(step.stepId, (current) => ({
          ...current,
          status: 'failed',
          errorMessage: message,
          finishedAt,
        }))
        appendAgentRunStatus(`步骤失败：${step.title}。${message}`, 'workspace.step.failed', artifactId)
        return {
          autoApplyResult: { applied: false, reason: message },
          stepResults,
        }
      }

      if (result.applied) {
        appliedResults.push(result)
        const finishedAt = new Date().toISOString()
        updateStepResult(step.stepId, (current) => ({
          ...current,
          status: 'success',
          resultSummary: result.message,
          errorMessage: null,
          finishedAt,
        }))
        appendAgentRunStatus(result.message, 'workspace.step.completed', artifactId)
        continue
      }

      const failureMessage = ('reason' in result && typeof result.reason === 'string' ? result.reason.trim() : '') || `步骤“${step.title}”没有成功改动工作台。`
      const finishedAt = new Date().toISOString()
      updateStepResult(step.stepId, (current) => ({
        ...current,
        status: failureMessage ? 'failed' : 'skipped',
        errorMessage: failureMessage,
        finishedAt,
      }))
      appendAgentRunStatus(failureMessage, 'workspace.step.failed', artifactId)
      return {
        autoApplyResult: { applied: false, reason: failureMessage },
        stepResults,
      }
    }

    return {
      autoApplyResult: mergeAutoApplyResults(appliedResults),
      stepResults,
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
              }
            : item,
        ),
      )
      setChapterDraft((current) =>
        current && publishedSet.has(current.id)
          ? { ...current, status: 'published', visibility: variables.visibility }
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
                    }
                  : item,
              ),
            }
          : current,
      )
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

  function handleArchiveNovel() {
    if (!novelForm || saveNovelMutation.isPending || novelForm.status === 'archived') {
      return
    }

    setWorkspaceDialog({
      title: '确认下架作品',
      description: '下架后，这部作品将不再保持发布状态。确认现在下架这部作品吗？',
      confirmLabel: '确认下架',
      cancelLabel: '取消',
      onConfirm: async () => {
        await saveNovelMutation.mutateAsync({ reason: 'manual', statusOverride: 'archived' })
      },
    })
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

  function handleExecuteWorkspaceAction(
    actionId:
      | 'save_novel'
      | 'publish_novel'
      | 'archive_novel'
      | 'delete_novel'
      | 'open_meta'
      | 'open_cover'
      | 'create_chapter',
  ) {
    switch (actionId) {
      case 'save_novel':
        handleSaveNovel()
        return
      case 'publish_novel':
        handlePublishNovel()
        return
      case 'archive_novel':
        handleArchiveNovel()
        return
      case 'delete_novel':
        handleRequestDeleteNovel()
        return
      case 'open_meta':
        setActiveToolPanel('meta')
        setMobileView('meta')
        return
      case 'open_cover':
        setActiveToolPanel('cover')
        setMobileView('cover')
        return
      case 'create_chapter':
        handleRequestCreateChapter()
        return
      default:
        return
    }
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

  // 按章节 upsert 待审条目：同章替换、异章并存（legacy 引擎路径与产物应用路径共用）
  function upsertPendingChapterReview(review: ChapterPendingReview | null) {
    if (!review) {
      return
    }
    setPendingChapterReviews((current) => [
      ...current.filter((item) => item.chapterId !== review.chapterId),
      review,
    ])
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
      setActiveToolPanel('cover')
      setMobileView('cover')
    },
    onError: (error: Error) => {
      setCoverMessage(error.message)
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
    const remainingChapters = chapters.filter((chapter) => chapter.id !== deletingChapter.id)
    const fallbackChapter =
      remainingChapters[Math.min(currentIndex, remainingChapters.length - 1)] ??
      remainingChapters[remainingChapters.length - 1] ??
      null

    if (!deletingChapter.localOnly) {
      await deleteChapterDraft(activeNovelId, deletingChapter.id)
    }

    setChapters((current) => removeChapterItem(current, deletingChapter.id))
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
              chapters: removeChapterItem(current.chapters, deletingChapter.id),
            }
          : current,
      )
    }
  }

  function getRollbackSnapshotForChapter(chapterId: string): AgentLocalRollbackChapterSnapshot | null {
    if (chapterDraft && chapterDraft.id === chapterId) {
      return buildRollbackSnapshotFromDraft(chapterDraft)
    }

    const cachedChapter = queryClient.getQueryData<Chapter>(['studio-chapter', activeNovelId, chapterId])
    return cachedChapter ? buildRollbackSnapshotFromChapter(cachedChapter) : null
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
          localOnly: false,
        }
      : null

    setChapters((current) => removeChapterItem(current, snapshot.chapter.id))
    queryClient.removeQueries({
      queryKey: ['studio-chapter', activeNovelId, snapshot.chapter.id],
      exact: true,
    })
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
            chapters: current.chapters.filter((chapter) => chapter.id !== snapshot.chapter.id),
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

  function syncLocalRollbackSnapshots(artifacts: AgentArtifact[]) {
    for (const artifact of [...artifacts].reverse()) {
      syncLocalRollbackSnapshot(artifact.localRollbackSnapshot)
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
        })

        syncSavedChapterState(restoredChapter, {
          message: '已撤销本次正文变更。',
          wordCountDelta: restoredChapter.wordCount - review.after.content.length,
        })
      } else {
        await deleteChapterDraft(activeNovelId, review.after.id)
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
            item.id === review.id ? { ...item, after: { ...item.after, content: resolved.after } } : item,
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
    setAgentRunStatusMode('none')
    setAgentRunStatuses([])
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

  function handleAgentPromptChange(next: string) {
    setAgentPrompt(next)
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

  async function handleCopyAgentPrompt(artifactId: string) {
    const targetArtifact = agentArtifacts.find((artifact) => artifact.id === artifactId)
    if (!targetArtifact) {
      return
    }

    const copyText = targetArtifact.promptText?.trim() ?? ''

    if (!copyText) {
      return
    }

    setActiveAgentArtifactId(targetArtifact.id)
    if (await copyToClipboard(copyText)) {
      setAgentRunState((current) => ({
        ...current,
        statusText: '已复制这条用户对话。',
      }))
    } else {
      setWorkspaceDialog({
        title: '复制失败',
        description: '当前环境暂时无法直接复制，请稍后重试。',
        confirmLabel: '知道了',
        cancelLabel: '关闭',
        onConfirm: () => undefined,
      })
    }
  }

  function handleRetryAgentArtifact(artifactId: string) {
    const targetArtifact = agentArtifacts.find((artifact) => artifact.id === artifactId)
    const retryPrompt = targetArtifact?.promptText?.trim() ?? ''

    if (!targetArtifact || !retryPrompt || agentRunState.active) {
      return
    }

    const resolvedCommand = resolveAgentCommandFromPrompt(retryPrompt, targetArtifact.task, {
      selectedText: editorSelection.text,
      chapterContent: agentChapterDraft?.content ?? chapterDraft?.content ?? '',
    })

    setWorkspaceDialog({
      title: '确认重试这轮任务',
      description: '确认后，会按这条对话的原始要求重新执行一次 Agent 任务。',
      confirmLabel: '确认重试',
      cancelLabel: '取消',
      onConfirm: async () => {
        await handleRunAgentTask({
          taskOverride: resolvedCommand.task,
          tabOverride: resolvedCommand.tab,
          promptOverride: resolvedCommand.prompt,
          submittedPromptText: retryPrompt,
          statusText: '正在重新执行这轮任务...',
        })
      },
    })
  }

  function handleSelectAgentArtifact(artifactId: string | null) {
    setActiveAgentArtifactId(artifactId)

    if (!artifactId) {
      return
    }

    const selectedArtifact = agentArtifacts.find((artifact) => artifact.id === artifactId)
    if (selectedArtifact?.savedAsPlan) {
      setSelectedTreeItemId(`plan:${artifactId}`)
    }
  }

  function resolveCoverPromptTextFromArtifact(artifact: AgentArtifact) {
    return (artifact.rawContent ?? artifact.content).trim()
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

  function removeAgentArtifactsByRunId(runId: string) {
    setAgentArtifacts((current) => {
      const next = current.filter((artifact) => artifact.runId !== runId)
      setActiveAgentArtifactId((activeId) => {
        if (!activeId || next.some((artifact) => artifact.id === activeId)) {
          return activeId
        }

        return next[0]?.id ?? null
      })
      return next
    })
  }

  function syncRollbackToWorkspace(result: Awaited<ReturnType<typeof rollbackWritingAgentRun>>) {
    if (result.chapter) {
      const restoredChapter = result.chapter

      setChapterDraft((current) =>
        current && current.id === restoredChapter.id
          ? {
              ...current,
              title: restoredChapter.title,
              summary: restoredChapter.summary ?? '',
              content: restoredChapter.content,
              localOnly: false,
            }
          : current,
      )
      setChapterDirty(false)
      setChapterSaveState('saved')
      setChapterLastSavedAt(restoredChapter.updatedAt)
      setChapterSaveMessage('已回退到本轮对话开始前的正文状态。')
      setChapters((current) =>
        current.map((chapter) =>
          chapter.id === restoredChapter.id
            ? {
                ...chapter,
                title: restoredChapter.title,
                summary: restoredChapter.summary,
                wordCount: restoredChapter.wordCount,
              }
            : chapter,
        ),
      )
      queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, restoredChapter.id], (current) =>
        current
          ? {
              ...current,
              title: restoredChapter.title,
              summary: restoredChapter.summary,
              content: restoredChapter.content,
              wordCount: restoredChapter.wordCount,
              updatedAt: restoredChapter.updatedAt,
            }
          : current,
      )
    }

    if (result.novel) {
      setCurrentNovel((current) =>
        current
          ? {
              ...current,
              coverPrompt: result.novel?.coverPrompt ?? null,
              updatedAt: result.novel?.updatedAt ?? current.updatedAt,
            }
          : current,
      )
      setCoverForm((current) =>
        current
          ? {
              ...current,
              prompt: result.novel?.coverPrompt ?? '',
            }
          : current,
      )
    }

    syncStudioPayload((current) =>
      current
        ? {
            ...current,
            novel: result.novel
              ? {
                  ...current.novel,
                  coverPrompt: result.novel.coverPrompt ?? null,
                  updatedAt: result.novel.updatedAt,
                }
              : current.novel,
            draftChapter:
              result.chapter && current.draftChapter?.id === result.chapter.id
                ? {
                    ...current.draftChapter,
                    title: result.chapter.title,
                    summary: result.chapter.summary,
                    content: result.chapter.content,
                    wordCount: result.chapter.wordCount,
                    updatedAt: result.chapter.updatedAt,
                  }
                : current.draftChapter,
            chapters: result.chapter
              ? current.chapters.map((chapter) =>
                  chapter.id === result.chapter?.id
                    ? {
                        ...chapter,
                        title: result.chapter.title,
                        summary: result.chapter.summary,
                        wordCount: result.chapter.wordCount,
                      }
                    : chapter,
                )
              : current.chapters,
          }
        : current,
    )
  }

  async function handleRollbackAgentRun(artifactId: string) {
    const targetArtifact = agentArtifacts.find((artifact) => artifact.id === artifactId)

    if (!targetArtifact?.runId || agentRunState.active) {
      return
    }

    const rollbackRunId = targetArtifact.runId
    const rollbackTitle = targetArtifact.title || '当前结果'
    const rollbackArtifacts = agentArtifacts.filter((artifact) => artifact.runId === rollbackRunId)
    setActiveAgentArtifactId(targetArtifact.id)
    setWorkspaceDialog({
      title: '确认回退本轮对话',
      description: `回退后，会删除“${rollbackTitle}”这一轮的 Agent 结果、上下文记忆，并恢复本轮开始前被应用过的正文或封面内容。`,
      confirmLabel: '确认回退',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        const result = await rollbackWritingAgentRun(rollbackRunId)
        removeAgentArtifactsByRunId(rollbackRunId)
        setPendingChapterReviews([])
        setPendingChapterReviewBusy(false)
        syncRollbackToWorkspace(result)
        syncLocalRollbackSnapshots(rollbackArtifacts)
        setAgentRunStatusMode('none')
        setAgentRunStatuses([])
        setAgentRunState({
          active: false,
          task: null,
          title: '',
          statusText: '已回退到本轮对话开始前。',
        })
      },
    })
  }

  async function handleCopyActiveArtifact(artifactId: string) {
    const targetArtifact = agentArtifacts.find((artifact) => artifact.id === artifactId)
    if (!targetArtifact) {
      return
    }

    const copyText = (targetArtifact.rawContent ?? targetArtifact.content ?? '').trim()

    if (!copyText) {
      return
    }

    setActiveAgentArtifactId(targetArtifact.id)
    if (await copyToClipboard(copyText)) {
      setAgentRunState((current) => ({
        ...current,
        statusText: '已复制当前结果。',
      }))
    } else {
      setWorkspaceDialog({
        title: '复制失败',
        description: '当前环境暂时无法直接复制，请稍后重试。',
        confirmLabel: '知道了',
        cancelLabel: '关闭',
        onConfirm: () => undefined,
      })
    }
  }

  function handleDeleteActiveArtifact(artifactId: string) {
    const targetArtifact = agentArtifacts.find((artifact) => artifact.id === artifactId)

    if (!targetArtifact) {
      return
    }

    const deleteArtifactId = targetArtifact.id
    const deleteRunId = targetArtifact.runId
    const deleteTitle = targetArtifact.title || '当前结果'
    setActiveAgentArtifactId(targetArtifact.id)

    setWorkspaceDialog({
      title: '确认删除当前结果',
      description: deleteRunId
        ? `删除后，会同步清理“${deleteTitle}”这轮的 Agent 结果和上下文记忆，刷新后不会再恢复出来。`
        : `删除后，“${deleteTitle}”会从当前对话区移除。`,
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      tone: 'danger',
      onConfirm: async () => {
        if (deleteRunId) {
          await deleteWritingAgentRun(deleteRunId)
          removeAgentArtifactsByRunId(deleteRunId)
        } else {
          setAgentArtifacts((current) => {
            const next = current.filter((artifact) => artifact.id !== deleteArtifactId)
            setActiveAgentArtifactId(next[0]?.id ?? null)
            return next
          })
        }

        const remainingArtifacts = agentArtifacts.filter((artifact) =>
          deleteRunId ? artifact.runId !== deleteRunId : artifact.id !== deleteArtifactId,
        )

        if (remainingArtifacts.length === 0) {
          setAgentSessionId(null)
          setAgentRunStatusMode('none')
          setAgentRunStatuses([])
          setAgentRunState(createIdleAgentRunState())
          setActiveAgentArtifactId(null)
        } else {
          setAgentRunState((current) => ({
            ...current,
            statusText: '已删除当前结果。',
          }))
        }
      },
    })
  }

  function handleInsertPolishPrompt() {
    setWorkspaceDialog({
      title: '插入润色提示词',
      description: '会在输入框里补一条更完整的润色指令，方便你直接继续追问或发送。',
      confirmLabel: '插入提示词',
      cancelLabel: '取消',
      onConfirm: () => {
        const trimmedPrompt = agentPrompt.trim()
        const nextPrompt = trimmedPrompt
          ? `请帮我润色下面这段内容，保留原意与情绪，只优化语序、节奏和画面感，只输出润色后的最终文本：\n${trimmedPrompt}`
          : editorSelection.text.trim()
            ? '请帮我润色我当前在编辑器中选中的内容，保留原意与情绪，只优化语序、节奏和画面感，只输出润色后的最终文本。'
            : '请帮我润色接下来这段内容，保留原意与情绪，只优化语序、节奏和画面感，只输出润色后的最终文本。'

        setAgentPrompt(nextPrompt)
      },
    })
  }

  async function handleToggleVoiceInput() {
    if (!voiceInputSupported) {
      setWorkspaceDialog({
        title: '当前不支持语音输入',
        description: '请在支持麦克风权限和语音识别能力的浏览器中使用语音输入。',
        confirmLabel: '知道了',
        cancelLabel: '关闭',
        onConfirm: () => undefined,
      })
      return
    }

    if (voiceInputActive) {
      voiceRecognitionRef.current?.stop()
      setVoiceInputActive(false)
      return
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStream.getTracks().forEach((track) => track.stop())
    } catch {
      setWorkspaceDialog({
        title: '麦克风权限未开启',
        description: '请先允许浏览器访问麦克风，然后再使用语音输入。',
        confirmLabel: '知道了',
        cancelLabel: '关闭',
        onConfirm: () => undefined,
      })
      return
    }

    const SpeechRecognitionCtor =
      (window as Window & { SpeechRecognition?: new () => BrowserSpeechRecognition }).SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: new () => BrowserSpeechRecognition })
        .webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      return
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .flatMap((item) => Array.from(item))
        .map((item) => item.transcript)
        .join('')
        .trim()

      if (!transcript) {
        return
      }

      setAgentPrompt((current) => {
        const prefix = current.trim() ? `${current.trim()} ` : ''
        return `${prefix}${transcript}`.trim()
      })
    }
    recognition.onerror = (event) => {
      setVoiceInputActive(false)
      if (event.error === 'not-allowed') {
        setWorkspaceDialog({
          title: '麦克风权限被拒绝',
          description: '请在浏览器设置里允许麦克风访问后再试一次。',
          confirmLabel: '知道了',
          cancelLabel: '关闭',
          onConfirm: () => undefined,
        })
      }
    }
    recognition.onend = () => {
      setVoiceInputActive(false)
      voiceRecognitionRef.current = null
    }

    voiceRecognitionRef.current = recognition
    recognition.start()
    setVoiceInputActive(true)
  }

  function handleEnterImmersive() {
    setIsImmersive(true)
  }

  function appendAgentRunStatus(text: string, event = 'status', artifactId?: string) {
    setAgentRunStatuses((current) => {
      if (current[current.length - 1]?.text === text) {
        return current
      }

      return [
        ...current,
        {
          id: `agent-status-${Date.now()}-${current.length + 1}`,
          event,
          text,
          createdAt: new Date().toISOString(),
        },
      ]
    })

    if (artifactId) {
      updateAgentArtifact(artifactId, (artifact) => {
        const currentStatuses = artifact.runStatuses ?? []

        if (currentStatuses[currentStatuses.length - 1]?.text === text) {
          return artifact
        }

        return {
          ...artifact,
          runStatuses: [
            ...currentStatuses,
            {
              id: `agent-status-${Date.now()}-${currentStatuses.length + 1}`,
              event,
              text,
              createdAt: new Date().toISOString(),
            },
          ],
        }
      })
    }
  }

  function resolveExecutionModeForTask(task: AgentTaskType): AgentExecutionMode {
    if (task === 'plan-chapter' || task === 'generate-novel-title' || task === 'generate-chapter-titles') {
      return 'plan'
    }

    if (task === 'review-continuity' || task === 'read-story-context') {
      return 'review'
    }

    return 'build'
  }

  async function handleRunAgentTask(options?: {
    handoff?: AgentActionHandoff | null
    promptOverride?: string
    submittedPromptText?: string
    taskOverride?: AgentTaskType
    tabOverride?: AgentTab
    statusText?: string
  }) {
    if (!currentNovel || !projectNotes) {
      return
    }

    if (agentRunState.active) {
      return
    }

    const resolvedCommand = options?.taskOverride
      ? {
          task: options.taskOverride,
          tab: options.tabOverride ?? defaultTabForTask(options.taskOverride),
          prompt: options.promptOverride ?? '',
          commandLabel: null,
        }
      : resolveAgentCommandFromPrompt(agentPrompt, agentTask, {
          selectedText: editorSelection.text,
          chapterContent: agentChapterDraft?.content ?? chapterDraft?.content ?? '',
        })
    const resolvedTask = resolvedCommand.task
    const resolvedTab = options?.tabOverride ?? resolvedCommand.tab
    const resolvedPrompt =
      options?.promptOverride ?? resolvedCommand.prompt ?? defaultPromptForAgentTask(resolvedTask)
    const submittedPromptText = options?.submittedPromptText ?? agentPrompt.trim()
    const currentTaskWindow = activeAgentTaskWindow
    let taskWindowIdForRun = currentTaskWindow?.id ?? activeAgentTaskWindowId ?? null
    let ensuredSessionId = agentSessionId
    const shouldAutoNameTask = Boolean(
      currentTaskWindow &&
        !currentTaskWindow.customNamed &&
        !currentTaskWindow.firstPromptSubmitted,
    )
    const executionMode = resolveExecutionModeForTask(resolvedTask)
    const resolvedExecutionAgent = resolveExecutionAgentForTask(resolvedTask)
    const resolvedRouteDecision = resolveExecutionRouteDecisionForTask(resolvedTask)

    setAgentTask(resolvedTask)
    setAgentTab(resolvedTab)

    if (!ensuredSessionId) {
      const createdSession = await createWritingAgentSession(
        activeNovelId,
        currentTaskWindow?.customNamed ? currentTaskWindow.title : undefined,
      )
      ensuredSessionId = createdSession.id
      taskWindowIdForRun = createdSession.id
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
    }

    const artifactId = `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const createdAt = new Date().toISOString()

    setAgentRunState({
      active: true,
      task: resolvedTask,
      title: agentTaskLabelMap[resolvedTask],
      statusText:
        options?.statusText ??
        (resolvedCommand.commandLabel
          ? `已识别 ${resolvedCommand.commandLabel}，正在处理当前任务...`
          : `${resolvedExecutionAgent.title} 正在处理当前任务...`),
      activeAgent: resolvedExecutionAgent,
      routeDecision: resolvedRouteDecision,
      executionMode,
    })
    setAgentRunStatusMode('none')
    setAgentRunStatuses([])
    setAgentArtifacts((current) => [
      {
        id: artifactId,
        task: resolvedTask,
        type: artifactTypeForTask(resolvedTask),
        title: agentTaskLabelMap[resolvedTask],
        content: '',
        promptText: submittedPromptText,
        createdAt,
        status: 'streaming',
        runId: null,
        sessionId: ensuredSessionId,
        runStatusMode: 'none',
        runStatuses: [],
        memoryEntries: [],
        activeAgent: resolvedExecutionAgent,
        routeDecision: resolvedRouteDecision,
        executionMode,
      },
      ...current,
    ])
    setActiveAgentArtifactId(artifactId)
    if (!options?.handoff) {
      setAgentPrompt('')
    }

    try {
      const abortController = new AbortController()
      agentRunAbortControllerRef.current = abortController
      let agentTargetChapter: ChapterDraftState | null = null

      try {
        agentTargetChapter = await resolvePersistedAgentChapterTarget()
      } catch {
        agentTargetChapter = agentChapterDraft && !agentChapterDraft.localOnly ? agentChapterDraft : null
      }

      const agentSelectedText = resolveAgentSelectedText(
        submittedPromptText || resolvedPrompt,
        editorSelection.text,
        agentTargetChapter?.content ?? chapterDraft?.content ?? '',
      )

      const result = await runWritingAgentAction(
        {
          action: resolvedTask,
          novelId: currentNovel.id,
          sessionId: ensuredSessionId ?? undefined,
          chapterId: agentTargetChapter?.id,
          prompt: resolvedPrompt,
          novelTitle: currentNovel.title,
          novelSummary: novelForm?.summary.trim() || currentNovel.summary,
          chapterTitle: agentTargetChapter?.title,
          chapterSummary: agentTargetChapter?.summary,
          chapterContent: agentTargetChapter?.content,
          selectedText: agentSelectedText,
          genre: projectNotes.genre,
          protagonist: projectNotes.protagonist,
          tone: projectNotes.tone,
          stylePreference: projectNotes.stylePreference,
          coverSummary: coverForm?.summary,
          handoff: options?.handoff ?? null,
        },
        {
          onStatus: (status) => {
            setAgentRunState((current) => ({
              ...current,
              active: true,
              task: resolvedTask,
              title: agentTaskLabelMap[resolvedTask],
              statusText: status.text,
              activeAgent: current.activeAgent ?? null,
              routeDecision: current.routeDecision ?? resolvedRouteDecision,
              executionMode,
            }))
            appendAgentRunStatus(status.text, status.event, artifactId)
          },
          onStatusModeChange: (mode) => {
            setAgentRunStatusMode(mode)
            updateAgentArtifact(artifactId, (artifact) => ({
              ...artifact,
              runStatusMode: mode,
            }))
            setAgentRunState((current) => ({
              ...current,
              active: true,
              task: resolvedTask,
              title: agentTaskLabelMap[resolvedTask],
              statusText: mode === 'history' ? '正在同步本次处理记录...' : current.statusText || '正在处理当前任务...',
              activeAgent: current.activeAgent ?? null,
              routeDecision: current.routeDecision ?? resolvedRouteDecision,
              executionMode,
            }))
          },
          onChunk: (chunk) => {
            updateAgentArtifact(artifactId, (artifact) => ({
              ...artifact,
              content: `${artifact.content}${chunk}`,
              rawContent: `${artifact.rawContent ?? artifact.content}${chunk}`,
            }))
          },
          signal: abortController.signal,
        },
      )

      const nextArtifacts: AgentArtifact[] = (
        result.artifacts.length > 0
          ? result.artifacts.map((artifact) => ({
              id: artifact.id,
              task: artifact.task,
              type: artifact.type,
              title: artifact.title,
              content: artifact.content,
              rawContent: artifact.content,
              promptText: artifact.promptText || submittedPromptText,
              createdAt: artifact.createdAt,
              status: 'ready' as const,
              runId: artifact.runId,
              sessionId: result.sessionId ?? ensuredSessionId,
              runStatusMode: result.statusMode,
              runStatuses: result.streamStatuses,
              memoryEntries: result.memoryEntries,
              backendArtifactId: artifact.backendArtifactId,
              availableApplyStrategies: artifact.availableApplyStrategies,
              actionPlan: artifact.actionPlan ?? result.actionPlan ?? null,
              handoff: artifact.handoff ?? result.handoff ?? null,
              activeAgent: artifact.activeAgent ?? result.activeAgent ?? null,
              routeDecision: artifact.routeDecision ?? result.routeDecision ?? resolvedRouteDecision,
              ruleBundle: artifact.ruleBundle ?? result.ruleBundle ?? null,
              storyMemoryDigest: artifact.storyMemoryDigest ?? result.storyMemoryDigest ?? null,
              executionMode: artifact.executionMode ?? result.executionMode ?? executionMode,
              toolPolicy: artifact.toolPolicy ?? result.toolPolicy ?? null,
              stepResults: artifact.stepResults ?? result.stepResults ?? null,
            }))
          : [
              {
                id: artifactId,
                task: result.resolvedTask,
                type: result.type,
                title: result.title,
                content: result.content,
                rawContent: result.content,
                promptText: submittedPromptText,
                createdAt,
                status: 'ready' as const,
                runId: result.runId ?? null,
                sessionId: result.sessionId ?? ensuredSessionId,
                runStatusMode: result.statusMode,
                runStatuses: result.streamStatuses,
                memoryEntries: result.memoryEntries,
                backendArtifactId: result.backendArtifactId ?? null,
                availableApplyStrategies: result.availableApplyStrategies,
                actionPlan: result.actionPlan ?? null,
                handoff: result.handoff ?? null,
                activeAgent: result.activeAgent ?? null,
                routeDecision: result.routeDecision ?? resolvedRouteDecision,
                ruleBundle: result.ruleBundle ?? null,
                storyMemoryDigest: result.storyMemoryDigest ?? null,
                executionMode: result.executionMode ?? executionMode,
                toolPolicy: result.toolPolicy ?? null,
                stepResults: result.stepResults ?? null,
              },
            ]
      ).map((artifact) =>
        artifact.type === 'chapter_plan'
          ? {
              ...artifact,
              title: buildDefaultPlanTitle(artifact, chapters, chapterDraft),
              savedAsPlan: true,
            }
          : artifact,
      )
      const primaryPlanArtifact = nextArtifacts.find((artifact) => artifact.savedAsPlan) ?? null

      setAgentTask(result.resolvedTask)
      setAgentTab(defaultTabForTask(result.resolvedTask))
      const finalizedSessionId = result.sessionId ?? ensuredSessionId
      setAgentSessionId(finalizedSessionId)
      setAgentArtifacts((current) => {
        const remaining = current.filter(
          (artifact) =>
            artifact.id !== artifactId &&
            !nextArtifacts.some((nextArtifact) => nextArtifact.id === artifact.id),
        )

        return [...nextArtifacts, ...remaining]
      })
      setAgentRunStatusMode(result.statusMode)
      setAgentRunStatuses(result.streamStatuses)
      setActiveAgentArtifactId(nextArtifacts[0]?.id ?? artifactId)
      if (primaryPlanArtifact) {
        setSelectedTreeItemId(`plan:${primaryPlanArtifact.id}`)
        setChapterSaveState('saved')
        setChapterSaveMessage('创作计划已存入计划文件夹。')
      }
      if (finalizedSessionId) {
        setActiveAgentTaskWindowId(finalizedSessionId)
      }
      if (taskWindowIdForRun) {
        setAgentTaskWindows((current) =>
          current.map((taskWindow) =>
            taskWindow.id === taskWindowIdForRun || taskWindow.sessionId === finalizedSessionId
              ? {
                  ...taskWindow,
                  id: finalizedSessionId ?? taskWindow.id,
                  sessionId: finalizedSessionId,
                  temporary: false,
                  loaded: true,
                  firstPromptSubmitted: true,
                  updatedAt: new Date().toISOString(),
                }
              : taskWindow,
          ),
        )
      }
      if (finalizedSessionId && shouldAutoNameTask) {
        const autoTitle = deriveAgentTaskTitle(submittedPromptText, nextArtifacts)
        setAgentTaskWindows((current) =>
          current.map((taskWindow) =>
            taskWindow.id === finalizedSessionId || taskWindow.sessionId === finalizedSessionId
              ? {
                  ...taskWindow,
                  title: autoTitle,
                  customNamed: false,
                  updatedAt: new Date().toISOString(),
                }
              : taskWindow,
          ),
        )
        try {
          const updatedSession = await updateWritingAgentSession(finalizedSessionId, {
            title: autoTitle,
          })
          setAgentTaskWindows((current) =>
            current.map((taskWindow) =>
              taskWindow.id === finalizedSessionId || taskWindow.sessionId === finalizedSessionId
                ? {
                    ...taskWindow,
                    title: updatedSession.title,
                    customNamed: false,
                    updatedAt: updatedSession.updatedAt,
                  }
                : taskWindow,
            ),
          )
        } catch {
          // 自动命名失败时保留当前本地标题，不打断主流程
        }
      }

      let autoApplied = false
      let autoAppliedMessage = ''
      let autoApplySkippedReason = ''
      const primaryArtifact = nextArtifacts[0]
      if ((primaryArtifact?.rawContent ?? primaryArtifact?.content ?? '').trim()) {
        try {
          const executionResult = await attemptAutoApplyAgentResult(
            primaryArtifact.id,
            submittedPromptText,
            result.resolvedTask,
            primaryArtifact.rawContent ?? primaryArtifact.content,
            primaryArtifact.availableApplyStrategies ?? result.availableApplyStrategies ?? [],
            primaryArtifact.actionPlan ?? result.actionPlan ?? null,
            primaryArtifact.toolPolicy ?? result.toolPolicy ?? null,
          )
          const autoApplyResult = executionResult.autoApplyResult

          autoApplied = autoApplyResult.applied
          autoAppliedMessage = autoApplyResult.applied ? autoApplyResult.message : ''
          autoApplySkippedReason =
            autoApplyResult.applied === false && autoApplyResult.reason ? autoApplyResult.reason : ''

          if (autoApplyResult.applied && primaryArtifact) {
            updateAgentArtifact(primaryArtifact.id, (artifact) => ({
              ...artifact,
              ...autoApplyResult.patch,
              stepResults: executionResult.stepResults,
              rawContent: artifact.rawContent ?? primaryArtifact.rawContent ?? primaryArtifact.content,
              status: 'ready',
            }))
            appendAgentRunStatus(autoApplyResult.message, 'workspace.apply.completed', primaryArtifact.id)
          } else {
            updateAgentArtifact(primaryArtifact.id, (artifact) => ({
              ...artifact,
              stepResults: executionResult.stepResults,
            }))
          }

          if (autoApplySkippedReason) {
            appendAgentRunStatus(autoApplySkippedReason, 'workspace.apply.skipped', primaryArtifact?.id)
          }
        } catch (autoApplyError) {
          const message =
            autoApplyError instanceof Error
              ? autoApplyError.message
              : '结果已生成，但自动写入作品时失败。'

          appendAgentRunStatus(message, 'workspace.apply.failed', primaryArtifact?.id)
        }
      }

      setAgentRunState({
        active: false,
        task: result.resolvedTask,
        title: result.title,
        activeAgent: primaryArtifact?.activeAgent ?? result.activeAgent ?? null,
        routeDecision: primaryArtifact?.routeDecision ?? result.routeDecision ?? resolvedRouteDecision,
        executionMode: result.executionMode ?? executionMode,
        statusText:
          autoApplied
            ? autoAppliedMessage || '结果已生成，并已同步写入当前作品。'
            : autoApplySkippedReason
              ? autoApplySkippedReason
            : result.statusMode === 'history'
              ? '结果已生成，可查看本次处理记录。'
              : result.streamStatuses[result.streamStatuses.length - 1]?.text ??
                '结果已生成，可直接落回当前工作台。',
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setAgentArtifacts((current) => {
          const next = current.filter((artifact) => artifact.id !== artifactId)
          setActiveAgentArtifactId(next[0]?.id ?? null)
          return next
        })
        setAgentRunStatusMode('none')
        setAgentRunStatuses([])
        setAgentRunState({
          active: false,
          task: resolvedTask,
          title: agentTaskLabelMap[resolvedTask],
          statusText: '已暂停当前任务。',
          activeAgent: null,
          routeDecision: null,
          executionMode,
        })
        return
      }

      setAgentArtifacts((current) => {
        const next = current.filter((artifact) => artifact.id !== artifactId)
        setActiveAgentArtifactId(next[0]?.id ?? null)
        return next
      })
      appendAgentRunStatus(
        error instanceof Error ? error.message : 'Agent 暂时无法完成当前任务。',
        'run.failed',
        artifactId,
      )
      setAgentRunState({
        active: false,
        task: resolvedTask,
        title: agentTaskLabelMap[resolvedTask],
        statusText: error instanceof Error ? error.message : 'Agent 暂时无法完成当前任务。',
        activeAgent: null,
        routeDecision: null,
        executionMode,
      })
    } finally {
      agentRunAbortControllerRef.current = null
    }
  }

  function handleExecuteAgentHandoff(artifactId: string) {
    const artifact = agentArtifacts.find((item) => item.id === artifactId)
    const handoff = artifact?.handoff

    if (!artifact || !handoff || handoff.targetMode !== 'build' || agentRunState.active) {
      return
    }

    const targetTask = (handoff.actionHint as AgentTaskType | undefined) ?? 'draft-chapter'
    void handleRunAgentTask({
      handoff,
      taskOverride: targetTask,
      tabOverride: defaultTabForTask(targetTask),
      promptOverride: '请按刚才确认的计划直接执行。',
      submittedPromptText: artifact.promptText?.trim() || '按刚才的计划继续执行',
      statusText: '已接收规划结果，正在切换到执行模式...',
    })
  }

  function handleStopAgentTask() {
    agentRunAbortControllerRef.current?.abort()
  }

  function syncChapterDraftAfterApply(
    strategy: 'replaceChapterContent' | 'appendChapterContent' | 'saveChapterSummary',
    artifact: AgentArtifact,
  ) {
    if (!chapterDraft) {
      return
    }

    const appliedAt = new Date().toISOString()
    const artifactBody = artifact.rawContent ?? artifact.content

    if (strategy === 'saveChapterSummary') {
      const nextSummary = toAppliedChapterSummary(artifactBody)

      setChapterDraft({ ...chapterDraft, summary: nextSummary })
      setChapterDirty(false)
      setChapterLastSavedAt(appliedAt)
      setChapterSaveState('saved')
      setChapterSaveMessage('创作计划已保存。')
      setChapters((current) =>
        current.map((chapter) =>
          chapter.id === chapterDraft.id
            ? {
                ...chapter,
                summary: nextSummary,
              }
            : chapter,
        ),
      )
      queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, chapterDraft.id], (current) =>
        current
          ? {
              ...current,
              summary: nextSummary,
              updatedAt: appliedAt,
            }
          : current,
      )
      syncStudioPayload((current) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                updatedAt: appliedAt,
              },
              draftChapter:
                current.draftChapter?.id === chapterDraft.id
                  ? {
                      ...current.draftChapter,
                      summary: nextSummary,
                      updatedAt: appliedAt,
                    }
                  : current.draftChapter,
              chapters: current.chapters.map((chapter) =>
                chapter.id === chapterDraft.id
                  ? {
                      ...chapter,
                      summary: nextSummary,
                    }
                  : chapter,
              ),
            }
          : current,
      )
      return
    }

    const nextContent =
      strategy === 'appendChapterContent'
        ? `${chapterDraft.content.trim() ? `${chapterDraft.content.trim()}\n\n` : ''}${artifactBody}`.trim()
        : artifactBody
    const wordCountDelta = nextContent.length - chapterDraft.content.length

    setChapterDraft({ ...chapterDraft, content: nextContent })
    setChapterDirty(false)
    setChapterLastSavedAt(appliedAt)
    setChapterSaveState('saved')
    setChapterSaveMessage(strategy === 'appendChapterContent' ? '正文已追加最新结果。' : '正文已更新。')
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === chapterDraft.id
          ? {
              ...chapter,
              wordCount: nextContent.length,
            }
          : chapter,
      ),
    )

    if (!chapterDraft.localOnly) {
      setCurrentNovel((current) =>
        current
          ? {
              ...current,
              wordCount: Math.max(0, current.wordCount + wordCountDelta),
              updatedAt: appliedAt,
            }
          : current,
      )
      queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, chapterDraft.id], (current) =>
        current
          ? {
              ...current,
              content: nextContent,
              wordCount: nextContent.length,
              updatedAt: appliedAt,
            }
          : current,
      )
      syncStudioPayload((current) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                wordCount: Math.max(0, current.novel.wordCount + wordCountDelta),
                updatedAt: appliedAt,
              },
              draftChapter:
                current.draftChapter?.id === chapterDraft.id
                  ? {
                      ...current.draftChapter,
                      content: nextContent,
                      wordCount: nextContent.length,
                      updatedAt: appliedAt,
                    }
                  : current.draftChapter,
              chapters: current.chapters.map((chapter) =>
                chapter.id === chapterDraft.id
                  ? {
                      ...chapter,
                      wordCount: nextContent.length,
                    }
                  : chapter,
              ),
            }
          : current,
      )
    }
  }

  async function handleApplyAgentArtifactToBackend(
    artifactId: string,
    strategy: 'replaceChapterContent' | 'appendChapterContent' | 'saveChapterSummary' | 'setNovelCoverPrompt',
  ) {
    if (pendingChapterReviews.length > 0) {
      promptConfirmPendingChapterReview('继续应用新的结果')
      return 'not_available' as const
    }

    const artifact = agentArtifacts.find((item) => item.id === artifactId)
    const persistedSelectedChapterId =
      selectedChapterId && !selectedChapterId.startsWith('local-') ? selectedChapterId : null
    const targetChapterId =
      strategy === 'setNovelCoverPrompt'
        ? undefined
        : chapterDraft && !chapterDraft.localOnly
          ? chapterDraft.id
          : persistedSelectedChapterId ?? undefined

    if (!artifact?.backendArtifactId || !artifact.availableApplyStrategies?.includes(strategy)) {
      const message =
        strategy === 'setNovelCoverPrompt'
          ? '当前结果暂时无法写入封面提示词，请重新生成后再试。'
          : '当前结果暂时无法同步到作品，请重新生成后再试。'

      if (strategy === 'setNovelCoverPrompt') {
        setCoverMessage(message)
      } else {
        setChapterSaveState('error')
        setChapterSaveMessage(message)
      }

      return 'not_available' as const
    }

    if (strategy !== 'setNovelCoverPrompt' && !targetChapterId) {
      setChapterSaveState('error')
      setChapterSaveMessage('请先保存当前章节，再同步当前结果。')
      return 'not_available' as const
    }

    try {
      await applyWritingAgentArtifact({
        artifactId: artifact.backendArtifactId,
        strategy,
        chapterId: targetChapterId,
      })

      const artifactBody = artifact.rawContent ?? artifact.content
      const targetChapter =
        isChapterContentApplyStrategy(strategy)
          ? await resolvePersistedAgentChapterTarget({ preferCached: true })
          : null

      if (strategy === 'setNovelCoverPrompt') {
        setCoverForm((current) => (current ? { ...current, prompt: artifactBody } : current))
        setCurrentNovel((current) =>
          current
            ? {
                ...current,
                coverPrompt: artifactBody,
              }
            : current,
        )
        setCoverMessage('封面提示词已写入当前作品。')
        syncStudioPayload((current) =>
          current
            ? {
                ...current,
                novel: {
                  ...current.novel,
                  coverPrompt: artifactBody,
                },
              }
            : current,
        )
        updateAgentArtifact(artifactId, (current) => ({ ...current, appliedToCover: true }))
        return 'applied' as const
      }

      const review =
        targetChapter && isChapterContentApplyStrategy(strategy)
          ? buildPendingChapterReview({
              before: cloneChapterDraftState(targetChapter),
              after: {
                ...cloneChapterDraftState(targetChapter),
                content:
                  strategy === 'appendChapterContent'
                    ? `${targetChapter.content.trim() ? `${targetChapter.content.trim()}\n\n` : ''}${artifactBody}`.trim()
                    : artifactBody,
                localOnly: false,
              },
              rollbackSnapshot: {
                kind: 'restore_chapter',
                chapter: buildRollbackSnapshotFromDraft(targetChapter),
                selectedChapterId: selectedChapterId ?? targetChapter.id,
              },
              description: buildChapterReviewDescription(
                strategy === 'appendChapterContent' ? 'append' : 'replace',
                targetChapter.title || `第 ${targetChapter.orderIndex} 章`,
              ),
              artifactId,
              runId: artifact.runId ?? null,
            })
          : null

      syncChapterDraftAfterApply(strategy, artifact)
      upsertPendingChapterReview(review)
      updateAgentArtifact(artifactId, (current) => ({
        ...current,
        savedAsPlan: strategy === 'saveChapterSummary' ? true : current.savedAsPlan,
        replacedChapterContent:
          strategy === 'replaceChapterContent' ? true : current.replacedChapterContent,
        appendedToChapter: strategy === 'appendChapterContent' ? true : current.appendedToChapter,
        pendingChapterReview: review,
      }))
      return 'applied' as const
    } catch (error) {
      const message = error instanceof Error ? error.message : '当前结果暂时无法同步，请稍后再试。'

      if (strategy === 'setNovelCoverPrompt') {
        setCoverMessage(message)
      } else {
        setChapterSaveState('error')
        setChapterSaveMessage(message)
      }

      return 'failed' as const
    }
  }

  async function handleSaveAgentArtifactAsPlan(artifactId: string) {
    const artifact = agentArtifacts.find((item) => item.id === artifactId)

    if (!artifact) {
      return
    }

    const canSyncChapterSummary = Boolean(
      chapterDraft &&
        artifact.backendArtifactId &&
        artifact.availableApplyStrategies?.includes('saveChapterSummary'),
    )

    if (canSyncChapterSummary) {
      const applied = await handleApplyAgentArtifactToBackend(artifactId, 'saveChapterSummary')
      if (applied === 'failed' || applied === 'not_available') {
        return
      }
    }

    updateAgentArtifact(artifactId, (current) => ({
      ...current,
      title: buildDefaultPlanTitle(current, chapters, chapterDraft),
      savedAsPlan: true,
    }))
    setActiveAgentArtifactId(artifactId)
    setSelectedTreeItemId(`plan:${artifactId}`)
    setActiveToolPanel('assistant')
    setChapterSaveState('saved')
    setChapterSaveMessage(
      canSyncChapterSummary ? '创作计划已同步，并已存入计划文件夹。' : '创作计划已存入计划文件夹。',
    )
  }

  async function handleApplyAgentCoverPrompt(artifactId: string) {
    const artifact = agentArtifacts.find((item) => item.id === artifactId)

    if (!artifact || artifact.type !== 'cover_prompt') {
      return
    }

    const applied = await handleApplyAgentArtifactToBackend(artifactId, 'setNovelCoverPrompt')

    if (applied !== 'applied') {
      return
    }
  }

  async function handleGenerateCoverFromArtifact(artifactId: string) {
    const artifact = agentArtifacts.find((item) => item.id === artifactId)

    if (!artifact || artifact.type !== 'cover_prompt') {
      return
    }

    const coverPrompt = resolveCoverPromptTextFromArtifact(artifact)
    if (!coverPrompt) {
      setCoverMessage('当前结果里还没有可直接生成的封面提示词。')
      return
    }

    setActiveAgentArtifactId(artifactId)
    setGeneratingCoverArtifactId(artifactId)

    try {
      if (!artifact.appliedToCover) {
        if (artifact.backendArtifactId && artifact.availableApplyStrategies?.includes('setNovelCoverPrompt')) {
          const applied = await handleApplyAgentArtifactToBackend(artifactId, 'setNovelCoverPrompt')
          if (applied !== 'applied') {
            return
          }
        } else if (currentNovel) {
          const updatedNovel = await updateNovelMeta(currentNovel.id, { coverPrompt })
          syncUpdatedNovelState(updatedNovel, '封面提示词已同步到当前作品。')
          updateAgentArtifact(artifactId, (current) => ({
            ...current,
            appliedToCover: true,
            availableApplyStrategies: [],
            rawContent: current.rawContent ?? current.content,
          }))
        }
      }

      const generationResult = await generateCoverCandidatesFromAgent({
        prompt: coverPrompt,
        count: coverForm?.count,
        focusToolPanel: false,
      })

      if (!generationResult.applied) {
        if ('reason' in generationResult && generationResult.reason) {
          setCoverMessage(generationResult.reason)
        }
        return
      }

      updateAgentArtifact(artifactId, (current) => ({
        ...current,
        ...generationResult.patch,
        rawContent: current.rawContent ?? current.content,
      }))
    } catch (error) {
      setCoverMessage(error instanceof Error ? error.message : '暂时无法生成封面，请稍后再试。')
    } finally {
      setGeneratingCoverArtifactId(null)
    }
  }

  async function handleApplyGeneratedCoverAsset(artifactId: string, asset: CoverAsset) {
    const artifact = agentArtifacts.find((item) => item.id === artifactId)

    if (!artifact || artifact.type !== 'cover_prompt') {
      return
    }

    setActiveAgentArtifactId(artifactId)
    setApplyingGeneratedCoverArtifactId(artifactId)

    try {
      const applyResult = await applyCoverAssetFromAgent(
        asset,
        resolveCoverPromptTextFromArtifact(artifact) || asset.prompt || coverForm?.prompt.trim(),
      )

      if (!applyResult.applied) {
        if ('reason' in applyResult && applyResult.reason) {
          setCoverMessage(applyResult.reason)
        }
        return
      }

      updateAgentArtifact(artifactId, (current) => ({
        ...current,
        ...applyResult.patch,
        rawContent: current.rawContent ?? current.content,
        coverPreviewAssetIds: Array.from(new Set([asset.id, ...(current.coverPreviewAssetIds ?? [])])),
      }))
    } catch (error) {
      setCoverMessage(error instanceof Error ? error.message : '暂时无法应用这张封面，请稍后再试。')
    } finally {
      setApplyingGeneratedCoverArtifactId(null)
    }
  }

  async function handleReplaceChapterContentWithArtifact(artifactId: string) {
    const applied = await handleApplyAgentArtifactToBackend(artifactId, 'replaceChapterContent')

    if (applied !== 'applied') {
      return
    }
  }

  async function handleAppendArtifactToChapter(artifactId: string) {
    const applied = await handleApplyAgentArtifactToBackend(artifactId, 'appendChapterContent')

    if (applied !== 'applied') {
      return
    }
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
    // Agent Loop 新链路（plan/13）：默认启用，VITE_AGENT_ENGINE=legacy 可回退旧面板
    if (agentLoopEnabled) {
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

    return (
      <WritingAgentPanel
        activeTab={agentTab}
        activeTask={agentTask}
        prompt={agentPrompt}
        runState={agentRunState}
        runStatusMode={activeArtifactRunStatusMode}
        runStatuses={activeArtifactRunStatuses}
        memoryEntries={activeArtifactMemoryEntries}
        artifacts={agentArtifacts}
        activeArtifactId={activeAgentArtifact?.id ?? activeAgentArtifactId}
        selectedTextLength={selectedTextLength}
        canSavePlan={Boolean(chapterDraft && !chapterDraft.localOnly)}
        canApplyCoverPrompt={Boolean(coverForm)}
        canReplaceChapter={Boolean(chapterDraft && !chapterDraft.localOnly)}
        canAppendChapter={Boolean(chapterDraft && !chapterDraft.localOnly)}
        supportsBackendChapterApply={Boolean(chapterDraft && !chapterDraft.localOnly)}
        voiceInputSupported={voiceInputSupported}
        voiceInputActive={voiceInputActive}
        novelPublished={novelForm?.status === 'published'}
        taskWindows={agentTaskWindows.map((taskWindow) => ({
          id: taskWindow.id,
          title: taskWindow.title,
          updatedAt: taskWindow.updatedAt,
          temporary: taskWindow.temporary,
          prompt: taskWindow.prompt,
          artifactsCount: taskWindow.artifacts.length,
        }))}
        activeTaskWindowId={activeAgentTaskWindowId}
        showTaskList={showAgentTaskList}
        taskSwitchLocked={agentRunState.active}
        coverPreviewAssetsByArtifactId={coverPreviewAssetsByArtifactId}
        generatingCoverArtifactId={generatingCoverArtifactId}
        selectingCover={coverSelectMutation.isPending || Boolean(applyingGeneratedCoverArtifactId)}
        onPromptChange={handleAgentPromptChange}
        onRun={() => void handleRunAgentTask()}
        onStop={handleStopAgentTask}
        onRollback={(artifactId) => void handleRollbackAgentRun(artifactId)}
        onCopyPrompt={(artifactId) => void handleCopyAgentPrompt(artifactId)}
        onCopyResult={(artifactId) => void handleCopyActiveArtifact(artifactId)}
        onRetryArtifact={handleRetryAgentArtifact}
        onDeleteResult={handleDeleteActiveArtifact}
        onInsertPolishPrompt={handleInsertPolishPrompt}
        onToggleVoiceInput={() => void handleToggleVoiceInput()}
        onExecuteWorkspaceAction={handleExecuteWorkspaceAction}
        onExecuteHandoff={(artifactId) => handleExecuteAgentHandoff(artifactId)}
        onSelectArtifact={handleSelectAgentArtifact}
        onCreateTaskWindow={handleCreateAgentTaskWindow}
        onToggleTaskList={() => setShowAgentTaskList((current) => !current)}
        onSavePlan={(artifactId) => void handleSaveAgentArtifactAsPlan(artifactId)}
        onApplyCoverPrompt={(artifactId) => void handleApplyAgentCoverPrompt(artifactId)}
        onGenerateCoverFromArtifact={(artifactId) => void handleGenerateCoverFromArtifact(artifactId)}
        onOpenCoverPanel={openCoverPanelFromAgent}
        onDownloadCoverAsset={handleDownloadCoverAsset}
        onApplyGeneratedCoverAsset={(artifactId, asset) => void handleApplyGeneratedCoverAsset(artifactId, asset)}
        onReplaceChapterContent={(artifactId) => void handleReplaceChapterContentWithArtifact(artifactId)}
        onAppendToChapter={(artifactId) => void handleAppendArtifactToChapter(artifactId)}
        onClose={close}
        showCloseAction={showCloseAction}
      />
    )
  }

  function renderAgentTaskSidebar() {
    if (!showAgentTaskList) {
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
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
                  { key: 'assistant', label: '对话', icon: MessageSquareText },
                  { key: 'editor', label: '写作', icon: PenLine },
                  { key: 'chapters', label: '章节', icon: BookOpenText },
                ] as Array<{ key: MobileView; label: string; icon: typeof PenLine }>
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobileView(key)}
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
                  { key: 'publish', label: novelForm?.status === 'published' ? '更新发布' : '发布作品', icon: Upload, action: () => handlePublishNovel() },
                  { key: 'immersive', label: '沉浸创作', icon: WandSparkles, action: () => handleEnterImmersive() },
                  { key: 'detail', label: '作品页', icon: BookOpenText, action: () => navigate(detailPreviewHref) },
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
          />

          <div className="mt-4 min-h-0 flex-1 overflow-hidden pb-2">
            <div
              className="hidden h-full min-h-0 overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] lg:grid"
              style={{ gridTemplateColumns: `${panelWidths.tree}px minmax(0,1fr) auto` }}
            >
              <div className="relative min-h-0 border-r border-[var(--border-subtle)]">
                <ChapterSidebar
                  embedded
                  chapters={chapters}
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
            </div>
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
    </>
  )
}

