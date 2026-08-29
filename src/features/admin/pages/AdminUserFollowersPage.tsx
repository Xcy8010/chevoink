import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { listAdminUserFollowers } from '../api'
import { AdminCard, AdminPageHeader, AdminPanelState, StatusPill } from '../AdminLayout'

export default function AdminUserFollowersPage() {
  const { userId = '' } = useParams()

  const query = useQuery({
    queryKey: ['admin', 'users', userId, 'followers'],
    queryFn: () => listAdminUserFollowers(userId),
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
        title={payload ? `${payload.user.nickname} 的粉丝` : '粉丝列表'}
        description={payload ? `共 ${payload.total} 位粉丝关注了该用户` : undefined}
      />

      <AdminPanelState state={query.isLoading ? 'loading' : query.isError ? 'error' : payload && payload.items.length === 0 ? 'empty' : 'ready'}>
        {payload ? (
          <AdminCard>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {payload.items.map((follower) => (
                <div key={follower.id} className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] p-3">
                  {follower.avatarUrl ? (
                    <img src={follower.avatarUrl} alt={follower.nickname} className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-base font-semibold">
                      {follower.nickname.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/users/${follower.id}`} className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium hover:underline">{follower.nickname}</span>
                      <StatusPill tone={follower.isOnline ? 'success' : 'neutral'}>{follower.isOnline ? '在线' : '离线'}</StatusPill>
                    </Link>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      粉丝 {follower.followerCount} · 关注于 {follower.followedAt.slice(0, 10)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>
        ) : null}
      </AdminPanelState>
    </div>
  )
}
