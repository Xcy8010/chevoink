import { PropsWithChildren, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ApiClientError, requestJson } from '@/app/api-client'
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
        const payload = await requestJson<UserMePayload>('/api/users/me')

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
