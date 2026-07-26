import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useDevice } from '@/components/layout/DeviceProvider'
import AppState from '@/components/ui/AppState'
import { ConversationSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { getMe, listConversations, listMessages, markConversationRead, sendMessage } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import ChatComposer from '@/features/messages/components/ChatComposer'
import ConversationList from '@/features/messages/components/ConversationList'
import MessageBubbleList, { type PendingMessage } from '@/features/messages/components/MessageBubbleList'
import type { Conversation, Message } from '../../shared/contracts/index.js'

/**
 * 消息中心（方案 2.5.5 / 9.2）：
 * - 手机：会话列表 ↔ 聊天全屏切换
 * - 平板/电脑：左会话列表(280/320px) + 右聊天区分栏
 * - 气泡指向性圆角、时间分隔线、发送状态、自动增高输入区
 */
export default function MessagesPage() {
  const { isMobile } = useDevice()
  const isSplitLayout = !isMobile
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedConversationId, setSelectedConversationId] = useState(searchParams.get('conversationId') ?? '')
  const [draftByConversationId, setDraftByConversationId] = useState<Record<string, string>>({})
  const [pendingByConversation, setPendingByConversation] = useState<Record<string, PendingMessage[]>>({})
  const messageScrollRef = useRef<HTMLDivElement | null>(null)

  const meQuery = useQuery({
    queryKey: ['community', 'me'],
    queryFn: getMe,
  })

  const conversationsQuery = useQuery({
    queryKey: ['community', 'conversations'],
    queryFn: () => listConversations(30),
    // 方案 6.1：15s 轻轮询，保持会话列表/未读数新鲜
    refetchInterval: 15_000,
  })

  const allConversations = conversationsQuery.data?.items ?? []
  const filteredConversations = useMemo(() => {
    if (activeFilter === 'unread') {
      return allConversations.filter((item) => item.unreadCount > 0)
    }
    if (activeFilter === 'direct') {
      return allConversations.filter((item) => item.type === 'direct')
    }
    return allConversations
  }, [activeFilter, allConversations])

  useEffect(() => {
    const routeConversationId = searchParams.get('conversationId')

    if (routeConversationId && filteredConversations.some((item) => item.id === routeConversationId)) {
      setSelectedConversationId(routeConversationId)
      return
    }

    if (isSplitLayout) {
      if (!filteredConversations.some((item) => item.id === selectedConversationId)) {
        setSelectedConversationId(filteredConversations[0]?.id ?? '')
      }
      return
    }

    if (!routeConversationId) {
      setSelectedConversationId('')
    }
  }, [filteredConversations, isSplitLayout, searchParams, selectedConversationId])

  const messagesQuery = useQuery({
    queryKey: ['community', 'messages', selectedConversationId],
    queryFn: () => listMessages(selectedConversationId, 50),
    enabled: Boolean(selectedConversationId),
    refetchInterval: 15_000,
  })

  // 进入会话即标记已读：本地未读数归零 + 刷新全局未读统计
  useEffect(() => {
    if (!selectedConversationId) return

    void markConversationRead(selectedConversationId)
      .then(() => {
        queryClient.setQueryData<{ items: Conversation[] } | undefined>(
          ['community', 'conversations'],
          (current) => {
            if (!current) return current
            return {
              ...current,
              items: current.items.map((conversation) =>
                conversation.id === selectedConversationId
                  ? { ...conversation, unreadCount: 0 }
                  : conversation,
              ),
            }
          },
        )
        void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
      })
      .catch(() => {
        // 已读标记失败不阻断聊天，下次轮询会重新对齐
      })
  }, [queryClient, selectedConversationId])

  const removePending = (conversationId: string, tempId: string) => {
    setPendingByConversation((current) => ({
      ...current,
      [conversationId]: (current[conversationId] ?? []).filter((item) => item.tempId !== tempId),
    }))
  }

  const sendMessageMutation = useMutation({
    mutationFn: ({
      conversationId,
      content,
    }: {
      conversationId: string
      content: string
      tempId: string
    }) => sendMessage(conversationId, { type: 'text', content }),
    onSuccess: async (message, variables) => {
      removePending(variables.conversationId, variables.tempId)
      queryClient.setQueryData<{ conversation: Conversation | null; items: Message[] } | undefined>(
        ['community', 'messages', variables.conversationId],
        (current) => {
          if (!current) return current
          return { ...current, items: [...current.items, message] }
        },
      )
      queryClient.setQueryData<{ items: Conversation[] } | undefined>(
        ['community', 'conversations'],
        (current) => {
          if (!current) return current
          return {
            ...current,
            items: current.items.map((conversation) =>
              conversation.id === variables.conversationId
                ? {
                    ...conversation,
                    lastMessagePreview: message.content,
                    lastMessageAt: message.createdAt,
                    unreadCount: 0,
                  }
                : conversation,
            ),
          }
        },
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'messages', variables.conversationId] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'me'] }),
      ])
    },
    onError: (error, variables) => {
      setPendingByConversation((current) => ({
        ...current,
        [variables.conversationId]: (current[variables.conversationId] ?? []).map((item) =>
          item.tempId === variables.tempId ? { ...item, status: 'failed' } : item,
        ),
      }))
      toast.error(error instanceof Error ? error.message : '这条消息暂时没有发出，请稍后再试。')
    },
  })

  const selectedConversation =
    filteredConversations.find((item) => item.id === selectedConversationId) ??
    allConversations.find((item) => item.id === selectedConversationId) ??
    messagesQuery.data?.conversation ??
    null
  const activeMessages = messagesQuery.data?.items ?? []
  const activePending = selectedConversationId ? (pendingByConversation[selectedConversationId] ?? []) : []
  const activeDraft = selectedConversation ? (draftByConversationId[selectedConversation.id] ?? '') : ''
  const currentUserId = meQuery.data?.user?.id ?? ''
  const totalUnread = allConversations.reduce((sum, item) => sum + item.unreadCount, 0)
  const shouldShowListPane = isSplitLayout || !selectedConversation
  const shouldShowConversationPane = isSplitLayout || Boolean(selectedConversation)

  // 新消息到达后滚动到底部
  useEffect(() => {
    const element = messageScrollRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [selectedConversationId, activeMessages.length, activePending.length])

  const dispatchMessage = (conversationId: string, content: string, tempId?: string) => {
    const finalTempId = tempId ?? `pending-${Date.now()}-${Math.round(Math.random() * 1000)}`
    if (!tempId) {
      setPendingByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] ?? []),
          { tempId: finalTempId, content, createdAt: new Date().toISOString(), status: 'sending' },
        ],
      }))
    } else {
      setPendingByConversation((current) => ({
        ...current,
        [conversationId]: (current[conversationId] ?? []).map((item) =>
          item.tempId === tempId ? { ...item, status: 'sending' } : item,
        ),
      }))
    }
    sendMessageMutation.mutate({ conversationId, content, tempId: finalTempId })
  }

  const handleSend = () => {
    const content = activeDraft.trim()
    if (!selectedConversationId || !content) return
    setDraftByConversationId((current) => ({ ...current, [selectedConversationId]: '' }))
    dispatchMessage(selectedConversationId, content)
  }

  const handleRetryPending = (tempId: string) => {
    const pending = activePending.find((item) => item.tempId === tempId)
    if (!pending || !selectedConversationId) return
    dispatchMessage(selectedConversationId, pending.content, tempId)
  }

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    setSearchParams({ conversationId })
  }

  const handleBackToList = () => {
    setSelectedConversationId('')
    setSearchParams({})
  }

  if (conversationsQuery.isLoading) {
    return <ConversationSkeleton />
  }

  if (conversationsQuery.isError) {
    return (
      <AppState
        tone="error"
        title="消息中心暂时没有打开"
        description={conversationsQuery.error instanceof Error ? conversationsQuery.error.message : '请稍后再试。'}
        primaryAction={{ label: '重新加载', onClick: () => void conversationsQuery.refetch() }}
        className="min-h-[360px]"
      />
    )
  }

  return (
    // 单一分栏面：桌面/平板用一张卡片包住两栏中间分隔线，手机端全出血去掉卡片壳，避免容器套容器
    <div className="flex overflow-hidden md:h-[calc(100dvh-14rem)] md:rounded-[var(--radius-lg)] md:border md:border-[var(--border-subtle)] md:bg-[var(--surface-default)] md:shadow-[var(--shadow-card)]">
      {shouldShowListPane ? (
        <aside className="h-[calc(100dvh-11rem)] w-full shrink-0 overflow-hidden md:h-full md:w-[280px] md:border-r md:border-[var(--border-subtle)] xl:w-[320px]">
          <ConversationList
            conversations={filteredConversations}
            selectedId={selectedConversationId || null}
            onSelect={handleSelectConversation}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            totalUnread={totalUnread}
          />
        </aside>
      ) : null}

      {shouldShowConversationPane ? (
        <section className="flex h-[calc(100dvh-11rem)] min-w-0 flex-1 flex-col overflow-hidden md:h-full">
          {selectedConversation ? (
            <>
              {/* 聊天头部 */}
              <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-3">
                {!isSplitLayout ? (
                  <button
                    type="button"
                    onClick={handleBackToList}
                    aria-label="返回会话列表"
                    className="touch-target press-feedback inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-pill)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                ) : null}
                <Avatar name={selectedConversation.title ?? '系统'} src={selectedConversation.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {selectedConversation.title ?? '系统通知'}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                    {selectedConversation.type === 'system'
                      ? '系统会把重要提醒收在这里'
                      : selectedConversation.presence === 'online'
                        ? '在线'
                        : selectedConversation.presence === 'typing'
                          ? '正在输入...'
                          : selectedConversation.unreadCount > 0
                            ? `${selectedConversation.unreadCount} 条未读`
                            : '消息已读完'}
                  </p>
                </div>
              </div>

              {/* 消息区 */}
              {messagesQuery.isLoading ? (
                <AppState
                  tone="loading"
                  title="会话内容正在载入"
                  description="稍等一下，这段对话很快就会出现。"
                  className="min-h-0 flex-1 border-0 shadow-none"
                />
              ) : messagesQuery.isError ? (
                <AppState
                  tone="error"
                  title="这段会话暂时没有打开"
                  description={messagesQuery.error instanceof Error ? messagesQuery.error.message : '请稍后再试。'}
                  primaryAction={{ label: '重试', onClick: () => void messagesQuery.refetch() }}
                  className="min-h-0 flex-1 border-0 shadow-none"
                />
              ) : (
                <div ref={messageScrollRef} className="min-h-0 flex-1 overflow-y-auto">
                  <MessageBubbleList
                    messages={activeMessages}
                    pendingMessages={activePending}
                    currentUserId={currentUserId}
                    onRetryPending={handleRetryPending}
                  />
                </div>
              )}

              {/* 输入区 / 系统会话提示 */}
              {selectedConversation.type === 'system' ? (
                <div className="border-t border-[var(--border-subtle)] px-4 py-3 text-center text-xs text-[var(--text-tertiary)]">
                  系统通知不支持回复
                </div>
              ) : (
                <ChatComposer
                  value={activeDraft}
                  onChange={(value) =>
                    setDraftByConversationId((current) => ({
                      ...current,
                      [selectedConversation.id]: value,
                    }))
                  }
                  onSend={handleSend}
                  isSending={sendMessageMutation.isPending}
                />
              )}
            </>
          ) : (
            <AppState
              tone="empty"
              title="先选一段会话再继续浏览"
              description="左侧会话会按最近消息更新，点开后就能继续查看。"
              className="min-h-0 flex-1 border-0 shadow-none"
            />
          )}
        </section>
      ) : null}
    </div>
  )
}
