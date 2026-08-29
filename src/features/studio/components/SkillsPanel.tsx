import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, Check, DatabaseZap, Fingerprint, History, Import, Inbox, LoaderCircle, Plus, RefreshCw, Share2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-context'
import type { AgentSkillListItem, StudioPayload } from '../../../../shared/contracts/index.js'
import { acceptSkillShareInviteApi, createSkillShareInviteApi, declineSkillShareInviteApi, extractAuthorStyleProfileApi, getAuthorStyleProfileApi, getNovelSkills, getResearchWorkbenchApi, listSkillShareInvitesApi, revokeAuthorStyleSourceApi, updateAgentDataControlApi, updateNovelSkill } from '../api'
import SkillManagerDialog from './SkillManagerDialog'

const phaseNames: Record<string, string> = {
  research: '调研', plan: '规划', scene: '场景', draft: '正文', critique: '审阅', revision: '修订', commit: '落库',
}

function lastUsedLabel(value: string | null): string {
  if (!value) return '尚未调用'
  return `最近调用 ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value))}`
}

export default function SkillsPanel({ novelId, chapters, className }: { novelId: string; chapters: StudioPayload['chapters']; className?: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [dialog, setDialog] = useState<'create' | 'import' | AgentSkillListItem | null>(null)
  const [styleSetupOpen, setStyleSetupOpen] = useState(false)
  const [styleTitle, setStyleTitle] = useState('我的写作样章')
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([])
  const [styleConsent, setStyleConsent] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [shareSkillId, setShareSkillId] = useState<string | null>(null)
  const [shareRecipient, setShareRecipient] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const queryKey = ['studio', novelId, 'skills'] as const
  const skillsQuery = useQuery({
    queryKey,
    queryFn: () => getNovelSkills(novelId),
    staleTime: 30_000,
  })
  const styleQuery = useQuery({
    queryKey: ['studio', novelId, 'style-profile'],
    queryFn: () => getAuthorStyleProfileApi(novelId),
    staleTime: 30_000,
  })
  const researchQuery = useQuery({
    queryKey: ['studio', novelId, 'research-workbench'],
    queryFn: () => getResearchWorkbenchApi(novelId),
    staleTime: 30_000,
  })
  const shareQuery = useQuery({
    queryKey: ['agent', 'skill-share-invites'],
    queryFn: listSkillShareInvitesApi,
    staleTime: 30_000,
  })
  const updateMutation = useMutation({
    mutationFn: ({ skillId, enabled }: { skillId: string; enabled: boolean }) => updateNovelSkill(novelId, skillId, { enabled }),
    onSuccess: (payload) => queryClient.setQueryData(queryKey, payload),
    onError: (error) => toast.error(error instanceof Error ? error.message : '技能状态更新失败。'),
  })
  const extractStyleMutation = useMutation({
    mutationFn: () => extractAuthorStyleProfileApi(novelId, { title: styleTitle.trim(), chapterIds: selectedChapterIds, consent: true }),
    onSuccess: async () => {
      await styleQuery.refetch()
      setStyleSetupOpen(false)
      setSelectedChapterIds([])
      setStyleConsent(false)
      toast.success('作者 Style DNA 已更新，仅限当前作品使用。')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Style DNA 提取失败。'),
  })
  const revokeStyleMutation = useMutation({
    mutationFn: (sourceId: string) => revokeAuthorStyleSourceApi(novelId, sourceId, '作者在技能区主动撤回私有样章授权。'),
    onSuccess: async () => {
      await styleQuery.refetch()
      setConfirmRevoke(false)
      toast.success('私有样章、Style DNA 与派生索引已删除。')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Style DNA 撤回失败。'),
  })
  const dataControlMutation = useMutation({
    mutationFn: updateAgentDataControlApi.bind(null, novelId),
    onSuccess: (dataControl) => {
      queryClient.setQueryData(['studio', novelId, 'research-workbench'], (current: typeof researchQuery.data) => current ? { ...current, dataControl } : current)
      toast.success('数据使用设置已更新。')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '数据使用设置更新失败。'),
  })
  const createShareMutation = useMutation({
    mutationFn: ({ skillId, recipientAccount, message }: { skillId: string; recipientAccount: string; message: string }) => createSkillShareInviteApi(novelId, skillId, { recipientAccount, message }),
    onSuccess: async () => {
      await shareQuery.refetch()
      setShareSkillId(null)
      setShareRecipient('')
      setShareMessage('')
      toast.success('技能邀请已发送，有效期 7 天。')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '技能邀请发送失败。'),
  })
  const acceptShareMutation = useMutation({
    mutationFn: (inviteId: string) => acceptSkillShareInviteApi(inviteId, novelId),
    onSuccess: ({ skills, invites }) => {
      queryClient.setQueryData(queryKey, skills)
      queryClient.setQueryData(['agent', 'skill-share-invites'], invites)
      toast.success('共享技能已安装到当前作品。')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '共享技能安装失败。'),
  })
  const declineShareMutation = useMutation({
    mutationFn: declineSkillShareInviteApi,
    onSuccess: (invites) => queryClient.setQueryData(['agent', 'skill-share-invites'], invites),
    onError: (error) => toast.error(error instanceof Error ? error.message : '邀请处理失败。'),
  })

  if (skillsQuery.isLoading) {
    return <div className={cn('flex h-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]', className)}><LoaderCircle className="h-4 w-4 animate-spin" />正在载入作品技能…</div>
  }

  if (skillsQuery.isError || !skillsQuery.data) {
    return <div className={cn('flex h-full flex-col items-center justify-center gap-3 px-6 text-center', className)}><Sparkles className="h-8 w-8 text-[var(--text-tertiary)]" /><p className="text-sm text-[var(--text-secondary)]">技能目录暂时无法载入。</p><button type="button" onClick={() => void skillsQuery.refetch()} className="text-xs text-[var(--text-primary)] underline underline-offset-4">重新加载</button></div>
  }

  const payload = skillsQuery.data
  return <section className={cn('flex h-full min-h-0 flex-col bg-[var(--surface-default)]', className)} aria-label="作品技能">
    <header className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-emerald-500" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">技能</h2>
        <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{payload.enabledCount}/{payload.totalCount} 已启用</span>
        <button type="button" onClick={() => setDialog('create')} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label="创建技能" title="创建技能"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => setDialog('import')} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label="导入第三方技能" title="导入第三方技能"><Import className="h-4 w-4" /></button>
        <button type="button" onClick={() => void skillsQuery.refetch()} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label="刷新技能" title="刷新技能"><RefreshCw className={cn('h-3.5 w-3.5', skillsQuery.isFetching && 'animate-spin')} /></button>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">Agent 会按任务自动召回已启用技能；关闭后从下一轮开始生效。</p>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      <article className="mb-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/35 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-violet-500/10 text-violet-500"><DatabaseZap className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h3 className="text-xs font-medium text-[var(--text-primary)]">创作研究台</h3><span className="rounded-[5px] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">按需联网</span></div>
            {researchQuery.isLoading ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">正在读取研究资产…</p> : researchQuery.data?.dossier ? <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{researchQuery.data.dossier.genre} · dossier v{researchQuery.data.dossier.version} · {researchQuery.data.dossier.sources.length} 个摘要来源 · 已复用 {researchQuery.data.dossier.reusedCount} 次</p> : <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">新书、换题材或事实高风险时由 Agent 建立；普通续写不会重复联网。</p>}
          </div>
          <button type="button" onClick={() => void researchQuery.refetch()} className="shrink-0 text-[10px] text-[var(--text-secondary)] underline underline-offset-4">刷新</button>
        </div>
        {researchQuery.data?.dossier ? <div className="mt-2.5 space-y-1 border-t border-[var(--border-subtle)] pt-2.5 text-[10px] leading-4 text-[var(--text-secondary)]"><p><span className="text-[var(--text-tertiary)]">读者承诺：</span>{researchQuery.data.dossier.readerPromise}</p><p><span className="text-[var(--text-tertiary)]">弃书风险：</span>{researchQuery.data.dossier.abandonmentRisks.slice(0, 2).join('；')}</p></div> : null}
        {researchQuery.data?.prototype ? <div className="mt-2.5 flex items-center gap-2 rounded-[8px] border border-[var(--border-subtle)] px-2.5 py-2 text-[10px]"><BookOpenCheck className="h-3.5 w-3.5 text-emerald-500" /><span className="text-[var(--text-secondary)]">前三章试制 v{researchQuery.data.prototype.version}</span><span className="ml-auto text-[var(--text-tertiary)]">{researchQuery.data.prototype.directions.length} 个方向 · {researchQuery.data.prototype.status}</span></div> : null}
        {researchQuery.data ? <details className="mt-2.5 border-t border-[var(--border-subtle)] pt-2.5"><summary className="cursor-pointer text-[10px] text-[var(--text-secondary)]">数据使用与隐私</summary><div className="mt-2 space-y-2 text-[10px] text-[var(--text-secondary)]">
          {[
            ['productAnalyticsEnabled', '匿名产品指标', '仅记录完成率、修订轮数和发布等统计，不记录小说正文。'],
            ['qualityTelemetryEnabled', '质量反馈关联', '把建议接受/拒绝与匿名质量结果关联，用于改进质量门。'],
            ['privateStyleEnabled', '本作品 Style DNA', '允许当前作品使用作者私有统计画像，不跨作者。'],
            ['publicCorpusOptIn', '共建公共技法库', '默认关闭；开启也不自动导入正文，仍需另行明确授权。'],
          ].map(([key, title, detail]) => <label key={key} className="flex cursor-pointer items-start gap-2 rounded-[7px] px-1 py-1 hover:bg-[var(--surface-muted)]"><input className="mt-0.5" type="checkbox" checked={Boolean(researchQuery.data?.dataControl[key as keyof typeof researchQuery.data.dataControl])} disabled={dataControlMutation.isPending} onChange={(event) => dataControlMutation.mutate({ [key]: event.target.checked })} /><span><strong className="font-medium text-[var(--text-primary)]">{title}</strong><br />{detail}</span></label>)}
        </div></details> : null}
      </article>
      <article className="mb-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-muted)]/35 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-sky-500/10 text-sky-500"><Fingerprint className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h3 className="text-xs font-medium text-[var(--text-primary)]">作者 Style DNA</h3><span className="rounded-[5px] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">仅本作品</span></div>
            {styleQuery.isLoading ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">正在读取风格画像…</p> : styleQuery.data ? <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{styleQuery.data.name} · {styleQuery.data.sampleCount} 章 / {styleQuery.data.sampleChars.toLocaleString()} 字符。Agent 只使用统计画像，不向其他作者召回样章。</p> : <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">选择自己拥有的章节建立私有统计画像，让作者风格优先于平台通用技法卡。</p>}
          </div>
          <button type="button" onClick={() => setStyleSetupOpen((open) => !open)} className="shrink-0 text-[10px] text-[var(--text-secondary)] underline underline-offset-4">{styleQuery.data ? '更新' : '建立'}</button>
        </div>
        {styleQuery.data ? <div className="mt-2.5 grid grid-cols-2 gap-2 text-[9px] text-[var(--text-tertiary)] sm:grid-cols-4">
          <span>对白 {Math.round(styleQuery.data.stats.dialogueRatio * 100)}%</span>
          <span>句中位 {styleQuery.data.stats.medianSentenceChars} 字</span>
          <span>段中位 {styleQuery.data.stats.medianParagraphChars} 字</span>
          <span>修辞密度 {Math.round(styleQuery.data.stats.imageryDensity * 100)}%</span>
        </div> : null}
        {styleSetupOpen ? <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
          <input value={styleTitle} onChange={(event) => setStyleTitle(event.target.value)} maxLength={160} className="h-9 w-full rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-xs outline-none focus:border-[var(--border-strong)]" aria-label="Style DNA 名称" />
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-[8px] border border-[var(--border-subtle)] p-2">
            {chapters.length === 0 ? <p className="py-3 text-center text-[10px] text-[var(--text-tertiary)]">当前作品还没有可选章节。</p> : chapters.map((chapter) => {
              const checked = selectedChapterIds.includes(chapter.id)
              return <label key={chapter.id} className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[10px] hover:bg-[var(--surface-muted)]">
                <input type="checkbox" checked={checked} disabled={!checked && selectedChapterIds.length >= 12} onChange={() => setSelectedChapterIds((ids) => checked ? ids.filter((id) => id !== chapter.id) : [...ids, chapter.id])} />
                <span className="min-w-0 truncate">第 {chapter.orderIndex} 章 · {chapter.title}</span>
              </label>
            })}
          </div>
          <label className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-[var(--text-secondary)]"><input className="mt-0.5" type="checkbox" checked={styleConsent} onChange={(event) => setStyleConsent(event.target.checked)} /><span>我确认这些章节由我拥有，并同意仅在当前作品内生成 Style DNA；不会进入公共文笔库或跨作者召回。</span></label>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" disabled={!styleTitle.trim() || selectedChapterIds.length === 0 || !styleConsent || extractStyleMutation.isPending} onClick={() => extractStyleMutation.mutate()} className="inline-flex h-8 items-center rounded-[8px] bg-[var(--surface-contrast)] px-3 text-[10px] text-[var(--text-contrast)] disabled:opacity-40">{extractStyleMutation.isPending ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : null}生成私有画像</button>
            <button type="button" onClick={() => setStyleSetupOpen(false)} className="h-8 px-2 text-[10px] text-[var(--text-secondary)]">取消</button>
          </div>
        </div> : null}
        {styleQuery.data && !styleSetupOpen ? <div className="mt-2.5 border-t border-[var(--border-subtle)] pt-2.5">
          {confirmRevoke ? <div className="flex flex-wrap items-center gap-2 text-[10px]"><span className="text-[var(--text-secondary)]">将删除私有原文、画像和派生索引，确认撤回？</span><button type="button" disabled={revokeStyleMutation.isPending} onClick={() => { const sourceId = styleQuery.data?.sourceId; if (sourceId) revokeStyleMutation.mutate(sourceId) }} className="text-red-500">确认删除</button><button type="button" onClick={() => setConfirmRevoke(false)} className="text-[var(--text-secondary)]">取消</button></div> : <button type="button" onClick={() => setConfirmRevoke(true)} className="inline-flex items-center gap-1 text-[9px] text-[var(--text-tertiary)] hover:text-red-500"><Trash2 className="h-3 w-3" />撤回样章授权并删除画像</button>}
        </div> : null}
      </article>
      {shareQuery.data?.received.some((invite) => invite.status === 'pending') ? <article className="mb-3 rounded-[12px] border border-violet-500/25 bg-violet-500/5 p-3">
        <div className="flex items-center gap-2"><Inbox className="h-4 w-4 text-violet-500" /><h3 className="text-xs font-medium text-[var(--text-primary)]">收到的技能邀请</h3><span className="ml-auto text-[9px] text-[var(--text-tertiary)]">邀请制</span></div>
        <div className="mt-2 space-y-2">{shareQuery.data.received.filter((invite) => invite.status === 'pending').map((invite) => <div key={invite.id} className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2.5 text-[10px]"><div className="flex items-center gap-2"><span className="font-medium text-[var(--text-primary)]">{invite.skillName}</span><span className="font-mono text-[var(--text-tertiary)]">v{invite.version}</span></div><p className="mt-1 text-[var(--text-secondary)]">{invite.counterpart.nickname} 从《{invite.sourceNovel.title}》邀请共享。{invite.message}</p><div className="mt-2 flex gap-2"><button type="button" disabled={acceptShareMutation.isPending} onClick={() => acceptShareMutation.mutate(invite.id)} className="rounded-[6px] bg-[var(--surface-contrast)] px-2 py-1 text-[var(--text-contrast)]">安装到本作品</button><button type="button" disabled={declineShareMutation.isPending} onClick={() => declineShareMutation.mutate(invite.id)} className="px-2 py-1 text-[var(--text-secondary)]">拒绝</button></div></div>)}</div>
      </article> : null}
      <div className="space-y-2">
        {payload.items.map((skill) => {
          const pending = updateMutation.isPending && updateMutation.variables?.skillId === skill.id
          return <article key={skill.id} className={cn('rounded-[12px] border p-3 transition-colors', skill.enabled ? 'border-[var(--border-subtle)] bg-[var(--surface-muted)]/35' : 'border-[var(--border-subtle)] bg-transparent opacity-70')}>
            <div className="flex items-start gap-3">
              <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]', skill.enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--surface-muted)] text-[var(--text-tertiary)]')}><Sparkles className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-xs font-medium text-[var(--text-primary)]">{skill.name}</h3><span className="shrink-0 font-mono text-[9px] text-[var(--text-tertiary)]">v{skill.activeVersion}</span></div>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{skill.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={skill.enabled}
                aria-label={`${skill.enabled ? '关闭' : '启用'}${skill.name}`}
                disabled={pending}
                onClick={() => updateMutation.mutate({ skillId: skill.id, enabled: !skill.enabled })}
                className={cn('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60', skill.enabled ? 'bg-emerald-500' : 'bg-[var(--border-strong)]')}
              >
                <span className={cn('absolute top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm transition-transform', skill.enabled ? 'translate-x-5' : 'translate-x-1')}>{pending ? <LoaderCircle className="h-2.5 w-2.5 animate-spin" /> : skill.enabled ? <Check className="h-2.5 w-2.5" /> : null}</span>
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {skill.phases.map((phase) => <span key={phase} className="rounded-[5px] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-secondary)]">{phaseNames[phase] ?? phase}</span>)}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{skill.source === 'builtin' ? 'Chevoink 内置' : '自定义'} · {skill.license}</span>
              <span className="inline-flex items-center gap-1"><History className="h-3 w-3" />{lastUsedLabel(skill.lastUsedAt)}{skill.usageCount > 0 ? ` · ${skill.usageCount} 次` : ''}</span>
              <div className="ml-auto flex items-center gap-2">{skill.canEdit && skill.status === 'active' ? <button type="button" onClick={() => setShareSkillId((current) => current === skill.id ? null : skill.id)} className="inline-flex items-center gap-1 text-[var(--text-secondary)] underline underline-offset-4"><Share2 className="h-3 w-3" />邀请</button> : null}<button type="button" onClick={() => setDialog(skill)} className="text-[var(--text-secondary)] underline underline-offset-4">详情 / 测试</button></div>
            </div>
            {shareSkillId === skill.id ? <div className="mt-3 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-2.5"><div className="flex items-center gap-2"><p className="text-[10px] font-medium text-[var(--text-primary)]">邀请账号使用 v{skill.activeVersion}</p><button type="button" className="ml-auto text-[var(--text-tertiary)]" onClick={() => setShareSkillId(null)} aria-label="关闭邀请"><X className="h-3.5 w-3.5" /></button></div><input value={shareRecipient} onChange={(event) => setShareRecipient(event.target.value)} placeholder="对方用户 ID、邮箱或手机号" className="mt-2 h-8 w-full rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 text-[10px] outline-none focus:border-[var(--border-strong)]" /><input value={shareMessage} maxLength={500} onChange={(event) => setShareMessage(event.target.value)} placeholder="附言（可选）" className="mt-2 h-8 w-full rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 text-[10px] outline-none focus:border-[var(--border-strong)]" /><button type="button" disabled={!shareRecipient.trim() || createShareMutation.isPending} onClick={() => createShareMutation.mutate({ skillId: skill.id, recipientAccount: shareRecipient.trim(), message: shareMessage.trim() })} className="mt-2 inline-flex h-8 items-center rounded-[7px] bg-[var(--surface-contrast)] px-3 text-[10px] text-[var(--text-contrast)] disabled:opacity-40">{createShareMutation.isPending ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : null}发送 7 天邀请</button></div> : null}
          </article>
        })}
      </div>
      {payload.recentRuns.length > 0 ? <div className="mt-4 border-t border-[var(--border-subtle)] pt-3"><p className="px-1 text-[10px] font-medium text-[var(--text-secondary)]">最近路由</p>{payload.recentRuns.slice(0, 3).map((run) => <div key={run.runId} className="mt-2 rounded-[9px] border border-[var(--border-subtle)] px-2.5 py-2 text-[10px] text-[var(--text-secondary)]"><div className="flex items-center gap-2"><span>{phaseNames[run.phase] ?? run.phase}</span><span className="ml-auto tabular-nums text-[var(--text-tertiary)]">置信度 {Math.round(run.confidence * 100)}%</span></div><p className="mt-1 truncate text-[var(--text-tertiary)]">{run.selected.map((item) => item.name).join('、') || '本轮未加载技能'}</p></div>)}</div> : null}
    </div>
    {dialog ? <SkillManagerDialog novelId={novelId} skill={dialog === 'create' || dialog === 'import' ? null : dialog} importMode={dialog === 'import'} onClose={() => setDialog(null)} onPayload={(next) => {
      queryClient.setQueryData(queryKey, next)
      if (typeof dialog === 'object') setDialog(next.items.find((item) => item.id === dialog.id) ?? null)
    }} /> : null}
  </section>
}
