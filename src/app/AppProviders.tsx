import { PropsWithChildren, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ApiClientError, requestJson } from '@/app/api-client'
import { DeviceProvider } from '@/components/layout/DeviceProvider'
import { ToastProvider } from '@/components/ui/Toast'
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
        <ToastProvider>{children}</ToastProvider>
      </DeviceProvider>
    </QueryClientProvider>
  )
}
