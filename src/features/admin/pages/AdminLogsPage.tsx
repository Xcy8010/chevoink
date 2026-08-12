import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { listAdminAuditLogs } from '../api'
import { AdminCard, AdminPageHeader, AdminPager, AdminPanelState, formatDateTime } from '../AdminLayout'
import { describeAdminAction } from './AdminDashboardPage'

const TARGET_TYPE_LABELS: Record<string, string> = {
  user: '用户',
  novel: '作品',
  chapter: '章节',
  post: '帖子',
  comment: '评论',
}

export default function AdminLogsPage() {
  const [targetType, setTargetType] = useState('')
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['admin', 'logs', targetType, page],
    queryFn: () =>
      listAdminAuditLogs({
        targetType: targetType || undefined,
        page,
        pageSize: 20,
      }),
  })

  const data = query.data

  return (
    <div>
      <AdminPageHeader title="操作日志" description="所有管理操作留痕，只增不删" />

      <AdminCard>
        <div className="mb-4">
          <select
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value)
              setPage(1)
            }}
            className="h-10 rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-default)] px-3 text-sm text-[var(--text-primary)] outline-none"
          >
            <option value="">全部对象</option>
            <option value="user">用户</option>
            <option value="novel">作品</option>
            <option value="chapter">章节</option>
            <option value="post">帖子</option>
            <option value="comment">评论</option>
          </select>
        </div>

        <AdminPanelState
          state={query.isLoading ? 'loading' : query.isError ? 'error' : data && data.items.length === 0 ? 'empty' : 'ready'}
        >
          {data ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)]">
                      <th className="pb-2 font-normal">时间</th>
                      <th className="pb-2 font-normal">管理员</th>
                      <th className="pb-2 font-normal">操作</th>
                      <th className="pb-2 font-normal">对象</th>
                      <th className="pb-2 font-normal">详情</th>
                      <th className="pb-2 font-normal">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((log) => {
                      const detailEntries = Object.entries(log.detail).filter(([key]) => key !== 'previousVisibility')
                      return (
                        <tr key={log.id} className="border-t border-[var(--border-default)]">
                          <td className="py-2.5 text-[var(--text-secondary)]">{formatDateTime(log.createdAt)}</td>
                          <td className="py-2.5">{log.adminNickname ?? log.adminId}</td>
                          <td className="py-2.5 font-medium">{describeAdminAction(log.action)}</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">
                            {log.targetType ? TARGET_TYPE_LABELS[log.targetType] ?? log.targetType : '—'}
                          </td>
                          <td className="max-w-[260px] py-2.5 text-xs text-[var(--text-secondary)]">
                            {detailEntries.length > 0
                              ? detailEntries.map(([key, value]) => `${key}: ${String(value)}`).join('；')
                              : '—'}
                          </td>
                          <td className="py-2.5 text-xs text-[var(--text-secondary)]">{log.ip ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <AdminPager pagination={data.pagination} page={page} onPageChange={setPage} />
            </>
          ) : null}
        </AdminPanelState>
      </AdminCard>
    </div>
  )
}
