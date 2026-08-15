import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, MessageSquare, Newspaper, Users } from 'lucide-react'

import { getAdminDashboard } from '../api'
import { AdminCard, AdminPageHeader, AdminPanelState } from '../AdminLayout'
import { describeAdminAction, formatDateTime } from '../admin-shared'
import TrendLineChart from '../components/TrendLineChart'

export default function AdminDashboardPage() {
  const query = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: getAdminDashboard,
  })

  const dashboard = query.data

  return (
    <div>
      <AdminPageHeader title="仪表盘" description="平台内容与管理动作的实时概览" />

      <AdminPanelState state={query.isLoading ? 'loading' : query.isError ? 'error' : 'ready'}>
        {dashboard ? (
          <div className="space-y-5">
            {/* 指标卡 + 近 7 日折线趋势 */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: '注册用户',
                  caption: '近 7 天新增注册趋势',
                  value: dashboard.totals.users,
                  icon: Users,
                  to: '/admin/users',
                  series: dashboard.trend.map((day) => day.users),
                },
                {
                  label: '已发布作品',
                  caption: '近 7 天新发布趋势',
                  value: dashboard.totals.publishedNovels,
                  icon: BookOpen,
                  to: '/admin/novels',
                  series: dashboard.trend.map((day) => day.novels),
                },
                {
                  label: '社区帖子',
                  caption: '近 7 天新帖趋势',
                  value: dashboard.totals.posts,
                  icon: Newspaper,
                  to: '/admin/posts',
                  series: dashboard.trend.map((day) => day.posts),
                },
                {
                  label: '评论总数',
                  caption: '近 7 天新评论趋势',
                  value: dashboard.totals.comments,
                  icon: MessageSquare,
                  to: '/admin/comments',
                  series: dashboard.trend.map((day) => day.comments),
                },
              ].map((card) => (
                <Link
                  key={card.label}
                  to={card.to}
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-default)] p-4 transition-colors hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-[var(--text-secondary)]">{card.label}</p>
                        <card.icon size={14} className="text-[var(--text-tertiary)]" />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{card.caption}</p>
                    </div>
                    <p className="shrink-0 text-xl font-semibold tracking-[-0.02em]">
                      {card.value.toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="mt-3">
                    <TrendLineChart labels={dashboard.trend.map((day) => day.date.slice(5))} values={card.series} />
                  </div>
                  <p className="mt-2 text-right text-[10px] text-[var(--text-tertiary)]">近 7 天</p>
                </Link>
              ))}
            </div>

            {/* 最近管理操作 */}
            <AdminCard>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">最近管理操作</h2>
                <Link to="/admin/logs" className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]">
                  全部日志
                </Link>
              </div>
              {dashboard.recentLogs.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--text-secondary)]">暂无管理操作记录</p>
              ) : (
                <ul className="divide-y divide-[var(--border-default)]">
                  {dashboard.recentLogs.map((log) => (
                    <li key={log.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">
                          <span className="font-medium">{log.adminNickname ?? '管理员'}</span>
                          <span className="mx-1.5 text-[var(--text-secondary)]">·</span>
                          {describeAdminAction(log.action)}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-[var(--text-secondary)]">{formatDateTime(log.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </div>
        ) : null}
      </AdminPanelState>
    </div>
  )
}
