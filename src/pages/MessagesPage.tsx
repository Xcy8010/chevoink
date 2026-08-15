import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, UserRoundPlus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useDevice } from '@/components/layout/DeviceProvider'
import AppState from '@/components/ui/AppState'
import { ConversationSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useKeyboardPushScroll } from '@/hooks/useKeyboardPushScroll'
import {
  createDirectConversation,
  getInteractionBadges,
  getMe,
  listConversations,
  listInteractions,
  listMessages,
  listUserFollowers,
  markConversationRead,
  sendMessage,
  setUserFollow,
} from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import ChatComposer from '@/features/messages/components/ChatComposer'
import ConversationList from '@/features/messages/components/ConversationList'
import MessageBubbleList, { type PendingMessage } from '@/features/messages/components/MessageBubbleList'
import type { Conversation, Message } from '../../shared/contracts/index.js'

/**
 * 消息中心（TikTok/Messenger 式重设计）：
 * - 手机：会话列表 ↔ 聊天全屏切换
 * - 平板：左会话列表 300px + 右聊天区分栏；电脑：列表加宽到 360px
 * - 列表面板：互关好友横向头像栏 + 「新关注我的」与系统消息固定置顶 + 私聊会话
 */
export default function MessagesPage() {
  const { isMobile } = useDevice()
  const isSplitLayout = !isMobile
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  // 选中会话直接从 URL 派生，URL 是唯一数据源：
  // 之前用本地 state + effect 与路由参数双向同步，但 react-router v7 的 setSearchParams
  // 走 startTransition 延迟提交，本地 state 先行提交会产生「列表↔聊天」来回翻转的中间帧，
  // 手机端表现为进入/退出聊天时各闪一下；派生后页面切换与壳层底栏隐藏在同一次提交内完成
  const routeConversationId = searchParams.get('conversationId') ?? ''
  const [openingFriendId, setOpeningFriendId] = useState<string | null>(null)
  const [draftByConversationId, setDraftByConversationId] = useState<Record<string, string>>({})
  const [pendingByConversation, setPendingByConversation] = useState<Record<string, PendingMessage[]>>({})
  const [followBackSubmitting, setFollowBackSubmitting] = useState(false)
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

  // 互关好友与最新粉丝：登录后拉取自己的粉丝列表（含 followedByViewer/followsViewer 标记）
  const followersQuery = useQuery({
    queryKey: ['community', 'followers', 'me'],
    queryFn: () => listUserFollowers('me'),
    enabled: Boolean(meQuery.data?.user?.id),
  })
  const followerItems = useMemo(() => followersQuery.data?.items ?? [], [followersQuery.data])
  const mutualFriends = useMemo(
    () => followerItems.filter((item) => item.followedByViewer && item.followsViewer),
    [followerItems],
  )
  const latestFollower = followerItems[0] ?? null

  // 最新互动（赞/收藏/评论）：给「互动消息」固定入口提供副标题
  const interactionsQuery = useQuery({
    queryKey: ['community', 'interactions'],
    queryFn: listInteractions,
    enabled: Boolean(meQuery.data?.user?.id),
  })
  const latestInteraction = interactionsQuery.data?.items?.[0] ?? null

  // 互动/新关注未读红点：15s 轻轮询保持新鲜
  const badgesQuery = useQuery({
    queryKey: ['community', 'interaction-badges'],
    queryFn: getInteractionBadges,
    enabled: Boolean(meQuery.data?.user?.id),
    refetchInterval: 15_000,
  })
  const interactionsUnseen = badgesQuery.data?.interactionsUnseen ?? 0
  const followersUnseen = badgesQuery.data?.followersUnseen ?? 0

  // 直接信任路由参数：新建会话可能还不在缓存列表里（staleTime 内不会重拉），
  // 聊天区已有 messagesQuery.data.conversation 兑底，选中不依赖列表包含该会话；
  // 平板/桌面分栏无参数时兜底选中第一条会话，手机端无参数即回到列表
  const selectedConversationId =
    routeConversationId || (isSplitLayout ? (allConversations[0]?.id ?? '') : '')

  const messagesQuery = useQuery({
    queryKey: ['community', 'messages', selectedConversationId],
    queryFn: () => listMessages(selectedConversationId, 50),
    enabled: Boolean(selectedConversationId),
    refetchInterval: 15_000,
  })

  // 进入会话即标记已读：本地未读数归零 + 刷新全局未读统计；
  // 依赖最新消息 id，停留在聊天中收到新消息时也持续上报已读，对方的「已读」状态才能半实时刷新
  const latestMessageId = messagesQuery.data?.items?.at(-1)?.id ?? ''
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
  }, [queryClient, selectedConversationId, latestMessageId])

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
      type,
    }: {
      conversationId: string
      content: string
      type: 'text' | 'image'
      tempId: string
    }) => sendMessage(conversationId, { type, content }),
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
                    lastMessagePreview: message.type === 'image' ? '[图片]' : message.content,
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
    allConversations.find((item) => item.id === selectedConversationId) ??
    messagesQuery.data?.conversation ??
    null
  const activeMessages = messagesQuery.data?.items ?? []
  const activePending = selectedConversationId ? (pendingByConversation[selectedConversationId] ?? []) : []
  const activeDraft = selectedConversation ? (draftByConversationId[selectedConversation.id] ?? '') : ''
  const currentUserId = meQuery.data?.user?.id ?? ''
  // 对方最近读到会话的时间：从消息接口返回的会话成员里取（用于「已读」状态）
  const counterpartLastReadAt = useMemo(() => {
    const members = messagesQuery.data?.conversation?.members ?? []
    return members.find((member) => member.id && String(member.id) !== currentUserId)?.lastReadAt ?? null
  }, [messagesQuery.data, currentUserId])
  const totalUnread = allConversations.reduce((sum, item) => sum + item.unreadCount, 0)
  const shouldShowListPane = isSplitLayout || !selectedConversation
  const shouldShowConversationPane = isSplitLayout || Boolean(selectedConversation)

  // 回关横幅：对方关注了我而我还没回关时展示
  const showFollowBackBanner =
    selectedConversation?.type === 'direct' &&
    selectedConversation.counterpartFollowsViewer === true &&
    selectedConversation.viewerFollowsCounterpart === false
  // 陌生消息限额：未互关的直聊单方最多发 3 条（含发送中的乐观消息，失败的不占额度）
  const isStrangerConversation =
    selectedConversation?.type === 'direct' && selectedConversation.isMutualFollow === false
  const sentByMeCount =
    activeMessages.filter((message) => message.senderId === currentUserId).length +
    activePending.filter((item) => item.status !== 'failed').length
  const strangerQuotaLeft = isStrangerConversation ? Math.max(0, 3 - sentByMeCount) : Infinity

  // 新消息到达后滚动到底部
  useEffect(() => {
    const element = messageScrollRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [selectedConversationId, activeMessages.length, activePending.length])

  // 键盘弹起时微信/QQ 式把聊天对话顶上去（消息区加载完成后才挂载，ready 翻真重绑）
  useKeyboardPushScroll(messageScrollRef, !messagesQuery.isLoading && !messagesQuery.isError)

  const dispatchMessage = (
    conversationId: string,
    content: string,
    type: 'text' | 'image' = 'text',
    tempId?: string,
  ) => {
    const finalTempId = tempId ?? `pending-${Date.now()}-${Math.round(Math.random() * 1000)}`
    if (!tempId) {
      setPendingByConversation((current) => ({
        ...current,
        [conversationId]: [
          ...(current[conversationId] ?? []),
          { tempId: finalTempId, content, createdAt: new Date().toISOString(), status: 'sending', type },
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
    sendMessageMutation.mutate({ conversationId, content, type, tempId: finalTempId })
  }

  const handleSend = () => {
    const content = activeDraft.trim()
    if (!selectedConversationId || !content) return
    if (isStrangerConversation && strangerQuotaLeft <= 0) {
      toast.info('你们还没有互相关注，最多只能发送 3 条陌生消息。')
      return
    }
    setDraftByConversationId((current) => ({ ...current, [selectedConversationId]: '' }))
    dispatchMessage(selectedConversationId, content)
  }

  const handleRetryPending = (tempId: string) => {
    const pending = activePending.find((item) => item.tempId === tempId)
    if (!pending || !selectedConversationId) return
    dispatchMessage(selectedConversationId, pending.content, pending.type ?? 'text', tempId)
  }

  // 加号发图片：校验格式与大小后转 dataURL 走同一发送链路（后端落盘并替换为图片地址）
  const handlePickImage = (file: File) => {
    if (!selectedConversationId) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error('仅支持 PNG、JPG 或 WebP 图片。')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片不能超过 5MB。')
      return
    }
    if (isStrangerConversation && strangerQuotaLeft <= 0) {
      toast.info('你们还没有互相关注，最多只能发送 3 条陌生消息。')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        toast.error('图片读取失败，请重试。')
        return
      }
      dispatchMessage(selectedConversationId, dataUrl, 'image')
    }
    reader.onerror = () => toast.error('图片读取失败，请重试。')
    reader.readAsDataURL(file)
  }

  const handleSelectConversation = (conversationId: string) => {
    setSearchParams({ conversationId })
  }

  const handleBackToList = () => {
    setSearchParams({})
  }

  // 回关对方：成功后刷新会话/消息/粉丝数据，横幅与陌生限额随之解除
  const handleFollowBack = async () => {
    const counterpartId = selectedConversation?.counterpart?.id
    if (!counterpartId || followBackSubmitting) return

    setFollowBackSubmitting(true)
    try {
      await setUserFollow(String(counterpartId), true)
      toast.success('已回关，现在可以不限次数畅聊了。')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'messages', selectedConversationId] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'followers', 'me'] }),
      ])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '回关暂时没有成功，请稍后再试。')
    } finally {
      setFollowBackSubmitting(false)
    }
  }

  // 点互关好友头像：复用已有直聊会话，否则创建后选中
  const handleOpenFriend = async (userId: string) => {
    if (openingFriendId) return

    const existing = allConversations.find(
      (item) => item.type === 'direct' && item.counterpart?.id === userId,
    )
    if (existing) {
      handleSelectConversation(existing.id)
      return
    }

    setOpeningFriendId(userId)
    try {
      const conversation = await createDirectConversation(userId)
      await queryClient.invalidateQueries({ queryKey: ['community', 'conversations'] })
      handleSelectConversation(conversation.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '暂时无法打开会话，请稍后再试。')
    } finally {
      setOpeningFriendId(null)
    }
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
    // 单一分栏面：桌面/平板用一张卡片包住两栏中间分隔线，手机端全出血去掉卡片壳；壳层已改 overflow-hidden 固定布局，直接 flex-1 铺满剩余高度，不再估算 dvh 减值
    <div className="flex min-h-0 flex-1 overflow-hidden md:rounded-[var(--radius-lg)] md:border md:border-[var(--border-subtle)] md:bg-[var(--surface-default)] md:shadow-[var(--shadow-card)]">
      {shouldShowListPane ? (
        <aside className="h-full w-full shrink-0 overflow-hidden md:w-[300px] md:border-r md:border-[var(--border-subtle)] xl:w-[360px]">
          <ConversationList
            conversations={allConversations}
            selectedId={selectedConversationId || null}
            onSelect={handleSelectConversation}
            totalUnread={totalUnread}
            mutualFriends={mutualFriends}
            latestFollower={latestFollower}
            latestInteraction={latestInteraction}
            interactionsUnseen={interactionsUnseen}
            followersUnseen={followersUnseen}
            onOpenFriend={(userId) => void handleOpenFriend(userId)}
            openingFriendId={openingFriendId}
          />
        </aside>
      ) : null}

      {shouldShowConversationPane ? (
        <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              {/* 聊天头部：手机端收紧左边距与间距，让返回键+头像+昵称整体靠左 */}
              <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-3 mobile:gap-2 mobile:px-1.5">
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
                {/* 直聊会话：头像与昵称可点进入对方主页 */}
                {selectedConversation.type === 'direct' && selectedConversation.counterpart ? (
                  <Link
                    to={`/author/${selectedConversation.counterpart.id}`}
                    aria-label={`查看 ${selectedConversation.title ?? selectedConversation.counterpart.nickname} 的主页`}
                    className="shrink-0"
                  >
                    <Avatar
                      name={selectedConversation.title ?? selectedConversation.counterpart.nickname}
                      src={selectedConversation.avatarUrl ?? selectedConversation.counterpart.avatarUrl}
                      size="sm"
                    />
                  </Link>
                ) : (
                  <Avatar name={selectedConversation.title ?? '系统'} src={selectedConversation.avatarUrl} size="sm" />
                )}
                <div className="min-w-0 flex-1">
                  {selectedConversation.type === 'direct' && selectedConversation.counterpart ? (
                    <Link
                      to={`/author/${selectedConversation.counterpart.id}`}
                      className="block truncate text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--color-brand)]"
                    >
                      {selectedConversation.title ?? selectedConversation.counterpart.nickname}
                    </Link>
                  ) : (
                    <h3 className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {selectedConversation.title ?? '系统通知'}
                    </h3>
                  )}
                  {selectedConversation.type === 'system' ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">系统会把重要提醒收在这里</p>
                  ) : selectedConversation.presence === 'online' ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">在线</p>
                  ) : selectedConversation.presence === 'typing' ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">正在输入...</p>
                  ) : selectedConversation.unreadCount > 0 ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{selectedConversation.unreadCount} 条未读</p>
                  ) : null}
                </div>
              </div>

              {/* 回关横幅：对方关注了你而你未回关，实心红色长方形白字按钮一键回关 */}
              {showFollowBackBanner ? (
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2.5">
                  <p className="min-w-0 truncate text-xs text-[var(--text-secondary)]">
                    对方关注了你，回关后可以不限次数畅聊
                  </p>
                  <button
                    type="button"
                    disabled={followBackSubmitting}
                    onClick={() => void handleFollowBack()}
                    className="press-feedback shrink-0 rounded-[6px] bg-rose-500 px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {followBackSubmitting ? '关注中...' : '关注'}
                  </button>
                </div>
              ) : null}

              {/* 消息区 */}
              {messagesQuery.isLoading ? (
                <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-4 py-5" aria-busy="true" aria-label="会话加载中">
                  <Skeleton className="h-10 w-3/5 rounded-[16px]" />
                  <Skeleton className="ml-auto h-10 w-1/2 rounded-[16px]" />
                  <Skeleton className="h-16 w-2/3 rounded-[16px]" />
                  <Skeleton className="ml-auto h-10 w-2/5 rounded-[16px]" />
                </div>
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
                    counterpartLastReadAt={counterpartLastReadAt}
                    onRetryPending={handleRetryPending}
                  />
                </div>
              )}

              {/* 输入区 / 系统会话提示 / 陌生消息限额 */}
              {selectedConversation.type === 'system' ? (
                <div className="border-t border-[var(--border-subtle)] px-4 py-3 text-center text-xs text-[var(--text-tertiary)]">
                  系统通知不支持回复
                </div>
              ) : isStrangerConversation && strangerQuotaLeft <= 0 ? (
                <div className="border-t border-[var(--border-subtle)] px-4 py-3 text-center text-xs text-[var(--text-tertiary)]">
                  你们还没有互相关注，最多发送 3 条陌生消息，等对方回关后再继续聊吧。
                </div>
              ) : (
                <>
                  {isStrangerConversation ? (
                    <div className="flex justify-center border-t border-[var(--border-subtle)] px-4 pt-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-3 py-1 text-[11px] text-[var(--text-tertiary)]">
                        <UserRoundPlus className="h-3 w-3" />
                        互相关注前还可以发送
                        <span className="font-semibold tabular-nums text-[var(--text-primary)]">{strangerQuotaLeft}</span>
                        条消息
                      </span>
                    </div>
                  ) : null}
                  <ChatComposer
                    value={activeDraft}
                    onChange={(value) =>
                      setDraftByConversationId((current) => ({
                        ...current,
                        [selectedConversation.id]: value,
                      }))
                    }
                    onSend={handleSend}
                    onPickImage={handlePickImage}
                    isSending={sendMessageMutation.isPending}
                  />
                </>
              )}
            </>
          ) : (
            <AppState
              tone="empty"
              title="选一个会话开始聊天"
              className="min-h-0 flex-1 border-0 shadow-none"
            />
          )}
        </section>
      ) : null}
    </div>
  )
}
