import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, LoaderCircle, RefreshCcw, SendHorizonal } from 'lucide-react'

import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

import {
  assistModeLabelMap,
  type AgentMessage,
  type AgentProgressState,
  type AssistMode,
  type AssistantResultState,
  type ChapterDraftState,
  type ProjectNotesState,
  type SavedSuggestion,
} from '../types'

type AssistPanelProps = {
  projectNotes?: ProjectNotesState
  assistMode: AssistMode
  assistPrompt: string
  assistantResult: AssistantResultState | null
  assistantMessage: string
  agentMessages: AgentMessage[]
  agentProgress: AgentProgressState
  suggestionDrafts?: SavedSuggestion[]
  chapterDraft: ChapterDraftState | null
  isPending: boolean
  formatDateTime: (value?: string | null) => string
  onChangeProjectNotes: (next: ProjectNotesState) => void
  onChangeMode: (mode: AssistMode) => void
  onChangePrompt: (next: string) => void
  onRun: () => void
  onAppend: () => void
  onReplace: () => void
  onSaveDraft?: () => void
  onUndo: () => void
  canUndo: boolean
  onClose?: () => void
  showCloseAction?: boolean
  currentChapterTitle?: string
  focusSignal?: number
}

export default function AssistPanel({
  projectNotes: _projectNotes,
  assistMode,
  assistPrompt,
  assistantResult,
  assistantMessage,
  agentMessages,
  agentProgress,
  suggestionDrafts: _suggestionDrafts,
  chapterDraft,
  isPending,
  formatDateTime,
  onChangeProjectNotes: _onChangeProjectNotes,
  onChangeMode: _onChangeMode,
  onChangePrompt,
  onRun,
  onAppend,
  onReplace,
  onSaveDraft: _onSaveDraft,
  onUndo,
  canUndo,
  onClose,
  showCloseAction = true,
  currentChapterTitle,
  focusSignal,
}: AssistPanelProps) {
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  useEffect(() => {
    if (!focusSignal) {
      return
    }

    promptRef.current?.focus()
  }, [focusSignal])

  async function handleCopyMessage(messageId: string, content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 1500)
    } catch {
      setCopiedMessageId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col pb-2">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">Agent</h3>
          {currentChapterTitle ? (
            <p className="truncate text-xs text-[var(--text-secondary)]">{currentChapterTitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {showCloseAction && onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              收起
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 pb-3 text-xs text-[var(--text-tertiary)]">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#38c793]" />
          <span>已连接当前作品</span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 pb-2">
          {agentMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'rounded-[16px] px-3 py-3',
                message.role === 'user'
                  ? 'ml-8 border border-[var(--border-subtle)] bg-[var(--surface-default)]'
                  : message.role === 'status'
                    ? 'mr-6 border border-dashed border-[var(--border-subtle)] bg-transparent'
                    : message.tone === 'error'
                      ? 'mr-6 border border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.04)]'
                      : 'mr-6 border border-[var(--border-subtle)] bg-[var(--surface-muted)]',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  {message.role === 'user' ? '你' : message.role === 'status' ? '进度' : 'Agent'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyMessage(message.id, message.content)}
                    className="inline-flex h-6 items-center gap-1 rounded-[999px] px-2 text-[11px] text-[var(--text-tertiary)] transition hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)]"
                    aria-label="复制消息"
                  >
                    {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedMessageId === message.id ? '已复制' : '复制'}
                  </button>
                  <span className="text-[11px] text-[var(--text-tertiary)]">{formatDateTime(message.createdAt)}</span>
                </div>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-primary)]">
                {message.content}
              </p>
            </div>
          ))}

          {agentProgress.active ? (
            <div className="mr-6 rounded-[16px] border border-dashed border-[var(--border-subtle)] px-3 py-3">
              <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>{agentProgress.title}</span>
              </div>
              <div className="mt-3 space-y-2">
                {agentProgress.steps.map((step, index) => {
                  const isDone = index < agentProgress.currentStep
                  const isCurrent = index === agentProgress.currentStep
                  return (
                    <div key={step} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'inline-flex h-2 w-2 rounded-full',
                          isDone
                            ? 'bg-[var(--text-primary)]'
                            : isCurrent
                              ? 'animate-pulse bg-[var(--text-secondary)]'
                              : 'bg-[var(--border-subtle)]',
                        )}
                      />
                      <span className={isDone || isCurrent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
                        {step}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {assistantResult?.content ? (
            <div className="mr-6 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">最新结果</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyMessage('assistant-result', assistantResult.content)}
                    className="inline-flex h-6 items-center gap-1 rounded-[999px] px-2 text-[11px] text-[var(--text-tertiary)] transition hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)]"
                    aria-label="复制最新结果"
                  >
                    {copiedMessageId === 'assistant-result' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedMessageId === 'assistant-result' ? '已复制' : '复制'}
                  </button>
                  <span className="text-[11px] text-[var(--text-tertiary)]">{assistModeLabelMap[assistantResult.mode]}</span>
                </div>
              </div>
              <pre className="max-h-[18rem] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-primary)]">
                {assistantResult.content}
              </pre>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button onClick={onAppend} disabled={!chapterDraft} size="sm">
                  <ChevronRight className="h-4 w-4" />
                  追加
                </Button>
                <Button onClick={onReplace} variant="secondary" disabled={!chapterDraft} size="sm">
                  替换
                </Button>
                {canUndo ? (
                  <Button onClick={onUndo} variant="ghost" size="sm">
                    <RefreshCcw className="h-4 w-4" />
                    撤销
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mr-6 rounded-[16px] border border-dashed border-[var(--border-subtle)] px-3 py-3 text-sm leading-7 text-[var(--text-secondary)]">
              {assistantMessage}
            </div>
          )}
        </div>

        <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
          <textarea
            ref={promptRef}
            value={assistPrompt}
            onChange={(event) => onChangePrompt(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-[18px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
            placeholder="直接输入你的写作任务，例如：帮我续写这一章，重点写门外脚步逼近时主角的压迫感。"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="truncate text-xs text-[var(--text-secondary)]">直接告诉 Agent 你要它做什么</span>
            <Button onClick={onRun} disabled={isPending} size="sm">
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
