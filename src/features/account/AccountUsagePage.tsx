import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Gift, LoaderCircle, RefreshCcw, Sparkles } from 'lucide-react'

import Button from '@/components/ui/Button'
import { fetchCreditUsage, fetchReferral } from './credits-api'
import InviteCreditsDialog from './InviteCreditsDialog'
import { formatCreditAmount, roundCreditAmount } from './credit-format'
import AccountLayout from './AccountLayout'
import type { CreditLedgerItem } from '../../../shared/contracts'

const SOURCE_LABELS: Record<string, string> = {
  model_tokens: '文本模型', image_generation: '图片生成', web_search: '联网搜索',
  referral_inviter: '邀请奖励', referral_invitee: '受邀奖励', admin_reset: '管理员重置', admin_reset_all: '管理员全体重置',
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function LedgerRow({ item }: { item: CreditLedgerItem }) {
  const displayedDelta = roundCreditAmount(item.delta)
  const positive = displayedDelta > 0
  const cacheTotal = item.promptCacheHitTokens !== null && item.promptCacheMissTokens !== null
    ? item.promptCacheHitTokens + item.promptCacheMissTokens
    : null
  const cacheLabel = cacheTotal !== null && cacheTotal > 0
    ? ` · 缓存命中 ${Math.round(((item.promptCacheHitTokens ?? 0) / cacheTotal) * 100)}%（${new Intl.NumberFormat('zh-CN').format(item.promptCacheHitTokens ?? 0)}）`
    : ''
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[#efefec] px-5 py-4 last:border-b-0 dark:border-[var(--border-subtle)]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.kind === 'refund' ? '失败调用返还' : SOURCE_LABELS[item.sourceType] ?? item.sourceType}</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          {formatDateTime(item.createdAt)}
          {item.requestTokens !== null || item.responseTokens !== null ? ` · 输入 ${new Intl.NumberFormat('zh-CN').format(item.requestTokens ?? 0)} / 输出 ${new Intl.NumberFormat('zh-CN').format(item.responseTokens ?? 0)}` : ''}
          {cacheLabel}
        </p>
      </div>
      <span className={`text-sm font-medium tabular-nums ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-primary)]'}`}>
        {positive ? '+' : ''}{formatCreditAmount(displayedDelta)}
      </span>
    </li>
  )
}

export default function AccountUsagePage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<'used' | 'earned'>('used')
  const autoCopyInviteRef = useRef(false)
  const usageQuery = useQuery({ queryKey: ['credits', 'usage'], queryFn: fetchCreditUsage, staleTime: 20_000 })
  const referralQuery = useQuery({ queryKey: ['credits', 'referral'], queryFn: fetchReferral, staleTime: 60_000 })
  const usage = usageQuery.data
  const summary = usage?.account
  const resetLabel = useMemo(() => (summary ? formatDateTime(summary.resetsAt) : '—'), [summary])
  const filteredLedger = useMemo(
    () => (usage?.ledger ?? []).filter((item) => (ledgerFilter === 'earned' ? roundCreditAmount(item.delta) > 0 : roundCreditAmount(item.delta) <= 0)),
    [ledgerFilter, usage?.ledger],
  )

  useEffect(() => { if (!inviteOpen) setCopied(false) }, [inviteOpen])
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
      try { await navigator.clipboard.writeText(referralQuery.data.inviteUrl); setCopied(true) } catch { /* 弹窗仍提供显式复制 */ }
    }
  }, [referralQuery.data?.inviteUrl])
  useEffect(() => {
    if (!inviteOpen || !autoCopyInviteRef.current || !referralQuery.data?.inviteUrl) return
    autoCopyInviteRef.current = false
    void copyInviteLink()
  }, [copyInviteLink, inviteOpen, referralQuery.data?.inviteUrl])

  if (usageQuery.isLoading) {
    return <AccountLayout active="usage"><div className="flex min-h-[70vh] items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" /></div></AccountLayout>
  }
  if (!summary || !usage || usageQuery.isError) {
    return (
      <AccountLayout active="usage">
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">暂时无法读取额度信息。</p>
          <Button onClick={() => void usageQuery.refetch()}><RefreshCcw className="h-4 w-4" />重新加载</Button>
        </div>
      </AccountLayout>
    )
  }

  const dailyRemaining = Math.max(0, summary.dailyAllowance - summary.dailyUsed)
  return (
    <AccountLayout active="usage">
      <div className="px-5 py-9 sm:px-8 lg:px-12 lg:py-11">
        <div className="max-w-[1040px]">
          <header>
            <p className="text-xs text-[var(--text-tertiary)]">{summary.planLabel}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">用量明细</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">每日额度在 UTC+8 15:00 重置；邀请奖励独立累计，不随每日重置清零。</p>
          </header>
          <section className="mt-8 grid gap-4 xl:grid-cols-2">
            <article className="rounded-[16px] border border-[#e9e9e6] bg-white p-5 sm:p-6 dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">每日公测额度</h2>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">用于内置模型与 Agent 工具</p>
                </div>
                <span className="text-sm text-[var(--text-secondary)]">剩余 <strong className="text-[var(--text-primary)]">{formatCreditAmount(dailyRemaining)}</strong></span>
              </div>
              <p className="mt-7 text-xl font-semibold tabular-nums">
                {formatCreditAmount(summary.dailyUsed)} <span className="text-sm font-normal text-[var(--text-secondary)]">/ {formatCreditAmount(summary.dailyAllowance)} · 已使用 {summary.usedPercent}%</span>
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f0f0ee] dark:bg-[var(--border-subtle)]">
                <div className="h-full rounded-full bg-[#171b24] transition-[width] duration-500 dark:bg-white" style={{ width: `${Math.min(100, Math.max(0, summary.usedPercent))}%` }} />
              </div>
              <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><CalendarDays className="h-3.5 w-3.5" />下次重置 {resetLabel}</p>
            </article>
            <article className="rounded-[16px] border border-[#e9e9e6] bg-white p-5 sm:p-6 dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">奖励额度</h2>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">邀请奖励长期有效</p>
                </div>
                <span className="text-sm text-[var(--text-secondary)]">剩余 <strong className="text-[var(--text-primary)]">{formatCreditAmount(summary.bonusRemaining)}</strong></span>
              </div>
              <p className="mt-7 text-xl font-semibold tabular-nums">当前总可用 {formatCreditAmount(summary.totalRemaining)} Credits</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f0f0ee] dark:bg-[var(--border-subtle)]">
                <div className="h-full w-full rounded-full bg-emerald-500/75" />
              </div>
              <p className="mt-4 text-xs text-[var(--text-tertiary)]">奖励额度会在每日额度用完后继续抵扣。</p>
            </article>
          </section>
          <section className="mt-5 flex flex-col justify-between gap-5 rounded-[16px] border border-[#e9e9e6] bg-white p-5 sm:flex-row sm:items-center sm:p-6 dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
            <div className="flex items-start gap-3">
              <Gift className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="text-base font-semibold">邀请好友获得额外额度</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">每位成功注册的新好友为你增加 300 Credits，不受每日重置影响。</p>
              </div>
            </div>
            <Button variant="primary" onClick={() => void openInvite()} className="sm:shrink-0"><Sparkles className="h-4 w-4" />邀请好友</Button>
          </section>
          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-[-.02em]">Credits 记录</h2>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">最近 {usage.ledger.length} 条记录</p>
              </div>
              <div className="inline-flex rounded-[9px] bg-[#ececea] p-1 dark:bg-[var(--surface-muted)]">
                <button type="button" onClick={() => setLedgerFilter('used')} className={`h-8 rounded-[7px] px-3 text-xs transition-colors ${ledgerFilter === 'used' ? 'bg-white font-medium shadow-sm dark:bg-[var(--surface-default)]' : 'text-[var(--text-secondary)]'}`}>已使用</button>
                <button type="button" onClick={() => setLedgerFilter('earned')} className={`h-8 rounded-[7px] px-3 text-xs transition-colors ${ledgerFilter === 'earned' ? 'bg-white font-medium shadow-sm dark:bg-[var(--surface-default)]' : 'text-[var(--text-secondary)]'}`}>已获得</button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-[16px] border border-[#e9e9e6] bg-white dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
              {filteredLedger.length > 0 ? (
                <ul>{filteredLedger.map((item) => <LedgerRow key={item.id} item={item} />)}</ul>
              ) : (
                <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">暂无{ledgerFilter === 'used' ? '使用' : '获得'}记录</div>
              )}
            </div>
          </section>
        </div>
      </div>
      <InviteCreditsDialog open={inviteOpen} referral={referralQuery.data ?? null} copied={copied} onCopy={() => void copyInviteLink()} onClose={() => { autoCopyInviteRef.current = false; setInviteOpen(false) }} />
    </AccountLayout>
  )
}
