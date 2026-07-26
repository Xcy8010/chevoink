import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, Crosshair, LoaderCircle, Square } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AgentExecutionMode } from '../../../../../shared/contracts/index.js'
import { useAgentStore } from '../agentStore'

/**
 * Agent 输入区（plan/13 §5.3）：
 * - plan / build / review 三模式切换（运行中锁定）
 * - Enter 发送、Shift+Enter 换行；运行中主按钮切换为停止
 */

const MODE_OPTIONS: Array<{ mode: AgentExecutionMode; label: string; hint: string }> = [
  { mode: 'plan', label: '规划', hint: '只读分析，产出方案' },
  { mode: 'build', label: '执行', hint: '可写入章节与作品' },
  { mode: 'review', label: '审阅', hint: '只读诊断与点评' },
]

type AgentComposerProps = {
  mode: AgentExecutionMode
  running: boolean
  disabled?: boolean
  onModeChange: (mode: AgentExecutionMode) => void
  /** 可返回 Promise：启动失败时抛错，输入框保留草稿 */
  onSend: (prompt: string) => Promise<void> | void
  onStop: () => void
}

export function AgentComposer({
  mode,
  running,
  disabled = false,
  onModeChange,
  onSend,
  onStop,
}: AgentComposerProps) {
  // 草稿存在全局 store：面板在沉浸/普通视图间重挂载时不丢失未发送内容
  const prompt = useAgentStore((state) => state.composerDraft)
  const setPrompt = useAgentStore((state) => state.setComposerDraft)
  const autoFollow = useAgentStore((state) => state.autoFollow)
  const setAutoFollow = useAgentStore((state) => state.setAutoFollow)
  // 启动中（建会话 + 启动 run 的网络往返）：成功后才清空草稿，避免内容“瞬间消失”观感
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const canSend = !running && !disabled && !sending && prompt.trim().length > 0

  const handleSend = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || running || disabled || sending) {
      return
    }
    setSending(true)
    try {
      await onSend(trimmed)
      setPrompt('')
    } catch {
      // 面板已展示错误提示；保留草稿供用户重试
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2.5 shadow-sm">
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        disabled={disabled}
        placeholder={
          mode === 'plan'
            ? '描述你的构思，我来帮你规划…'
            : mode === 'review'
              ? '想让我审阅什么内容？'
              : '告诉我要做什么，我会自主完成…'
        }
        className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none disabled:opacity-50"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-full bg-[var(--surface-muted)] p-0.5">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                title={option.hint}
                disabled={running}
                onClick={() => onModeChange(option.mode)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed',
                  mode === option.mode
                    ? 'bg-[var(--surface-default)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* 自动追踪：Agent 写入章节时编辑器自动跳转到对应正文 */}
          <button
            type="button"
            onClick={() => setAutoFollow(!autoFollow)}
            title={autoFollow ? '自动追踪已开启：Agent 写到哪章，编辑器跟到哪章' : '自动追踪已关闭：留在当前章节不跳转'}
            aria-pressed={autoFollow}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              autoFollow
                ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
                : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <Crosshair className="h-3 w-3" />
            追踪
          </button>
        </div>
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-contrast)] text-[var(--text-contrast)] transition-opacity hover:opacity-85"
            aria-label="停止运行"
            title="停止运行"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-contrast)] text-[var(--text-contrast)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="发送"
            title="发送"
          >
            {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}
