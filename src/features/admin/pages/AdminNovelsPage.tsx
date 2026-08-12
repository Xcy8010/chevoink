import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { useToast } from '@/components/ui/Toast'
import { ApiClientError } from '@/app/api-client'
import { listAdminNovels, restoreAdminNovel, takeDownAdminNovel } from '../api'
import { AdminCard, AdminConfirmDialog, AdminPageHeader, AdminPager, AdminPanelState, formatDateTime, StatusPill } from '../AdminLayout'
import type { AdminNovelRow } from '../../../../shared/contracts/index.js'

export const NOVEL_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '连载中',
  completed: '已完结',
  archived: '已归档',
}

export function isNovelTakenDown(novel: AdminNovelRow): boolean {
  return novel.visibility === 'private' || novel.status === 'archived'
}

export default function AdminNovelsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('search') ?? '')
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [pendingTakeDown, setPendingTakeDown] = useState<AdminNovelRow | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'novels', search, status, page, pageSize],
    queryFn: () =>
      listAdminNovels({
        search: search || undefined,
        status: status || undefined,
        page,
        pageSize,
      }),
  })

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setPage(1)
  }

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'novels'] })

  const takeDownMutation = useMutation({
    mutationFn: (novelId: string) => takeDownAdminNovel(novelId),
    onSuccess: () => {
      toast.success('已下架，前台不再展示该作品')
      invalidate()
      setPendingTakeDown(null)
    },
    onError: (error) => toast.error(error instanceof ApiClientError ? error.message : '下架失败'),
  })

  const restoreMutation = useMutation({
    mutationFn: (novelId: string) => restoreAdminNovel(novelId),
    onSuccess: () => {
      toast.success('已恢复上架')
      invalidate()
    },
    onError: (error) => toast.error(error instanceof ApiClientError ? error.message : '恢复失败'),
  })

  const data = query.data

  return (
    <div>
      <AdminPageHeader title="作品管理" description="检索全站作品，对违规内容执行下架、恢复或删除" />

      <AdminCard className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <form
            className="flex w-full max-w-sm gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setSearch(keyword.trim())
              setPage(1)
            }}
          >
            <TextInput
              value={keyword}
              placeholder="书名 / 作者名"
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Button type="submit" variant="primary">
              搜索
            </Button>
          </form>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            className="h-10 rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-default)] px-3 text-sm text-[var(--text-primary)] outline-none"
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">连载中</option>
            <option value="completed">已完结</option>
            <option value="archived">已归档</option>
          </select>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminPanelState
          state={query.isLoading ? 'loading' : query.isError ? 'error' : data && data.items.length === 0 ? 'empty' : 'ready'}
        >
          {data ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)]">
                      <th className="pb-2 font-normal">作品</th>
                      <th className="pb-2 font-normal">作者</th>
                      <th className="pb-2 font-normal">状态</th>
                      <th className="pb-2 font-normal">分类</th>
                      <th className="pb-2 font-normal">字数 / 章节</th>
                      <th className="pb-2 font-normal">更新时间</th>
                      <th className="pb-2 font-normal">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((novel) => {
                      const takenDown = isNovelTakenDown(novel)
                      return (
                        <tr key={novel.id} className="border-t border-[var(--border-default)]">
                          <td className="py-2.5">
                            <Link to={`/admin/novels/${novel.id}`} className="font-medium hover:underline">
                              {novel.displayTitle ?? novel.title}
                            </Link>
                          </td>
                          <td className="py-2.5 text-[var(--text-secondary)]">{novel.author.nickname}</td>
                          <td className="py-2.5">
                            {takenDown ? (
                              <StatusPill tone="danger">已下架</StatusPill>
                            ) : (
                              <StatusPill tone={novel.status === 'published' || novel.status === 'completed' ? 'success' : 'neutral'}>
                                {NOVEL_STATUS_LABELS[novel.status] ?? novel.status}
                              </StatusPill>
                            )}
                          </td>
                          <td className="py-2.5 text-[var(--text-secondary)]">{novel.categoryName ?? '—'}</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">
                            {novel.wordCount.toLocaleString('zh-CN')} / {novel.chapterCount}
                          </td>
                          <td className="py-2.5 text-[var(--text-secondary)]">{formatDateTime(novel.updatedAt)}</td>
                          <td className="py-2.5">
                            {takenDown ? (
                              <Button size="sm" onClick={() => restoreMutation.mutate(novel.id)} disabled={restoreMutation.isPending}>
                                恢复上架
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => setPendingTakeDown(novel)}>
                                下架
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <AdminPager
                pagination={data.pagination}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          ) : null}
        </AdminPanelState>
      </AdminCard>

      <AdminConfirmDialog
        open={pendingTakeDown !== null}
        title="下架作品"
        description={
          pendingTakeDown ? (
            <>
              下架后 <span className="font-medium text-[var(--text-primary)]">{pendingTakeDown.displayTitle ?? pendingTakeDown.title}</span>{' '}
              将从前台列表、搜索和详情页消失，作者本人也无法继续阅读发布态。可随时恢复。
            </>
          ) : null
        }
        confirmLabel="确认下架"
        loading={takeDownMutation.isPending}
        onCancel={() => setPendingTakeDown(null)}
        onConfirm={() => pendingTakeDown && takeDownMutation.mutate(pendingTakeDown.id)}
      />
    </div>
  )
}
