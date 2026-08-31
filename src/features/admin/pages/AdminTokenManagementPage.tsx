import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AdminCard, AdminPageHeader, AdminPanelState } from '../AdminLayout'
import { formatTokens } from '../admin-shared'
import { getAdminTokenManagement } from '../api'

export default function AdminTokenManagementPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')
  const query = useQuery({ queryKey: ['admin', 'token-usage', period], queryFn: () => getAdminTokenManagement(period) })
  const data = query.data
  const maxTrend = useMemo(() => Math.max(1, ...(data?.trend?.map((item) => item.requestTokens + item.responseTokens) ?? [1])), [data?.trend])
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><AdminPageHeader title="Token 管理" description="按 UTC+8 统计模型输入/输出 Token、联网搜索和生图调用，并下钻到用户创作记录。" /><div className="flex shrink-0 rounded-lg border border-[var(--border-strong)] p-1">{([['today','本日'],['week','本周'],['month','本月']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-md px-3 py-1.5 text-xs ${period === value ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'}`}>{label}</button>)}</div></div>
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

            {data.trend && data.trend.length > 0 ? <AdminCard><h2 className="text-sm font-semibold">输入 / 输出趋势</h2><div className="mt-5 flex h-36 items-end gap-2">{data.trend.map((item) => <div key={item.date} className="flex h-full min-w-0 flex-1 items-end gap-[2px]" title={`${item.date} · 输入 ${formatTokens(item.requestTokens)} · 输出 ${formatTokens(item.responseTokens)}`}><div className="flex-1 bg-slate-500" style={{ height: `${Math.max(2, item.requestTokens / maxTrend * 100)}%` }} /><div className="flex-1 bg-emerald-500" style={{ height: `${Math.max(2, item.responseTokens / maxTrend * 100)}%` }} /></div>)}</div><div className="mt-3 flex gap-4 text-xs text-[var(--text-secondary)]"><span><i className="mr-1 inline-block h-2 w-2 bg-slate-500" />输入</span><span><i className="mr-1 inline-block h-2 w-2 bg-emerald-500" />输出</span></div></AdminCard> : null}

            {data.models && data.models.length > 0 ? <AdminCard><h2 className="mb-3 text-sm font-semibold">模型用量</h2><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs text-[var(--text-secondary)]"><tr><th className="pb-2">模型档位</th><th>输入</th><th>输出</th><th>总量</th><th>请求</th></tr></thead><tbody className="divide-y divide-[var(--border-default)]">{data.models.map((item) => <tr key={item.modelTier}><td className="py-2.5 font-medium">{item.modelLabel}</td><td>{formatTokens(item.requestTokens)}</td><td>{formatTokens(item.responseTokens)}</td><td>{formatTokens(item.totalTokens)}</td><td>{item.requestCount.toLocaleString('zh-CN')}</td></tr>)}</tbody></table></div></AdminCard> : null}

            <AdminCard>
              <h2 className="mb-3 text-sm font-semibold">用量排行</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="text-xs text-[var(--text-secondary)]"><tr><th className="pb-2">用户</th><th>输入 Token</th><th>输出 Token</th><th>总 Token</th><th>请求数</th><th>联网</th><th>生图</th><th /></tr></thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {data.users.map((item, index) => (
                      <tr key={item.user.id}>
                        <td className="py-2.5"><span className="mr-2 text-[var(--text-tertiary)]">{index + 1}</span>{item.user.nickname}</td>
                        <td>{formatTokens(item.requestTokens)}</td><td>{formatTokens(item.responseTokens)}</td><td>{formatTokens(item.totalTokens)}</td><td>{item.requestCount}</td><td>{item.webSearchCalls}</td><td>{item.imageCalls}</td>
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
