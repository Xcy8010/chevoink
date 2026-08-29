import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Bot, ChevronDown, ChevronRight, History, MessageSquareText, User, Users } from 'lucide-react'

import { getAdminAgentSessionMessages, getAdminCreationRecords, listAdminUsers } from '../api'
import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { AdminCard, AdminPageHeader, AdminPanelState, StatusPill } from '../AdminLayout'
import { cn } from '@/lib/utils'
import type { AdminAgentSessionMessagesPayload } from '../../../../shared/contracts/index.js'

const RUN_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '进行中',
  awaiting_approval: '待审批',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const RUN_MODE_LABELS: Record<string, string> = {
  plan: '规划',
  act: '执行',
  review: '审查',
}

const ACTION_LABELS: Record<string, string> = {
  planChapter: '规划章节',
  draftChapter: '起草章节',
  continueChapter: '续写章节',
  rewriteSelection: '重写选中',
  polishSelection: '润色选中',
  reviewContinuity: '连贯性审查',
  generateCoverPrompt: '生成封面提示词',
  workspaceAgent: '工作区辅助',
}

type RenderPart = {
  type?: string
  text?: string
  title?: string
  toolName?: string
  status?: string
  summary?: string
  name?: string
  url?: string
}

function renderPart(part: RenderPart, index: number) {
  if (part.type === 'text' && part.text) {
    return (
      <p key={index} className="whitespace-pre-wrap text-sm leading-6">
        {part.text}
      </p>
    )
  }
  if (part.type === 'reasoning' && part.text) {
    return (
      <p key={index} className="text-xs italic leading-5 text-[var(--text-tertiary)]">
        {part.text}
      </p>
    )
  }
  if (part.type === 'tool-call') {
    return (
      <div key={index} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs">
        <span className="font-medium text-[var(--text-primary)]">{part.title ?? part.toolName ?? '工具调用'}</span>
        {part.summary ? <span className="ml-2 text-[var(--text-secondary)]">{part.summary}</span> : null}
        {part.status ? (
          <StatusPill tone={part.status === 'success' ? 'success' : part.status === 'failed' ? 'danger' : 'neutral'}>{part.status}</StatusPill>
        ) : null}
      </div>
    )
  }
  if (part.type === 'attachment') {
    return (
      <div key={index} className="text-xs">
        <span className="text-[var(--text-secondary)]">附件：</span>
        <span className="text-[var(--text-primary)]">{part.name}</span>
      </div>
    )
  }
  return null
}

function ChatRecord({ payload }: { payload: AdminAgentSessionMessagesPayload }) {
  return (
    <div className="mt-2 space-y-3">
      {payload.runs.map((run) => (
        <div key={run.id} className="rounded-xl border border-[var(--border-default)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{RUN_MODE_LABELS[run.mode] ?? run.mode}</span>
            <span>{ACTION_LABELS[run.action] ?? run.action}</span>
            <StatusPill tone={run.status === 'completed' || run.status === 'running' ? 'success' : run.status === 'failed' ? 'danger' : 'neutral'}>
              {RUN_STATUS_LABELS[run.status] ?? run.status}
            </StatusPill>
            <span className="ml-auto">{run.createdAt.slice(0, 16).replace('T', ' ')}</span>
          </div>
          {run.inputSummary ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">输入：{run.inputSummary}</p> : null}
          {run.outputSummary ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">输出：{run.outputSummary}</p> : null}
          {run.errorMessage ? <p className="mt-1 text-sm text-[var(--color-error)]">错误：{run.errorMessage}</p> : null}

          <div className="mt-2 space-y-1.5">
            {run.messages.map((message) => (
              <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('flex max-w-[85%] gap-2', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', message.role === 'user' ? 'bg-[var(--surface-muted)]' : 'bg-[var(--surface-muted)]')}>
                    {message.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                  </span>
                  <div
                    className={cn(
                      'rounded-xl px-3 py-2',
                      message.role === 'user' ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'bg-[var(--surface-muted)] text-[var(--text-primary)]',
                    )}
                  >
                    <div className="space-y-1">{message.parts.map((part, index) => renderPart(part as RenderPart, index))}</div>
                    <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{message.createdAt.slice(11, 16)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminCreationRecordsPage() {
  const { userId = '' } = useParams()
  const navigate = useNavigate()
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')

  const recordsQuery = useQuery({
    queryKey: ['admin', 'users', userId, 'creation-records'],
    queryFn: () => getAdminCreationRecords(userId),
    enabled: Boolean(userId),
  })

  const searchQuery = useQuery({
    queryKey: ['admin', 'users', 'search-for-records', search],
    queryFn: () => listAdminUsers({ search: search || undefined, page: 1, pageSize: 20 }),
    enabled: !userId && Boolean(search),
  })

  const messagesQuery = useQuery({
    queryKey: ['admin', 'agent-sessions', expandedSessionId, 'messages'],
    queryFn: () => getAdminAgentSessionMessages(expandedSessionId!),
    enabled: Boolean(expandedSessionId),
  })

  const payload = recordsQuery.data
  const sessionMessages = messagesQuery.data

  const sessionCount = useMemo(
    () => payload?.novels.reduce((total, novel) => total + novel.sessions.length, 0) ?? 0,
    [payload],
  )

  // 无 userId：进入创作者检索落地页（合法文笔库的「创作记录」入口）
  if (!userId) {
    return (
      <div>
        <AdminPageHeader title="创作记录" description="检索用户后查看其各作品与 Agent 的对话记录" />
        <form
          className="mb-4 flex max-w-md gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(keyword.trim())
          }}
        >
          <TextInput value={keyword} placeholder="昵称 / 手机号 / 邮箱" onChange={(event) => setKeyword(event.target.value)} />
          <Button type="submit" variant="primary">
            搜索
          </Button>
        </form>

        {search ? (
          <AdminPanelState state={searchQuery.isLoading ? 'loading' : searchQuery.isError ? 'error' : searchQuery.data && searchQuery.data.items.length === 0 ? 'empty' : 'ready'}>
            <AdminCard>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {searchQuery.data?.items.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => navigate(`/admin/users/${user.id}/creation-records`)}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] p-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.nickname} className="h-11 w-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-base font-semibold">
                        {user.nickname.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{user.nickname}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {user.novelCount} 作品 · {user.followerCount} 粉丝
                      </p>
                    </div>
                    <ChevronRight size={15} className="text-[var(--text-tertiary)]" />
                  </button>
                ))}
              </div>
            </AdminCard>
          </AdminPanelState>
        ) : (
          <AdminCard>
            <div className="py-10 text-center">
              <Users className="mx-auto h-8 w-8 text-[var(--text-tertiary)]" />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">输入昵称、手机号或邮箱检索用户，点击进入其创作记录。</p>
            </div>
          </AdminCard>
        )}
      </div>
    )
  }

  return (
    <div>
      <Link to={`/admin/users/${userId}`} className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft size={15} />
        返回用户详情
      </Link>

      <AdminPageHeader
        title={payload ? `${payload.user.nickname} 的创作记录` : '创作记录'}
        description={payload ? `共 ${payload.novels.length} 部作品 · ${sessionCount} 个 Agent 会话` : undefined}
      />

      <AdminPanelState state={recordsQuery.isLoading ? 'loading' : recordsQuery.isError ? 'error' : payload && payload.novels.length === 0 ? 'empty' : 'ready'}>
        {payload ? (
          <div className="space-y-3">
            {payload.novels.map((novel) => (
              <AdminCard key={novel.novelId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{novel.displayTitle ?? novel.title}</h2>
                    <StatusPill tone={novel.status === 'published' || novel.status === 'completed' ? 'success' : 'neutral'}>
                      {novel.status === 'published' ? '连载中' : novel.status === 'completed' ? '已完结' : novel.status === 'draft' ? '草稿' : novel.status}
                    </StatusPill>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {novel.wordCount.toLocaleString('zh-CN')} 字 · {novel.chapterCount} 章 · {novel.sessions.length} 个会话
                  </p>
                </div>

                {novel.sessions.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--text-tertiary)]">该作品暂无 Agent 对话会话</p>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {novel.sessions.map((session) => {
                      const expanded = expandedSessionId === session.id
                      return (
                        <div key={session.id} className="rounded-lg border border-[var(--border-subtle)]">
                          <button
                            type="button"
                            onClick={() => setExpandedSessionId(expanded ? null : session.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
                          >
                            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            <History className="h-4 w-4 text-[var(--text-secondary)]" />
                            <span className="min-w-0 flex-1 truncate">{session.title}</span>
                            <MessageSquareText className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                            <span className="text-xs text-[var(--text-secondary)]">{session.runCount} 轮</span>
                            <span className="text-xs text-[var(--text-secondary)]">{session.lastRunAt ? session.lastRunAt.slice(0, 10) : session.createdAt.slice(0, 10)}</span>
                          </button>
                          {expanded ? (
                            <div className="border-t border-[var(--border-subtle)] px-3 py-2">
                              {messagesQuery.isLoading && expandedSessionId === session.id ? (
                                <p className="text-sm text-[var(--text-secondary)]">加载聊天记录…</p>
                              ) : messagesQuery.isError && expandedSessionId === session.id ? (
                                <p className="text-sm text-[var(--color-error)]">加载失败，请刷新重试。</p>
                              ) : sessionMessages && sessionMessages.session.id === session.id ? (
                                <ChatRecord payload={sessionMessages} />
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </AdminCard>
            ))}
          </div>
        ) : null}
      </AdminPanelState>
    </div>
  )
}
