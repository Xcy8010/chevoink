import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { useShellStore } from '@/store/useShellStore'

type RequireAuthRouteProps = {
  children: ReactNode
  title?: string
  description?: string
}

export default function RequireAuthRoute({
  children,
  title = '登录后即可继续查看这里的内容',
  description = '登录后，你的书架、草稿和个人记录都会继续保留。',
}: RequireAuthRouteProps) {
  const location = useLocation()
  const authStatus = useShellStore((state) => state.authStatus)
  const isAuthenticated = useShellStore((state) => state.authStatus === 'authenticated' && !!state.sessionUser)

  if (authStatus === 'checking') {
    return <AppState tone="loading" title="正在核对账户状态" description="很快就好。" />
  }

  if (authStatus === 'unavailable') {
    return (
      <AppState
        tone="error"
        title="暂时无法打开这里"
        description="账户状态还没有准备好，请稍后再试，或先回到首页继续浏览。"
        primaryAction={{ label: '返回首页', href: '/' }}
        secondaryAction={{ label: '重新加载', onClick: () => window.location.reload() }}
      />
    )
  }

  if (!isAuthenticated) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)

    return (
      <AppState
        title={title}
        description={description}
        primaryAction={{ label: '去登录', href: `/login?redirect=${redirect}` }}
        secondaryAction={{ label: '创建账户', href: `/register?redirect=${redirect}` }}
      />
    )
  }

  return <>{children}</>
}
