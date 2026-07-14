﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Clock3, FileText, Globe2, LoaderCircle, Lock, RefreshCcw, Upload, Users, WandSparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import Tag from '@/components/ui/Tag'
import TextInput from '@/components/ui/TextInput'
import { cn } from '@/lib/utils'
import type {
  AgentActionHandoff,
  AgentActionPlan,
  AgentExecutionAgent,
  AgentExecutionMode,
  AgentRouteDecision,
  AgentRuleBundle,
  AgentStoryMemoryDigest,
  AgentWorkspaceToolPolicy,
  Chapter,
  CoverAsset,
  Novel,
  StudioPayload,
  UpdateNovelRequest,
} from '../../../shared/contracts/index.js'
import {
  applyWritingAgentArtifact,
  createNovelWorkspace,
  createChapterDraft,
  deleteWritingAgentRun,
  deleteNovelWorkspace,
  deleteChapterDraft,
  generateCoverImages,
  generateCoverPrompt,
  getChapterContent,
  getMyStudioNovels,
  getStudioPayload,
  getWritingAgentSessionHistory,
  listWritingAgentSessions,
  rollbackWritingAgentRun,
  runWritingAgentAction,
  type AgentSessionHistoryItem,
  updateChapterDraft,
  updateNovelMeta,
} from './api'
import ChapterSidebar from './components/ChapterSidebar'
import ConfirmDialog from './components/ConfirmDialog'
import CoverPanel from './components/CoverPanel'
import EditorCanvas from './components/EditorCanvas'
import ImmersiveComposer from './components/ImmersiveComposer'
import MetaPanel from './components/MetaPanel'
import StudioToolbar from './components/StudioToolbar'
import WorkspaceNovelSwitcher from './components/WorkspaceNovelSwitcher'
import WritingAgentPanel from './components/WritingAgentPanel'
import { ActionCommandButton, InputLabel } from './components/StudioControls'
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
  ProjectNotesState,
  SaveState,
  ToolPanel,
} from './types'
import {
  agentTaskLabelMap,
  chapterStatusLabelMap,
  novelStatusLabelMap,
} from './types'

const DEFAULT_NOVEL_ID = 'novel-aurora'
const BOOTSTRAP_NOVEL_TITLE = '我的第一部作品'
const BOOTSTRAP_NOVEL_SUMMARY = '先创建一部作品，再继续完善简介、章节和封面。'
const AGENT_WORKSPACE_STORAGE_PREFIX = 'studio-agent-workspace'
const STUDIO_LAST_NOVEL_STORAGE_KEY = 'studio-last-novel-id'
type StoredAgentWorkspaceSnapshot = {
  sessionId: string | null
  prompt: string
  artifacts: AgentArtifact[]
  activeArtifactId: string | null
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
  if (title && title !== BOOTSTRAP_NOVEL_TITLE) {
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
    novel.title === BOOTSTRAP_NOVEL_TITLE &&
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
  const lines = content
    .split('\n')
    .map((line) => stripLeadingListMarker(line))
    .filter(Boolean)

  for (const line of lines) {
    const quoted = extractQuotedTitle(line)
    if (quoted) {
      return quoted
    }

    const normalized = line
      .replace(/^(推荐书名|书名|作品名|小说名|命名方案|最佳书名|建议书名)[:：]\s*/, '')
      .split(/\s[-|｜]\s|[（(]/)[0]
      .trim()

    if (normalized && normalized.length <= 24) {
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

function shouldAutoCreateChapter(promptText: string, currentChapterOrder?: number | null, chapterCount?: number) {
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

  const baselineOrder = Math.max(currentChapterOrder ?? 0, chapterCount ?? 0)
  return chapterOrder > baselineOrder
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

  return containsAnyKeyword(normalized, explicitWriteKeywords)
}

type AutoApplyAgentResult =
  | { applied: false; reason?: string }
  | {
      applied: true
      message: string
      patch: Partial<AgentArtifact>
    }

type AgentExecutionStep =
  | { kind: 'rename_novel' }
  | { kind: 'rename_chapter' }
  | {
      kind: 'write_chapter'
      forceWriteMode?: 'create' | 'append' | 'replace'
    }

function resolveWriteStepFromApplyStrategies(availableApplyStrategies?: string[] | null): AgentExecutionStep | null {
  if (!availableApplyStrategies?.length) {
    return null
  }

  for (const strategy of availableApplyStrategies) {
    if (strategy === 'appendChapterContent') {
      return {
        kind: 'write_chapter',
        forceWriteMode: 'append',
      }
    }

    if (strategy === 'replaceChapterContent') {
      return {
        kind: 'write_chapter',
        forceWriteMode: 'replace',
      }
    }
  }

  return null
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
      return { steps: [{ kind: 'rename_novel' as const }] }
    case 'generate-chapter-titles':
      return { steps: [{ kind: 'rename_chapter' as const }] }
    case 'continue-chapter':
      return {
        steps: [
          strategyWriteStep ?? {
            kind: 'write_chapter' as const,
            forceWriteMode: hasSelectedPersistedChapter || hasAnyChapter ? 'append' : 'create',
          },
        ],
      }
    case 'draft-chapter':
      return {
        steps: [
          strategyWriteStep ?? {
            kind: 'write_chapter' as const,
            forceWriteMode: hasSelectedPersistedChapter ? 'replace' : 'create',
          },
        ],
      }
    case 'rewrite-selection':
    case 'polish-selection':
      return {
        steps: [strategyWriteStep ?? { kind: 'write_chapter' as const, forceWriteMode: 'replace' }],
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

function shouldAutoApplyWriteFromStrategies(
  task: AgentTaskType,
  availableApplyStrategies?: string[] | null,
  options?: {
    hasSelectedPersistedChapter?: boolean
    hasAnyChapter?: boolean
  },
) {
  const strategyWriteStep = resolveWriteStepFromApplyStrategies(availableApplyStrategies)

  if (!strategyWriteStep) {
    return null
  }

  if (task === 'draft-chapter' || task === 'continue-chapter' || task === 'rewrite-selection' || task === 'polish-selection') {
    return strategyWriteStep
  }

  if (task === 'workspace-agent') {
    const hasSelectedPersistedChapter = options?.hasSelectedPersistedChapter ?? false
    const hasAnyChapter = options?.hasAnyChapter ?? false
    if (strategyWriteStep.kind === 'write_chapter' && strategyWriteStep.forceWriteMode === 'append') {
      return {
        kind: 'write_chapter',
        forceWriteMode: hasSelectedPersistedChapter || hasAnyChapter ? 'append' : 'create',
      }
    }
  }

  return null
}

function shouldAppendToExistingChapter(promptText: string, task: AgentTaskType, currentContent: string) {
  const normalized = promptText.trim()

  if (task === 'continue-chapter') {
    return true
  }

  if (!currentContent.trim()) {
    return false
  }

  return containsAnyKeyword(normalized, [
    '续写',
    '接着写',
    '往后写',
    '补在后面',
    '追加',
    '补写',
    '多写一点',
    '多写一些',
    '再写一点',
    '再写一些',
    '扩充',
    '丰富',
    '展开',
  ])
}

function getAgentWorkspaceStorageKey(novelId: string) {
  return `${AGENT_WORKSPACE_STORAGE_PREFIX}:${novelId}`
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
    const parsed = JSON.parse(raw) as StoredAgentWorkspaceSnapshot
    if (!Array.isArray(parsed.artifacts)) {
      return null
    }

    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
      artifacts: parsed.artifacts,
      activeArtifactId: typeof parsed.activeArtifactId === 'string' ? parsed.activeArtifactId : null,
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
    status: novel.status === 'published' ? 'published' : 'draft',
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
      appliedToCover: snapshotArtifact.appliedToCover ?? artifact.appliedToCover,
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

function resolveAgentCommandFromPrompt(
  rawPrompt: string,
  fallbackTask: AgentTaskType,
): {
  task: AgentTaskType
  tab: AgentTab
  prompt: string
  commandLabel: string | null
} {
  const normalizedPrompt = rawPrompt.trim()
  const matchedCommands = normalizedPrompt.match(/#[^\s#]+/g) ?? []
  const resolvedCommand = matchedCommands.find((command) => agentPromptCommandMap[command]) ?? null
  const task = resolvedCommand ? agentPromptCommandMap[resolvedCommand] : fallbackTask

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
    return '请围绕当前章节生成清晰可执行的写作计划，突出冲突推进、情绪节奏和结尾钩子。'
  }

  if (task === 'draft-chapter') {
    return '请结合当前章节信息直接起草正文，保持叙事连贯、语言克制，结果可直接落回正文。'
  }

  if (task === 'rewrite-selection') {
    return '请在保留原意的前提下重写选中内容，让表达更顺、更有画面感。'
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
    size: '1024x1536',
    count: 3,
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

function buildBlankChapterDraft(orderIndex: number): ChapterDraftState {
  return {
    id: `local-${Date.now()}`,
    title: '',
    summary: '',
    content: '',
    status: 'draft',
    visibility: 'private',
    orderIndex,
    localOnly: true,
  }
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

export default function StudioWorkspace() {
  const { novelId } = useParams()
  const navigate = useNavigate()
  const activeNovelId = novelId ?? DEFAULT_NOVEL_ID
  const queryClient = useQueryClient()

  const studioQuery = useQuery({
    queryKey: ['studio', activeNovelId],
    queryFn: () => getStudioPayload(activeNovelId),
    refetchOnWindowFocus: false,
  })
  const myNovelsQuery = useQuery({
    queryKey: ['studio', 'my-novels'],
    queryFn: getMyStudioNovels,
    refetchOnWindowFocus: false,
  })

  const [currentNovel, setCurrentNovel] = useState<Novel | null>(null)
  const [novelForm, setNovelForm] = useState<NovelFormState | null>(null)
  const [projectNotes, setProjectNotes] = useState<ProjectNotesState | null>(null)
  const [coverForm, setCoverForm] = useState<CoverFormState | null>(null)
  const [coverAssets, setCoverAssets] = useState<CoverAsset[]>([])
  const [selectedCoverId, setSelectedCoverId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<StudioPayload['chapters']>([])
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [chapterDraft, setChapterDraft] = useState<ChapterDraftState | null>(null)
  const [chapterDirty, setChapterDirty] = useState(false)
  const [chapterSaveState, setChapterSaveState] = useState<SaveState>('idle')
  const [chapterSaveMessage, setChapterSaveMessage] = useState('内容会在停止输入后自动保存。')
  const [chapterLastSavedAt, setChapterLastSavedAt] = useState<string | null>(null)
  const [novelDirty, setNovelDirty] = useState(false)
  const [novelSaveState, setNovelSaveState] = useState<SaveState>('idle')
  const [novelLastSavedAt, setNovelLastSavedAt] = useState<string | null>(null)
  const [novelMessage, setNovelMessage] = useState('作品设置支持自动保存，也可以手动点击保存。')
  const [mobileView, setMobileView] = useState<MobileView>('editor')
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel | null>(null)
  const [isImmersive, setIsImmersive] = useState(false)
  const [agentTab, setAgentTab] = useState<AgentTab>('write')
  const [agentTask, setAgentTask] = useState<AgentTaskType>('workspace-agent')
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null)
  const [agentRunState, setAgentRunState] = useState<AgentRunState>(createIdleAgentRunState)
  const [agentRunStatusMode, setAgentRunStatusMode] = useState<AgentRunStatusMode>('none')
  const [agentRunStatuses, setAgentRunStatuses] = useState<AgentRunStatusItem[]>([])
  const [agentArtifacts, setAgentArtifacts] = useState<AgentArtifact[]>([])
  const [activeAgentArtifactId, setActiveAgentArtifactId] = useState<string | null>(null)
  const agentRunAbortControllerRef = useRef<AbortController | null>(null)
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const [voiceInputActive, setVoiceInputActive] = useState(false)
  const [editorSelection, setEditorSelection] = useState<EditorSelectionState>({
    start: 0,
    end: 0,
    text: '',
  })
  const [coverKeywords, setCoverKeywords] = useState<string[]>([])
  const [coverMessage, setCoverMessage] = useState('先整理提示词，再生成候选封面。')
  const [editorChapterSettingsOpen, setEditorChapterSettingsOpen] = useState(false)
  const [pendingChapterReview, setPendingChapterReview] = useState<ChapterPendingReview | null>(null)
  const [pendingChapterReviewBusy, setPendingChapterReviewBusy] = useState(false)
  const [workspaceDialog, setWorkspaceDialog] = useState<{
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'default' | 'danger'
    onConfirm: () => void | Promise<void>
  } | null>(null)
  const [workspaceDialogBusy, setWorkspaceDialogBusy] = useState(false)
  const createChapterLockRef = useRef(false)
  const createNovelMutation = useMutation({
    mutationFn: () =>
      createNovelWorkspace({
        title: BOOTSTRAP_NOVEL_TITLE,
        summary: BOOTSTRAP_NOVEL_SUMMARY,
        tags: [],
        visibility: 'private',
        status: 'draft',
      }),
    onSuccess: (novel) => {
      void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
      navigate(`/studio/novel/${novel.id}`)
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

  useEffect(() => {
    setPendingChapterReview(null)
    setPendingChapterReviewBusy(false)
  }, [activeNovelId])

  useEffect(() => {
    if (!studioQuery.data) {
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

    const snapshot = readStoredAgentWorkspace(activeNovelId)
    if (snapshot) {
      setAgentSessionId(snapshot.sessionId)
      setAgentPrompt(snapshot.prompt)
      setAgentArtifacts(snapshot.artifacts)
      setActiveAgentArtifactId(
        snapshot.activeArtifactId && snapshot.artifacts.some((artifact) => artifact.id === snapshot.activeArtifactId)
          ? snapshot.activeArtifactId
          : snapshot.artifacts.at(-1)?.id ?? null,
      )
    }

    let cancelled = false

    void (async () => {
      try {
        const sessions = await listWritingAgentSessions(activeNovelId)
        if (cancelled) {
          return
        }

        const latestSession = sessions[0]
        if (!latestSession) {
          return
        }

        setAgentSessionId(latestSession.id)
        const historyItems = await getWritingAgentSessionHistory(latestSession.id)
        if (cancelled) {
          return
        }

        const restoredArtifacts = mergeRestoredArtifactsWithSnapshot(
          buildArtifactsFromHistory(historyItems),
          snapshot?.artifacts ?? [],
        )
        if (restoredArtifacts.length === 0) {
          return
        }

        setAgentArtifacts(restoredArtifacts)
        setActiveAgentArtifactId(restoredArtifacts.at(-1)?.id ?? null)
        setAgentRunState({
          active: false,
          task: restoredArtifacts.at(-1)?.task ?? null,
          title: restoredArtifacts.at(-1)?.title ?? 'Agent 对话',
          statusText: '已恢复最近一次 Agent 对话记录。',
          activeAgent: restoredArtifacts.at(-1)?.activeAgent ?? null,
          routeDecision: restoredArtifacts.at(-1)?.routeDecision ?? null,
          executionMode: restoredArtifacts.at(-1)?.executionMode ?? null,
        })
        setAgentRunStatusMode(restoredArtifacts.at(-1)?.runStatusMode ?? 'history')
        setAgentRunStatuses(restoredArtifacts.at(-1)?.runStatuses ?? [])
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
    }
  }, [])

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

    const hasAgentState =
      Boolean(agentSessionId) ||
      Boolean(agentPrompt.trim()) ||
      agentArtifacts.length > 0 ||
      Boolean(activeAgentArtifactId)

    const storageKey = getAgentWorkspaceStorageKey(activeNovelId)
    if (!hasAgentState) {
      window.localStorage.removeItem(storageKey)
      return
    }

    const snapshot: StoredAgentWorkspaceSnapshot = {
      sessionId: agentSessionId,
      prompt: agentPrompt,
      artifacts: agentArtifacts,
      activeArtifactId: activeAgentArtifactId,
    }
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot))
  }, [activeNovelId, activeAgentArtifactId, agentArtifacts, agentPrompt, agentSessionId])

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
    if (!chapterQuery.data) {
      return
    }

    setChapterDraft(buildChapterDraft(chapterQuery.data))
    setChapterDirty(false)
    setChapterSaveState('saved')
    setChapterLastSavedAt(chapterQuery.data.updatedAt)
    setChapterSaveMessage(`已同步到 ${formatDateTime(chapterQuery.data.updatedAt)}`)
  }, [chapterQuery.data])

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
    },
    [activeNovelId, queryClient],
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

  const latestWordCount = useMemo(() => chapterDraft?.content.trim().length ?? 0, [chapterDraft])
  const activeAgentArtifact = useMemo(
    () => agentArtifacts.find((artifact) => artifact.id === activeAgentArtifactId) ?? agentArtifacts[0] ?? null,
    [activeAgentArtifactId, agentArtifacts],
  )
  const selectedTextLength = editorSelection.end - editorSelection.start
  const activeArtifactRunStatusMode = activeAgentArtifact?.runStatusMode ?? agentRunStatusMode
  const activeArtifactRunStatuses = activeAgentArtifact?.runStatuses ?? agentRunStatuses
  const activeArtifactMemoryEntries = activeAgentArtifact?.memoryEntries ?? []

  function handleSelectWorkspaceNovel(novelId: string) {
    if (novelId === activeNovelId) {
      return
    }

    if (pendingChapterReview) {
      promptConfirmPendingChapterReview('切换作品')
      return
    }

    navigate(`/studio/novel/${novelId}`)
  }

  function handleCreateWorkspaceNovel() {
    if (pendingChapterReview) {
      promptConfirmPendingChapterReview('新建作品')
      return
    }

    if (createNovelMutation.isPending) {
      return
    }

    createNovelMutation.mutate()
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
    void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
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

    setChapters((current) => replaceChapterItem(current, options.localDraftId ?? null, toChapterListItem(savedChapter)))
    setSelectedChapterId(savedChapter.id)
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
    void queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
  }

  async function resolvePersistedAgentChapterTarget(options?: {
    preferCached?: boolean
    promptText?: string
  }): Promise<ChapterDraftState | null> {
    const preferCached = options?.preferCached ?? false
    const requestedChapterId = options?.promptText
      ? resolveRequestedExistingChapterId(options.promptText, chapters)
      : null
    const targetChapterId = requestedChapterId ?? selectedChapterId

    if (!targetChapterId || targetChapterId.startsWith('local-')) {
      return chapterDraft && !chapterDraft.localOnly ? chapterDraft : null
    }

    const cachedChapter = queryClient.getQueryData<Chapter>(['studio-chapter', activeNovelId, targetChapterId])
    if (preferCached && cachedChapter) {
      return buildChapterDraft(cachedChapter)
    }

    if (chapterDraft && !chapterDraft.localOnly && chapterDraft.id === targetChapterId) {
      return chapterDraft
    }

    if (cachedChapter) {
      return buildChapterDraft(cachedChapter)
    }

    const fetchedChapter = await getChapterContent(activeNovelId, targetChapterId)
    queryClient.setQueryData<Chapter>(['studio-chapter', activeNovelId, targetChapterId], fetchedChapter)
    return buildChapterDraft(fetchedChapter)
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

      switch (step.toolName) {
        case 'novel.rename':
          steps.push({ kind: 'rename_novel' })
          break
        case 'chapter.rename':
          steps.push({ kind: 'rename_chapter' })
          break
        case 'chapter.create':
          steps.push({ kind: 'write_chapter', forceWriteMode: 'create' })
          break
        case 'chapter.append':
          steps.push({ kind: 'write_chapter', forceWriteMode: 'append' })
          break
        case 'chapter.write':
          steps.push({ kind: 'write_chapter', forceWriteMode: 'replace' })
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
    availableApplyStrategies?: string[] | null,
    actionPlan?: AgentActionPlan | null,
    toolPolicy?: AgentWorkspaceToolPolicy | null,
  ): { steps: AgentExecutionStep[]; blockedReason?: string } {
    if (shouldAutoRenameNovel(promptText, task)) {
      return {
        steps: [{ kind: 'rename_novel' }],
      }
    }

    if (isTitleOnlyChapterRequest(promptText, task)) {
      return {
        steps: [{ kind: 'rename_chapter' }],
      }
    }

    const plannedExecution = mapActionPlanToExecutionSteps(actionPlan, toolPolicy)
    if (actionPlan) {
      return plannedExecution
    }

    return resolveFallbackExecutionPlanFromTask(task, availableApplyStrategies, {
      hasSelectedPersistedChapter: Boolean(chapterDraft && !chapterDraft.localOnly),
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

  async function renameNovelFromAgent(content: string, promptText: string): Promise<AutoApplyAgentResult> {
    if (!currentNovel) {
      return { applied: false }
    }

    const nextTitle = extractExplicitNovelTitleFromPrompt(promptText) ?? extractNovelTitleCandidate(content)
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

  async function renameChapterFromAgent(content: string, promptText: string): Promise<AutoApplyAgentResult> {
    const targetChapter = await resolvePersistedAgentChapterTarget({ preferCached: true, promptText })

    if (!targetChapter) {
      return { applied: false }
    }

    const fallbackOrder = targetChapter.orderIndex || chapters.length + 1
    const extractedTitle = extractChapterTitleCandidate(content, fallbackOrder)
    if (!extractedTitle) {
      return { applied: false }
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

  async function createChapterFromAgent(content: string, promptText: string): Promise<AutoApplyAgentResult> {
    const requestedOrder = resolveRequestedChapterOrder(promptText, chapters.length)
    const preparedDraft = prepareWritableChapterDraft(content, requestedOrder)
    if (!preparedDraft?.content.trim()) {
      return { applied: false }
    }

    const localDraftId = chapterDraft?.localOnly ? chapterDraft.id : null
    const previousChapterSnapshot =
      chapterDraft && !chapterDraft.localOnly ? buildRollbackSnapshotFromDraft(chapterDraft) : null
    const savedChapter = await createChapterDraft(activeNovelId, {
      title: resolveChapterTitleForWrite('', preparedDraft.title, requestedOrder),
      summary: chapterDraft?.summary.trim() || undefined,
      content: preparedDraft.content,
      status: chapterDraft?.status ?? 'draft',
      visibility: chapterDraft?.visibility ?? 'private',
    })
    const nextDraft = buildChapterDraft(savedChapter)
    const review = buildPendingChapterReview({
      before: null,
      after: nextDraft,
      rollbackSnapshot: {
        kind: 'remove_created_chapter',
        chapter: buildRollbackSnapshotFromChapter(savedChapter),
        previousSelectedChapterId: selectedChapterId,
        previousChapter: previousChapterSnapshot,
      },
      description: buildChapterReviewDescription('create', savedChapter.title),
    })

    syncSavedChapterState(savedChapter, {
      message: 'Agent 已创建新章节并写入正文。',
      localDraftId,
      chapterCountDelta: localDraftId ? 0 : 1,
      wordCountDelta: savedChapter.wordCount,
    })
    setPendingChapterReview(review)
    return {
      applied: true,
      message: `已创建新章节《${savedChapter.title}》并写入正文。`,
      patch: {
        replacedChapterContent: true,
        availableApplyStrategies: [],
        actionSummary: `我已经新建章节《${savedChapter.title}》，并把正文写进去了。`,
        content: `我已经新建章节《${savedChapter.title}》，并把正文写进去了。`,
        rawContent: content,
        localRollbackSnapshot: review.rollbackSnapshot,
        pendingChapterReview: review,
      },
    }
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

    if ((!chapterDraft || chapterDraft.localOnly) && (task === 'draft-chapter' || task === 'continue-chapter')) {
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
    const nextTitle = resolveChapterTitleForWrite(targetChapter.title, preparedDraft.title, fallbackOrder)

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
    setPendingChapterReview(review)
    return {
      applied: true,
      message: append ? '已把最新内容追加到当前章节。' : '已把最新内容写入当前章节。',
      patch: {
        replacedChapterContent: append ? undefined : true,
        appendedToChapter: append ? true : undefined,
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
    promptText: string,
    task: AgentTaskType,
    content: string,
    availableApplyStrategies?: string[] | null,
    actionPlan?: AgentActionPlan | null,
    toolPolicy?: AgentWorkspaceToolPolicy | null,
  ): Promise<AutoApplyAgentResult> {
    const executionPlan = buildAgentExecutionPlan(
      promptText,
      task,
      availableApplyStrategies,
      actionPlan,
      toolPolicy,
    )
    if (executionPlan.blockedReason) {
      return { applied: false, reason: executionPlan.blockedReason }
    }

    const plannedSteps = executionPlan.steps
    if (plannedSteps.length === 0) {
      return { applied: false }
    }

    const appliedResults: Array<Extract<AutoApplyAgentResult, { applied: true }>> = []

    for (const step of plannedSteps) {
      appendAgentRunStatus(
        step.kind === 'rename_novel'
          ? '正在同步作品命名。'
          : step.kind === 'rename_chapter'
            ? '正在同步章节标题。'
            : step.forceWriteMode === 'create'
              ? `正在创建第 ${resolveRequestedChapterOrder(promptText, chapters.length)} 章并写入正文。`
              : step.forceWriteMode === 'append'
                ? '正在把新内容追加到目标章节。'
                : '正在把正文写入目标章节。',
        'workspace.apply.started',
      )

      const result =
        step.kind === 'rename_novel'
          ? await renameNovelFromAgent(content, promptText)
          : step.kind === 'rename_chapter'
            ? await renameChapterFromAgent(content, promptText)
            : await writeAgentContentIntoChapter(content, task, promptText, {
                forceWriteMode: step.forceWriteMode,
              })

      if (result.applied) {
        appliedResults.push(result)
      }
    }

    return mergeAutoApplyResults(appliedResults)
  }

  const saveNovelMutation = useMutation({
    mutationFn: async ({
      reason,
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

  const deleteNovelMutation = useMutation({
    mutationFn: async () => {
      await deleteNovelWorkspace(activeNovelId)
    },
    onSuccess: async () => {
      setWorkspaceDialog(null)
      setNovelMessage('作品已删除。')
      if (typeof window !== 'undefined') {
        const lastNovelId = window.localStorage.getItem(STUDIO_LAST_NOVEL_STORAGE_KEY)
        if (lastNovelId === activeNovelId) {
          window.localStorage.removeItem(STUDIO_LAST_NOVEL_STORAGE_KEY)
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] })
      await queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
      navigate('/studio', { replace: true })
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
    if (!novelForm || saveNovelMutation.isPending || novelForm.status === 'published') {
      return
    }

    setWorkspaceDialog({
      title: '确认发布作品',
      description: '发布后，作品会以已发布状态对外展示。确认现在发布这部作品吗？',
      confirmLabel: '确认发布',
      cancelLabel: '取消',
      onConfirm: async () => {
        await saveNovelMutation.mutateAsync({ reason: 'publish', statusOverride: 'published' })
      },
    })
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
      setWorkspaceDialog({
        title: '当前作品暂时不能删除',
        description: '已发布作品需要先下架，或切回草稿状态后，才允许执行删除。',
        confirmLabel: '我知道了',
        cancelLabel: '关闭',
        onConfirm: () => undefined,
      })
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
      description: `当前章节还有一处待确认的正文变更，请先选择“保留”或“撤销”，再继续${actionLabel}。`,
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

      if (pendingChapterReview) {
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
    [activeNovelId, chapterDraft, pendingChapterReview, syncStudioPayload],
  )

  useEffect(() => {
    if (!chapterDraft || !chapterDirty) {
      return
    }

    setChapterSaveState('pending')
    setChapterSaveMessage('检测到修改，停止输入 5 秒后自动保存。')
    const timer = window.setTimeout(() => {
      void persistChapter('auto')
    }, 5000)

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
        size: coverForm.size,
        count: coverForm.count,
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

  function guardUnsavedChanges(callback: () => void) {
    if (pendingChapterReview) {
      promptConfirmPendingChapterReview('切换章节')
      return
    }

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

  function handleSelectChapter(nextChapterId: string) {
    if (pendingChapterReview && nextChapterId !== selectedChapterId) {
      promptConfirmPendingChapterReview('切换章节')
      return
    }

    if (nextChapterId === selectedChapterId) {
      setEditorChapterSettingsOpen(false)
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
      setEditorChapterSettingsOpen(false)
      setChapterDraft(null)
      setChapterSaveState('idle')
      setChapterSaveMessage('正在打开章节...')
      setMobileView('editor')
    })
  }

  async function handleCreateLocalChapter() {
    if (pendingChapterReview) {
      promptConfirmPendingChapterReview('新建章节')
      return
    }

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
    if (pendingChapterReview) {
      promptConfirmPendingChapterReview('新建章节')
      return
    }

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

    if (pendingChapterReview) {
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

  function handleKeepPendingChapterReview() {
    if (!pendingChapterReview || pendingChapterReviewBusy) {
      return
    }

    const review = pendingChapterReview
    setPendingChapterReviewBusy(true)
    try {
      setPendingChapterReview(null)
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

  async function handleRevertPendingChapterReview() {
    if (!pendingChapterReview || pendingChapterReviewBusy) {
      return
    }

    const review = pendingChapterReview
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

      setPendingChapterReview(null)
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

  function handleRetrySave() {
    void persistChapter('manual')
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
        setPendingChapterReview(null)
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

    const copyText = (targetArtifact?.rawContent ?? targetArtifact?.content ?? '').trim()

    if (!copyText) {
      return
    }

    try {
      setActiveAgentArtifactId(targetArtifact.id)
      await navigator.clipboard.writeText(copyText)
      setAgentRunState((current) => ({
        ...current,
        statusText: '已复制当前结果。',
      }))
    } catch {
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

    if (pendingChapterReview) {
      promptConfirmPendingChapterReview('继续运行 Agent')
      return
    }

    const resolvedCommand = options?.taskOverride
      ? {
          task: options.taskOverride,
          tab: options.tabOverride ?? defaultTabForTask(options.taskOverride),
          prompt: options.promptOverride ?? '',
          commandLabel: null,
        }
      : resolveAgentCommandFromPrompt(agentPrompt, agentTask)
    const resolvedTask = resolvedCommand.task
    const resolvedTab = options?.tabOverride ?? resolvedCommand.tab
    const resolvedPrompt =
      options?.promptOverride ?? resolvedCommand.prompt ?? defaultPromptForAgentTask(resolvedTask)
    const submittedPromptText = options?.submittedPromptText ?? agentPrompt.trim()
    const executionMode = resolveExecutionModeForTask(resolvedTask)
    const resolvedExecutionAgent = resolveExecutionAgentForTask(resolvedTask)
    const resolvedRouteDecision = resolveExecutionRouteDecisionForTask(resolvedTask)

    setAgentTask(resolvedTask)
    setAgentTab(resolvedTab)

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
        sessionId: agentSessionId,
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
        agentTargetChapter = chapterDraft && !chapterDraft.localOnly ? chapterDraft : null
      }

      const result = await runWritingAgentAction(
        {
          action: resolvedTask,
          novelId: currentNovel.id,
          sessionId: agentSessionId ?? undefined,
          chapterId: agentTargetChapter?.id,
          prompt: resolvedPrompt,
          novelTitle: currentNovel.title,
          novelSummary: novelForm?.summary.trim() || currentNovel.summary,
          chapterTitle: agentTargetChapter?.title,
          chapterSummary: agentTargetChapter?.summary,
          chapterContent: agentTargetChapter?.content,
          selectedText: editorSelection.text,
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

      const nextArtifacts =
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
              sessionId: result.sessionId ?? agentSessionId,
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
                sessionId: result.sessionId ?? agentSessionId,
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
              },
            ]

      setAgentTask(result.resolvedTask)
      setAgentTab(defaultTabForTask(result.resolvedTask))
      setAgentSessionId(result.sessionId ?? agentSessionId)
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

      let autoApplied = false
      let autoAppliedMessage = ''
      let autoApplySkippedReason = ''
      const primaryArtifact = nextArtifacts[0]
      if ((primaryArtifact?.rawContent ?? primaryArtifact?.content ?? '').trim()) {
        try {
          const autoApplyResult = await attemptAutoApplyAgentResult(
            submittedPromptText,
            result.resolvedTask,
            primaryArtifact.rawContent ?? primaryArtifact.content,
            primaryArtifact.availableApplyStrategies ?? result.availableApplyStrategies ?? [],
            primaryArtifact.actionPlan ?? result.actionPlan ?? null,
            primaryArtifact.toolPolicy ?? result.toolPolicy ?? null,
          )

          autoApplied = autoApplyResult.applied
          autoAppliedMessage = autoApplyResult.applied ? autoApplyResult.message : ''
          autoApplySkippedReason =
            autoApplyResult.applied === false && autoApplyResult.reason ? autoApplyResult.reason : ''

          if (autoApplyResult.applied && primaryArtifact) {
            updateAgentArtifact(primaryArtifact.id, (artifact) => ({
              ...artifact,
              ...autoApplyResult.patch,
              rawContent: artifact.rawContent ?? primaryArtifact.rawContent ?? primaryArtifact.content,
              status: 'ready',
            }))
            appendAgentRunStatus(
              autoApplyResult.message,
              'workspace.apply.completed',
              primaryArtifact.id,
            )
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
      setChapterSaveMessage('章节计划已保存。')
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
    if (pendingChapterReview) {
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
      setPendingChapterReview(review)
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
    if (!chapterDraft) {
      return
    }

    const artifact = agentArtifacts.find((item) => item.id === artifactId)

    if (!artifact) {
      return
    }

    const applied = await handleApplyAgentArtifactToBackend(artifactId, 'saveChapterSummary')

    if (applied !== 'applied') {
      return
    }
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
    return (
      <Surface as="section" padding="lg" className="min-h-56">
        <div className="flex min-h-40 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            <span>加载创作内容...</span>
          </div>
        </div>
      </Surface>
    )
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
  const previewHref = chapters[0]
    ? `/novel/${currentNovel.id}/read/${chapters[0].id}?from=studio&returnTo=${encodeURIComponent(
        `/studio/novel/${currentNovel.id}`,
      )}`
    : undefined

  function renderWritingAgent(close?: () => void, showCloseAction = true) {
    return (
      <WritingAgentPanel
        currentChapterTitle={chapterTitle}
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
        onPromptChange={handleAgentPromptChange}
        onRun={() => void handleRunAgentTask()}
        onStop={handleStopAgentTask}
        onRollback={(artifactId) => void handleRollbackAgentRun(artifactId)}
        onCopyResult={(artifactId) => void handleCopyActiveArtifact(artifactId)}
        onDeleteResult={handleDeleteActiveArtifact}
        onInsertPolishPrompt={handleInsertPolishPrompt}
        onToggleVoiceInput={() => void handleToggleVoiceInput()}
        onExecuteWorkspaceAction={handleExecuteWorkspaceAction}
        onExecuteHandoff={(artifactId) => handleExecuteAgentHandoff(artifactId)}
        onSelectArtifact={setActiveAgentArtifactId}
        onSavePlan={(artifactId) => void handleSaveAgentArtifactAsPlan(artifactId)}
        onApplyCoverPrompt={(artifactId) => void handleApplyAgentCoverPrompt(artifactId)}
        onReplaceChapterContent={(artifactId) => void handleReplaceChapterContentWithArtifact(artifactId)}
        onAppendToChapter={(artifactId) => void handleAppendArtifactToChapter(artifactId)}
        onClose={close}
        showCloseAction={showCloseAction}
      />
    )
  }

  function renderToolPanel() {
    if (!activeToolPanel) {
      return null
    }

    return (
      <Surface as="section" padding="md" className="flex h-full min-h-0 flex-col overflow-hidden">
        {activeToolPanel === 'meta' ? (
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
            onSave={handleSaveNovel}
            onClose={() => setActiveToolPanel(null)}
          />
        ) : null}
        {activeToolPanel === 'assistant' ? renderWritingAgent(() => setActiveToolPanel(null)) : null}
        {activeToolPanel === 'cover' ? (
          <CoverPanel
            coverForm={coverForm}
            coverAssets={coverAssets}
            selectedCover={selectedCover}
            currentCoverId={currentNovel.coverAssetId}
            coverKeywords={coverKeywords}
            coverMessage={coverMessage}
            generatingPrompt={coverPromptMutation.isPending}
            generatingImage={coverImageMutation.isPending}
            selectingCover={coverSelectMutation.isPending}
            formatDateTime={formatDateTime}
            onChange={setCoverForm}
            onGeneratePrompt={() => coverPromptMutation.mutate()}
            onGenerateImages={() => coverImageMutation.mutate()}
            onSelectAsset={setSelectedCoverId}
            onApplyCover={() => selectedCover && coverSelectMutation.mutate(selectedCover)}
            onClose={() => setActiveToolPanel(null)}
          />
        ) : null}
      </Surface>
    )
  }

  return (
    <>
      <div className="space-y-4 md:flex md:h-full md:flex-col md:overflow-hidden md:space-y-4">
        <div className="space-y-3 md:hidden">
          <Surface as="section" padding="md" className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <WorkspaceNovelSwitcher
                currentNovelId={currentNovel.id}
                currentNovelTitle={novelTitle}
                novels={novelOptions}
                busy={createNovelMutation.isPending}
                onSelectNovel={handleSelectWorkspaceNovel}
                onCreateNovel={handleCreateWorkspaceNovel}
              />
              <div className="shrink-0 rounded-full border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                {saveDisplayMessage}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="accent">创作中心</Tag>
                <Tag>{novelStatusLabelMap[novelForm.status]}</Tag>
                <Tag>{chapterStatusLabel}</Tag>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-[var(--text-secondary)]">{novelTitle}</p>
                <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">{chapterTitle}</h1>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMobileView('editor')}
                  className={cn(
                    'rounded-[18px] border px-4 py-3 text-left transition-colors',
                    mobileView === 'editor'
                      ? 'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                  )}
                >
                  <p className="text-sm font-medium">继续写作</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">正文优先，继续当前章节。</p>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView('assistant')}
                  className={cn(
                    'rounded-[18px] border px-4 py-3 text-left transition-colors',
                    mobileView === 'assistant'
                      ? 'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                  )}
                >
                  <p className="text-sm font-medium">打开 Agent</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">继续提问、规划或执行。</p>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView('chapters')}
                  className={cn(
                    'rounded-[18px] border px-4 py-3 text-left transition-colors',
                    mobileView === 'chapters'
                      ? 'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                  )}
                >
                  <p className="text-sm font-medium">查看章节</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{chapterCountLabel}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView('meta')}
                  className={cn(
                    'rounded-[18px] border px-4 py-3 text-left transition-colors',
                    mobileView === 'meta'
                      ? 'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                  )}
                >
                  <p className="text-sm font-medium">{novelTitleMissing ? '去命名作品' : '作品设置'}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">补作品信息、状态和可见范围。</p>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handleEnterImmersive}>
                <WandSparkles className="h-4 w-4" />
                沉浸创作
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMobileView('cover')}>
                <Upload className="h-4 w-4" />
                封面
              </Button>
              <Button size="sm" variant="ghost" onClick={handleRequestCreateChapter}>
                <FileText className="h-4 w-4" />
                新建章节
              </Button>
            </div>
          </Surface>

          <div className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-[var(--surface-base)] px-1 py-2">
            <div className="inline-flex min-w-full gap-2">
              {[
                ['editor', '写作'],
                ['chapters', '章节'],
                ['assistant', 'Agent'],
                ['cover', '封面'],
                ['meta', '作品'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobileView(key as MobileView)}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-4 py-2.5 text-sm transition-colors',
                    mobileView === key
                      ? 'border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mobileView === 'editor' ? (
            <EditorCanvas
              chapterDraft={chapterDraft}
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
              onStatusChange={handleEditorStatusChange}
              onChange={handleChapterDraftChange}
              onRetrySave={handleRetrySave}
              pendingChapterReview={pendingChapterReview}
              pendingChapterReviewBusy={pendingChapterReviewBusy}
              onKeepPendingReview={handleKeepPendingChapterReview}
              onRevertPendingReview={() => void handleRevertPendingChapterReview()}
            />
          ) : null}

          {mobileView === 'chapters' ? (
            <ChapterSidebar
              chapters={chapters}
              selectedChapterId={selectedChapterId}
              novelWordCountLabel={wordCountLabel}
              chapterCountLabel={chapterCountLabel}
              novelTitle={novelTitle}
              activeCoverLabel={coverLabel}
              onSelectChapter={handleSelectChapter}
              onCreateChapter={handleRequestCreateChapter}
            />
          ) : null}

          {mobileView === 'assistant' ? (
            <Surface as="section" padding="md" className="min-h-[32rem]">
              {renderWritingAgent(() => setMobileView('editor'))}
            </Surface>
          ) : null}

          {mobileView === 'cover' ? (
            <Surface as="section" padding="md" className="min-h-[32rem]">
              <CoverPanel
                coverForm={coverForm}
                coverAssets={coverAssets}
                selectedCover={selectedCover}
                currentCoverId={currentNovel.coverAssetId}
                coverKeywords={coverKeywords}
                coverMessage={coverMessage}
                generatingPrompt={coverPromptMutation.isPending}
                generatingImage={coverImageMutation.isPending}
                selectingCover={coverSelectMutation.isPending}
                formatDateTime={formatDateTime}
                onChange={setCoverForm}
                onGeneratePrompt={() => coverPromptMutation.mutate()}
                onGenerateImages={() => coverImageMutation.mutate()}
                onSelectAsset={setSelectedCoverId}
                onApplyCover={() => selectedCover && coverSelectMutation.mutate(selectedCover)}
                onClose={() => setMobileView('editor')}
              />
            </Surface>
          ) : null}

          {mobileView === 'meta' ? (
            <Surface as="section" padding="md" className="min-h-[32rem]">
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
                onSave={handleSaveNovel}
                onClose={() => setMobileView('editor')}
              />
            </Surface>
          ) : null}
        </div>

        <div className="hidden min-h-0 md:flex md:flex-1 md:flex-col">
          <StudioToolbar
            currentNovelId={currentNovel.id}
            novelTitle={novelTitle}
            novelTitleMissing={novelTitleMissing}
            novelOptions={novelOptions}
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
            previewHref={previewHref}
            immersiveDisabled={false}
            switchingNovel={createNovelMutation.isPending}
            novelSaving={saveNovelMutation.isPending || deleteNovelMutation.isPending}
            novelDirty={novelDirty}
            novelPublished={novelForm?.status === 'published'}
            novelDeleteDisabled={novelForm?.status === 'published'}
          />

          <div className="mt-4 min-h-0 flex-1 overflow-hidden pb-2">
            <div className="grid h-full min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_260px] lg:hidden">
              <div className="min-h-0">
                <EditorCanvas
                  chapterDraft={chapterDraft}
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
                  onStatusChange={handleEditorStatusChange}
                  onChange={handleChapterDraftChange}
                  onRetrySave={handleRetrySave}
                  pendingChapterReview={pendingChapterReview}
                  pendingChapterReviewBusy={pendingChapterReviewBusy}
                  onKeepPendingReview={handleKeepPendingChapterReview}
                  onRevertPendingReview={() => void handleRevertPendingChapterReview()}
                />
              </div>

              <div className="min-h-0 md:block">
                <ChapterSidebar
                  chapters={chapters}
                  selectedChapterId={selectedChapterId}
                  novelWordCountLabel={wordCountLabel}
                  chapterCountLabel={chapterCountLabel}
                  novelTitle={novelTitle}
                  activeCoverLabel={coverLabel}
                  onSelectChapter={handleSelectChapter}
                  onCreateChapter={handleRequestCreateChapter}
                />
              </div>
            </div>

            <div className="hidden h-full min-h-0 overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] lg:grid lg:grid-cols-[260px_minmax(0,1fr)_420px] xl:grid-cols-[280px_minmax(0,1fr)_440px]">
              <div className="min-h-0 border-r border-[var(--border-subtle)]">
                <ChapterSidebar
                  embedded
                  chapters={chapters}
                  selectedChapterId={selectedChapterId}
                  novelWordCountLabel={wordCountLabel}
                  chapterCountLabel={chapterCountLabel}
                  novelTitle={novelTitle}
                  activeCoverLabel={coverLabel}
                  onSelectChapter={handleSelectChapter}
                  onCreateChapter={handleRequestCreateChapter}
                />
              </div>

              <div className="min-h-0 border-r border-[var(--border-subtle)] bg-[var(--surface-default)]">
                <EditorCanvas
                  embedded
                  chapterDraft={chapterDraft}
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
                  onStatusChange={handleEditorStatusChange}
                  onChange={handleChapterDraftChange}
                  onRetrySave={handleRetrySave}
                  pendingChapterReview={pendingChapterReview}
                  pendingChapterReviewBusy={pendingChapterReviewBusy}
                  onKeepPendingReview={handleKeepPendingChapterReview}
                  onRevertPendingReview={() => void handleRevertPendingChapterReview()}
                />
              </div>

              <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f3ec] px-4 py-4">
                {renderWritingAgent(undefined, false)}
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

          {activeToolPanel === 'assistant' ? (
            <div className="fixed inset-0 z-40 hidden bg-[rgba(15,23,42,0.18)] md:block lg:hidden" onClick={() => setActiveToolPanel(null)}>
              <div className="absolute inset-y-4 left-4 w-[24rem] max-w-[calc(100vw-2rem)]" onClick={(event) => event.stopPropagation()}>
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
          chapterDraft={chapterDraft}
          chapters={chapters}
          selectedChapterId={selectedChapterId}
          saveState={chapterSaveState}
          saveMessage={saveDisplayMessage}
          wordCountLabel={latestWordCountLabel}
          onClose={() => setIsImmersive(false)}
          onSave={() => void persistChapter('manual')}
          onRetrySave={chapterSaveState === 'error' ? handleRetrySave : undefined}
          onSelectNovel={handleSelectWorkspaceNovel}
          onCreateNovel={handleCreateWorkspaceNovel}
          onEditNovelTitle={() => setActiveToolPanel('meta')}
          onSelectChapter={handleSelectChapter}
          onCreateChapter={handleRequestCreateChapter}
          onDeleteChapter={() => void handleDeleteChapter()}
          onChange={handleChapterDraftChange}
          onSelectionChange={setEditorSelection}
          pendingChapterReview={pendingChapterReview}
          pendingChapterReviewBusy={pendingChapterReviewBusy}
          onKeepPendingReview={handleKeepPendingChapterReview}
          onRevertPendingReview={() => void handleRevertPendingChapterReview()}
          agentPanel={renderWritingAgent(undefined, false)}
          switchingNovel={createNovelMutation.isPending}
        />
      ) : null}
      {editorChapterSettingsOpen && chapterDraft ? (
        <div
          className="fixed inset-0 z-40 bg-[rgba(15,23,42,0.18)]"
          onClick={() => setEditorChapterSettingsOpen(false)}
        >
          <div
            className="absolute inset-y-4 right-4 w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_24px_64px_rgba(15,23,42,0.18)] xl:w-[26rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full min-h-0 flex-col p-5">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">章节设置</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  调整当前章节标题、状态、可见范围和摘要。
                </p>
              </div>
              <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <label className="space-y-2">
                  <InputLabel label="章节标题" />
                  <TextInput
                    value={chapterDraft.title}
                    onChange={(event) => handleChapterDraftChange({ ...chapterDraft, title: event.target.value })}
                    placeholder="例如：第三十七章 失控回环"
                  />
                </label>
                <label className="space-y-2">
                  <InputLabel label="状态操作" hint="点一次执行一次，确认后立即生效。" />
                  <div className="flex flex-wrap gap-2">
                    <ActionCommandButton
                      icon={<FileText className="h-4 w-4" />}
                      label="状态设置为草稿"
                      onClick={() => handleRequestChapterStatusAction('draft')}
                      disabled={chapterDraft.status === 'draft'}
                    />
                    <ActionCommandButton
                      icon={<Upload className="h-4 w-4" />}
                      label="立即上架"
                      onClick={() => handleRequestChapterStatusAction('published')}
                      disabled={chapterDraft.status === 'published'}
                    />
                    <ActionCommandButton
                      icon={<Clock3 className="h-4 w-4" />}
                      label="状态设置为定时"
                      onClick={() => handleRequestChapterStatusAction('scheduled')}
                      disabled={chapterDraft.status === 'scheduled'}
                    />
                    <ActionCommandButton
                      icon={<Archive className="h-4 w-4" />}
                      label="立即下架"
                      onClick={() => handleRequestChapterStatusAction('archived')}
                      disabled={chapterDraft.status === 'archived'}
                      tone="danger"
                    />
                  </div>
                </label>
                <label className="space-y-2">
                  <InputLabel label="可见范围操作" hint="直接执行可见范围变更，不再手动挑选。" />
                  <div className="flex flex-wrap gap-2">
                    <ActionCommandButton
                      icon={<Lock className="h-4 w-4" />}
                      label="可见范围设置为个人"
                      onClick={() => handleRequestChapterVisibilityAction('private')}
                      disabled={chapterDraft.visibility === 'private'}
                    />
                    <ActionCommandButton
                      icon={<Users className="h-4 w-4" />}
                      label="可见范围设置为关注可见"
                      onClick={() => handleRequestChapterVisibilityAction('followers')}
                      disabled={chapterDraft.visibility === 'followers'}
                    />
                    <ActionCommandButton
                      icon={<Globe2 className="h-4 w-4" />}
                      label="可见范围设置为公开"
                      onClick={() => handleRequestChapterVisibilityAction('public')}
                      disabled={chapterDraft.visibility === 'public'}
                    />
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">章节摘要</span>
                  <textarea
                    value={chapterDraft.summary}
                    onChange={(event) => handleChapterDraftChange({ ...chapterDraft, summary: event.target.value })}
                    rows={5}
                    className="min-h-[9rem] w-full resize-y overflow-y-auto rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
                    placeholder="补充这一章的目标、节奏或推进重点。"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
                <Button
                  onClick={handleRequestDeleteChapterFromEditor}
                  variant="ghost"
                  className="text-[rgb(153,27,27)] hover:bg-[rgba(127,29,29,0.08)] hover:text-[rgb(127,29,29)]"
                >
                  删除章节
                </Button>
                <Button onClick={() => setEditorChapterSettingsOpen(false)} variant="secondary">
                  完成
                </Button>
              </div>
            </div>
          </div>
        </div>
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
    </>
  )
}

