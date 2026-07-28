import { PropsWithChildren, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ApiClientError, requestJson } from '@/app/api-client'
import { DeviceProvider } from '@/components/layout/DeviceProvider'
import { ToastProvider } from '@/components/ui/Toast'
import UpdateBanner from '@/components/ui/UpdateBanner'
import { hydrateReadingSync } from '@/features/home/reading-sync'
import { syncNativeSystemBars } from '@/lib/native-app'
import { useShellStore } from '@/store/useShellStore'
import type { UserMePayload } from '../../shared/contracts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function AppProviders({ children }: PropsWithChildren) {
  const theme = useShellStore((state) => state.theme)
  const setSessionChecking = useShellStore((state) => state.setSessionChecking)
  const setSessionUnavailable = useShellStore((state) => state.setSessionUnavailable)
  const setGuest = useShellStore((state) => state.setGuest)
  const syncSessionUser = useShellStore((state) => state.syncSessionUser)

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
    // APP 壳内：把原生状态栏/导航栏染成当前主题背景色，使上下安全区跟随主题（浏览器为空操作）
    const appBg = getComputedStyle(document.documentElement).getPropertyValue('--app-bg').trim()
    syncNativeSystemBars(appBg, theme === 'dark')
  }, [theme])

  useEffect(() => {
    let disposed = false

    async function bootstrapShellSession() {
      setSessionChecking()

      try {
        // 经 react-query 缓存拉取：与页面级 ['community','me'] 查询共享同一请求/缓存，避免首屏重复请求 /api/users/me
        const payload = await queryClient.fetchQuery({
          queryKey: ['community', 'me'],
          queryFn: () => requestJson<UserMePayload>('/api/users/me'),
          staleTime: 30_000,
          retry: false,
        })

        if (!disposed) {
          if (!payload.user) {
            setGuest()
            return
          }

          syncSessionUser({
            user: payload.user,
            unreadMessageCount: payload.unreadMessageCount,
            unreadNotificationCount: payload.unreadNotificationCount,
          })

          // 登录后水合书架/阅读进度：拉取云端并合并本地，变更后刷新 /me 让书架列表重算
          void hydrateReadingSync().then((changed) => {
            if (changed && !disposed) {
              void queryClient.invalidateQueries({ queryKey: ['community', 'me'] })
            }
          })
        }
      } catch (error) {
        if (disposed) {
          return
        }

        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
          setGuest()
          return
        }

        setSessionUnavailable()
      }
    }

    void bootstrapShellSession()

    return () => {
      disposed = true
    }
  }, [setGuest, setSessionChecking, setSessionUnavailable, syncSessionUser])

  return (
    <QueryClientProvider client={queryClient}>
      <DeviceProvider>
        <ToastProvider>
          {children}
          <UpdateBanner />
        </ToastProvider>
      </DeviceProvider>
    </QueryClientProvider>
  )
}
