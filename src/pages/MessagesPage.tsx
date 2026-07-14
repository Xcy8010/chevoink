import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, ChevronLeft, Circle, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import { getMe, listConversations, listMessages, sendMessage } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import { conversationFilters } from '@/features/community/constants'
import { formatRelativeTime } from '@/features/community/utils'
import type { Conversation, Message } from '../../shared/contracts/index.js'

export default function MessagesPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedConversationId, setSelectedConversationId] = useState(searchParams.get('conversationId') ?? '')
  const [draftByConversationId, setDraftByConversationId] = useState<Record<string, string>>({})
  const [isSplitLayout, setIsSplitLayout] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.innerWidth >= 768
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const updateLayout = () => {
      setIsSplitLayout(window.innerWidth >= 768)
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)

    return () => {
      window.removeEventListener('resize', updateLayout)
    }
  }, [])

  const meQuery = useQuery({
    queryKey: ['community', 'me'],
    queryFn: getMe,
  })

  const conversationsQuery = useQuery({
    queryKey: ['community', 'conversations'],
    queryFn: () => listConversations(30),
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
  })

  const sendMessageMutation = useMutation({
    mutationFn: ({
      conversationId,
      content,
    }: {
      conversationId: string
      content: string
    }) => sendMessage(conversationId, { type: 'text', content }),
    onSuccess: async (message, variables) => {
      setDraftByConversationId((current) => ({
        ...current,
        [selectedConversationId]: '',
      }))
      queryClient.setQueryData<{ conversation: Conversation | null; items: Message[] } | undefined>(
        ['community', 'messages', variables.conversationId],
        (current) => {
          if (!current) {
            return current
          }

          return {
            ...current,
            items: [...current.items, message],
          }
        },
      )
      queryClient.setQueryData<{ items: Conversation[] } | undefined>(
        ['community', 'conversations'],
        (current) => {
          if (!current) {
            return current
          }

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
  })

  const selectedConversation =
    filteredConversations.find((item) => item.id === selectedConversationId) ??
    allConversations.find((item) => item.id === selectedConversationId) ??
    messagesQuery.data?.conversation ??
    null
  const activeMessages = messagesQuery.data?.items ?? []
  const activeDraft = selectedConversation ? draftByConversationId[selectedConversation.id] ?? '' : ''
  const currentUserId = meQuery.data?.user?.id ?? ''
  const isConversationListLoading = conversationsQuery.isLoading
  const isConversationListError = conversationsQuery.isError
  const shouldShowListPane = isSplitLayout || !selectedConversation
  const shouldShowConversationPane = isSplitLayout || Boolean(selectedConversation)

  const handleSend = () => {
    const content = activeDraft.trim()
    if (!selectedConversationId || !content) {
      return
    }

    sendMessageMutation.mutate({
      conversationId: selectedConversationId,
      content,
    })
  }

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    setSearchParams({ conversationId })
  }

  const handleBackToList = () => {
    setSelectedConversationId('')
    setSearchParams({})
  }

  if (isConversationListLoading) {
    return (
      <AppState
        tone="loading"
        title="会话列表正在准备"
        description="稍等一下，最近消息很快就会出现。"
        className="min-h-[360px]"
      />
    )
  }

  if (isConversationListError) {
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
    <div className="space-y-4">
      <div className="grid gap-4 md:h-[calc(100dvh-14rem)] md:grid-cols-[280px_minmax(0,1fr)] md:items-stretch xl:grid-cols-[320px_minmax(0,1fr)]">
        {shouldShowListPane ? (
          <aside className="rounded-[26px] border border-slate-200/80 bg-white/88 p-3 dark:border-slate-800 dark:bg-slate-950/86 md:flex md:h-[calc(100dvh-14rem)] md:min-h-0 md:flex-col md:p-4">
            <div className="space-y-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950 dark:text-slate-50">最近会话</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">系统提醒和私聊都收在这里。</p>
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600 md:inline-flex dark:border-slate-700 dark:text-slate-300">
                  <BellRing className="h-3.5 w-3.5" />
                  {allConversations.reduce((sum, item) => sum + item.unreadCount, 0)} 条未读
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {conversationFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActiveFilter(filter.id)}
                    className={[
                      'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition',
                      activeFilter === filter.id
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50',
                    ].join(' ')}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
              {filteredConversations.length > 0 ? (
                filteredConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation.id)}
                    className={[
                      'flex w-full items-start gap-3 rounded-[20px] border px-3 py-3 text-left transition',
                      selectedConversation?.id === conversation.id
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                        : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-700',
                    ].join(' ')}
                  >
                    <Avatar name={conversation.title ?? '系统'} src={conversation.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 text-sm font-medium">{conversation.title}</span>
                        <span className="text-[11px] opacity-70">
                          {conversation.lastMessageAt ? formatRelativeTime(conversation.lastMessageAt) : '刚刚'}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-xs opacity-80">
                        <Circle className="h-2.5 w-2.5 fill-current" />
                        {conversation.type === 'system' ? '系统提醒' : '私聊'}
                      </span>
                      <span className="mt-2 block line-clamp-2 text-xs leading-6 opacity-80">
                        {conversation.lastMessagePreview}
                      </span>
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-medium text-slate-950 dark:bg-slate-950 dark:text-slate-50">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <AppState
                  tone="empty"
                  title="这里还没有符合条件的会话"
                  description="切换一下筛选，或者稍后再回来看看。"
                  className="min-h-[260px]"
                />
              )}
            </div>
          </aside>
        ) : null}

        {shouldShowConversationPane ? (
          <section className="flex min-h-[72dvh] flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-white/88 dark:border-slate-800 dark:bg-slate-950/86 md:min-h-[620px] md:h-[calc(100dvh-14rem)]">
            {selectedConversation ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-slate-800">
                  <div className="flex min-w-0 items-center gap-3">
                    {!isSplitLayout ? (
                      <button
                        type="button"
                        onClick={handleBackToList}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-50"
                        aria-label="返回会话列表"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    ) : null}
                    <Avatar name={selectedConversation.title ?? '系统'} src={selectedConversation.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-slate-950 dark:text-slate-50">
                        {selectedConversation.title}
                      </h3>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {selectedConversation.type === 'system'
                          ? '系统会把重要提醒收在这里。'
                          : '在这里继续聊作品、章节和阅读感受。'}
                      </p>
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600 md:inline-flex dark:border-slate-700 dark:text-slate-300">
                    <BellRing className="h-3.5 w-3.5" />
                    {selectedConversation.unreadCount > 0 ? `${selectedConversation.unreadCount} 条未读` : '消息已读完'}
                  </div>
                </div>

                {messagesQuery.isLoading ? (
                  <AppState
                    tone="loading"
                    title="会话内容正在载入"
                    description="稍等一下，这段对话很快就会出现。"
                    className="min-h-[320px] flex-1 rounded-none border-0 shadow-none"
                  />
                ) : null}

                {messagesQuery.isError ? (
                  <AppState
                    tone="error"
                    title="这段会话暂时没有打开"
                    description={messagesQuery.error instanceof Error ? messagesQuery.error.message : '请稍后再试。'}
                    primaryAction={{ label: '重试', onClick: () => void messagesQuery.refetch() }}
                    className="min-h-[320px] flex-1 rounded-none border-0 shadow-none"
                  />
                ) : null}

                {!messagesQuery.isLoading && !messagesQuery.isError ? (
                  <>
                    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                      {activeMessages.length > 0 ? (
                        activeMessages.map((message) => {
                          const isSelf = message.senderId === currentUserId
                          const relatedHref =
                            message.type === 'novelCard' && message.relatedId
                              ? `/novel/${message.relatedId}`
                              : message.type === 'postCard' && message.relatedId
                                ? `/post/${message.relatedId}`
                                : null

                          return (
                            <div key={message.id} className={isSelf ? 'flex justify-end' : 'flex justify-start'}>
                              <div
                                className={[
                                  'max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-7 md:max-w-[76%]',
                                  isSelf
                                    ? 'bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
                                ].join(' ')}
                              >
                                <p>{message.content}</p>
                                {relatedHref ? (
                                  <Link
                                    to={relatedHref}
                                    className={[
                                      'mt-3 inline-flex rounded-full border px-3 py-1.5 text-xs font-medium transition',
                                      isSelf
                                        ? 'border-white/20 text-white hover:border-white/30'
                                        : 'border-slate-300 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600',
                                    ].join(' ')}
                                  >
                                    {message.type === 'novelCard' ? '查看作品' : '查看帖子'}
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <AppState
                          tone="empty"
                          title="这段会话还没有消息"
                          description="先发一条问候，让对话继续下去。"
                          className="min-h-[280px] rounded-none border-0 shadow-none"
                        />
                      )}
                    </div>

                    {selectedConversation.type === 'system' ? (
                      <div className="border-t border-slate-200/80 px-4 py-4 dark:border-slate-800">
                        <div className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                          系统会把更新提醒和账户消息集中收在这里，方便随时回看。
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-slate-200/80 px-4 py-4 dark:border-slate-800">
                        <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
                          <textarea
                            value={activeDraft}
                            onChange={(event) =>
                              setDraftByConversationId((current) => ({
                                ...current,
                                [selectedConversation.id]: event.target.value,
                              }))
                            }
                            rows={3}
                            placeholder="给对方发条消息。"
                            className="w-full resize-none bg-transparent text-sm leading-7 text-slate-700 outline-none dark:text-slate-200"
                          />
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs text-slate-500 dark:text-slate-400">直接聊作品、章节和阅读感受。</span>
                            <Button
                              variant="primary"
                              onClick={handleSend}
                              disabled={!activeDraft.trim() || sendMessageMutation.isPending}
                            >
                              <Send className="h-4 w-4" />
                              {sendMessageMutation.isPending ? '发送中' : '发送'}
                            </Button>
                          </div>
                          {sendMessageMutation.isError ? (
                            <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
                              {sendMessageMutation.error instanceof Error
                                ? sendMessageMutation.error.message
                                : '这条消息暂时没有发出，请稍后再试。'}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <AppState
                tone="empty"
                title="先选一段会话再继续浏览"
                description="左侧会话会按最近消息更新，点开后就能继续查看。"
                className="min-h-[480px] flex-1 rounded-none border-0 shadow-none"
              />
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
