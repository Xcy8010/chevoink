import { useQuery } from '@tanstack/react-query'
import {
  BookOpenText,
  ChevronDown,
  ChevronLeft,
  Coins,
  Crosshair,
  Gauge,
  Gift,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Settings2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Avatar from '@/features/community/components/Avatar'
import { fetchCreditSummary, fetchReferral } from '@/features/account/credits-api'
import InviteCreditsDialog from '@/features/account/InviteCreditsDialog'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/useShellStore'
import type { Novel } from '../../../../shared/contracts/index.js'
import ChevoinkAgentMark from '../agent/components/ChevoinkAgentMark'
import WorkspaceNovelSwitcher from './WorkspaceNovelSwitcher'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  perspective: 'work' | 'ide'
  perspectiveSwitchEnabled: boolean
  onPerspectiveChange: (value: 'work' | 'ide') => void
  currentNovelId: string
  currentNovelTitle: string
  novels: Novel[]
  novelsLoading?: boolean
  switchingNovel?: boolean
  onSelectNovel: (novelId: string) => void
  onCreateNovel: () => void
  autoFollow: boolean
  onAutoFollowChange: (enabled: boolean) => void
}

function getNovelTitle(novel: Novel) {
  return novel.displayTitle?.trim() || novel.title || '未命名作品'
}

function remainingLabel(value: number) {
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万`
  return value.toLocaleString('zh-CN')
}

function formatCreditReset(value?: string | null) {
  if (!value) return '稍后自动重置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '稍后自动重置'
  return `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 重置`
}

/**
 * 桌面创作壳层的一级导航。作品与账户属于这里；任务对话仍由旁边独立细轨负责，
 * 避免把“切作品”和“切对话”揉成一棵难扫描的树。
 */
export default function StudioWorkspaceSidebar({
  open,
  onOpenChange,
  perspective,
  perspectiveSwitchEnabled,
  onPerspectiveChange,
  currentNovelId,
  currentNovelTitle,
  novels,
  novelsLoading = false,
  switchingNovel = false,
  onSelectNovel,
  onCreateNovel,
  autoFollow,
  onAutoFollowChange,
}: Props) {
  const navigate = useNavigate()
  const sessionUser = useShellStore((state) => state.sessionUser)
  const [peekVisible, setPeekVisible] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [warningDismissed, setWarningDismissed] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const autoCopyInviteRef = useRef(false)

  const creditQuery = useQuery({
    queryKey: ['credits', 'summary'],
    queryFn: fetchCreditSummary,
    staleTime: 20_000,
    refetchInterval: 60_000,
  })
  const referralQuery = useQuery({
    queryKey: ['credits', 'referral'],
    queryFn: fetchReferral,
    staleTime: 60_000,
    enabled: inviteOpen,
  })

  const summary = creditQuery.data
  const remainingPercent = summary?.dailyAllowance
    ? Math.max(0, Math.min(100, Math.round((summary.totalRemaining / summary.dailyAllowance) * 100)))
    : 100
  const warningThreshold: 5 | 10 | 20 | null = remainingPercent <= 5
    ? 5
    : remainingPercent <= 10
      ? 10
      : remainingPercent <= 20
        ? 20
        : null

  useEffect(() => {
    const key = summary?.resetsAt && warningThreshold
      ? `chevoink:credit-warning:${summary.resetsAt}:${warningThreshold}`
      : null
    setWarningDismissed(Boolean(key && window.localStorage.getItem(key) === 'dismissed'))
  }, [summary?.resetsAt, warningThreshold])

  useEffect(() => {
    if (!accountMenuOpen) return
    const close = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [accountMenuOpen])

  const copyInvite = useCallback(async () => {
    const url = referralQuery.data?.inviteUrl
    if (!url || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
      window.setTimeout(() => setInviteCopied(false), 1800)
    } catch {
      // 浏览器拒绝自动复制时仍保留弹窗内的显式按钮。
    }
  }, [referralQuery.data?.inviteUrl])

  useEffect(() => {
    if (!inviteOpen || !autoCopyInviteRef.current || !referralQuery.data?.inviteUrl) return
    autoCopyInviteRef.current = false
    void copyInvite()
  }, [copyInvite, inviteOpen, referralQuery.data?.inviteUrl])

  const openInvite = useCallback(() => {
    setAccountMenuOpen(false)
    setInviteOpen(true)
    autoCopyInviteRef.current = true
    if (referralQuery.data?.inviteUrl) {
      autoCopyInviteRef.current = false
      void copyInvite()
    }
  }, [copyInvite, referralQuery.data?.inviteUrl])

  const renderBody = (peek = false) => (
    <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
        <ChevoinkAgentMark className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">Chevoink</span>
        <button
          type="button"
          onClick={() => {
            if (peek) setPeekVisible(false)
            else onOpenChange(false)
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          aria-label={peek ? '关闭临时侧栏' : '折叠左侧栏'}
          title={peek ? '关闭临时侧栏' : '折叠左侧栏'}
        >
          {peek ? <ChevronLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:none]">
        {perspectiveSwitchEnabled ? (
          <div className="relative grid h-8 grid-cols-2 bg-[var(--surface-muted)] p-0.5" aria-label="切换创作模式">
            <span
              aria-hidden
              className={cn(
                'absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] bg-[var(--surface-default)] shadow-sm transition-transform duration-200 ease-out',
                perspective === 'ide' && 'translate-x-full',
              )}
            />
            {([
              { key: 'work' as const, label: 'Work', icon: BookOpenText },
              { key: 'ide' as const, label: 'IDE', icon: PenLine },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onPerspectiveChange(key)}
                aria-pressed={perspective === key}
                className={cn(
                  'relative inline-flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors',
                  perspective === key ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3">
          <WorkspaceNovelSwitcher
            fullWidth
            currentNovelId={currentNovelId}
            currentNovelTitle={currentNovelTitle}
            novels={novels}
            loading={novelsLoading}
            busy={switchingNovel}
            onSelectNovel={onSelectNovel}
            onCreateNovel={onCreateNovel}
          />
        </div>

        <button
          type="button"
          onClick={() => onAutoFollowChange(!autoFollow)}
          aria-pressed={autoFollow}
          className={cn(
            'mt-2 flex h-9 w-full items-center gap-2 px-2.5 text-left text-xs transition-colors',
            autoFollow
              ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
          )}
        >
          <Crosshair className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">正文追踪</span>
          <span className="text-[10px] opacity-70">{autoFollow ? '已开启' : '已关闭'}</span>
        </button>

        <div className="mt-5 flex items-center justify-between px-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">作品</p>
          <button
            type="button"
            onClick={onCreateNovel}
            disabled={switchingNovel}
            className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"
            aria-label="新建作品"
            title="新建作品"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1 space-y-0.5">
          {novels.map((novel) => {
            const active = novel.id === currentNovelId
            const title = getNovelTitle(novel)
            return (
              <button
                key={novel.id}
                type="button"
                onClick={() => onSelectNovel(novel.id)}
                className={cn(
                  'group flex h-9 w-full items-center gap-2 px-2.5 text-left text-xs transition-colors',
                  active ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <BookOpenText className="h-3.5 w-3.5 shrink-0 opacity-75" />
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <span className="shrink-0 text-[9px] tabular-nums text-[var(--text-tertiary)]">{novel.chapterCount} 章</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative shrink-0 border-t border-[var(--border-subtle)]" ref={accountMenuRef}>
        {warningThreshold && !warningDismissed ? (
          <div className="mx-2 my-2 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 text-[11px] leading-4 text-[var(--text-secondary)]">
            <div className="flex items-start gap-2.5">
              <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--text-primary)]">剩余 {remainingPercent}% 使用量</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{formatCreditReset(summary?.resetsAt)}</p>
              </div>
              <button type="button" onClick={() => {
                if (summary?.resetsAt) window.localStorage.setItem(`chevoink:credit-warning:${summary.resetsAt}:${warningThreshold}`, 'dismissed')
                setWarningDismissed(true)
              }} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="关闭额度提醒">×</button>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--border-subtle)]"><div className="h-full rounded-full bg-amber-500" style={{ width: `${remainingPercent}%` }} /></div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => window.open('/account/usage', '_blank', 'noopener,noreferrer')} className="h-7 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]">查看用量</button>
              <button type="button" onClick={openInvite} className="h-7 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]">获取 Credits</button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => window.open('/account/usage', '_blank', 'noopener,noreferrer')}
          className="flex w-full items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
        >
          <Coins className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{summary?.planLabel ?? '公测版'}</span>
          <span className="shrink-0 tabular-nums text-[var(--text-primary)]">{summary ? `${remainingLabel(summary.totalRemaining)} Credits` : '读取中…'}</span>
        </button>
        <button
          type="button"
          onClick={() => setAccountMenuOpen((value) => !value)}
          className="flex h-12 w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
          aria-expanded={accountMenuOpen}
        >
          <Avatar name={sessionUser?.nickname ?? '创作者'} src={sessionUser?.avatarUrl} size="sm" className="h-7 w-7" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">{sessionUser?.nickname ?? '创作者'}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform', accountMenuOpen && 'rotate-180')} />
        </button>

        {accountMenuOpen ? (
          <div className="absolute bottom-[calc(100%+6px)] left-2 right-2 z-50 border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1 shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
            <button type="button" onClick={() => window.open('/account/usage', '_blank', 'noopener,noreferrer')} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><Gauge className="h-3.5 w-3.5" />用量与 Credits</button>
            <button type="button" onClick={openInvite} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><Gift className="h-3.5 w-3.5" />邀请好友</button>
            <button type="button" onClick={() => navigate('/settings')} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><Settings2 className="h-3.5 w-3.5" />设置</button>
            <button type="button" onClick={() => navigate('/')} className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><Home className="h-3.5 w-3.5" />返回首页</button>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <aside
      className="relative z-30 h-full min-h-0 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--app-bg)] transition-[width] duration-200 ease-out"
      style={{ width: open ? 248 : 48 }}
      onMouseEnter={() => { if (!open) setPeekVisible(true) }}
      onMouseLeave={() => { if (!open) setPeekVisible(false) }}
      data-workspace-sidebar={open ? 'open' : 'collapsed'}
    >
      {open ? renderBody() : (
        <div className="flex h-full flex-col items-center py-2">
          <ChevoinkAgentMark className="mt-0.5 h-5 w-5" />
          <button type="button" onClick={() => onOpenChange(true)} className="mt-3 inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="展开左侧栏" title="展开左侧栏"><PanelLeftOpen className="h-4 w-4" /></button>
          <div className="my-3 h-px w-5 bg-[var(--border-subtle)]" />
          <button type="button" onClick={() => onPerspectiveChange(perspective === 'work' ? 'ide' : 'work')} className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label={`切换到 ${perspective === 'work' ? 'IDE' : 'Work'}`} title={`切换到 ${perspective === 'work' ? 'IDE' : 'Work'}`}>{perspective === 'work' ? <BookOpenText className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}</button>
          <button type="button" onClick={() => onAutoFollowChange(!autoFollow)} className={cn('mt-1 inline-flex h-8 w-8 items-center justify-center rounded-[7px] hover:bg-[var(--surface-muted)]', autoFollow ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]')} aria-label="正文追踪" title="正文追踪"><Crosshair className="h-4 w-4" /></button>
          <div className="mt-auto">
            <Avatar name={sessionUser?.nickname ?? '创作者'} src={sessionUser?.avatarUrl} size="sm" className="h-7 w-7" />
          </div>
        </div>
      )}

      {!open ? (
        <div
          className={cn(
            'absolute inset-y-0 left-0 z-40 w-[220px] border-r border-[var(--border-strong)] shadow-[14px_0_34px_rgba(15,23,42,0.10)] transition-[opacity,transform] duration-200 ease-out',
            peekVisible ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-2 opacity-0',
          )}
          aria-hidden={!peekVisible}
        >
          {renderBody(true)}
        </div>
      ) : null}

      <InviteCreditsDialog
        open={inviteOpen}
        referral={referralQuery.data ?? null}
        copied={inviteCopied}
        onCopy={() => void copyInvite()}
        onClose={() => {
          autoCopyInviteRef.current = false
          setInviteOpen(false)
        }}
      />
    </aside>
  )
}
