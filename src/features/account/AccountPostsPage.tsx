import { useQuery } from '@tanstack/react-query'
import { Bookmark, BookOpen, Heart, LoaderCircle, MessageCircle, RefreshCcw, Star, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { requestJson } from '@/app/api-client'
import AppImage from '@/components/ui/AppImage'
import Button from '@/components/ui/Button'
import { useShellStore } from '@/store/useShellStore'
import AccountLayout from './AccountLayout'
import type { AgentSkillListItem, NovelCard, NovelSkillsPayload, Pagination, Post } from '../../../shared/contracts'

const AUDIT_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: '审核中', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  rejected: { label: '未通过', className: 'bg-red-500/10 text-[var(--color-error)]' },
}

const NOVEL_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-[#f1f1ef] text-[var(--text-secondary)] dark:bg-[var(--surface-muted)]' },
  published: { label: '连载中', className: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' },
  completed: { label: '已完结', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  archived: { label: '已下架', className: 'bg-red-500/10 text-[var(--color-error)]' },
}

/** 只展示用户侧上传/生成的技能，内置技能不算「我的发布」 */
const SKILL_SOURCE_LABELS: Record<string, string> = { user: '自建', agent: 'Agent 生成', third_party: '第三方导入' }
const SKILL_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-[#f1f1ef] text-[var(--text-secondary)] dark:bg-[var(--surface-muted)]' },
  testing: { label: '测试中', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  active: { label: '已启用', className: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' },
  deprecated: { label: '已弃用', className: 'bg-[#f1f1ef] text-[var(--text-tertiary)] dark:bg-[var(--surface-muted)]' },
  quarantined: { label: '已隔离', className: 'bg-red-500/10 text-[var(--color-error)]' },
}

type TabId = 'posts' | 'novels' | 'skills'

const TABS: { id: TabId; label: string }[] = [
  { id: 'posts', label: '讨论' },
  { id: 'novels', label: '作品' },
  { id: 'skills', label: '技能' },
]

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function formatWordCount(count: number): string {
  return count >= 10_000 ? `${(count / 10_000).toFixed(1)} 万字` : `${count.toLocaleString('zh-CN')} 字`
}

function PanelState({ query, onRetry }: { query: { isLoading: boolean; isError: boolean }; onRetry: () => void }) {
  if (query.isLoading) {
    return <div className="flex min-h-[32vh] items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" /></div>
  }
  if (query.isError) {
    return (
      <div className="flex min-h-[32vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-[var(--text-secondary)]">暂时无法读取记录。</p>
        <Button onClick={onRetry}><RefreshCcw className="h-4 w-4" />重新加载</Button>
      </div>
    )
  }
  return null
}

const novelCardClass = 'flex gap-4 rounded-[16px] border border-[#e9e9e6] bg-white p-4 transition-colors hover:border-[#d8d8d4] dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)] dark:hover:border-[var(--border-strong)]'

/** 书封缺失时用图标占位，与首页作品卡兜底一致 */
function NovelCover({ novel }: { novel: NovelCard }) {
  if (!novel.coverUrl) {
    return <div className="grid h-[104px] w-[78px] shrink-0 place-items-center rounded-[10px] bg-[#f1f1ef] text-[var(--text-tertiary)] dark:bg-[var(--surface-muted)]"><BookOpen className="h-5 w-5" /></div>
  }
  return <AppImage src={novel.coverUrl} alt="" className="h-[104px] w-[78px] shrink-0 rounded-[10px] object-cover" />
}

export default function AccountPostsPage() {
  const user = useShellStore((state) => state.sessionUser)
  const [tab, setTab] = useState<TabId>('posts')

  const postsQuery = useQuery({
    queryKey: ['account', 'my-posts', user?.id ?? 'anonymous'],
    queryFn: () => requestJson<{ items: Post[]; pagination: Pagination }>(`/api/posts?authorId=${encodeURIComponent(user?.id ?? '')}&pageSize=30&sort=latest`),
    enabled: Boolean(user?.id),
    staleTime: 20_000,
  })
  const novelsQuery = useQuery({
    queryKey: ['account', 'my-novels', user?.id ?? 'anonymous'],
    queryFn: () => requestJson<{ items: NovelCard[]; pagination: Pagination }>(`/api/novels?authorId=${encodeURIComponent(user?.id ?? '')}&pageSize=50`),
    enabled: Boolean(user?.id),
    staleTime: 20_000,
  })
  /** 技能按作品挂载：拉完作品列表后逐作品取技能，压平去重并滤掉内置 */
  const skillsQuery = useQuery({
    queryKey: ['account', 'my-skills', user?.id ?? 'anonymous', (novelsQuery.data?.items ?? []).map((novel) => novel.id).join(',')],
    queryFn: async () => {
      const novels = novelsQuery.data?.items ?? []
      const payloads = await Promise.all(
        novels.map(async (novel) => {
          try {
            const payload = await requestJson<NovelSkillsPayload>(`/api/agent/novels/${novel.id}/skills`)
            return { novel, items: payload.items }
          } catch {
            return { novel, items: [] as AgentSkillListItem[] }
          }
        }),
      )
      const seen = new Set<string>()
      const skills: Array<AgentSkillListItem & { novelTitle: string; novelId: string }> = []
      for (const { novel, items } of payloads) {
        for (const item of items) {
          if (item.source === 'builtin' || seen.has(item.id)) continue
          seen.add(item.id)
          skills.push({ ...item, novelTitle: novel.displayTitle ?? novel.title, novelId: novel.id })
        }
      }
      return skills
    },
    enabled: Boolean(user?.id) && novelsQuery.isSuccess,
    staleTime: 20_000,
  })

  const posts = postsQuery.data?.items ?? []
  const novels = novelsQuery.data?.items ?? []
  const skills = skillsQuery.data ?? []

  return (
    <AccountLayout active="posts">
      <div className="px-5 py-9 sm:px-8 lg:px-12 lg:py-11">
        <div className="max-w-[1040px]">
          <header>
            <h1 className="text-2xl font-semibold tracking-[-.02em]">我的发布</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">你在社区发布的讨论、上传发布的作品与技能，共 {posts.length + novels.length + skills.length} 项。</p>
          </header>
          <div className="mt-6 inline-flex rounded-[9px] bg-[#ececea] p-1 dark:bg-[var(--surface-muted)]">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`h-8 rounded-[7px] px-4 text-xs transition-colors ${tab === id ? 'bg-white font-medium shadow-sm dark:bg-[var(--surface-default)]' : 'text-[var(--text-secondary)]'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'posts' ? (
            postsQuery.isLoading || postsQuery.isError ? (
              <PanelState query={postsQuery} onRetry={() => void postsQuery.refetch()} />
            ) : posts.length === 0 ? (
              <div className="mt-6 rounded-[16px] border border-[#e9e9e6] bg-white py-16 text-center dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
                <p className="text-sm text-[var(--text-secondary)]">还没有发布过讨论。</p>
                <Link to="/community" className="mt-3 inline-flex h-9 items-center rounded-[9px] bg-[#171b24] px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-[#171b24]">去社区发第一条</Link>
              </div>
            ) : (
              <ul className="mt-6 space-y-4">
                {posts.map((post) => {
                  const audit = AUDIT_LABELS[post.auditStatus]
                  return (
                    <li key={post.id}>
                      <Link
                        to={`/post/${post.id}`}
                        className="block rounded-[16px] border border-[#e9e9e6] bg-white p-5 transition-colors hover:border-[#d8d8d4] dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)] dark:hover:border-[var(--border-strong)]"
                      >
                        <p className="line-clamp-4 text-sm leading-6 whitespace-pre-wrap">{post.content}</p>
                        {post.imageUrls.length > 0 ? <p className="mt-2 text-xs text-[var(--text-tertiary)]">含 {post.imageUrls.length} 张配图</p> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
                          {audit ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${audit.className}`}>{audit.label}</span> : null}
                          {post.topic ? <span className="rounded-full bg-[#f1f1ef] px-2 py-0.5 text-[10px] dark:bg-[var(--surface-muted)]">{post.topic.name}</span> : null}
                          <span>{formatDateTime(post.createdAt)}</span>
                          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{post.likeCount}</span>
                          <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{post.commentCount}</span>
                          <span className="inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" />{post.favoriteCount}</span>
                          {post.relatedNovel ? <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{post.relatedNovel.title}</span> : null}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )
          ) : null}

          {tab === 'novels' ? (
            novelsQuery.isLoading || novelsQuery.isError ? (
              <PanelState query={novelsQuery} onRetry={() => void novelsQuery.refetch()} />
            ) : novels.length === 0 ? (
              <div className="mt-6 rounded-[16px] border border-[#e9e9e6] bg-white py-16 text-center dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
                <p className="text-sm text-[var(--text-secondary)]">还没有创建过作品。</p>
                <Link to="/studio" className="mt-3 inline-flex h-9 items-center rounded-[9px] bg-[#171b24] px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-[#171b24]">去创作中心建第一部</Link>
              </div>
            ) : (
              <ul className="mt-6 space-y-4">
                {novels.map((novel) => {
                  const status = NOVEL_STATUS_LABELS[novel.status]
                  const visible = novel.status === 'published' || novel.status === 'completed'
                  const body = (
                    <>
                      <NovelCover novel={novel} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-sm font-semibold">{novel.displayTitle ?? novel.title}</h2>
                          {status ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span> : null}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-tertiary)]">{novel.summary || '暂无简介'}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
                          <span>{novel.chapterCount} 章 · {formatWordCount(novel.wordCount)}</span>
                          {novel.viewCount !== undefined ? <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{novel.viewCount} 次阅读</span> : null}
                          {novel.favoriteCount !== undefined ? <span className="inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" />{novel.favoriteCount}</span> : null}
                          <span>更新于 {formatDateTime(novel.updatedAt)}</span>
                        </div>
                      </div>
                    </>
                  )
                  return (
                    <li key={novel.id}>
                      {visible ? (
                        <Link to={`/novel/${novel.id}`} className={novelCardClass}>{body}</Link>
                      ) : (
                        /* 草稿/下架作品读者页不可见，点击回创作区继续编辑 */
                        <Link to={`/studio/novel/${novel.id}`} className={novelCardClass}>{body}</Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          ) : null}

          {tab === 'skills' ? (
            novelsQuery.isLoading || skillsQuery.isLoading || skillsQuery.isError ? (
              <PanelState query={skillsQuery.isLoading ? skillsQuery : novelsQuery} onRetry={() => void skillsQuery.refetch()} />
            ) : skills.length === 0 ? (
              <div className="mt-6 rounded-[16px] border border-[#e9e9e6] bg-white py-16 text-center dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
                <p className="text-sm text-[var(--text-secondary)]">还没有上传或生成过技能。</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">在创作中心的技能面板里可以新建技能，或直接对 Agent 说「为我创建一个……技能」。</p>
                <Link to="/studio" className="mt-3 inline-flex h-9 items-center rounded-[9px] bg-[#171b24] px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-[#171b24]">去创作中心</Link>
              </div>
            ) : (
              <ul className="mt-6 space-y-4">
                {skills.map((skill) => {
                  const status = SKILL_STATUS_LABELS[skill.status]
                  return (
                    <li key={skill.id} className="rounded-[16px] border border-[#e9e9e6] bg-white p-5 dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <Wrench className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                        <h2 className="truncate text-sm font-semibold">{skill.name}</h2>
                        <span className="shrink-0 rounded-full bg-[#f1f1ef] px-2 py-0.5 text-[10px] dark:bg-[var(--surface-muted)]">{SKILL_SOURCE_LABELS[skill.source] ?? skill.source}</span>
                        {status ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>{status.label}</span> : null}
                        {!skill.enabled ? <span className="shrink-0 rounded-full bg-[#f1f1ef] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)] dark:bg-[var(--surface-muted)]">已停用</span> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-tertiary)]">{skill.description || '暂无描述'}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)]">
                        <Link to={`/studio/novel/${skill.novelId}`} className="inline-flex items-center gap-1 hover:underline"><BookOpen className="h-3.5 w-3.5" />{skill.novelTitle}</Link>
                        <span>许可 {skill.license}</span>
                        <span>版本 {skill.activeVersion || skill.defaultVersion}</span>
                        <span>调用 {skill.usageCount} 次</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          ) : null}
        </div>
      </div>
    </AccountLayout>
  )
}
