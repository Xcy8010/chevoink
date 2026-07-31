import { LoaderCircle, Send } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'

type ChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isSending: boolean
}

/** 聊天输入区（方案 9.2.3）：自动增高 1-5 行，Enter 发送 / Shift+Enter 换行 */
export default function ChatComposer({ value, onChange, onSend, isSending }: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`
  }, [value])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (value.trim() && !isSending) onSend()
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-3 pb-[calc(var(--safe-bottom)+12px)] md:pb-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="给对方发条消息，Enter 发送"
        className="max-h-[132px] min-h-[40px] flex-1 resize-none overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3.5 py-2.5 text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-brand)]"
      />
      <button
        type="button"
        aria-label="发送"
        onClick={onSend}
        disabled={!value.trim() || isSending}
        className="press-feedback inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-white transition-opacity disabled:opacity-40"
      >
        {isSending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  )
}
