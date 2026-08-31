import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CircleGauge, Gift, LoaderCircle, Settings, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import AppImage from '@/components/ui/AppImage'
import Button from '@/components/ui/Button'
import { brandMeta } from '@/lib/theme/tokens'
import { useShellStore } from '@/store/useShellStore'
import { fetchCreditUsage, fetchReferral } from './credits-api'
import InviteCreditsDialog from './InviteCreditsDialog'
import { formatCreditAmount, roundCreditAmount } from './credit-format'
import type { CreditLedgerItem } from '../../../shared/contracts'

const SOURCE_LABELS: Record<string, string> = {
  model_tokens: '文本模型',
  image_generation: '图片生成',
  web_search: '联网搜索',
  referral_inviter: '邀请奖励',
  referral_invitee: '受邀奖励',
  admin_reset: '管理员重置',
  admin_reset_all: '管理员全体重置',
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function LedgerRow({ item }: { item: CreditLedgerItem }) {
  const displayedDelta = roundCreditAmount(item.delta)
  const positive = displayedDelta > 0
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--border-subtle)] py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {item.kind === 'refund' ? '失败调用返还' : SOURCE_LABELS[item.sourceType] ?? item.sourceType}
        </p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          {formatDateTime(item.createdAt)}
          {item.requestTokens !== null || item.responseTokens !== null
            ? ` · 输入 ${new Intl.NumberFormat('zh-CN').format(item.requestTokens ?? 0)} / 输出 ${new Intl.NumberFormat('zh-CN').format(item.responseTokens ?? 0)}`
            : ''}
        </p>
      </div>
      <span className={`text-sm font-medium tabular-nums ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-primary)]'}`}>
        {positive ? '+' : ''}{formatCreditAmount(displayedDelta)}
      </span>
    </li>
  )
}

export default function AccountUsagePage() {
  const navigate = useNavigate()
  const sessionUser = useShellStore((state) => state.sessionUser)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const autoCopyInviteRef = useRef(false)
  const usageQuery = useQuery({ queryKey: ['credits', 'usage'], queryFn: fetchCreditUsage, staleTime: 20_000 })
  const referralQuery = useQuery({ queryKey: ['credits', 'referral'], queryFn: fetchReferral, staleTime: 60_000 })

  const usage = usageQuery.data
  const summary = usage?.account
  const resetLabel = useMemo(() => summary ? formatDateTime(summary.resetsAt) : '—', [summary])

  useEffect(() => {
    if (!inviteOpen) setCopied(false)
  }, [inviteOpen])

  const copyInviteLink = useCallback(async () => {
    const url = referralQuery.data?.inviteUrl
    if (!url || !navigator.clipboard) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }, [referralQuery.data?.inviteUrl])

  const openInvite = useCallback(async () => {
    setInviteOpen(true)
    autoCopyInviteRef.current = true
    if (referralQuery.data?.inviteUrl && navigator.clipboard) {
      autoCopyInviteRef.current = false
      try {
        await navigator.clipboard.writeText(referralQuery.data.inviteUrl)
        setCopied(true)
      } catch {
        // 浏览器拒绝自动写入时，弹窗内仍提供显式复制按钮。
      }
    }
  }, [referralQuery.data?.inviteUrl])

  useEffect(() => {
    if (!inviteOpen || !autoCopyInviteRef.current || !referralQuery.data?.inviteUrl) return
    autoCopyInviteRef.current = false
    void copyInviteLink()
  }, [copyInviteLink, inviteOpen, referralQuery.data?.inviteUrl])

  if (usageQuery.isLoading) {
    return <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-[#f6f6f4]"><LoaderCircle className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" /></div>
  }

  if (!summary || !usage || usageQuery.isError) {
    return (
      <main className="flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-y-auto bg-[#f6f6f4] px-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">暂时无法读取额度信息。</p>
        <Button onClick={() => void usageQuery.refetch()}>重新加载</Button>
      </main>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[#f6f6f4] text-[var(--text-primary)] [scrollbar-gutter:stable] dark:bg-[var(--app-bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-white/90 backdrop-blur-xl dark:bg-[color:var(--app-bg)]/92">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <button type="button" onClick={() => navigate('/studio')} className="flex items-center gap-3 text-left">
            <AppImage src="/favicon.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-semibold tracking-tight">{brandMeta.productName}</span>
          </button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/studio')}>
            <ArrowLeft className="h-4 w-4" /> 返回创作区
          </Button>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100%-4rem)] max-w-[1280px] gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 lg:py-10">
        <aside className="hidden self-stretch border-r border-[var(--border-subtle)] pr-7 lg:block">
          <div className="sticky top-24"><p className="mb-1 truncate text-sm font-semibold">{sessionUser?.nickname ?? '创作者'}</p><p className="mb-7 text-xs text-[var(--text-tertiary)]">{summary.planLabel}</p>
          <nav className="space-y-1">
            <div className="flex items-center gap-3 rounded-[10px] bg-white px-3 py-2.5 text-sm font-medium shadow-[0_1px_0_rgba(15,23,42,.03)] dark:bg-[var(--surface-muted)]">
              <CircleGauge className="h-4 w-4" /> 用量
            </div>
            <div className="flex cursor-not-allowed items-center gap-3 px-[14px] py-2.5 text-sm text-[var(--text-tertiary)]" title="公测阶段暂未开放">
              <Settings className="h-4 w-4" /> 账户设置 <span className="ml-auto text-[10px]">稍后开放</span>
            </div>
          </nav></div>
        </aside>

        <main className="min-w-0">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm text-[var(--text-tertiary)]">{sessionUser?.nickname ?? '创作者'} · {summary.planLabel}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">用量明细</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              每日额度在 UTC+8 15:00 重置；邀请奖励单独累计，不随每日重置清零。
            </p>
          </div>

          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-[16px] border border-[#e8e8e5] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,.02)] sm:p-6 dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]"><div className="flex items-start justify-between gap-5"><div><h2 className="text-base font-medium">每日公测额度</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">每日自动补充，可用于内置模型与 Agent 工具。</p></div><p className="text-sm tabular-nums text-[var(--text-secondary)]">剩余 <strong className="text-[var(--text-primary)]">{formatCreditAmount(Math.max(0, summary.dailyAllowance - summary.dailyUsed))}</strong></p></div><p className="mt-5 text-lg font-medium tabular-nums">{formatCreditAmount(summary.dailyUsed)} / {formatCreditAmount(summary.dailyAllowance)} <span className="text-sm font-normal text-[var(--text-secondary)]">（已使用 {summary.usedPercent}%）</span></p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eeeeeb] dark:bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[#1d2939] transition-[width] duration-500 dark:bg-white" style={{ width: `${Math.min(100, Math.max(0, summary.usedPercent))}%` }} /></div><p className="mt-3 text-xs text-[var(--text-tertiary)]">下次重置：{resetLabel}</p></article>
            <article className="rounded-[16px] border border-[#e8e8e5] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,.02)] sm:p-6 dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]"><div className="flex items-start justify-between gap-5"><div><h2 className="text-base font-medium">奖励额度</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">邀请奖励长期有效，不随每日额度重置。</p></div><p className="text-sm tabular-nums text-[var(--text-secondary)]">剩余 <strong className="text-[var(--text-primary)]">{formatCreditAmount(summary.bonusRemaining)}</strong></p></div><p className="mt-5 text-lg font-medium tabular-nums">当前总可用 {formatCreditAmount(summary.totalRemaining)} Credits</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eeeeeb] dark:bg-[var(--surface-muted)]"><div className="h-full w-full rounded-full bg-emerald-500/75" /></div></article>
          </section>

          <section className="mt-5 flex flex-col justify-between gap-5 rounded-[14px] border border-[#ececea] bg-[#f1f1ef] p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex items-start gap-3">
              <Gift className="mt-0.5 h-5 w-5 shrink-0" />
              <div><h2 className="text-base font-semibold">邀请好友获得额外额度</h2><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">每位成功注册的新好友为你增加 300 Credits，不受每日重置影响。</p></div>
            </div>
            <Button variant="primary" onClick={() => void openInvite()} className="sm:shrink-0"><Sparkles className="h-4 w-4" /> 邀请好友</Button>
          </section>

          <section className="mt-10 rounded-[14px] border border-[#ececea] bg-white/55 p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-base font-semibold">Credits 计费规则</h2>
              <p className="text-xs text-[var(--text-tertiary)]">输入与输出按实际用量相加扣除</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <div><p className="text-xs text-[var(--text-tertiary)]">输入 Token</p><p className="mt-1 text-sm font-medium">10,000 = 1 Credit</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">输出 Token</p><p className="mt-1 text-sm font-medium">1,000 = 1 Credit</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">图片生成</p><p className="mt-1 text-sm font-medium">每次 6 Credits</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">联网搜索</p><p className="mt-1 text-sm font-medium">每次 2 Credits</p></div>
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-semibold">Credits 记录</h2><span className="text-xs text-[var(--text-tertiary)]">最近 {usage.ledger.length} 条</span></div>
            {usage.ledger.length > 0 ? <ul className="mt-3">{usage.ledger.map((item) => <LedgerRow key={item.id} item={item} />)}</ul> : <div className="mt-5 border-y border-[var(--border-subtle)] py-12 text-center text-sm text-[var(--text-tertiary)]">还没有 Credits 记录</div>}
          </section>
        </main>
      </div>

      <InviteCreditsDialog open={inviteOpen} referral={referralQuery.data ?? null} copied={copied} onCopy={() => void copyInviteLink()} onClose={() => { autoCopyInviteRef.current = false; setInviteOpen(false) }} />
    </div>
  )
}
