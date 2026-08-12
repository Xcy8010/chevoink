import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, MessageSquare, Newspaper, Users } from 'lucide-react'

import { getAdminDashboard } from '../api'
import { AdminCard, AdminPageHeader, AdminPanelState, formatDateTime } from '../AdminLayout'

const ACTION_LABELS: Record<string, string> = {
  'admin.login': '登录后台',
  'admin.change_own_password': '修改自己密码',
  'user.ban': '封禁用户',
  'user.unban': '解封用户',
  'user.set_role': '调整角色',
  'user.reset_password': '重置密码',
  'novel.take_down': '下架作品',
  'novel.restore': '恢复作品',
  'novel.delete': '删除作品',
  'chapter.delete': '删除章节',
  'post.delete': '删除帖子',
  'comment.delete': '删除评论',
}

export function describeAdminAction(action: string): string {
  return ACTION_LABELS[action] ?? action
}

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
            {/* 指标卡 */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: '注册用户', value: dashboard.totals.users, icon: Users, to: '/admin/users' },
                { label: '已发布作品', value: dashboard.totals.publishedNovels, icon: BookOpen, to: '/admin/novels' },
                { label: '社区帖子', value: dashboard.totals.posts, icon: Newspaper, to: '/admin/posts' },
                { label: '评论总数', value: dashboard.totals.comments, icon: MessageSquare, to: '/admin/comments' },
              ].map((card) => (
                <Link
                  key={card.label}
                  to={card.to}
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-default)] p-4 transition-colors hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-secondary)]">{card.label}</p>
                    <card.icon size={16} className="text-[var(--text-secondary)]" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{card.value.toLocaleString('zh-CN')}</p>
                </Link>
              ))}
            </div>

            {/* 近 7 日新增 */}
            <AdminCard>
              <h2 className="mb-3 text-sm font-semibold">近 7 日新增</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)]">
                      <th className="pb-2 font-normal">日期</th>
                      <th className="pb-2 font-normal">注册用户</th>
                      <th className="pb-2 font-normal">发布作品</th>
                      <th className="pb-2 font-normal">新帖子</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.trend.map((day) => (
                      <tr key={day.date} className="border-t border-[var(--border-default)]">
                        <td className="py-2 text-[var(--text-secondary)]">{day.date.slice(5)}</td>
                        <td className="py-2">{day.users}</td>
                        <td className="py-2">{day.novels}</td>
                        <td className="py-2">{day.posts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminCard>

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
