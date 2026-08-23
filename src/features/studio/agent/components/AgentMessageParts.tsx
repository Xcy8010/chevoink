import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenText,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Download,
  Eye,
  FileText,
  FolderDown,
  Library,
  LoaderCircle,
  Search,
  ShieldX,
  Wrench,
} from 'lucide-react'

import { buildApiUrl } from '@/app/api-base'
import { cn } from '@/lib/utils'
import ImageLightbox from '../../components/ImageLightbox'
import type {
  AgentMessagePart,
  AgentToolDisplayPayload,
} from '../../../../../shared/contracts/index.js'

/**
 * 消息 Parts 渲染器（plan/13 §5.3 + plan/20 §3.3）：
 * - text / reasoning / tool-call 三类 part 按 type 分发
 * - tool-call 的 display 负载再按 kind 渲染 diff / plan / 封面等结构化卡片
 * - part 级组件全部 memo：store 保证未变更 part 引用稳定，流式期间只有正在输出的最后一个 part 重渲染
 */

type DiffLine = {
  type: 'same' | 'add' | 'del'
  text: string
}

const DIFF_LINE_LIMIT = 300

/** 轻量行级 diff（LCS）；超长内容直接降级为仅展示新内容 */
function computeLineDiff(before: string, after: string): DiffLine[] | null {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')

  if (beforeLines.length > DIFF_LINE_LIMIT || afterLines.length > DIFF_LINE_LIMIT) {
    return null
  }

  const m = beforeLines.length
  const n = afterLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] =
        beforeLines[i] === afterLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ type: 'same', text: beforeLines[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'del', text: beforeLines[i] })
      i += 1
    } else {
      lines.push({ type: 'add', text: afterLines[j] })
      j += 1
    }
  }
  while (i < m) {
    lines.push({ type: 'del', text: beforeLines[i] })
    i += 1
  }
  while (j < n) {
    lines.push({ type: 'add', text: afterLines[j] })
    j += 1
  }

  return lines
}

function DiffCard({
  display,
}: {
  display: Extract<AgentToolDisplayPayload, { kind: 'chapterDiff' }>
}) {
  const [expanded, setExpanded] = useState(false)
  const diffLines = useMemo(
    () => (expanded ? computeLineDiff(display.before, display.after) : null),
    [expanded, display.before, display.after],
  )

  const addedChars = display.after.length - display.before.length

  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 truncate text-xs font-medium text-[var(--text-primary)]">
          {display.chapterTitle}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <span className={cn(addedChars >= 0 ? 'text-emerald-600' : 'text-rose-500')}>
            {addedChars >= 0 ? `+${addedChars}` : addedChars} 字
          </span>
          {display.appliedDirectly ? <span>已写入</span> : null}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded ? (
        <div className="max-h-72 overflow-y-auto border-t border-[var(--border-subtle)] px-3 py-2">
          {diffLines ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-6">
              {diffLines.map((line, index) =>
                line.type === 'same' ? (
                  <span key={index} className="block text-[var(--text-secondary)]">
                    {line.text || ' '}
                  </span>
                ) : line.type === 'add' ? (
                  <span key={index} className="block bg-emerald-50 text-emerald-700">
                    {line.text || ' '}
                  </span>
                ) : (
                  <span key={index} className="block bg-rose-50 text-rose-600 line-through">
                    {line.text || ' '}
                  </span>
                ),
              )}
            </pre>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-6 text-[var(--text-primary)]">
              {display.after}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  )
}

function PlanCard({ display }: { display: Extract<AgentToolDisplayPayload, { kind: 'plan' }> }) {
  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2">
      <p className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">方案</p>
      {display.summary ? (
        <p className="mt-1 text-xs leading-6 text-[var(--text-primary)]">{display.summary}</p>
      ) : null}
      {display.steps.length > 0 ? (
        <ol className="mt-1.5 space-y-1">
          {display.steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2 text-xs leading-6">
              <span className="mt-0.5 shrink-0 text-[var(--text-secondary)]">{index + 1}.</span>
              <span className="min-w-0">
                <span className="text-[var(--text-primary)]">{step.title}</span>
                {step.detail ? (
                  <span className="text-[var(--text-secondary)]"> — {step.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

function CoverImagesCard({
  display,
}: {
  display: Extract<AgentToolDisplayPayload, { kind: 'coverImages' }>
}) {
  // 点击缩略图放大查看，并支持下载
  const [previewImage, setPreviewImage] = useState<{ id: string; url: string } | null>(null)

  return (
    <div className="flex flex-wrap gap-2">
      {display.images.map((image) => (
        <button
          key={image.id}
          type="button"
          onClick={() => setPreviewImage(image)}
          className="cursor-zoom-in overflow-hidden rounded-[10px] border border-[var(--border-subtle)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          aria-label="放大查看封面候选"
        >
          <img
            src={image.url}
            alt="封面候选"
            className="h-32 w-24 object-cover"
            loading="lazy"
          />
        </button>
      ))}
      {previewImage ? (
        <ImageLightbox
          src={previewImage.url}
          alt="封面候选"
          downloadName={`封面候选-${previewImage.id}.png`}
          onClose={() => setPreviewImage(null)}
        />
      ) : null}
    </div>
  )
}

/** 联网搜索结果卡片：折叠行 = 已检索网络「query」· n 个结果，展开为标题+来源域名列表 */
function WebSearchCard({
  display,
}: {
  display: Extract<AgentToolDisplayPayload, { kind: 'webSearch' }>
}) {
  const [expanded, setExpanded] = useState(false)
  const unavailable = display.provider === 'unavailable'

  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
          {unavailable ? '联网搜索不可用 · ' : '已检索网络 '}
          「{display.query}」
          {!unavailable && display.results.length > 0 ? ` · ${display.results.length} 个结果` : ''}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        )}
      </button>
      {expanded && display.results.length > 0 ? (
        <ul className="max-h-72 overflow-y-auto border-t border-[var(--border-subtle)] px-1 py-1">
          {display.results.map((result, index) => (
            <li key={result.url || index}>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 transition hover:bg-[var(--surface-muted)]"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
                  {result.title}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">
                  {result.source}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 站内作品搜索结果卡片：折叠行 = 已搜索作品「query」· n 个结果，展开为书名+作者+状态徽标列表 */
function PlatformNovelSearchCard({
  display,
}: {
  display: Extract<AgentToolDisplayPayload, { kind: 'platformNovelSearch' }>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Library className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
          已搜索作品 「{display.query}」
          {display.results.length > 0 ? ` · ${display.results.length} 个结果` : ''}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        )}
      </button>
      {expanded && display.results.length > 0 ? (
        <ul className="max-h-72 overflow-y-auto border-t border-[var(--border-subtle)] px-1 py-1">
          {display.results.map((result, index) => (
            <li
              key={result.id || index}
              className="flex items-center gap-2 rounded-[8px] px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
                《{result.title}》 · {result.authorName}
              </span>
              <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">
                {result.published ? '已上架' : result.isOwn ? '我的·未公开' : '已下架'}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-secondary)]">
                {result.wordCount} 字
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 站内作品查看卡片：折叠行 = 已查看作品《title》· 作者 · n 章，展开为状态/标签/简介元信息 */
function PlatformNovelCard({
  display,
}: {
  display: Extract<AgentToolDisplayPayload, { kind: 'platformNovel' }>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <BookOpenText className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
          已查看作品 《{display.title}》 · {display.authorName} · {display.chapterCount} 章
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        )}
      </button>
      {expanded ? (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <p className="text-[11px] text-[var(--text-secondary)]">
            {display.published ? '已上架' : display.isOwn ? '我的·未公开' : '已下架'}
            {display.chapterTitle ? ` · 本章：《${display.chapterTitle}》` : ''}
          </p>
          {display.tags.length > 0 ? (
            <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
              标签：{display.tags.join('、')}
            </p>
          ) : null}
          {display.summary.trim() ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-primary)]">
              {display.summary}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** 视觉旁路查看图片卡片：折叠行「已查看图片 · n 张」，展开为缩略图行（点击放大）+ 视觉模型描述 */
function ViewedImageCard({
  display,
}: {
  display: Extract<AgentToolDisplayPayload, { kind: 'viewedImage' }>
}) {
  const [expanded, setExpanded] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ id: string; url: string } | null>(null)

  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Eye className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
          已查看图片 · {display.images.length} 张
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        )}
      </button>
      {expanded ? (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <div className="flex flex-wrap gap-2">
            {display.images.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setPreviewImage(image)}
                className="cursor-zoom-in overflow-hidden rounded-[10px] border border-[var(--border-subtle)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                aria-label="放大查看图片"
              >
                <img
                  src={image.url}
                  alt="查看过的图片"
                  className="h-24 w-24 object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
          {display.description ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-secondary)]">
              {display.description}
            </p>
          ) : null}
        </div>
      ) : null}
      {previewImage ? (
        <ImageLightbox
          src={previewImage.url}
          alt="查看过的图片"
          downloadName={`图片-${previewImage.id}.webp`}
          onClose={() => setPreviewImage(null)}
        />
      ) : null}
    </div>
  )
}

/** markdown 内容卡片：长内容（读文件/读网页）默认折叠、点击展开收起；短内容（如封面提示词）直接展示 */
function MarkdownCard({
  display,
}: {
  display: Extract<AgentToolDisplayPayload, { kind: 'markdown' }>
}) {
  const collapsible = display.markdown.length > 300
  const [expanded, setExpanded] = useState(false)

  if (!collapsible) {
    return (
      <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2">
        <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-6 text-[var(--text-primary)]">
          {display.markdown}
        </pre>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
          内容 · {display.markdown.length} 字
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        )}
      </button>
      {expanded ? (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2">
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-6 text-[var(--text-primary)]">
            {display.markdown}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

function ToolDisplayRenderer({ display }: { display: AgentToolDisplayPayload }) {
  switch (display.kind) {
    case 'chapterDiff':
      return <DiffCard display={display} />
    case 'plan':
      return <PlanCard display={display} />
    case 'coverImages':
      return <CoverImagesCard display={display} />
    case 'webSearch':
      return <WebSearchCard display={display} />
    case 'platformNovelSearch':
      return <PlatformNovelSearchCard display={display} />
    case 'platformNovel':
      return <PlatformNovelCard display={display} />
    case 'viewedImage':
      return <ViewedImageCard display={display} />
    case 'markdown':
      return <MarkdownCard display={display} />
    case 'chapterRef':
      return (
        <p className="text-[11px] text-[var(--text-secondary)]">
          章节「{display.title}」 · {display.wordCount} 字
        </p>
      )
    case 'planFile':
      return (
        <p className="text-[11px] text-[var(--text-secondary)]">
          计划「{display.title}」已写入计划文件夹 · {display.content.length} 字，可在左侧作品树直接编辑
        </p>
      )
    case 'planRename':
      return (
        <p className="text-[11px] text-[var(--text-secondary)]">
          计划「{display.beforeTitle}」已重命名为「{display.title}」
        </p>
      )
    case 'planDelete':
      return (
        <p className="text-[11px] text-[var(--text-secondary)]">
          计划「{display.title}」已从计划文件夹移除
        </p>
      )
    case 'uiIntent':
      return (
        <p className="text-[11px] text-[var(--text-secondary)]">
          {display.intent === 'open_meta' ? '已请求打开作品信息面板' : '已请求打开封面面板'}
        </p>
      )
    case 'exportReady':
      return (
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <FolderDown className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--text-primary)]">{display.fileName}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-secondary)]">
                含{display.detail} · 链接 15 分钟内有效
              </p>
            </div>
          </div>
          <a
            href={buildApiUrl(display.downloadUrl)}
            download={display.fileName}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-contrast)] px-3 text-xs font-medium text-[var(--text-contrast)] transition hover:bg-[var(--surface-contrast-hover)]"
          >
            <Download className="h-3.5 w-3.5" />
            下载导出包
          </a>
        </div>
      )
    case 'question':
      return (
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2">
          <p className="break-words text-xs leading-6 text-[var(--text-primary)]">{display.question}</p>
          <p className="mt-1 break-words text-[11px] leading-5 text-[var(--text-secondary)]">
            {display.unanswered ? '未回答，Agent 已按默认方案继续' : `你的回答：${display.answer ?? ''}`}
          </p>
        </div>
      )
    case 'todoList': {
      const completed = display.items.filter((item) => item.status === 'completed').length
      return (
        <p className="text-[11px] text-[var(--text-secondary)]">
          待办清单已更新 · {completed}/{display.items.length} 已完成
        </p>
      )
    }
    default:
      return null
  }
}

const toolStatusIcon = {
  running: <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" />,
  success: <Check className="h-3.5 w-3.5 text-emerald-600" />,
  failed: <CircleAlert className="h-3.5 w-3.5 text-rose-500" />,
  denied: <ShieldX className="h-3.5 w-3.5 text-amber-500" />,
} as const

/** 工具真实执行耗时：不足 1 秒的瞬时操作不展示，避免满屏无意义的 0.0s */
function formatToolDuration(durationMs: number | undefined): string | null {
  if (typeof durationMs !== 'number' || durationMs < 1000) {
    return null
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`
  }
  return `${Math.floor(durationMs / 60_000)}m${Math.round((durationMs % 60_000) / 1000)}s`
}

const ToolCallCard = memo(function ToolCallCard({
  part,
}: {
  part: Extract<AgentMessagePart, { type: 'tool-call' }>
}) {
  const [expanded, setExpanded] = useState(false)
  const argsPreview = useMemo(() => {
    try {
      const raw = JSON.stringify(part.args, null, 2)
      return raw && raw !== '{}' ? raw : ''
    } catch {
      return ''
    }
  }, [part.args])
  const durationLabel = formatToolDuration(part.durationMs)
  const running = part.status === 'running'
  // 深读卡：执行结束后默认折叠、点击头部展开回看；按 toolName 精确门控（cover_prompt_set 同样产出 markdown，不能误折）
  const collapsible = part.toolName === 'web_read' && !!part.display
  // 联网搜索过程态：复用 tool.call args 里的 query，免新增事件类型
  const argsRecord = typeof part.args === 'object' && part.args !== null ? (part.args as Record<string, unknown>) : null
  const webSearchQuery =
    part.toolName === 'web_search' && typeof argsRecord?.query === 'string' ? argsRecord.query : ''
  const platformSearchQuery =
    part.toolName === 'platform_novel_search' && typeof argsRecord?.query === 'string'
      ? argsRecord.query
      : ''
  const runningLabel =
    running && webSearchQuery
      ? `正在搜索「${webSearchQuery}」…`
      : running && platformSearchQuery
        ? `正在搜索作品「${platformSearchQuery}」…`
        : running && part.toolName === 'platform_novel_read'
          ? '查看作品中…'
          : running
            ? part.progressChars
              ? `已生成 ${part.progressChars} 字 · 执行中…`
              : '执行中…'
            : ''

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[14px] border bg-[var(--surface-muted)]/60',
        running ? 'border-[var(--border-strong)]' : 'border-[var(--border-subtle)]',
      )}
    >
      {/* IDE 式执行中呼吸动画：整卡蒙层脉冲，比单独的 spinner 更醒目 */}
      {running ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse bg-[var(--surface-muted)]/80"
        />
      ) : null}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="relative flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
          {part.title || part.toolName}
        </span>
        {running ? (
          <span className="shrink-0 animate-pulse text-[10px] font-medium text-[var(--text-secondary)]">
            {runningLabel}
          </span>
        ) : null}
        {durationLabel ? (
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-secondary)]">
            {durationLabel}
          </span>
        ) : null}
        <span className="shrink-0">{toolStatusIcon[part.status]}</span>
        {collapsible ? (
          expanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
          )
        ) : null}
      </button>
      {part.summary ? (
        <p
          className={cn(
            'px-3 pb-2 text-[11px] leading-5',
            part.status === 'failed' || part.status === 'denied'
              ? 'text-rose-500'
              : 'text-[var(--text-secondary)]',
          )}
        >
          {part.summary}
        </p>
      ) : null}
      {expanded && argsPreview ? (
        <pre className="max-h-40 overflow-y-auto border-t border-[var(--border-subtle)] px-3 py-2 text-[10px] leading-5 text-[var(--text-secondary)]">
          {argsPreview}
        </pre>
      ) : null}
      {part.display && (!collapsible || expanded) ? (
        <div className="px-3 pb-3 pt-1">
          <ToolDisplayRenderer display={part.display} />
        </div>
      ) : null}
    </div>
  )
})

const ReasoningPart = memo(function ReasoningPart({
  part,
  streaming,
}: {
  part: Extract<AgentMessagePart, { type: 'reasoning' }>
  streaming: boolean
}) {
  // null = 跟随默认（思考中展开、思考结束收起）；true/false = 用户本轮手动指定，思考中也能收起
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const showBody = manualOpen ?? streaming
  const bodyRef = useRef<HTMLParagraphElement | null>(null)
  // 是否跟随最新思考文本：默认跟随，用户在思考区内往上翻即暂停，重新滑回底部即恢复
  const followRef = useRef(true)

  // 思考结束时清掉手动状态，恢复「自动收起 + 之后可手动展开回看」的默认行为
  useEffect(() => {
    if (!streaming) {
      setManualOpen(null)
    }
  }, [streaming])

  useEffect(() => {
    // 只在思考中跟随；思考结束后用户手动展开回看时，从头开始读而不是跳到末尾
    if (!streaming || !showBody) {
      return
    }
    const node = bodyRef.current
    if (!node || !followRef.current) {
      return
    }
    node.scrollTop = node.scrollHeight
  }, [part.text, streaming, showBody])

  const handleBodyScroll = useCallback(() => {
    const node = bodyRef.current
    if (!node) {
      return
    }
    // 程序自动滚底后本就贴底，不会被误判成用户干预；内容没溢出时差值为 0，同样保持跟随
    followRef.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 12
  }, [])

  const handleToggle = useCallback(() => {
    setManualOpen((current) => {
      const nextOpen = !(current ?? streaming)
      // 收起时重置跟随，再次展开直接看最新思考
      if (!nextOpen) {
        followRef.current = true
      }
      return nextOpen
    })
  }, [streaming])

  return (
    <div className="rounded-[14px] border border-dashed border-[var(--border-subtle)] px-3 py-2">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2 text-left"
      >
        <Brain
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]',
            streaming && 'animate-pulse',
          )}
        />
        <span className="flex-1 text-[11px] font-medium tracking-[0.08em] text-[var(--text-secondary)]">
          {streaming ? '思考中…' : '思考过程'}
        </span>
        {showBody ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
        )}
      </button>
      {showBody ? (
        /* 这里刻意不加 overscroll-contain：思考区滚到边界后手势要能继续传给外层对话列表，
           否则手指落在思考区上时整个对话就滑不动了 */
        <p
          ref={bodyRef}
          onScroll={handleBodyScroll}
          className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[var(--text-secondary)] [-webkit-overflow-scrolling:auto]"
        >
          {part.text}
        </p>
      ) : null}
    </div>
  )
})

/** 兼容历史消息里残留的 Markdown 记号与模型误输出的工具轨迹标记，保持纯文本阅读体验 */
function sanitizePlainText(text: string): string {
  return text
    .replace(/^\s*\[调用\s*(?:工具|tool)[^\n]*$/gim, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '· ')
    .replace(/\n{3,}/g, '\n\n')
}

/** 文本段：清洗结果按 part.text 缓存，避免流式期间历史段落反复正则清洗 */
const TextPart = memo(function TextPart({
  text,
  streamingCursor,
}: {
  text: string
  streamingCursor: boolean
}) {
  const cleanText = useMemo(() => sanitizePlainText(text), [text])
  // 整段都是脏标记时清洗后为空，避免渲染空段落（流式尾部保留光标）
  if (!cleanText.trim() && !streamingCursor) {
    return null
  }
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-primary)]">
      {cleanText}
      {streamingCursor ? (
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--text-primary)] align-middle" />
      ) : null}
    </p>
  )
})

export const AgentMessageParts = memo(function AgentMessageParts({
  parts,
  streaming,
  runActive,
  blockId,
  summaryCount,
  summaryExpanded = false,
  onToggleSummary,
}: {
  parts: AgentMessagePart[]
  streaming: boolean
  /** 所属 run 是否仍活跃：活跃时平铺输出 */
  runActive: boolean
  /** 所属对话块（连续助手消息）的首条消息 id */
  blockId?: string
  /** 整个对话块的操作总数（仅块内首条助手消息传值）：run 结束后显示唯一一行「已处理 n 个操作」 */
  summaryCount?: number
  /** 摘要是否已展开（回看全部思考/动作） */
  summaryExpanded?: boolean
  onToggleSummary?: (blockId: string) => void
}) {
  const showSummary = !runActive && (summaryCount ?? 0) > 0
  const collapsed = !runActive && !summaryExpanded

  return (
    <div className="space-y-2">
      {showSummary ? (
        <button
          type="button"
          onClick={() => {
            if (blockId) {
              onToggleSummary?.(blockId)
            }
          }}
          className="flex w-full animate-fade-in items-center gap-1 text-left"
        >
          <span className="text-[11px] text-[var(--text-secondary)]">已处理 {summaryCount} 个操作</span>
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
          )}
        </button>
      ) : null}
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1

        if (part.type === 'text') {
          return <TextPart key={index} text={part.text} streamingCursor={streaming && isLast} />
        }

        // 折叠态：隐藏思考/动作，仅保留 text 结论
        if (collapsed) {
          return null
        }

        if (part.type === 'reasoning') {
          return <ReasoningPart key={index} part={part} streaming={streaming && isLast} />
        }

        if (part.type === 'tool-call') {
          return <ToolCallCard key={`${part.callId}-${index}`} part={part} />
        }

        // attachment part 只在用户消息出现，由 AgentPanel 气泡自行渲染，此处防御性跳过
        return null
      })}
    </div>
  )
})
