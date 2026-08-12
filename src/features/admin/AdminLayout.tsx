import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LogOut, ShieldCheck } from 'lucide-react'

import { ApiClientError } from '@/app/api-client'
import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { cn } from '@/lib/utils'
import type { Pagination } from '../../../shared/contracts/index.js'
import { adminLogout, getAdminMe } from './api'

/* ---------------- 会话守卫 ---------------- */

/**
 * 管理后台会话守卫：拉取 /api/admin/me。
 * 401 时跳转登录页；加载中渲染骨架；其余错误就地提示。
 */
export function useAdminSession() {
  const query = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: getAdminMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const denied = query.error instanceof ApiClientError && (query.error.status === 401 || query.error.status === 403)

  return { admin: query.data ?? null, isLoading: query.isLoading, denied }
}

/* ---------------- 时间格式化 ---------------- */

export function formatDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ---------------- 布局 ---------------- */

const navItems = [
  { to: '/admin', label: '仪表盘', end: true },
  { to: '/admin/users', label: '用户管理' },
  { to: '/admin/novels', label: '作品管理' },
  { to: '/admin/posts', label: '帖子管理' },
  { to: '/admin/comments', label: '评论管理' },
  { to: '/admin/logs', label: '操作日志' },
  { to: '/admin/settings', label: '安全设置' },
]

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { admin, isLoading, denied } = useAdminSession()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  if (denied) {
    return <Navigate to="/admin/login" replace />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-muted)] text-sm text-[var(--text-secondary)]">
        正在校验管理员身份…
      </div>
    )
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await adminLogout()
    } catch {
      // 登出失败也强制回登录页：cookie 兜底由登录页重新建立
    }
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-[var(--surface-muted)] text-[var(--text-primary)]">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--surface-default)] md:flex">
        <Link to="/admin" className="flex items-center gap-2 px-5 py-5">
          <ShieldCheck size={20} className="text-[var(--text-primary)]" />
          <div>
            <p className="text-sm font-semibold tracking-[-0.01em]">启创墨域</p>
            <p className="text-xs text-[var(--text-secondary)]">管理后台</p>
          </div>
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--border-default)] px-5 py-4">
          <p className="truncate text-sm">{admin?.nickname}</p>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-1 flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <LogOut size={13} />
            退出登录
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 移动端顶栏：横向导航替代侧边栏 */}
        <header className="sticky top-0 z-10 border-b border-[var(--border-default)] bg-[var(--surface-default)] md:hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            <p className="text-sm font-semibold">启创墨域 · 管理后台</p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex items-center gap-1 text-xs text-[var(--text-secondary)]"
            >
              <LogOut size={13} />
              退出
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 py-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-full px-3 py-1.5 text-xs',
                    isActive
                      ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
                      : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* children 由扁平路由表直接注入；Outlet 仅作兜底 */}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">{children ?? <Outlet />}</main>
      </div>
    </div>
  )
}

/* ---------------- 页头 ---------------- */

export function AdminPageHeader({ title, description, extra }: { title: string; description?: string; extra?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-[-0.01em]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p> : null}
      </div>
      {extra}
    </div>
  )
}

/* ---------------- 卡片容器 ---------------- */

export function AdminCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-[var(--border-default)] bg-[var(--surface-default)] p-4 md:p-5', className)}>
      {children}
    </section>
  )
}

/* ---------------- 状态标签 ---------------- */

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'danger' | 'warning' }) {
  const toneClass = {
    neutral: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
    success: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
    danger: 'bg-[var(--color-error)]/15 text-[var(--color-error)]',
    warning: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
  }[tone]

  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs', toneClass)}>{children}</span>
}

/* ---------------- 分页 ---------------- */

function PagerIconButton({
  disabled,
  label,
  onClick,
  children,
}: {
  disabled: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-default)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:text-[var(--text-secondary)]"
    >
      {children}
    </button>
  )
}

/** 列表分页器：左侧总条数，右侧条/页选择 + 首页/上一页/页码输入/下一页/末页 */
export function AdminPager({
  pagination,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: Pagination
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const totalPages = Math.max(Math.ceil(pagination.total / pageSize), 1)
  const [draft, setDraft] = useState(String(page))

  useEffect(() => {
    setDraft(String(page))
  }, [page, totalPages])

  const commitDraft = () => {
    const parsed = Number.parseInt(draft, 10)
    if (Number.isNaN(parsed)) {
      setDraft(String(page))
      return
    }
    const next = Math.min(Math.max(parsed, 1), totalPages)
    setDraft(String(next))
    if (next !== page) {
      onPageChange(next)
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-default)] pt-3">
      <p className="text-xs text-[var(--text-secondary)]">共 {pagination.total} 条</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-default)] px-1.5 text-xs text-[var(--text-primary)] outline-none"
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          条 / 页
        </label>
        <div className="flex items-center gap-1">
          <PagerIconButton label="首页" disabled={page <= 1} onClick={() => onPageChange(1)}>
            <ChevronsLeft size={14} />
          </PagerIconButton>
          <PagerIconButton label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft size={14} />
          </PagerIconButton>
          <input
            value={draft}
            inputMode="numeric"
            aria-label="页码"
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitDraft()
              }
            }}
            className="h-8 w-12 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-default)] text-center text-xs text-[var(--text-primary)] outline-none"
          />
          <span className="px-0.5 text-xs text-[var(--text-secondary)]">/ {totalPages} 页</span>
          <PagerIconButton label="下一页" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight size={14} />
          </PagerIconButton>
          <PagerIconButton label="末页" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>
            <ChevronsRight size={14} />
          </PagerIconButton>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 搜索栏 ---------------- */

export function AdminSearchBar({
  value,
  placeholder,
  onSearch,
}: {
  value: string
  placeholder: string
  onSearch: (keyword: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(draft.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md gap-2">
      <TextInput value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} />
      <Button type="submit" variant="primary">
        搜索
      </Button>
    </form>
  )
}

/* ---------------- 确认弹窗（危险操作二次确认，支持输入确认文本） ---------------- */

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  confirmText,
  tone = 'danger',
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  /** 需要用户逐字输入该文本才能确认（如删除作品需输入书名） */
  confirmText?: string
  /** danger 红色确认钮；primary 常规确认钮（信息展示类弹窗） */
  tone?: 'danger' | 'primary'
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) {
      setTyped('')
    }
  }, [open])

  if (!open) {
    return null
  }

  const blocked = confirmText !== undefined && typed.trim() !== confirmText

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-default)] bg-[var(--surface-default)] p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="mt-2 text-sm text-[var(--text-secondary)]">{description}</div>

        {confirmText !== undefined ? (
          <div className="mt-4">
            <p className="mb-2 text-xs text-[var(--text-secondary)]">
              请输入 <span className="font-semibold text-[var(--text-primary)]">{confirmText}</span> 以确认操作
            </p>
            <TextInput value={typed} placeholder={confirmText} onChange={(event) => setTyped(event.target.value)} />
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>取消</Button>
          <Button
            variant="primary"
            disabled={blocked || loading}
            className={tone === 'danger' ? 'bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]' : undefined}
            onClick={onConfirm}
          >
            {loading ? '处理中…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 加载与空态 ---------------- */

export function AdminPanelState({ state, children }: { state: 'loading' | 'error' | 'empty' | 'ready'; children?: ReactNode }) {
  if (state === 'loading') {
    return <div className="py-16 text-center text-sm text-[var(--text-secondary)]">加载中…</div>
  }
  if (state === 'error') {
    return <div className="py-16 text-center text-sm text-[var(--color-error)]">加载失败，请刷新重试。</div>
  }
  if (state === 'empty') {
    return <div className="py-16 text-center text-sm text-[var(--text-secondary)]">暂无数据</div>
  }
  return <>{children}</>
}
