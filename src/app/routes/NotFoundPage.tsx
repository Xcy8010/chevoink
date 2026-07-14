import { Link } from 'react-router-dom'

import AppState from '@/components/ui/AppState'

export default function NotFoundPage() {
  return (
    <AppState
      eyebrow="404"
      title="你访问的页面没有找到"
      description="可能已经被移动，或者这个地址已经失效。回到首页继续阅读、发现或开始创作。"
      details={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--surface-contrast)] px-4 text-sm font-medium text-[var(--text-contrast)] transition-colors hover:bg-[var(--surface-contrast-hover)]"
          >
            回到首页
          </Link>
          <Link
            to="/discover"
            className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            去发现看看
          </Link>
        </div>
      }
    />
  )
}
