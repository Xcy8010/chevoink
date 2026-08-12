import { useState } from 'react'
import { BookOpen, LoaderCircle, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'

import AppImage from '@/components/ui/AppImage'
import Avatar from '@/features/community/components/Avatar'
import PostImageViewer from '@/features/community/components/PostImageViewer'
import { cn } from '@/lib/utils'
import type { Message, MessageCard } from '../../../../shared/contracts/index.js'

export type PendingMessage = {
  tempId: string
  content: string
  createdAt: string
  status: 'sending' | 'failed'
  type?: 'text' | 'image'
}

type MessageBubbleListProps = {
  messages: Message[]
  pendingMessages: PendingMessage[]
  currentUserId: string
  /** 对方最近一次读到会话的时间：用于判断自己最后一条消息是否已读 */
  counterpartLastReadAt?: string | null
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

/** 卡片底部类型标签 */
const CARD_KIND_LABEL: Record<MessageCard['kind'], string> = {
  novel: '作品',
  author: '作者',
  post: '帖子',
  comment: '评论',
}

/**
 * 私信分享专属卡片（微信式）：固定宽度、文本截断保证卡片尺寸一致，
 * 作品卡展示封面/书名/简介，点击整卡跳转到对应详情页。
 */
function MessageCardView({ card }: { card: MessageCard }) {
  const href =
    card.kind === 'novel'
      ? `/novel/${card.id}`
      : card.kind === 'author'
        ? `/author/${card.id}`
        : card.kind === 'post'
          ? `/post/${card.id}`
          : card.postId
            ? `/post/${card.postId}`
            : card.novelId
              ? `/novel/${card.novelId}`
              : null

  const body =
    card.kind === 'novel' ? (
      <div className="flex gap-3">
        {card.coverUrl ? (
          <AppImage
            src={card.coverUrl}
            alt={card.title}
            className="h-[76px] w-[57px] shrink-0 rounded-[8px]"
          />
        ) : (
          <span className="flex h-[76px] w-[57px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-muted)]">
            <BookOpen className="h-5 w-5 text-[var(--text-tertiary)]" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="line-clamp-1 text-sm font-semibold text-[var(--text-primary)]">{card.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
            {card.summary || '这本书还没有简介'}
          </p>
          <p className="mt-auto line-clamp-1 pt-1 text-[11px] text-[var(--text-tertiary)]">{card.authorName}</p>
        </div>
      </div>
    ) : card.kind === 'author' ? (
      <div className="flex items-center gap-3">
        <Avatar name={card.nickname} src={card.avatarUrl} size="md" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold text-[var(--text-primary)]">{card.nickname}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
            {card.bio || '这位作者很神秘，什么都没写'}
          </p>
          <p className="mt-1 line-clamp-1 text-[11px] text-[var(--text-tertiary)]">
            {card.followerCount} 粉丝 · {card.novelCount} 部作品
          </p>
        </div>
      </div>
    ) : card.kind === 'post' ? (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={card.authorName} src={card.authorAvatarUrl} size="sm" className="h-6 w-6 shrink-0" />
          <p className="line-clamp-1 text-xs font-medium text-[var(--text-secondary)]">{card.authorName}</p>
        </div>
        <div className="flex gap-2.5">
          <p className="line-clamp-3 min-w-0 flex-1 text-[13px] leading-5 text-[var(--text-primary)]">
            {card.excerpt}
          </p>
          {card.imageUrl ? (
            <AppImage
              src={card.imageUrl}
              alt="帖子配图"
              className="h-[56px] w-[56px] shrink-0 rounded-[8px]"
            />
          ) : null}
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={card.authorName} src={card.authorAvatarUrl} size="sm" className="h-6 w-6 shrink-0" />
          <p className="line-clamp-1 text-xs font-medium text-[var(--text-secondary)]">{card.authorName} 的评论</p>
        </div>
        <p className="line-clamp-3 text-[13px] leading-5 text-[var(--text-primary)]">{card.content}</p>
      </div>
    )

  const cardClassName =
    'block w-[264px] max-w-full rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:border-[var(--border-strong)]'

  const footer = (
    <div className="mt-2.5 border-t border-[var(--border-subtle)] pt-1.5 text-[11px] text-[var(--text-tertiary)]">
      {CARD_KIND_LABEL[card.kind]}
    </div>
  )

  if (!href) {
    return (
      <span className={cardClassName}>
        {body}
        {footer}
      </span>
    )
  }

  return (
    <Link to={href} className={cardClassName}>
      {body}
      {footer}
    </Link>
  )
}

/** 消息气泡列表：X 风格指向性气泡 + 时间分隔 + 气泡外发送/已读状态 + 图片消息 */
export default function MessageBubbleList({
  messages,
  pendingMessages,
  currentUserId,
  counterpartLastReadAt,
  onRetryPending,
}: MessageBubbleListProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // 空会话不展示任何占位图标/文案，保持干净的聊天背景
  if (messages.length === 0 && pendingMessages.length === 0) {
    return null
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

  // 只在自己发出的最后一条消息下方展示 已读/已发送（气泡外）；有发送中的消息时先隐藏，避免状态跳动
  const lastSelfMessage = [...messages].reverse().find(
    (message) => message.senderId === currentUserId && message.type !== 'system',
  )
  const statusMessageId = pendingMessages.length === 0 ? (lastSelfMessage?.id ?? null) : null
  const isRead = (message: Message) =>
    Boolean(
      counterpartLastReadAt &&
        new Date(counterpartLastReadAt).getTime() >= new Date(message.createdAt).getTime(),
    )

  return (
    <div className="space-y-2 px-4 py-4">
      {items.map((item) => {
        if (item.kind === 'divider') {
          return (
            <div key={item.id} className="flex justify-center py-2">
              <span className="text-[11px] text-[var(--text-tertiary)]">{item.time}</span>
            </div>
          )
        }

        if (item.kind === 'pending') {
          const { pending } = item
          return (
            <div key={item.id} className="flex flex-col items-end">
              {pending.type === 'image' ? (
                <img
                  src={pending.content}
                  alt="发送中的图片"
                  className="max-h-[280px] max-w-[70%] rounded-[18px] rounded-br-[6px] object-cover opacity-70"
                />
              ) : (
                <div className="max-w-[75%] rounded-[18px] rounded-br-[6px] bg-[var(--color-brand)] px-4 py-2.5 text-[15px] leading-6 text-white opacity-70">
                  <p className="whitespace-pre-wrap break-words">{pending.content}</p>
                </div>
              )}
              <span className="mt-1 flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                {pending.status === 'sending' ? (
                  <>
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    发送中
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRetryPending?.(pending.tempId)}
                    className="inline-flex items-center gap-1 text-rose-500"
                  >
                    <RotateCcw className="h-3 w-3" />
                    发送失败，点击重试
                  </button>
                )}
              </span>
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
        const showStatus = isSelf && message.id === statusMessageId

        // 分享卡片消息：有富数据时渲染专属卡片（无气泡底色），源内容已删除时降级为文本气泡
        if (message.card) {
          return (
            <div key={item.id} className={cn('flex flex-col', isSelf ? 'items-end' : 'items-start')}>
              <MessageCardView card={message.card} />
              {showStatus ? (
                <span className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  {isRead(message) ? '已读' : '已发送'}
                </span>
              ) : null}
            </div>
          )
        }

        // 图片消息：无气泡底色，圆角图片直出，点击全屏预览
        if (message.type === 'image') {
          return (
            <div key={item.id} className={cn('flex flex-col', isSelf ? 'items-end' : 'items-start')}>
              <button
                type="button"
                onClick={() => setPreviewUrl(message.content)}
                className="max-w-[70%] overflow-hidden"
                aria-label="查看图片"
              >
                <AppImage
                  src={message.content}
                  alt="图片消息"
                  natural
                  className={cn(
                    'rounded-[18px]',
                    isSelf ? 'rounded-br-[6px]' : 'rounded-bl-[6px]',
                  )}
                  imgClassName="max-h-[280px] w-auto"
                  placeholderClassName="aspect-[3/4] w-[180px] max-w-full"
                />
              </button>
              {showStatus ? (
                <span className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  {isRead(message) ? '已读' : '已发送'}
                </span>
              ) : null}
            </div>
          )
        }

        const relatedHref =
          message.type === 'novelCard' && message.relatedId
            ? `/novel/${message.relatedId}`
            : message.type === 'postCard' && message.relatedId
              ? `/post/${message.relatedId}`
              : message.type === 'authorCard' && message.relatedId
                ? `/author/${message.relatedId}`
                : null

        return (
          <div key={item.id} className={cn('flex flex-col', isSelf ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[75%] rounded-[18px] px-4 py-2.5 text-[15px] leading-6',
                isSelf
                  ? 'rounded-br-[6px] bg-[var(--color-brand)] text-white'
                  : 'rounded-bl-[6px] bg-[var(--surface-muted)] text-[var(--text-primary)]',
              )}
            >
              <p className="whitespace-pre-wrap break-words">{message.content}</p>

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
                  {message.type === 'novelCard' ? '查看作品' : message.type === 'authorCard' ? '查看主页' : '查看帖子'}
                </Link>
              ) : null}
            </div>
            {showStatus ? (
              <span className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                {isRead(message) ? '已读' : '已发送'}
              </span>
            ) : null}
          </div>
        )
      })}

      {previewUrl ? (
        <PostImageViewer images={[previewUrl]} onClose={() => setPreviewUrl(null)} />
      ) : null}
    </div>
  )
}
