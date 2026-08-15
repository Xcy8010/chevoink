import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LoaderCircle, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import { useToast } from '@/components/ui/toast-context'
import { createDirectConversation, listUserFollowers, sendMessage } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import { cn } from '@/lib/utils'
import type { Conversation, Message } from '../../../../shared/contracts/index.js'

/** 发给好友的消息载荷：作品/帖子/作者/评论都走专属卡片消息 */
export type FriendShareMessage = {
  type: 'text' | 'novelCard' | 'postCard' | 'authorCard' | 'commentCard'
  content: string
  relatedId?: string
}

type ShareToFriendSheetProps = {
  message: FriendShareMessage
  onClose: () => void
}

/**
 * 分享给好友弹层（X 式）：列出互相关注的好友，点头像勾选（可多选），
 * 底部「分享」按钮一次发送给所有选中好友；手机端底部弹出、桌面居中。
 */
export default function ShareToFriendSheet({ message, onClose }: ShareToFriendSheetProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSending, setIsSending] = useState(false)

  const followersQuery = useQuery({
    queryKey: ['community', 'followers', 'me'],
    queryFn: () => listUserFollowers('me'),
  })
  const mutualFriends = (followersQuery.data?.items ?? []).filter(
    (item) => item.followedByViewer && item.followsViewer,
  )

  const toggleSelect = (friendId: string) => {
    if (isSending) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(friendId)) {
        next.delete(friendId)
      } else {
        next.add(friendId)
      }
      return next
    })
  }

  const handleShare = async () => {
    if (isSending || selectedIds.size === 0) return

    setIsSending(true)
    let successCount = 0
    let failedCount = 0

    // 逐个发送：创建/复用直聊会话后发出卡片消息，单个失败不影响其他好友
    for (const friendId of selectedIds) {
      try {
        const conversation = await createDirectConversation(friendId)
        const conversationId = String(conversation.id)
        const sent = await sendMessage(conversationId, {
          type: message.type,
          content: message.content,
          ...(message.relatedId ? { relatedId: message.relatedId } : {}),
        })
        successCount += 1
        // 与私聊页发消息成功后的处理保持一致：把新消息立即写进该会话的消息缓存，
        // 并同步会话列表的最后消息预览；否则跳回私聊界面时要等 15s 轮询才能看到刚分享的卡片
        queryClient.setQueryData<{ conversation: Conversation | null; items: Message[] } | undefined>(
          ['community', 'messages', conversationId],
          (current) => {
            if (!current) return current
            return { ...current, items: [...current.items, sent] }
          },
        )
        queryClient.setQueryData<{ items: Conversation[] } | undefined>(
          ['community', 'conversations'],
          (current) => {
            if (!current) return current
            return {
              ...current,
              items: current.items.map((item) =>
                item.id === conversationId
                  ? { ...item, lastMessagePreview: sent.content, lastMessageAt: sent.createdAt }
                  : item,
              ),
            }
          },
        )
        // 兜底失效：新建的会话不在列表缓存里、或消息缓存尚未建立时，重新进入会话页会即时重拉
        void queryClient.invalidateQueries({ queryKey: ['community', 'messages', conversationId] })
      } catch {
        failedCount += 1
      }
    }

    if (successCount > 0) {
      void queryClient.invalidateQueries({ queryKey: ['community', 'conversations'] })
    }

    setIsSending(false)
    if (successCount > 0 && failedCount === 0) {
      toast.success(successCount === 1 ? '已发送给好友' : `已分享给 ${successCount} 位好友`)
      onClose()
    } else if (successCount > 0) {
      toast.info(`已分享给 ${successCount} 位好友，${failedCount} 位发送失败`)
      onClose()
    } else {
      toast.error('发送失败，请稍后再试。')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-label="分享给好友">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full rounded-t-[20px] bg-[var(--surface-default)] pb-[max(16px,var(--safe-bottom))] sm:w-[420px] sm:rounded-[20px] sm:pb-4">
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">发给好友</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="press-feedback inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {followersQuery.isLoading ? (
          <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--text-tertiary)]">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            正在加载好友...
          </div>
        ) : mutualFriends.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--text-tertiary)]">
            还没有互相关注的好友，去社区认识一些朋友吧。
          </p>
        ) : (
          <>
            <div className="mt-3 grid max-h-[42vh] grid-cols-4 gap-y-5 overflow-y-auto px-4 py-2 sm:grid-cols-5">
              {mutualFriends.map((friend) => {
                const friendId = String(friend.id)
                const isSelected = selectedIds.has(friendId)
                return (
                  <button
                    key={friendId}
                    type="button"
                    disabled={isSending}
                    onClick={() => toggleSelect(friendId)}
                    className="press-feedback flex flex-col items-center gap-1.5"
                    aria-label={`${isSelected ? '取消选择' : '选择'} ${friend.nickname}`}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={cn(
                        'relative rounded-full transition-shadow',
                        isSelected && 'ring-2 ring-[var(--color-brand)] ring-offset-2 ring-offset-[var(--surface-default)]',
                      )}
                    >
                      <Avatar name={friend.nickname} src={friend.avatarUrl} size="md" />
                      {isSelected ? (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)] text-white ring-2 ring-[var(--surface-default)]">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'w-full truncate text-center text-xs',
                        isSelected ? 'font-medium text-[var(--color-brand)]' : 'text-[var(--text-secondary)]',
                      )}
                    >
                      {friend.nickname}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 底部分享按钮：选中至少一位好友后可点击，一次发送给所有选中好友 */}
            <div className="border-t border-[var(--border-subtle)] px-5 pb-1 pt-3">
              <button
                type="button"
                disabled={selectedIds.size === 0 || isSending}
                onClick={() => void handleShare()}
                className="press-feedback flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-brand)] text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isSending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    发送中...
                  </>
                ) : selectedIds.size > 0 ? (
                  `分享（${selectedIds.size}）`
                ) : (
                  '分享'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
