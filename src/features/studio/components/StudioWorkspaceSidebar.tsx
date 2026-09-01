import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive, BookOpenText, Bot, Check, ChevronDown, ChevronRight, Clock3, Crosshair,
  Gauge, Gift, Home, MoreHorizontal, PencilLine, Pin, PinOff, Plus, Search, Settings2, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchCreditSummary, fetchReferral } from '@/features/account/credits-api'
import { formatCreditAmount } from '@/features/account/credit-format'
import InviteCreditsDialog from '@/features/account/InviteCreditsDialog'
import Avatar from '@/features/community/components/Avatar'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/useShellStore'
import type { AgentSession, Novel } from '../../../../shared/contracts/index.js'
import { updateNovelMeta } from '../api'
import { fetchAgentSessions, renameAgentSession, updateAgentSessionSettings } from '../agent/agentApi'
import ChevoinkAgentMark from '../agent/components/ChevoinkAgentMark'
import type { AgentTaskSidebarItem } from './AgentTaskSidebar'

type SettingsSection = 'general' | 'models' | 'operations' | 'archives'
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 宽度最终确定（拖拽结束/折叠/首帧）时上报，供 Work 布局动态计算聊天区最小宽度 */
  onWidthChange?: (width: number) => void
  perspective: 'work' | 'ide'
  perspectiveSwitchEnabled: boolean
  onPerspectiveChange: (value: 'work' | 'ide') => void
  currentNovelId: string
  currentNovelTitle: string
  novels: Novel[]
  novelsLoading?: boolean
  switchingNovel?: boolean
  currentTasks: AgentTaskSidebarItem[]
  activeTaskId: string | null
  taskSwitchLocked: boolean
  onSelectNovel: (novelId: string) => void
  onCreateNovel: () => void
  onCreateTask: () => void
  onSelectTask: (taskId: string, novelId: string) => void
  onRenameTask: (taskId: string, title: string) => void
  autoFollow: boolean
  onAutoFollowChange: (enabled: boolean) => void
  onOpenStudioSettings: (section?: SettingsSection) => void
}
type ContextTarget =
  | { kind: 'novel'; id: string; title: string; pinned: boolean; x: number; y: number }
  | { kind: 'task'; id: string; novelId: string; title: string; pinned: boolean; temporary: boolean; x: number; y: number }
type ContextTargetInput =
  | { kind: 'novel'; id: string; title: string; pinned: boolean }
  | { kind: 'task'; id: string; novelId: string; title: string; pinned: boolean; temporary: boolean }
type RenameTarget = { kind: 'novel' | 'task'; id: string; title: string }
type SidebarTask = { id: string; novelId: string; title: string; updatedAt: string; pinnedAt: string | null; temporary: boolean }

const MIN_WIDTH = 216
const MAX_WIDTH = 392
const DEFAULT_WIDTH = 280
const COLLAPSE_AT = MIN_WIDTH
/** 折叠态悬停peek的横向宽度上限：悬浮预览不需要展开态那么宽 */
const PEEK_MAX_WIDTH = 288
/** 旧版默认宽度，仅精确匹配时迁移到新默认，保留用户主动拖拽的值 */
const LEGACY_DEFAULT_WIDTH = 304

function novelTitle(novel: Novel) {
  return novel.displayTitle?.trim() || novel.title?.trim() || '未命名作品'
}

function sortWorkspaceItemsByLatest<T extends { updatedAt: string }>(items: T[]): T[] {
  const timestamp = (value: string) => {
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : 0
  }
  return [...items].sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))
}

function resetLabel(value?: string | null) {
  if (!value) return '稍后自动重置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '稍后自动重置'
  return `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 重置`
}

function initialWidth() {
  const value = Number(window.localStorage.getItem('chevoink:studio-sidebar-width'))
  if (!Number.isFinite(value) || value <= MIN_WIDTH + 16) return DEFAULT_WIDTH
  if (value === LEGACY_DEFAULT_WIDTH) return DEFAULT_WIDTH
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value))
}

export default function StudioWorkspaceSidebar(props: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionUser = useShellStore((state) => state.sessionUser)
  const [width, setWidth] = useState(initialWidth)
  const onWidthChangeRef = useRef(props.onWidthChange)
  onWidthChangeRef.current = props.onWidthChange
  // 宽度稳定后上报（拖拽中不逐帧上报，避免父级大组件高频重渲染）
  useEffect(() => {
    onWidthChangeRef.current?.(width)
  }, [width])
  const [peek, setPeek] = useState(false)
  const [productMenu, setProductMenu] = useState(false)
  const [moreMenu, setMoreMenu] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [usageExpanded, setUsageExpanded] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [warningDismissed, setWarningDismissed] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set([props.currentNovelId]))
  const [context, setContext] = useState<ContextTarget | null>(null)
  const [rename, setRename] = useState<RenameTarget | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [busy, setBusy] = useState(false)
  const accountRef = useRef<HTMLDivElement | null>(null)
  const peekCloseTimerRef = useRef<number | null>(null)
  const autoCopyRef = useRef(false)
  const dragRef = useRef<{ x: number; width: number; raw: number } | null>(null)

  const novels = useMemo(
    () => sortWorkspaceItemsByLatest(props.novels.filter((item) => item.status !== 'archived')),
    [props.novels],
  )
  const sessionsQuery = useQuery({
    queryKey: ['agent', 'sessions', 'workspace-sidebar'],
    queryFn: () => fetchAgentSessions(),
    staleTime: 15_000,
    enabled: props.open || peek || searchOpen,
  })
  const searchQuery = useQuery({
    queryKey: ['agent', 'sessions', 'workspace-search', searchText.trim()],
    queryFn: () => fetchAgentSessions(undefined, { query: searchText.trim() }),
    staleTime: 8_000,
    enabled: searchOpen && searchText.trim().length > 0,
  })
  const creditQuery = useQuery({ queryKey: ['credits', 'summary'], queryFn: fetchCreditSummary, staleTime: 20_000, refetchInterval: 60_000 })
  const referralQuery = useQuery({ queryKey: ['credits', 'referral'], queryFn: fetchReferral, staleTime: 60_000, enabled: inviteOpen })
  const sessions = useMemo(() => sessionsQuery.data?.items ?? [], [sessionsQuery.data?.items])
  const sessionsByNovel = useMemo(() => {
    const result = new Map<string, AgentSession[]>()
    sessions.forEach((session) => result.set(session.novelId, [...(result.get(session.novelId) ?? []), session]))
    result.forEach((items, novelId) => result.set(novelId, sortWorkspaceItemsByLatest(items)))
    return result
  }, [sessions])
  const localTasks = useMemo<SidebarTask[]>(() => props.currentTasks.map((task) => ({
    id: task.id, novelId: props.currentNovelId, title: task.title, updatedAt: task.updatedAt,
    pinnedAt: null, temporary: task.temporary,
  })), [props.currentNovelId, props.currentTasks])
  const summary = creditQuery.data
  const remainingPercent = summary?.dailyAllowance ? Math.max(0, Math.min(100, Math.round(summary.totalRemaining / summary.dailyAllowance * 100))) : 100
  const warningThreshold: 5 | 10 | 20 | null = remainingPercent <= 5 ? 5 : remainingPercent <= 10 ? 10 : remainingPercent <= 20 ? 20 : null

  useEffect(() => setExpandedProjects((current) => new Set(current).add(props.currentNovelId)), [props.currentNovelId])
  useEffect(() => {
    const key = summary?.resetsAt && warningThreshold ? `chevoink:credit-warning:${summary.resetsAt}:${warningThreshold}` : null
    setWarningDismissed(Boolean(key && window.localStorage.getItem(key) === 'dismissed'))
  }, [summary?.resetsAt, warningThreshold])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (accountOpen && !accountRef.current?.contains(event.target as Node)) setAccountOpen(false)
      setProductMenu(false)
      setMoreMenu(false)
      setContext(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [accountOpen])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) }
      if (event.key === 'Escape') { setSearchOpen(false); setContext(null) }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  useEffect(() => () => {
    if (peekCloseTimerRef.current !== null) window.clearTimeout(peekCloseTimerRef.current)
  }, [])

  const copyInvite = useCallback(async () => {
    const url = referralQuery.data?.inviteUrl
    if (!url || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
      window.setTimeout(() => setInviteCopied(false), 1800)
    } catch { /* 显式复制按钮仍可用 */ }
  }, [referralQuery.data?.inviteUrl])
  useEffect(() => {
    if (!inviteOpen || !autoCopyRef.current || !referralQuery.data?.inviteUrl) return
    autoCopyRef.current = false
    void copyInvite()
  }, [copyInvite, inviteOpen, referralQuery.data?.inviteUrl])

  function openInvite() {
    setAccountOpen(false)
    setInviteOpen(true)
    autoCopyRef.current = true
    if (referralQuery.data?.inviteUrl) { autoCopyRef.current = false; void copyInvite() }
  }
  function openContext(event: React.MouseEvent, target: ContextTargetInput) {
    event.preventDefault(); event.stopPropagation()
    setContext({ ...target, x: event.clientX, y: event.clientY } as ContextTarget)
  }
  async function refreshNavigation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['studio', 'my-novels'] }),
      queryClient.invalidateQueries({ queryKey: ['agent', 'sessions'] }),
    ])
  }
  async function togglePin(target: ContextTarget) {
    if ('temporary' in target && target.temporary) return
    setBusy(true)
    try {
      if (target.kind === 'novel') await updateNovelMeta(target.id, { pinned: !target.pinned })
      else await updateAgentSessionSettings(target.id, { pinned: !target.pinned })
      await refreshNavigation()
    } finally { setBusy(false); setContext(null) }
  }
  async function archive(target: ContextTarget) {
    if ('temporary' in target && target.temporary) return
    setBusy(true)
    try {
      if (target.kind === 'novel') {
        await updateNovelMeta(target.id, { status: 'archived' })
        if (target.id === props.currentNovelId) {
          const next = novels.find((item) => item.id !== target.id)
          if (next) props.onSelectNovel(next.id); else props.onCreateNovel()
        }
      } else {
        await updateAgentSessionSettings(target.id, { status: 'archived' })
        if (target.id === props.activeTaskId) props.onCreateTask()
      }
      await refreshNavigation()
    } finally { setBusy(false); setContext(null) }
  }
  function beginRename(target: ContextTarget) {
    setRename({ kind: target.kind, id: target.id, title: target.title }); setRenameValue(target.title); setContext(null)
  }
  async function commitRename() {
    if (!rename || !renameValue.trim()) return
    setBusy(true)
    try {
      const title = renameValue.trim().slice(0, 160)
      if (rename.kind === 'novel') await updateNovelMeta(rename.id, { title })
      else if (props.currentTasks.some((task) => task.id === rename.id)) props.onRenameTask(rename.id, title)
      else await renameAgentSession(rename.id, title)
      await refreshNavigation(); setRename(null)
    } finally { setBusy(false) }
  }
  function beginResize(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, width, raw: width }
  }
  function resize(event: React.PointerEvent) {
    if (!dragRef.current) return
    const raw = dragRef.current.width + event.clientX - dragRef.current.x
    dragRef.current.raw = raw
    if (raw <= COLLAPSE_AT) {
      dragRef.current = null
      // 折叠时保留用户当前宽度（不重置默认）：重新展开与 peek 都沿用这个宽度
      window.localStorage.setItem('chevoink:studio-sidebar-width', String(Math.round(width)))
      onWidthChangeRef.current?.(width)
      props.onOpenChange(false)
      return
    }
    setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, raw)))
  }
  function finishResize() {
    const state = dragRef.current; dragRef.current = null
    if (state) {
      window.localStorage.setItem('chevoink:studio-sidebar-width', String(Math.round(Math.max(MIN_WIDTH + 17, width))))
      onWidthChangeRef.current?.(width)
    }
  }

  function showPeek() {
    if (peekCloseTimerRef.current !== null) window.clearTimeout(peekCloseTimerRef.current)
    peekCloseTimerRef.current = null
    setPeek(true)
  }
  function schedulePeekClose() {
    if (peekCloseTimerRef.current !== null) window.clearTimeout(peekCloseTimerRef.current)
    peekCloseTimerRef.current = window.setTimeout(() => {
      setPeek(false)
      setProductMenu(false)
      setMoreMenu(false)
      setAccountOpen(false)
      peekCloseTimerRef.current = null
    }, 180)
  }

  const projectTasks = (novelId: string): SidebarTask[] => {
    const remote = (sessionsByNovel.get(novelId) ?? []).map((session) => ({ ...session, temporary: false }))
    if (novelId !== props.currentNovelId) return sortWorkspaceItemsByLatest(remote)
    const localIds = new Set(localTasks.map((task) => task.id))
    return sortWorkspaceItemsByLatest([...localTasks, ...remote.filter((task) => !localIds.has(task.id))])
  }
  const pinnedNovels = sortWorkspaceItemsByLatest(novels.filter((item) => item.pinnedAt))
  const pinnedSessions = sortWorkspaceItemsByLatest(sessions.filter((item) => item.pinnedAt))

  function taskRow(task: SidebarTask, compact = false) {
    const active = task.id === props.activeTaskId
    return <button key={`${task.novelId}:${task.id}`} type="button" onClick={() => props.onSelectTask(task.id, task.novelId)} onContextMenu={(event) => openContext(event, { kind: 'task', id: task.id, novelId: task.novelId, title: task.title, pinned: Boolean(task.pinnedAt), temporary: task.temporary })} disabled={props.taskSwitchLocked} className={cn('group flex w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[12px] transition-colors disabled:opacity-50', compact ? 'h-8' : 'h-9', active ? 'bg-[var(--surface-muted)] font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]')} aria-current={active ? 'page' : undefined}><span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-emerald-500' : 'bg-[var(--text-tertiary)]/35')} /><span className="min-w-0 flex-1 truncate">{task.title || '新任务'}</span>{task.pinnedAt ? <Pin className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" /> : null}</button>
  }

  function body(preview = false) {
    return <div className="relative flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
      <div className="flex h-12 shrink-0 items-center gap-1.5 px-3">
        <div className="relative min-w-0 flex-1">
          <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={() => setProductMenu((value) => !value)} className="flex h-8 max-w-full items-center gap-2 rounded-[9px] px-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><ChevoinkAgentMark className="h-5 w-5 shrink-0" /><span key={props.perspective} className="truncate motion-safe:animate-[mode-label-in_180ms_cubic-bezier(.22,1,.36,1)]">{props.perspective === 'work' ? 'Work' : 'IDE'}</span><ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-tertiary)] transition-transform', productMenu && 'rotate-180')} /></button>
          {productMenu ? <div onMouseDown={(event) => event.stopPropagation()} className="absolute left-0 top-[calc(100%+5px)] z-50 w-64 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1.5 shadow-[0_18px_50px_rgba(15,23,42,.18)]">{([{ id: 'work' as const, title: 'Work', description: '协作、任务与创作' }, { id: 'ide' as const, title: 'IDE', description: '结构、正文与预览' }]).map((item) => <button key={item.id} type="button" onClick={() => { props.onPerspectiveChange(item.id); setProductMenu(false) }} disabled={!props.perspectiveSwitchEnabled} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left hover:bg-[var(--surface-muted)] disabled:opacity-50"><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.title}</p><p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{item.description}</p></div>{props.perspective === item.id ? <Check className="h-4 w-4" /> : null}</button>)}</div> : null}
        </div>
        <button type="button" onClick={() => setSearchOpen(true)} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="搜索作品与任务" title="搜索（Ctrl+K）"><Search className="h-4 w-4" /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 [scrollbar-width:thin]">
        <div className="space-y-0.5 pb-3">
          <button type="button" onClick={props.onCreateTask} disabled={props.taskSwitchLocked} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs font-medium hover:bg-[var(--surface-muted)] disabled:opacity-45"><PencilLine className="h-4 w-4" /><span className="flex-1">新对话</span><Plus className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
          <button type="button" onClick={() => props.onAutoFollowChange(!props.autoFollow)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><Crosshair className="h-4 w-4" /><span className="flex-1">正文追踪</span><span className="text-[10px] text-[var(--text-tertiary)]">{props.autoFollow ? '已开启' : '已关闭'}</span></button>
          <button type="button" onClick={() => props.onOpenStudioSettings('operations')} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><Bot className="h-4 w-4" /><span className="flex-1">Agent 与定时</span></button>
          <div className="relative"><button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={() => setMoreMenu((value) => !value)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><MoreHorizontal className="h-4 w-4" />更多</button>{moreMenu ? <div onMouseDown={(event) => event.stopPropagation()} className="absolute left-2 right-2 top-full z-40 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1 shadow-xl"><button type="button" onClick={() => props.onOpenStudioSettings('archives')} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-xs hover:bg-[var(--surface-muted)]"><Archive className="h-3.5 w-3.5" />归档内容</button><button type="button" onClick={() => props.onOpenStudioSettings('general')} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-xs hover:bg-[var(--surface-muted)]"><Settings2 className="h-3.5 w-3.5" />创作区设置</button></div> : null}</div>
        </div>

        {pinnedNovels.length || pinnedSessions.length ? <section className="pb-4"><p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--text-tertiary)]">置顶</p>{pinnedNovels.map((novel) => <button key={novel.id} type="button" onClick={() => props.onSelectNovel(novel.id)} onContextMenu={(event) => openContext(event, { kind: 'novel', id: novel.id, title: novelTitle(novel), pinned: true })} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"><BookOpenText className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{novelTitle(novel)}</span><Pin className="h-3 w-3" /></button>)}{pinnedSessions.map((session) => taskRow({ ...session, temporary: false }, true))}</section> : null}

        <section><div className="flex items-center justify-between px-2 pb-1.5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--text-tertiary)]">作品</p><button type="button" onClick={props.onCreateNovel} disabled={props.switchingNovel} className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)] disabled:opacity-40" aria-label="新建作品"><Plus className="h-3.5 w-3.5" /></button></div>
          {props.novelsLoading ? <p className="px-2 py-3 text-xs text-[var(--text-tertiary)]">正在读取作品…</p> : novels.map((novel) => {
            const title = novelTitle(novel); const tasks = projectTasks(novel.id); const expanded = expandedProjects.has(novel.id); const shown = expanded ? tasks : tasks.slice(0, 5)
            return <div key={novel.id} className="mb-1"><button type="button" onClick={() => { props.onSelectNovel(novel.id); setExpandedProjects((current) => new Set(current).add(novel.id)) }} onContextMenu={(event) => openContext(event, { kind: 'novel', id: novel.id, title, pinned: Boolean(novel.pinnedAt) })} className={cn('flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs', novel.id === props.currentNovelId ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]')}><BookOpenText className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{title}</span><span className="text-[9px] tabular-nums text-[var(--text-tertiary)]">{tasks.length || `${novel.chapterCount}章`}</span></button><div className="ml-5">{shown.map((task) => taskRow(task))}{tasks.length > 5 ? <button type="button" onClick={() => setExpandedProjects((current) => { const next = new Set(current); if (next.has(novel.id)) next.delete(novel.id); else next.add(novel.id); return next })} className="flex h-8 items-center gap-1 px-2 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">{expanded ? '收起' : `展开全部 ${tasks.length} 条`}<ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} /></button> : null}</div></div>
          })}
        </section>
      </div>

      <div className="relative shrink-0 border-t border-[var(--border-subtle)]" ref={accountRef}>
        {warningThreshold && !warningDismissed ? <div className="mx-2 my-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-2.5 text-[10px]"><div className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5 text-amber-500" /><span className="flex-1">剩余 {remainingPercent}% 使用量</span><button type="button" onClick={() => { if (summary?.resetsAt) window.localStorage.setItem(`chevoink:credit-warning:${summary.resetsAt}:${warningThreshold}`, 'dismissed'); setWarningDismissed(true) }} aria-label="关闭提醒"><X className="h-3 w-3" /></button></div></div> : null}
        <button type="button" onClick={() => setAccountOpen((value) => !value)} className="flex h-11 w-full items-center gap-2.5 px-3 text-left hover:bg-[var(--surface-muted)]" aria-expanded={accountOpen}><Avatar name={sessionUser?.nickname ?? '创作者'} src={sessionUser?.avatarUrl} size="sm" className="h-7 w-7" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{sessionUser?.nickname ?? '创作者'}</span><ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-tertiary)] transition-transform', accountOpen && 'rotate-180')} /></button>
        {accountOpen ? <div className="absolute bottom-[calc(100%-2px)] left-2 right-2 z-[70] overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1.5 shadow-[0_20px_55px_rgba(15,23,42,.22)] motion-safe:origin-bottom motion-safe:animate-[agent-menu-in_150ms_cubic-bezier(.2,.8,.2,1)]"><div className="mb-1 flex items-center gap-2 rounded-[10px] bg-emerald-600 px-3 py-2.5 text-[11px] text-white shadow-[0_5px_16px_rgba(5,150,105,.18)]"><Gift className="h-3.5 w-3.5" /><span className="font-medium">公测期间，每日送 450 Credits！</span></div><button type="button" onClick={() => setUsageExpanded((value) => !value)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-xs font-medium hover:bg-[var(--surface-muted)]"><Gauge className="h-3.5 w-3.5" /><span className="flex-1">剩余用量</span><ChevronDown className={cn('h-3.5 w-3.5 transition-transform', usageExpanded && 'rotate-180')} /></button>{usageExpanded ? <div className="mx-1 mb-1 rounded-[10px] bg-[var(--surface-muted)] px-3 py-2.5 text-[11px]"><div className="flex items-end justify-between"><div><p className="text-[var(--text-tertiary)]">当前可用</p><p className="mt-0.5 text-base font-semibold tabular-nums">{summary ? formatCreditAmount(summary.totalRemaining) : '—'} <span className="text-[10px] font-normal">Credits</span></p></div><span className="text-[10px] text-[var(--text-tertiary)]">{remainingPercent}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--border-subtle)]"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${remainingPercent}%` }} /></div><div className="mt-2 flex justify-between text-[10px] text-[var(--text-tertiary)]"><span>每日 {formatCreditAmount(summary?.dailyAllowance ?? 450)} Credits</span><span>{resetLabel(summary?.resetsAt)}</span></div><button type="button" onClick={() => navigate('/account/usage')} className="mt-2 text-[10px] font-medium hover:underline">查看详细记录 →</button></div> : null}<button type="button" onClick={openInvite} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-xs hover:bg-[var(--surface-muted)]"><Gift className="h-3.5 w-3.5" />邀请好友</button><button type="button" onClick={() => { setAccountOpen(false); props.onOpenStudioSettings('general') }} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-xs hover:bg-[var(--surface-muted)]"><Settings2 className="h-3.5 w-3.5" />创作区设置</button><button type="button" onClick={() => navigate('/')} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-xs hover:bg-[var(--surface-muted)]"><Home className="h-3.5 w-3.5" />返回首页</button></div> : null}
      </div>
      {!preview ? <div role="separator" aria-label="调整左侧栏宽度" onPointerDown={beginResize} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize} className="absolute inset-y-0 -right-1 z-40 w-2 cursor-col-resize touch-none before:absolute before:inset-y-0 before:left-1 before:w-px before:bg-transparent hover:before:bg-emerald-500/55" /> : null}
    </div>
  }

  const peekWidth = Math.min(width, PEEK_MAX_WIDTH)

  const foundSessions = searchText.trim() ? (searchQuery.data?.items ?? []) : sessions.slice(0, 10)
  const needle = searchText.trim().toLocaleLowerCase()
  const foundNovels = novels.filter((item) => !needle || novelTitle(item).toLocaleLowerCase().includes(needle))

  return <>
    <aside className={cn('relative z-30 h-full min-h-0 shrink-0 overflow-visible border-r bg-[var(--app-bg)] transition-[width,border-color] duration-200 ease-[cubic-bezier(.22,1,.36,1)]', props.open ? 'border-[var(--border-subtle)]' : 'border-transparent')} style={{ width: props.open ? width : 0 }} data-workspace-sidebar={props.open ? 'open' : 'collapsed'}>{props.open ? body() : null}</aside>
    {!props.open ? <div className="fixed bottom-0 left-0 top-12 z-50 overflow-visible transition-[width] duration-200 ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: peek ? peekWidth : 12 }} onMouseEnter={showPeek} onMouseLeave={schedulePeekClose}><aside className={cn('h-full border-r border-[var(--border-subtle)] bg-[var(--app-bg)] shadow-[12px_0_34px_rgba(15,23,42,.14)] transition-[opacity,transform] duration-180 ease-out', peek ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-3 opacity-0')} style={{ width: peekWidth }}>{body(true)}</aside></div> : null}

    {searchOpen ? <div className="fixed inset-0 z-[180] flex items-start justify-center bg-black/25 px-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={() => setSearchOpen(false)}><section role="dialog" aria-modal="true" aria-label="搜索作品、任务与聊天记录" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_28px_90px_rgba(15,23,42,.24)]"><div className="flex h-14 items-center gap-3 border-b border-[var(--border-subtle)] px-4"><Search className="h-4 w-4 text-[var(--text-tertiary)]" /><input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索作品、任务或聊天记录" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><kbd className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">Esc</kbd></div><div className="max-h-[62vh] overflow-y-auto p-2"><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--text-tertiary)]">作品</p>{foundNovels.map((item) => <button key={item.id} type="button" onClick={() => { props.onSelectNovel(item.id); setSearchOpen(false) }} className="flex h-10 w-full items-center gap-3 rounded-[9px] px-3 text-left text-xs hover:bg-[var(--surface-muted)]"><BookOpenText className="h-4 w-4 text-[var(--text-tertiary)]" /><span className="flex-1 truncate">{novelTitle(item)}</span><span className="text-[10px] text-[var(--text-tertiary)]">作品</span></button>)}<p className="mt-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--text-tertiary)]">任务与聊天记录</p>{foundSessions.map((session) => <button key={session.id} type="button" onClick={() => { props.onSelectTask(session.id, session.novelId); setSearchOpen(false) }} className="flex h-10 w-full items-center gap-3 rounded-[9px] px-3 text-left text-xs hover:bg-[var(--surface-muted)]"><Clock3 className="h-4 w-4 text-[var(--text-tertiary)]" /><span className="min-w-0 flex-1 truncate">{session.title}</span><span className="max-w-36 truncate text-[10px] text-[var(--text-tertiary)]">{session.novelTitle ?? '任务'}</span></button>)}{needle && !foundNovels.length && !foundSessions.length ? <p className="px-3 py-10 text-center text-xs text-[var(--text-tertiary)]">没有找到相关作品、任务或聊天记录</p> : null}</div></section></div> : null}

    {context ? <div onMouseDown={(event) => event.stopPropagation()} className="fixed z-[190] w-44 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1 shadow-2xl" style={{ left: Math.min(context.x, window.innerWidth - 190), top: Math.min(context.y, window.innerHeight - 150) }}><button type="button" disabled={busy || ('temporary' in context && context.temporary)} onClick={() => void togglePin(context)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-xs hover:bg-[var(--surface-muted)] disabled:opacity-40">{context.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}{context.pinned ? '取消置顶' : '置顶'}</button><button type="button" disabled={busy} onClick={() => beginRename(context)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-xs hover:bg-[var(--surface-muted)]"><PencilLine className="h-3.5 w-3.5" />重命名</button><button type="button" disabled={busy || ('temporary' in context && context.temporary)} onClick={() => void archive(context)} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-xs text-amber-700 hover:bg-[var(--surface-muted)] disabled:opacity-40"><Archive className="h-3.5 w-3.5" />归档</button></div> : null}
    {rename ? <div className="fixed inset-0 z-[195] flex items-center justify-center bg-black/25 p-4" onMouseDown={() => setRename(null)}><form onSubmit={(event) => { event.preventDefault(); void commitRename() }} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-5 shadow-2xl"><h2 className="text-sm font-semibold">重命名{rename.kind === 'novel' ? '作品' : '任务'}</h2><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={160} className="mt-4 h-10 w-full rounded-[9px] border border-[var(--border-subtle)] bg-transparent px-3 text-sm outline-none focus:border-[var(--border-strong)]" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRename(null)} className="h-9 rounded-[9px] px-3 text-xs hover:bg-[var(--surface-muted)]">取消</button><button type="submit" disabled={busy || !renameValue.trim()} className="h-9 rounded-[9px] bg-[var(--surface-contrast)] px-4 text-xs font-medium text-[var(--text-contrast)] disabled:opacity-45">保存</button></div></form></div> : null}
    <InviteCreditsDialog open={inviteOpen} referral={referralQuery.data ?? null} copied={inviteCopied} onCopy={() => void copyInvite()} onClose={() => { autoCopyRef.current = false; setInviteOpen(false) }} />
  </>
}
