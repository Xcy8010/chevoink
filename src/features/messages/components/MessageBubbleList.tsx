import { Check, LoaderCircle, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { cn } from '@/lib/utils'
import type { Message } from '../../../../shared/contracts/index.js'

export type PendingMessage = {
  tempId: string
  content: string
  createdAt: string
  status: 'sending' | 'failed'
}

type MessageBubbleListProps = {
  messages: Message[]
  pendingMessages: PendingMessage[]
  currentUserId: string
  onRetryPending?: (tempId: string) => void
}

/** 超过 5 分钟的消息间隔插入时间分隔线（方案 9.2.2） */
const TIME_GAP_MS = 5 * 60 * 1000

function formatChatTime(value: string) {
  const date = new Date(value)
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000)

  if (dayDiff <= 0) return time
  if (dayDiff === 1) return `昨天 ${time}`
  return `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)} ${time}`
}

type RenderItem =
  | { kind: 'divider'; id: string; time: string }
  | { kind: 'message'; id: string; message: Message }
  | { kind: 'pending'; id: string; pending: PendingMessage }

/** 消息气泡列表：指向性气泡 + 时间分隔 + 发送状态 + 消息类型区分 */
export default function MessageBubbleList({
  messages,
  pendingMessages,
  currentUserId,
  onRetryPending,
}: MessageBubbleListProps) {
  if (messages.length === 0 && pendingMessages.length === 0) {
    return (
      <AppState
        tone="empty"
        title="这段会话还没有消息"
        description="先发一条问候，让对话继续下去。"
        className="min-h-[240px] border-0 shadow-none"
      />
    )
  }

  const items: RenderItem[] = []
  let previousTime: number | null = null

  const pushWithDivider = (id: string, createdAt: string, item: RenderItem) => {
    const time = new Date(createdAt).getTime()
    if (previousTime === null || time - previousTime > TIME_GAP_MS) {
      items.push({ kind: 'divider', id: `divider-${id}`, time: formatChatTime(createdAt) })
    }
    previousTime = time
    items.push(item)
  }

  for (const message of messages) {
    pushWithDivider(message.id, message.createdAt, { kind: 'message', id: message.id, message })
  }
  for (const pending of pendingMessages) {
    pushWithDivider(pending.tempId, pending.createdAt, { kind: 'pending', id: pending.tempId, pending })
  }

  return (
    <div className="space-y-3 px-4 py-4">
      {items.map((item) => {
        if (item.kind === 'divider') {
          return (
            <div key={item.id} className="flex justify-center pt-1">
              <span className="rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-3 py-1 text-[11px] text-[var(--text-tertiary)]">
                {item.time}
              </span>
            </div>
          )
        }

        if (item.kind === 'pending') {
          const { pending } = item
          return (
            <div key={item.id} className="flex justify-end">
              <div className="max-w-[70%] rounded-[12px] rounded-br-[4px] bg-[var(--color-brand)] px-3.5 py-2.5 text-sm leading-6 text-white opacity-80">
                <p className="whitespace-pre-wrap">{pending.content}</p>
                <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/80">
                  {pending.status === 'sending' ? (
                    <>
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                      发送中
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRetryPending?.(pending.tempId)}
                      className="inline-flex items-center gap-1 underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      发送失败，点击重试
                    </button>
                  )}
                </span>
              </div>
            </div>
          )
        }

        const { message } = item

        // 系统通知：居中灰色条，非气泡
        if (message.type === 'system') {
          return (
            <div key={item.id} className="flex justify-center">
              <span className="max-w-[85%] rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-3.5 py-1.5 text-center text-xs text-[var(--text-tertiary)]">
                {message.content}
              </span>
            </div>
          )
        }

        const isSelf = message.senderId === currentUserId
        const relatedHref =
          message.type === 'novelCard' && message.relatedId
            ? `/novel/${message.relatedId}`
            : message.type === 'postCard' && message.relatedId
              ? `/post/${message.relatedId}`
              : null

        return (
          <div key={item.id} className={isSelf ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={cn(
                'max-w-[70%] rounded-[12px] px-3.5 py-2.5 text-sm leading-6',
                isSelf
                  ? 'rounded-br-[4px] bg-[var(--color-brand)] text-white'
                  : 'rounded-bl-[4px] bg-[var(--surface-muted)] text-[var(--text-primary)]',
              )}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>

              {relatedHref ? (
                <Link
                  to={relatedHref}
                  className={cn(
                    'mt-2 inline-flex items-center rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-medium transition-colors',
                    isSelf
                      ? 'border-white/25 text-white hover:bg-white/10'
                      : 'border-[var(--border-subtle)] text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]',
                  )}
                >
                  {message.type === 'novelCard' ? '查看作品' : '查看帖子'}
                </Link>
              ) : null}

              {isSelf ? (
                <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/70">
                  <Check className="h-3 w-3" />
                  已发送
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
