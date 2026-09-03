import { useQuery } from '@tanstack/react-query'
import { Heart, MessageCircle, Bookmark, LoaderCircle, RefreshCcw, Star } from 'lucide-react'
import { Link } from 'react-router-dom'

import { requestJson } from '@/app/api-client'
import Button from '@/components/ui/Button'
import { useShellStore } from '@/store/useShellStore'
import AccountLayout from './AccountLayout'
import type { Pagination, Post } from '../../../shared/contracts'

const AUDIT_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: '审核中', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  rejected: { label: '未通过', className: 'bg-red-500/10 text-[var(--color-error)]' },
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

export default function AccountPostsPage() {
  const user = useShellStore((state) => state.sessionUser)
  const postsQuery = useQuery({
    queryKey: ['account', 'my-posts', user?.id ?? 'anonymous'],
    queryFn: () => requestJson<{ items: Post[]; pagination: Pagination }>(`/api/posts?authorId=${encodeURIComponent(user?.id ?? '')}&pageSize=30&sort=latest`),
    enabled: Boolean(user?.id),
    staleTime: 20_000,
  })

  const items = postsQuery.data?.items ?? []
  const total = postsQuery.data?.pagination.total ?? items.length

  return (
    <AccountLayout active="posts">
      <div className="px-5 py-9 sm:px-8 lg:px-12 lg:py-11">
        <div className="max-w-[1040px]">
          <header>
            <h1 className="text-2xl font-semibold tracking-[-.02em]">我的发布</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">你在社区发布的全部讨论，共 {total} 条。</p>
          </header>
          {postsQuery.isLoading ? (
            <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" /></div>
          ) : postsQuery.isError ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-[var(--text-secondary)]">暂时无法读取你的发布记录。</p>
              <Button onClick={() => void postsQuery.refetch()}><RefreshCcw className="h-4 w-4" />重新加载</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-8 rounded-[16px] border border-[#e9e9e6] bg-white py-16 text-center dark:border-[var(--border-subtle)] dark:bg-[var(--surface-default)]">
              <p className="text-sm text-[var(--text-secondary)]">还没有发布过讨论。</p>
              <Link to="/community" className="mt-3 inline-flex h-9 items-center rounded-[9px] bg-[#171b24] px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-[#171b24]">去社区发第一条</Link>
            </div>
          ) : (
            <ul className="mt-8 space-y-4">
              {items.map((post) => {
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
          )}
        </div>
      </div>
    </AccountLayout>
  )
}
