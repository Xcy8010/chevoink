import { ChevronDown, CircleGauge, LogOut, Newspaper, PenLine, Settings2, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { requestJson } from '@/app/api-client'
import AppImage from '@/components/ui/AppImage'
import Avatar from '@/features/community/components/Avatar'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/useShellStore'

export type AccountNavId = 'profile' | 'usage' | 'posts'

type Props = {
  active?: AccountNavId
  /** 价格/文档等独立页面不挂账户侧栏 */
  withSidebar?: boolean
  children: ReactNode
}

type NavCardItem = { title: string; desc: string; to: string }

/** 顶栏悬停卡片：对照参考站导航，把站内入口按意图分组 */
const NAV_CARDS: { id: string; label: string; items: NavCardItem[] }[] = [
  {
    id: 'product',
    label: '产品',
    items: [
      { title: '创作中心', desc: '从灵感整理到章节成稿与 AI 封面', to: '/studio' },
      { title: '阅读与发现', desc: '分类、书单与编辑推荐，找到下一本', to: '/discover' },
      { title: '社区', desc: '创作动态、读后讨论与作品话题', to: '/community' },
      { title: '榜单', desc: '看看大家都在读什么', to: '/rankings' },
    ],
  },
  {
    id: 'partner',
    label: '合作',
    items: [
      { title: '邀请计划', desc: '邀请好友注册，获得长期有效的 Credits', to: '/account/usage' },
      { title: '作者入驻', desc: '开通创作中心，发布你的第一部作品', to: '/studio' },
      { title: '反馈与建议', desc: '到社区聊聊使用感受与产品建议', to: '/community' },
    ],
  },
  {
    id: 'pricing',
    label: '价格',
    items: [
      { title: '公测版 · ¥0 / 月', desc: '注册即开通，含每日额度与完整 Agent 能力', to: '/account/plan' },
      { title: '查看价格页', desc: '当前套餐权益与后续套餐规划说明', to: '/account/plan' },
    ],
  },
  {
    id: 'help',
    label: '帮助',
    items: [
      { title: '文档', desc: '了解如何使用启创墨域', to: '/account/docs' },
      { title: '常见问题', desc: '获取常见问题的清晰解答', to: '/account/docs?doc=faq' },
      { title: '更新日志', desc: '了解最新功能发布与改进', to: '/account/docs?doc=changelog' },
      { title: '社区互助', desc: '与其他创作者交流心得', to: '/community' },
    ],
  },
]

const SIDEBAR_NAV: { id: AccountNavId; label: string; href: string; icon: typeof UserRound }[] = [
  { id: 'profile', label: '个人信息', href: '/account/profile', icon: UserRound },
  { id: 'usage', label: '用量明细', href: '/account/usage', icon: CircleGauge },
  { id: 'posts', label: '我的发布', href: '/account/posts', icon: Newspaper },
]

const menuItemClass =
  'flex items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[#f4f4f2] hover:text-[var(--text-primary)] dark:hover:bg-[var(--surface-muted)]'

export default function AccountLayout({ active, withSidebar = true, children }: Props) {
  const user = useShellStore((state) => state.sessionUser)
  const setGuest = useShellStore((state) => state.setGuest)
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
    } catch {
      // 服务端退出失败也照清本地会话，避免卡在已失效登录态
    }
    setGuest()
    navigate('/login', { replace: true })
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-[#f6f6f4] text-[var(--text-primary)] [scrollbar-gutter:stable] dark:bg-[var(--app-bg)]">
      <header className="sticky top-0 z-40 border-b border-[#e8e8e5] bg-[#f6f6f4]/95 backdrop-blur-xl dark:border-[var(--border-subtle)] dark:bg-[color:var(--app-bg)]/94">
        <div className="flex h-14 items-center gap-1 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 pr-3">
            <AppImage src="/chevoink-agent.png" alt="" className="h-7 w-7 rounded-[8px]" />
            <span className="text-[15px] font-semibold tracking-tight">Chevoink</span>
          </Link>
          <nav className="hidden items-center md:flex">
            {NAV_CARDS.map((card) => (
              <div key={card.id} className="group relative">
                <button
                  type="button"
                  className="flex h-14 items-center gap-1 px-3 text-sm text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]"
                >
                  {card.label}
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-180" />
                </button>
                <div className="pointer-events-none absolute left-0 top-full z-50 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                  <div className="w-[300px] rounded-[14px] border border-[#e7e7e4] bg-white p-1.5 shadow-[0_16px_40px_rgba(23,27,36,0.12)] dark:border-[var(--border-subtle)] dark:bg-[var(--surface-elevated)]">
                    {card.items.map((item) => (
                      <Link
                        key={`${item.to}-${item.title}`}
                        to={item.to}
                        className="block rounded-[10px] px-3 py-2.5 transition-colors hover:bg-[#f4f4f2] dark:hover:bg-[var(--surface-muted)]"
                      >
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-[var(--text-tertiary)]">{item.desc}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </nav>
          <div className="group relative ml-auto">
            <button type="button" className="flex h-14 items-center px-1" aria-label="账户菜单">
              <Avatar name={user?.nickname ?? '创作者'} src={user?.avatarUrl} size="sm" className="h-8 w-8" />
            </button>
            <div className="pointer-events-none absolute right-0 top-full z-50 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
              <div className="w-[252px] rounded-[14px] border border-[#e7e7e4] bg-white p-1.5 shadow-[0_16px_40px_rgba(23,27,36,0.12)] dark:border-[var(--border-subtle)] dark:bg-[var(--surface-elevated)]">
                <div className="rounded-[10px] bg-[#f4f4f2] px-3 py-2.5 dark:bg-[var(--surface-muted)]">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{user?.nickname ?? '创作者'}</span>
                    <span className="shrink-0 rounded-full bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">公测版</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{user?.email ?? user?.phone ?? '启创墨域账户'}</p>
                </div>
                <div className="my-1 h-px bg-[#ececea] dark:bg-[var(--border-subtle)]" />
                <Link to="/" className={menuItemClass}>
                  Chevoink 网页版
                  <PenLine className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                </Link>
                <Link to="/account/profile" className={menuItemClass}>
                  个人设置
                  <Settings2 className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                </Link>
                <div className="my-1 h-px bg-[#ececea] dark:bg-[var(--border-subtle)]" />
                <button type="button" onClick={() => void handleLogout()} className={cn(menuItemClass, 'w-full hover:text-[var(--color-error)]')}>
                  退出
                  <LogOut className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100%-3.5rem)] items-stretch">
        {withSidebar ? (
          <aside className="hidden w-[264px] shrink-0 border-r border-[#e8e8e5] lg:block dark:border-[var(--border-subtle)]">
            <div className="sticky top-14 px-4 py-7">
              <div className="px-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{user?.nickname ?? '创作者'}</span>
                  <span className="shrink-0 rounded-full bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">公测版</span>
                </p>
                <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{user?.email ?? user?.phone ?? '启创墨域账户'}</p>
              </div>
              <nav className="mt-7 space-y-1">
                {SIDEBAR_NAV.map(({ id, label, href, icon: Icon }) => (
                  <Link
                    key={id}
                    to={href}
                    className={cn(
                      'flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm transition-colors',
                      active === id
                        ? 'bg-[#ececea] font-medium text-[var(--text-primary)] dark:bg-[var(--surface-muted)]'
                        : 'text-[var(--text-secondary)] hover:bg-[#f1f1ef] hover:text-[var(--text-primary)] dark:hover:bg-[var(--surface-muted)]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>
        ) : null}
        <main className="min-w-0 flex-1">
          {withSidebar ? (
            <div className="flex gap-1 overflow-x-auto border-b border-[#e8e8e5] px-4 py-2 lg:hidden dark:border-[var(--border-subtle)]">
              {SIDEBAR_NAV.map(({ id, label, href }) => (
                <Link
                  key={id}
                  to={href}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors',
                    active === id
                      ? 'bg-[#ececea] font-medium text-[var(--text-primary)] dark:bg-[var(--surface-muted)]'
                      : 'text-[var(--text-secondary)] hover:bg-[#f1f1ef] dark:hover:bg-[var(--surface-muted)]',
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}
