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

function formatCredits(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value)
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

function UsageRing({ usedPercent }: { usedPercent: number }) {
  const clamped = Math.min(100, Math.max(0, usedPercent))
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  return (
    <div className="relative h-28 w-28 shrink-0" aria-label={`每日额度已使用 ${clamped}%`}>
      <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="52" cy="52" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="7" />
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">{clamped}%</strong>
        <span className="text-[11px] text-[var(--text-tertiary)]">已使用</span>
      </div>
    </div>
  )
}

function LedgerRow({ item }: { item: CreditLedgerItem }) {
  const positive = item.delta > 0
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
        {positive ? '+' : ''}{formatCredits(item.delta)}
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
    return <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)]"><LoaderCircle className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" /></div>
  }

  if (!summary || !usage || usageQuery.isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--app-bg)] px-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">暂时无法读取额度信息。</p>
        <Button onClick={() => void usageQuery.refetch()}>重新加载</Button>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[color:var(--app-bg)]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-6">
          <button type="button" onClick={() => navigate('/studio')} className="flex items-center gap-3 text-left">
            <AppImage src="/favicon.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-semibold tracking-tight">{brandMeta.productName}</span>
          </button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/studio')}>
            <ArrowLeft className="h-4 w-4" /> 返回创作区
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:py-12">
        <aside className="hidden lg:block">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-tertiary)]">ChevoInk 账户</p>
          <nav className="space-y-1">
            <div className="flex items-center gap-3 border-l-2 border-[var(--text-primary)] px-3 py-2.5 text-sm font-medium">
              <CircleGauge className="h-4 w-4" /> 用量
            </div>
            <div className="flex cursor-not-allowed items-center gap-3 px-[14px] py-2.5 text-sm text-[var(--text-tertiary)]" title="公测阶段暂未开放">
              <Settings className="h-4 w-4" /> 账户设置 <span className="ml-auto text-[10px]">稍后开放</span>
            </div>
          </nav>
        </aside>

        <main className="min-w-0">
          <div className="mb-8">
            <p className="text-sm text-[var(--text-tertiary)]">{sessionUser?.nickname ?? '创作者'} · {summary.planLabel}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">用量与额度</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              每日额度在 UTC+8 15:00 重置；邀请奖励单独累计，不随每日重置清零。
            </p>
          </div>

          <section className="border-y border-[var(--border-strong)] py-6 sm:py-8">
            <div className="flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.13em] text-[var(--text-tertiary)]">当前可用</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">{formatCredits(summary.totalRemaining)}</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Credits</p>
              </div>
              <UsageRing usedPercent={summary.usedPercent} />
            </div>
            <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-[var(--border-subtle)] pt-6 sm:grid-cols-4">
              <div><p className="text-xs text-[var(--text-tertiary)]">每日额度</p><p className="mt-1 text-sm font-medium tabular-nums">{formatCredits(summary.dailyAllowance)}</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">今日已用</p><p className="mt-1 text-sm font-medium tabular-nums">{formatCredits(summary.dailyUsed)}</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">奖励余额</p><p className="mt-1 text-sm font-medium tabular-nums">{formatCredits(summary.bonusRemaining)}</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">下次重置</p><p className="mt-1 text-sm font-medium tabular-nums">{resetLabel}</p></div>
            </div>
          </section>

          <section className="mt-10 flex flex-col justify-between gap-5 border-b border-[var(--border-strong)] pb-8 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <Gift className="mt-0.5 h-5 w-5 shrink-0" />
              <div><h2 className="text-base font-semibold">邀请好友获得额外额度</h2><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">每位成功注册的新好友为你增加 300 Credits，不受每日重置影响。</p></div>
            </div>
            <Button variant="primary" onClick={() => void openInvite()} className="sm:shrink-0"><Sparkles className="h-4 w-4" /> 邀请好友</Button>
          </section>

          <section className="mt-10 border-y border-[var(--border-subtle)] py-6">
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
