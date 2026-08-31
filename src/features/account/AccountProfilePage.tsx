import { ArrowRight, BookOpenText, CalendarDays, KeyRound, Mail, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import Avatar from '@/features/community/components/Avatar'
import { useShellStore } from '@/store/useShellStore'
import AccountShell from './AccountShell'

export default function AccountProfilePage() {
  const user = useShellStore((state) => state.sessionUser)
  const joined = user?.createdAt ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(user.createdAt)) : '—'

  return <AccountShell active="profile"><div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
    <div><p className="text-sm text-[var(--text-tertiary)]">账户</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.035em]">个人信息</h1><p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">查看账户资料、安全状态与创作入口。</p></div>
    <section className="mt-9 rounded-[16px] border border-[#e9e9e6] p-6 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><Avatar name={user?.nickname ?? '创作者'} src={user?.avatarUrl} size="lg" className="h-16 w-16" /><div className="min-w-0 flex-1"><h2 className="truncate text-xl font-semibold">{user?.nickname ?? '创作者'}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{user?.bio?.trim() || '还没有填写个人简介'}</p></div><Link to="/settings" className="inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border border-[#e4e4e1] px-3 text-xs hover:bg-[#f6f6f4]"><Settings2 className="h-4 w-4" />编辑资料</Link></div></section>
    <section className="mt-5 overflow-hidden rounded-[16px] border border-[#e9e9e6]"><div className="flex items-center gap-3 border-b border-[#ececea] px-5 py-4"><Mail className="h-4 w-4 text-[var(--text-tertiary)]" /><span className="w-24 text-xs text-[var(--text-tertiary)]">邮箱</span><span className="min-w-0 flex-1 truncate text-sm">{user?.email ?? '未绑定'}</span></div><div className="flex items-center gap-3 border-b border-[#ececea] px-5 py-4"><CalendarDays className="h-4 w-4 text-[var(--text-tertiary)]" /><span className="w-24 text-xs text-[var(--text-tertiary)]">加入时间</span><span className="text-sm">{joined}</span></div><div className="flex items-center gap-3 px-5 py-4"><KeyRound className="h-4 w-4 text-[var(--text-tertiary)]" /><span className="w-24 text-xs text-[var(--text-tertiary)]">账户安全</span><span className="text-sm">{user?.passwordConfigured ? '已设置登录密码' : '建议设置登录密码'}</span><Link to="/settings" className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">管理<ArrowRight className="h-3.5 w-3.5" /></Link></div></section>
    <Link to="/studio" className="mt-7 flex items-center gap-4 rounded-[16px] bg-[#f4f4f2] p-5 transition-colors hover:bg-[#eeeeeb]"><span className="inline-flex h-10 w-10 items-center justify-center rounded-[11px] bg-white"><BookOpenText className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">继续创作</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">回到 Work 或 IDE 工作区，继续最近的作品与任务。</span></span><ArrowRight className="h-4 w-4" /></Link>
  </div></AccountShell>
}
