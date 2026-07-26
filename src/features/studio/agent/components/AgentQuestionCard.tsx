import { useState } from 'react'
import { LoaderCircle, MessageCircleQuestion, Send } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { PendingQuestion } from '../agentStore'

/**
 * 提问卡（ask_user 工具）：Agent 提出问题并给出候选选项，
 * 作者点选即答，也可以在自定义输入框里写自己的需求后提交。
 */

type AgentQuestionCardProps = {
  question: PendingQuestion
  onAnswer: (answer: string) => Promise<void> | void
}

export function AgentQuestionCard({ question, onAnswer }: AgentQuestionCardProps) {
  const [customAnswer, setCustomAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  const submit = async (answer: string, label: string | null) => {
    const trimmed = answer.trim()
    if (submitting || !trimmed) {
      return
    }
    setSelectedLabel(label)
    setSubmitting(true)
    try {
      await onAnswer(trimmed)
    } finally {
      setSubmitting(false)
      setSelectedLabel(null)
    }
  }

  return (
    <div className="rounded-[18px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
        <p className="text-xs font-medium tracking-[0.08em] text-[var(--text-secondary)]">Agent 想先确认你的想法</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{question.question}</p>

      {/* 候选选项：点选即提交；首项约定为 Agent 最推荐的方案，加「推荐」标识 */}
      {question.options.length > 0 ? (
        <div className="mt-3 flex flex-col gap-1.5">
          {question.options.map((option, index) => (
            <button
              key={option.label}
              type="button"
              disabled={submitting}
              onClick={() =>
                void submit(option.detail ? `${option.label}（${option.detail}）` : option.label, option.label)
              }
              className={cn(
                'flex items-start gap-2 rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-left transition-colors',
                'hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {submitting && selectedLabel === option.label ? (
                <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
              ) : null}
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-5 text-[var(--text-primary)]">
                  {index === 0 ? (
                    <span className="mr-1.5 inline-flex shrink-0 -translate-y-px items-center rounded-full bg-[var(--surface-contrast)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[var(--text-contrast)]">
                      推荐
                    </span>
                  ) : null}
                  {option.label}
                </span>
                {option.detail ? (
                  <span className="mt-0.5 block break-words text-xs leading-5 text-[var(--text-secondary)]">
                    {option.detail}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* 自定义回答 */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <input
          value={customAnswer}
          onChange={(event) => setCustomAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit(customAnswer, null)
            }
          }}
          disabled={submitting}
          maxLength={500}
          placeholder="或者直接告诉 Agent 你的想法…"
          className="min-w-0 flex-1 rounded-[12px] border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          disabled={submitting || !customAnswer.trim()}
          onClick={() => void submit(customAnswer, null)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-contrast)] text-[var(--text-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="发送回答"
          title="发送回答"
        >
          {submitting && selectedLabel === null ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}
