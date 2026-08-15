import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { setSessionToken } from '@/lib/auth-token'
import type { ThemeMode } from '@/types/app'
import type { AuthTokenPair, User } from '../../shared/contracts'

type AuthStatus = 'checking' | 'guest' | 'authenticated' | 'unavailable'

type ShellState = {
  theme: ThemeMode
  /** 全站沉浸全屏开关（设置页可关），持久化保存；默认关闭，由首次进入弹窗询问 */
  fullscreenEnabled: boolean
  /** 是否已回答过「首次进入是否开启全屏」弹窗，持久化保存 */
  fullscreenPromptSeen: boolean
  quickCreateOpen: boolean
  authStatus: AuthStatus
  sessionUser: User | null
  authTokens: AuthTokenPair | null
  unreadMessageCount: number
  unreadNotificationCount: number
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setFullscreenEnabled: (enabled: boolean) => void
  /** 首次进入弹窗中的选择：记录偏好并标记弹窗已回答 */
  chooseFullscreen: (enabled: boolean) => void
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
      fullscreenEnabled: false,
      fullscreenPromptSeen: false,
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
      chooseFullscreen: (enabled) => set({ fullscreenEnabled: enabled, fullscreenPromptSeen: true }),
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
      setAuthenticated: ({ user, tokens = null, unreadMessageCount, unreadNotificationCount }) => {
        // 登录令牌落盘：安卓壳 cookie 未及时刷盘时以 Authorization 头做备选通道，避免杀后台丢登录态；
        // 优先存长效 refresh 令牌（30 天），服务端闸口会静默重签 access，Bearer 备选通道寿命不缩短
        setSessionToken(tokens?.refreshToken ?? tokens?.accessToken ?? null)
        set({
          authStatus: 'authenticated',
          sessionUser: user,
          authTokens: tokens,
          unreadMessageCount: unreadMessageCount ?? user.unreadMessageCount ?? 0,
          unreadNotificationCount: unreadNotificationCount ?? user.unreadNotificationCount ?? 0,
        })
      },
      syncSessionUser: ({ user, unreadMessageCount, unreadNotificationCount }) =>
        set((state) => ({
          authStatus: 'authenticated',
          sessionUser: user,
          authTokens: state.authTokens,
          unreadMessageCount: unreadMessageCount ?? user.unreadMessageCount ?? 0,
          unreadNotificationCount: unreadNotificationCount ?? user.unreadNotificationCount ?? 0,
        })),
      setGuest: () => {
        // 会话已确认无效或主动退出：同步清掉本地备选令牌
        setSessionToken(null)
        set({
          authStatus: 'guest',
          sessionUser: null,
          authTokens: null,
          unreadMessageCount: 0,
          unreadNotificationCount: 0,
        })
      },
    }),
    {
      name: 'chevoink-shell',
      partialize: (state) => ({
        theme: state.theme,
        fullscreenEnabled: state.fullscreenEnabled,
        fullscreenPromptSeen: state.fullscreenPromptSeen,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ShellState> | undefined
        return {
          ...currentState,
          theme: persisted?.theme ?? currentState.theme,
          fullscreenEnabled: persisted?.fullscreenEnabled ?? currentState.fullscreenEnabled,
          // 老版本没有该字段：只要本地已存过全屏偏好就视为回答过，避免老用户被再次弹窗
          fullscreenPromptSeen:
            persisted?.fullscreenPromptSeen ?? persisted?.fullscreenEnabled !== undefined,
        }
      },
    },
  ),
)
