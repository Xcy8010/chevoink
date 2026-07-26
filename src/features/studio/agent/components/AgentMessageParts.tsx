import { useMemo, useState } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  LoaderCircle,
  ShieldX,
  Wrench,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import ImageLightbox from '../../components/ImageLightbox'
import type {
  AgentMessagePart,
  AgentToolDisplayPayload,
} from '../../../../../shared/contracts/index.js'

/**
 * 消息 Parts 渲染器（plan/13 §5.3）：
 * - text / reasoning / tool-call 三类 part 按 type 分发
 * - tool-call 的 display 负载再按 kind 渲染 diff / plan / 封面等结构化卡片
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

function ToolDisplayRenderer({ display }: { display: AgentToolDisplayPayload }) {
  switch (display.kind) {
    case 'chapterDiff':
      return <DiffCard display={display} />
    case 'plan':
      return <PlanCard display={display} />
    case 'coverImages':
      return <CoverImagesCard display={display} />
    case 'markdown':
      return (
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2">
          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-6 text-[var(--text-primary)]">
            {display.markdown}
          </pre>
        </div>
      )
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
    case 'question':
      return (
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2">
          <p className="break-words text-xs leading-6 text-[var(--text-primary)]">{display.question}</p>
          <p className="mt-1 break-words text-[11px] leading-5 text-[var(--text-secondary)]">
            {display.unanswered ? '未回答，Agent 已按默认方案继续' : `你的回答：${display.answer ?? ''}`}
          </p>
        </div>
      )
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

function ToolCallCard({
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
            {part.progressChars ? `已生成 ${part.progressChars} 字 · 执行中…` : '执行中…'}
          </span>
        ) : null}
        {durationLabel ? (
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-secondary)]">
            {durationLabel}
          </span>
        ) : null}
        <span className="shrink-0">{toolStatusIcon[part.status]}</span>
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
      {part.display ? (
        <div className="px-3 pb-3 pt-1">
          <ToolDisplayRenderer display={part.display} />
        </div>
      ) : null}
    </div>
  )
}

function ReasoningPart({
  part,
  streaming,
}: {
  part: Extract<AgentMessagePart, { type: 'reasoning' }>
  streaming: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const showBody = expanded || streaming

  return (
    <div className="rounded-[14px] border border-dashed border-[var(--border-subtle)] px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
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
        <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[var(--text-secondary)]">
          {part.text}
        </p>
      ) : null}
    </div>
  )
}

/** 兼容历史消息里残留的 Markdown 记号与模型误输出的工具轨迹标记，保持纯文本阅读体验 */
function sanitizePlainText(text: string): string {
  return text
    .replace(/^\s*\[调用\s*(?:工具|tool)[^\n]*$/gim, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '· ')
    .replace(/\n{3,}/g, '\n\n')
}

export function AgentMessageParts({
  parts,
  streaming,
}: {
  parts: AgentMessagePart[]
  streaming: boolean
}) {
  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1

        if (part.type === 'text') {
          const cleanText = sanitizePlainText(part.text)
          // 整段都是脏标记时清洗后为空，避免渲染空段落（流式尾部保留光标）
          if (!cleanText.trim() && !(streaming && isLast)) {
            return null
          }
          return (
            <p
              key={index}
              className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-primary)]"
            >
              {cleanText}
              {streaming && isLast ? (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--text-primary)] align-middle" />
              ) : null}
            </p>
          )
        }

        if (part.type === 'reasoning') {
          return <ReasoningPart key={index} part={part} streaming={streaming && isLast} />
        }

        return <ToolCallCard key={`${part.callId}-${index}`} part={part} />
      })}
    </div>
  )
}
