import { BellRing } from 'lucide-react'

import Avatar from '@/features/community/components/Avatar'
import { conversationFilters } from '@/features/community/constants'
import { formatRelativeTime } from '@/features/community/utils'
import { cn } from '@/lib/utils'
import AppState from '@/components/ui/AppState'
import type { Conversation } from '../../../../shared/contracts/index.js'

type ConversationListProps = {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (conversationId: string) => void
  activeFilter: string
  onFilterChange: (filterId: string) => void
  totalUnread: number
}

function formatUnreadBadge(count: number) {
  return count > 99 ? '99+' : `${count}`
}

/**
 * 会话列表（方案 9.2.1）：
 * - 选中态：左侧 3px 品牌色指示条 + 浅色背景
 * - 头像 40px + 在线状态绿点，未读数红点（>99 显示 99+）
 */
export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  activeFilter,
  onFilterChange,
  totalUnread,
}: ConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-[var(--border-subtle)] px-3 pb-3 pt-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">最近会话</p>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <BellRing className="h-3.5 w-3.5" />
            {totalUnread} 条未读
          </span>
        </div>
        <div className="rail-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {conversationFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onFilterChange(filter.id)}
              className={cn(
                'press-feedback shrink-0 rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-xs transition-colors',
                activeFilter === filter.id
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <AppState
            tone="empty"
            title="这里还没有符合条件的会话"
            description="切换一下筛选，或者稍后再回来看看。"
            className="min-h-[220px] border-0 shadow-none"
          />
        ) : (
          conversations.map((conversation) => {
            const isActive = conversation.id === selectedId
            const isOnline = conversation.presence === 'online' || conversation.presence === 'typing'

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  'press-feedback relative flex w-full items-center gap-3 rounded-[var(--radius-md)] py-2.5 pl-4 pr-3 text-left transition-colors',
                  isActive
                    ? 'bg-[var(--color-brand-soft)]'
                    : 'hover:bg-[var(--surface-muted)]',
                )}
              >
                {isActive ? (
                  <span className="absolute bottom-2 left-1 top-2 w-[3px] rounded-full bg-[var(--color-brand)]" />
                ) : null}

                <span className="relative shrink-0">
                  <Avatar name={conversation.title ?? '系统'} src={conversation.avatarUrl} size="md" />
                  {isOnline ? (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-default)] bg-emerald-500" />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        'line-clamp-1 text-sm font-medium',
                        isActive ? 'text-[var(--color-brand)]' : 'text-[var(--text-primary)]',
                      )}
                    >
                      {conversation.title ?? '系统通知'}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
                      {conversation.lastMessageAt ? formatRelativeTime(conversation.lastMessageAt) : ''}
                    </span>
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className="line-clamp-1 text-xs text-[var(--text-secondary)]">
                      {conversation.lastMessagePreview ?? (conversation.type === 'system' ? '系统提醒' : '开始聊天吧')}
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-medium text-white">
                        {formatUnreadBadge(conversation.unreadCount)}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
