import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ThemeMode } from '@/types/app'
import type { AuthTokenPair, User } from '../../shared/contracts'

type AuthStatus = 'checking' | 'guest' | 'authenticated' | 'unavailable'

type ShellState = {
  theme: ThemeMode
  /** 全站沉浸全屏开关（设置页可关），持久化保存 */
  fullscreenEnabled: boolean
  quickCreateOpen: boolean
  authStatus: AuthStatus
  sessionUser: User | null
  authTokens: AuthTokenPair | null
  unreadMessageCount: number
  unreadNotificationCount: number
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setFullscreenEnabled: (enabled: boolean) => void
  openQuickCreate: () => void
  closeQuickCreate: () => void
  setSessionChecking: () => void
  setSessionUnavailable: () => void
  setAuthenticated: (payload: {
    user: User
    tokens?: AuthTokenPair | null
    unreadMessageCount?: number
    unreadNotificationCount?: number
  }) => void
  syncSessionUser: (payload: {
    user: User
    unreadMessageCount: number
    unreadNotificationCount: number
  }) => void
  setGuest: () => void
}

export const useShellStore = create<ShellState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      fullscreenEnabled: true,
      quickCreateOpen: false,
      authStatus: 'checking',
      sessionUser: null,
      authTokens: null,
      unreadMessageCount: 0,
      unreadNotificationCount: 0,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({
          theme: get().theme === 'light' ? 'dark' : 'light',
        }),
      setFullscreenEnabled: (enabled) => set({ fullscreenEnabled: enabled }),
      openQuickCreate: () => set({ quickCreateOpen: true }),
      closeQuickCreate: () => set({ quickCreateOpen: false }),
      setSessionChecking: () =>
        set({
          authStatus: 'checking',
        }),
      setSessionUnavailable: () =>
        set({
          authStatus: 'unavailable',
          sessionUser: null,
          authTokens: null,
          unreadMessageCount: 0,
          unreadNotificationCount: 0,
        }),
      setAuthenticated: ({ user, tokens = null, unreadMessageCount, unreadNotificationCount }) =>
        set({
          authStatus: 'authenticated',
          sessionUser: user,
          authTokens: tokens,
          unreadMessageCount: unreadMessageCount ?? user.unreadMessageCount ?? 0,
          unreadNotificationCount: unreadNotificationCount ?? user.unreadNotificationCount ?? 0,
        }),
      syncSessionUser: ({ user, unreadMessageCount, unreadNotificationCount }) =>
        set((state) => ({
          authStatus: 'authenticated',
          sessionUser: user,
          authTokens: state.authTokens,
          unreadMessageCount: unreadMessageCount ?? user.unreadMessageCount ?? 0,
          unreadNotificationCount: unreadNotificationCount ?? user.unreadNotificationCount ?? 0,
        })),
      setGuest: () =>
        set({
          authStatus: 'guest',
          sessionUser: null,
          authTokens: null,
          unreadMessageCount: 0,
          unreadNotificationCount: 0,
        }),
    }),
    {
      name: 'chevoink-shell',
      partialize: (state) => ({
        theme: state.theme,
        fullscreenEnabled: state.fullscreenEnabled,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        theme: (persistedState as Partial<ShellState>)?.theme ?? currentState.theme,
        fullscreenEnabled:
          (persistedState as Partial<ShellState>)?.fullscreenEnabled ?? currentState.fullscreenEnabled,
      }),
    },
  ),
)
