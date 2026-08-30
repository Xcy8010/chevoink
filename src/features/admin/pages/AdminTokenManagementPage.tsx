import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { AdminCard, AdminPageHeader, AdminPanelState } from '../AdminLayout'
import { formatTokens } from '../admin-shared'
import { getAdminTokenManagement } from '../api'

export default function AdminTokenManagementPage() {
  const query = useQuery({ queryKey: ['admin', 'token-usage'], queryFn: getAdminTokenManagement })
  const data = query.data
  return (
    <div>
      <AdminPageHeader title="Token 管理" description="用统一计量源查看模型 Token、联网搜索和生图调用，并下钻到用户创作记录。" />
      <AdminPanelState state={query.isLoading ? 'loading' : query.isError ? 'error' : 'ready'}>
        {data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              {[
                ['总 Token', formatTokens(data.summary.totalTokens)],
                ['输入 Token', formatTokens(data.summary.requestTokens)],
                ['输出 Token', formatTokens(data.summary.responseTokens)],
                ['使用用户', data.summary.users.toLocaleString('zh-CN')],
                ['联网搜索', data.summary.webSearchCalls.toLocaleString('zh-CN')],
                ['生图调用', data.summary.imageCalls.toLocaleString('zh-CN')],
              ].map(([label, value]) => (
                <AdminCard key={label}>
                  <p className="text-xs text-[var(--text-secondary)]">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </AdminCard>
              ))}
            </div>

            <AdminCard>
              <h2 className="mb-3 text-sm font-semibold">用量排行</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs text-[var(--text-secondary)]"><tr><th className="pb-2">用户</th><th>总 Token</th><th>请求数</th><th>联网</th><th>生图</th><th /></tr></thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {data.users.map((item, index) => (
                      <tr key={item.user.id}>
                        <td className="py-2.5"><span className="mr-2 text-[var(--text-tertiary)]">{index + 1}</span>{item.user.nickname}</td>
                        <td>{formatTokens(item.totalTokens)}</td><td>{item.requestCount}</td><td>{item.webSearchCalls}</td><td>{item.imageCalls}</td>
                        <td className="text-right"><Link className="text-xs underline" to={`/admin/users/${item.user.id}/creation-records`}>创作记录</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminCard>

            <AdminCard>
              <h2 className="mb-3 text-sm font-semibold">高消耗动作</h2>
              <div className="space-y-2">
                {data.actions.slice(0, 20).map((item) => (
                  <div key={item.action} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-4 border-b border-[var(--border-subtle)] py-2 text-sm last:border-0">
                    <span className="truncate">{item.action}</span>
                    <span>{formatTokens(item.totalTokens)} · {item.requestCount} 次</span>
                    <span className="text-[var(--text-secondary)]">均 {formatTokens(item.averageTokens)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
                长篇正文生成、多轮连续性/人类感检查、重复读取大段上下文通常是主要消耗。当前已通过检查结果复用、单轮自动修订、图谱空置才自动构建和工具参数容错减少无效重试，不缩减有效正文与质量检查。
              </p>
            </AdminCard>
          </div>
        ) : null}
      </AdminPanelState>
    </div>
  )
}
