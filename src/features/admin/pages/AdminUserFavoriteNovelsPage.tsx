import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { listAdminUserFavoriteNovels } from '../api'
import { AdminCard, AdminPageHeader, AdminPanelState, StatusPill } from '../AdminLayout'
import { formatDateTime, NOVEL_STATUS_LABELS } from '../admin-shared'

export default function AdminUserFavoriteNovelsPage() {
  const { userId = '' } = useParams()

  const query = useQuery({
    queryKey: ['admin', 'users', userId, 'favorites'],
    queryFn: () => listAdminUserFavoriteNovels(userId),
    enabled: Boolean(userId),
  })

  const payload = query.data

  return (
    <div>
      <Link to={`/admin/users/${userId}`} className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft size={15} />
        返回用户详情
      </Link>

      <AdminPageHeader
        title={payload ? `${payload.user.nickname} 的收藏作品` : '收藏作品'}
        description={payload ? `共收藏了 ${payload.total} 部作品` : undefined}
      />

      <AdminPanelState state={query.isLoading ? 'loading' : query.isError ? 'error' : payload && payload.items.length === 0 ? 'empty' : 'ready'}>
        {payload ? (
          <AdminCard>
            <div className="space-y-2">
              {payload.items.map((novel) => (
                <div key={novel.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] p-3">
                  <div className="min-w-0">
                    <Link to={`/admin/novels/${novel.id}`} className="flex items-center gap-2">
                      <span className="truncate font-medium hover:underline">{novel.displayTitle ?? novel.title}</span>
                      <StatusPill tone={novel.status === 'published' || novel.status === 'completed' ? 'success' : 'neutral'}>
                        {NOVEL_STATUS_LABELS[novel.status] ?? novel.status}
                      </StatusPill>
                    </Link>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {novel.author.nickname} · {novel.wordCount.toLocaleString('zh-CN')} 字 · {novel.chapterCount} 章 · {novel.favoriteCount} 收藏
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">收藏于 {formatDateTime(novel.favoritedAt)}</p>
                </div>
              ))}
            </div>
          </AdminCard>
        ) : null}
      </AdminPanelState>
    </div>
  )
}
