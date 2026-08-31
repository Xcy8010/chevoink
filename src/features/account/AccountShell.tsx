import { BookOpenText, CircleGauge, Home, Settings2, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import AppImage from '@/components/ui/AppImage'
import Avatar from '@/features/community/components/Avatar'
import { cn } from '@/lib/utils'
import { brandMeta } from '@/lib/theme/tokens'
import { useShellStore } from '@/store/useShellStore'

type Props = { active: 'profile' | 'usage'; planLabel?: string; children: ReactNode }

const navigation = [
  { id: 'profile' as const, label: '个人信息', href: '/account/profile', icon: UserRound },
  { id: 'usage' as const, label: '用量明细', href: '/account/usage', icon: CircleGauge },
]

export default function AccountShell({ active, planLabel = '公测版', children }: Props) {
  const user = useShellStore((state) => state.sessionUser)

  return <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-white text-[var(--text-primary)] [scrollbar-gutter:stable] dark:bg-[var(--app-bg)]">
    <header className="sticky top-0 z-30 border-b border-[#ececea] bg-white/95 backdrop-blur-xl dark:border-[var(--border-subtle)] dark:bg-[color:var(--app-bg)]/94">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-4 px-5 sm:px-8">
        <Link to="/studio" className="flex items-center gap-3"><AppImage src="/favicon.png" alt="" className="h-8 w-8 rounded-[9px]" /><span className="text-sm font-semibold tracking-tight">{brandMeta.productName}</span></Link>
        <span className="hidden h-5 w-px bg-[#e8e8e5] sm:block" />
        <span className="hidden text-xs text-[var(--text-tertiary)] sm:block">账户中心</span>
        <Link to="/studio" className="ml-auto inline-flex h-9 items-center gap-2 rounded-[9px] px-3 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[#f4f4f2] hover:text-[var(--text-primary)]"><Home className="h-4 w-4" />返回创作区</Link>
      </div>
    </header>
    <div className="mx-auto grid min-h-[calc(100%-4rem)] max-w-[1480px] lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-b border-[#ececea] bg-white px-5 py-5 dark:border-[var(--border-subtle)] dark:bg-[var(--app-bg)] lg:border-b-0 lg:border-r lg:px-7 lg:py-9">
        <div className="lg:sticky lg:top-24">
          <div className="hidden items-center gap-3 lg:flex"><Avatar name={user?.nickname ?? '创作者'} src={user?.avatarUrl} size="md" className="h-11 w-11" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.nickname ?? '创作者'}</p><p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">{user?.email ?? planLabel}</p></div></div>
          <span className="mt-3 hidden w-fit rounded-full bg-[#f2f2ef] px-2 py-1 text-[10px] text-[var(--text-secondary)] lg:block">{planLabel}</span>
          <nav className="flex gap-1 lg:mt-8 lg:block lg:space-y-1">{navigation.map(({ id, label, href, icon: Icon }) => <Link key={id} to={href} className={cn('flex h-10 flex-1 items-center gap-2.5 rounded-[9px] px-3 text-sm transition-colors lg:w-full lg:flex-none', active === id ? 'bg-[#f1f1ef] font-medium text-[var(--text-primary)] dark:bg-[var(--surface-muted)]' : 'text-[var(--text-secondary)] hover:bg-[#f6f6f4] hover:text-[var(--text-primary)] dark:hover:bg-[var(--surface-muted)]')}><Icon className="h-4 w-4" />{label}</Link>)}</nav>
          <div className="mt-6 hidden border-t border-[#ececea] pt-4 lg:block"><Link to="/settings" className="flex h-10 items-center gap-2.5 rounded-[9px] px-3 text-sm text-[var(--text-secondary)] hover:bg-[#f6f6f4] hover:text-[var(--text-primary)]"><Settings2 className="h-4 w-4" />全站设置</Link><Link to="/studio" className="flex h-10 items-center gap-2.5 rounded-[9px] px-3 text-sm text-[var(--text-secondary)] hover:bg-[#f6f6f4] hover:text-[var(--text-primary)]"><BookOpenText className="h-4 w-4" />我的作品</Link></div>
        </div>
      </aside>
      <main className="min-w-0 bg-white dark:bg-[var(--app-bg)]">{children}</main>
    </div>
  </div>
}
