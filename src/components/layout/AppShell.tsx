import { ReactNode, UIEvent, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ChevronUp, Compass, FileText, Home, LogOut, MessageSquareMore, MoonStar, PenSquare, Plus, Settings, SunMedium, UserRound, Users } from 'lucide-react'

import { ApiClientError, requestJson } from '@/app/api-client'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import QuickCreateSheet from '@/components/layout/QuickCreateSheet'
import Avatar from '@/features/community/components/Avatar'
import { getInteractionBadges, listConversations } from '@/features/community/api'
import GlobalSearchBox from '@/features/search/GlobalSearchBox'
import { brandMeta } from '@/lib/theme/tokens'
import { enterImmersiveFullscreen } from '@/lib/immersive-fullscreen'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/useShellStore'
import { desktopNavItems, mobileNavItems, workspaceLinks } from '@/types/app'

type AppShellProps = {
  title: string
  description: string
  children: ReactNode
}

export default function AppShell({ title, description, children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const quickCreateOpen = useShellStore((state) => state.quickCreateOpen)
  const openQuickCreate = useShellStore((state) => state.openQuickCreate)
  const closeQuickCreate = useShellStore((state) => state.closeQuickCreate)
  const toggleTheme = useShellStore((state) => state.toggleTheme)
  const theme = useShellStore((state) => state.theme)
  const fullscreenEnabled = useShellStore((state) => state.fullscreenEnabled)
  const fullscreenPromptSeen = useShellStore((state) => state.fullscreenPromptSeen)
  const chooseFullscreen = useShellStore((state) => state.chooseFullscreen)
  const authStatus = useShellStore((state) => state.authStatus)
  const sessionUser = useShellStore((state) => state.sessionUser)
  const setGuest = useShellStore((state) => state.setGuest)
  const isHome = location.pathname === '/'
  const isStudioRoute = location.pathname === '/studio' || location.pathname.startsWith('/studio/')
  const isReaderRoute = /^\/novel\/[^/]+\/read\/[^/]+$/.test(location.pathname)
  // 作品详情页自带书名主标题，壳层引导文案反而冗余，隐藏页头
  const isNovelDetailRoute = /^\/novel\/[^/]+$/.test(location.pathname)
  // 帖子详情页以正文为中心，壳层大标题会造成信息重复，同样隐藏
  const isPostDetailRoute = /^\/post\/[^/]+$/.test(location.pathname)
  // 消息页自带列表标题，壳层页头只会占掉聊天区高度，隐藏；主容器改为固定不滚动
  const isMessagesRoute = location.pathname === '/messages'
  // 关注粉丝/获赞明细页自带紧凑标题，壳层大标题多余，隐藏
  const isMeListRoute = location.pathname === '/me/follows' || location.pathname === '/me/likes'
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register'
  const isAuthenticated = authStatus === 'authenticated' && !!sessionUser
  const accountRoute = authStatus === 'guest' ? '/login?redirect=%2Fme' : '/me'
  const mainScrollRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const desktopAccountMenuRef = useRef<HTMLDivElement | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  // 默认折叠，保证内容区最大宽度；展开状态仅影响桌面端(lg)，平板端常驻收起导航轨
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [desktopAccountMenuOpen, setDesktopAccountMenuOpen] = useState(false)
  const [inlineAccountExpanded, setInlineAccountExpanded] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(160)

  // 全局未读汇总（私信 + 互动 + 新粉丝）：驱动底部导航/侧边栏的消息红点；
  // queryKey 与消息页共用，避免重复请求，30s 轻轮询保持新鲜
  const shellBadgesQuery = useQuery({
    queryKey: ['community', 'interaction-badges'],
    queryFn: getInteractionBadges,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  })
  const shellConversationsQuery = useQuery({
    queryKey: ['community', 'conversations'],
    queryFn: () => listConversations(30),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  })
  const conversationUnread = (shellConversationsQuery.data?.items ?? []).reduce(
    (sum, item) => sum + item.unreadCount,
    0,
  )
  const totalUnread =
    conversationUnread +
    (shellBadgesQuery.data?.interactionsUnseen ?? 0) +
    (shellBadgesQuery.data?.followersUnseen ?? 0)
  // 所有红点数字上限 99，超过也只显示 99
  const unreadBadgeText = totalUnread > 99 ? '99' : `${totalUnread}`

  // 全站沉浸全屏（手机/平板/电脑通用，首次进入弹窗询问、设置页可改）：浏览器禁止页面
  // 加载时自动全屏，故开启后在用户每次点击/触摸时进入并持续保持；关闭开关后立即
  // 退出全屏且不再自动进入；不支持的环境静默降级（进入逻辑见 lib/immersive-fullscreen）
  useEffect(() => {
    if (!fullscreenEnabled) {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
      return
    }

    window.addEventListener('pointerup', enterImmersiveFullscreen)
    return () => window.removeEventListener('pointerup', enterImmersiveFullscreen)
  }, [fullscreenEnabled])

  useEffect(() => {
    const headerEl = headerRef.current

    if (!headerEl) {
      return
    }

    const updateHeaderHeight = () => {
      setHeaderHeight(Math.ceil(headerEl.getBoundingClientRect().height))
    }

    updateHeaderHeight()

    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(headerEl)
    window.addEventListener('resize', updateHeaderHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeaderHeight)
    }
  }, [])

  useEffect(() => {
    const nextScrollRoot = mainScrollRef.current

    if (nextScrollRoot) {
      nextScrollRoot.scrollTo({ top: 0, behavior: 'auto' })
    }

    setIsScrolled(false)
    setDesktopAccountMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!desktopAccountMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!desktopAccountMenuRef.current?.contains(event.target as Node)) {
        setDesktopAccountMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDesktopAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [desktopAccountMenuOpen])

  const handleMainScroll = (event: UIEvent<HTMLDivElement>) => {
    setIsScrolled(event.currentTarget.scrollTop > 12)
  }

  async function handleLogout() {
    try {
      await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (!(error instanceof ApiClientError)) {
        return
      }
    } finally {
      setDesktopAccountMenuOpen(false)
      setGuest()
      navigate('/login', { replace: true })
    }
  }

  const accountActionClass =
    'flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]'

  const accountPanelClass =
    'mt-3 grid gap-2 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-2'

  function closeAccountMenu() {
    setDesktopAccountMenuOpen(false)
  }

  function openAccountRoute(path: string) {
    closeAccountMenu()
    navigate(path)
  }

  function renderAccountMenuActions(layout: 'popover' | 'inline') {
    const containerClass =
      layout === 'popover'
        ? 'absolute inset-x-0 bottom-[calc(100%+12px)] z-20 rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-default)] p-2 shadow-[0_12px_28px_rgba(17,24,39,0.10)]'
        : accountPanelClass

    const actionButtonClass =
      layout === 'popover'
        ? accountActionClass
        : 'flex items-center gap-3 rounded-[18px] border border-[var(--border-subtle)] px-3 py-3 text-left text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]'

    return (
      <div className={containerClass}>
        <button type="button" className={actionButtonClass} onClick={() => openAccountRoute('/me')}>
          <UserRound className="h-4 w-4 text-[var(--text-secondary)]" />
          个人中心
        </button>
        <button type="button" className={actionButtonClass} onClick={() => openAccountRoute('/settings')}>
          <Settings className="h-4 w-4 text-[var(--text-secondary)]" />
          设置
        </button>
        <button type="button" className={actionButtonClass} onClick={() => openAccountRoute('/studio')}>
          <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
          我的创作
        </button>
        <button type="button" className={actionButtonClass} onClick={() => void handleLogout()}>
          <LogOut className="h-4 w-4 text-[var(--text-secondary)]" />
          退出登录
        </button>
      </div>
    )
  }

  function renderAccountCard(layout: 'sidebar' | 'inline') {
    const isSidebar = layout === 'sidebar'
    const inlineExpanded = isSidebar ? true : inlineAccountExpanded
    const isCompactInline = !isSidebar && !inlineExpanded

    if (isAuthenticated && sessionUser) {
      return (
        <div ref={isSidebar ? desktopAccountMenuRef : undefined} className="relative">
          {isSidebar && desktopAccountMenuOpen ? renderAccountMenuActions('popover') : null}

          <button
            type="button"
            onClick={() => {
              if (isSidebar) {
                setDesktopAccountMenuOpen((current) => !current)
                return
              }

              setInlineAccountExpanded((current) => !current)
            }}
            className={cn(
              'flex w-full items-center gap-3 text-left transition-colors hover:bg-[var(--surface-muted)]',
              isSidebar
                ? 'rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-3'
                : isCompactInline
                  ? 'rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3'
                  : 'rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-4 md:px-5',
            )}
          >
            <Avatar
              name={sessionUser.nickname}
              src={sessionUser.avatarUrl}
              size="md"
              className={cn(!isSidebar && 'h-12 w-12')}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[var(--text-primary)] md:text-[15px]">
                {sessionUser.nickname}
              </span>
              {!isCompactInline ? (
                <span className="block truncate text-xs text-[var(--text-secondary)] md:text-sm">
                  {sessionUser.isAuthor ? '继续管理作品与资料' : '继续管理书架与资料'}
                </span>
              ) : null}
            </span>
            <ChevronUp
              className={cn(
                'h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform',
                !(isSidebar ? desktopAccountMenuOpen : inlineExpanded) && 'rotate-180',
              )}
            />
          </button>

          {!isSidebar && inlineExpanded ? renderAccountMenuActions('inline') : null}
        </div>
      )
    }

    return (
      <div
        className={cn(
          'space-y-3 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-default)]',
          isSidebar ? 'px-3 py-3' : isCompactInline ? 'px-4 py-3' : 'px-4 py-4 md:px-5',
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (!isSidebar) {
              setInlineAccountExpanded((current) => !current)
            }
          }}
          className={cn('flex w-full items-center gap-3 text-left', !isSidebar && 'transition-colors hover:bg-[var(--surface-muted)] rounded-[18px]')}
        >
          <span className="inline-flex aspect-square h-11 w-11 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">登录后同步你的内容</p>
            {!isCompactInline ? (
              <p className="text-xs text-[var(--text-secondary)] md:text-sm">书架、创作和资料会一起保留。</p>
            ) : null}
          </div>
          {!isSidebar ? (
            <ChevronUp
              className={cn(
                'ml-auto h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform',
                !inlineExpanded && 'rotate-180',
              )}
            />
          ) : null}
        </button>
        {inlineExpanded ? (
          <div className={cn('flex gap-2', !isSidebar && 'sm:max-w-[320px]')}>
            <Button className="flex-1" variant="secondary" onClick={() => navigate('/login?redirect=%2Fme')}>
              登录
            </Button>
            <Button className="flex-1" variant="primary" onClick={() => navigate('/register?redirect=%2Fme')}>
              注册
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  function renderCollapsedRailItem(href: string, label: string) {
    const Icon =
      href === '/'
        ? Home
        : href === '/discover'
          ? Compass
          : href === '/studio'
            ? PenSquare
            : href === '/community'
              ? Users
              : MessageSquareMore

    return (
      <NavLink
        key={href}
        to={href === '/me' ? accountRoute : href}
        title={label}
        className={({ isActive }) =>
          cn(
            'inline-flex h-11 w-11 items-center justify-center rounded-[16px] border transition-colors',
            isActive
              ? 'border-[var(--border-contrast)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
              : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
          )
        }
      >
        <span className="relative inline-flex">
          <Icon className="h-4 w-4" />
          {/* 折叠态只提示有新消息，不显示具体数字 */}
          {href === '/messages' && totalUnread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-rose-500" />
          ) : null}
        </span>
      </NavLink>
    )
  }

  const topNavClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
    )

  const railNavClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex w-full min-h-[44px] items-center justify-start rounded-[var(--radius-pill)] border border-transparent px-4 py-2.5 text-sm font-medium transition-colors',
      isActive
        ? 'border-[var(--border-contrast)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
        : 'text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)]',
    )

  const bottomNavClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-w-0 items-center justify-center rounded-[var(--radius-pill)] px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-transparent text-[var(--text-primary)]'
        : 'text-[var(--text-secondary)] hover:bg-transparent hover:text-[var(--text-primary)]',
    )

  return (
    <div
      // 壳高随软键盘收缩（iOS 等不缩小布局视口的浏览器），消息输入栏、评论框等随之被顶到键盘上方
      className="h-[calc(100dvh-var(--keyboard-inset,0px))] overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]"
      style={{ ['--app-header-height' as string]: `${headerHeight}px` }}
    >
      {/* IDE 式布局：侧边栏贴视口左缘常驻文档流，收起/展开只变宽度，右侧内容区随之自然靠拢 */}
      <div className="flex h-full">
        <aside
          className={cn(
            'hidden shrink-0 md:flex md:h-full md:flex-col md:overflow-y-auto md:transition-[width] md:duration-200',
            isAuthRoute && 'md:hidden',
            'md:w-[64px]',
            sidebarExpanded ? 'lg:w-[284px]' : 'lg:w-[64px]',
          )}
        >
          {sidebarExpanded ? (
            <div className="hidden min-h-full w-full flex-col px-3 pb-5 pt-[calc(var(--safe-top)+14px)] lg:flex">
              {/* 导航与账号整合为一张卡片：顶部收起按钮 + 导航链接，底部头像账号区 */}
              <Surface
                as="nav"
                tone="muted"
                padding="sm"
                className="flex flex-1 flex-col border-[var(--border-strong)] bg-[color:var(--surface-default)]/72 shadow-none rounded-[28px]"
              >
                <div className="flex items-center justify-end px-2 pb-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setSidebarExpanded(false)}
                    aria-label="收起侧边栏"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1 px-1 py-2">
                  {workspaceLinks
                    .filter((item) => item.href !== '/me')
                    .map((item) => (
                      <NavLink
                        key={item.href}
                        to={item.href === '/me' ? accountRoute : item.href}
                        className={railNavClass}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          {item.label}
                          {item.href === '/messages' && totalUnread > 0 ? (
                            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-center text-[11px] font-semibold leading-none tabular-nums text-white">
                              {unreadBadgeText}
                            </span>
                          ) : null}
                        </span>
                      </NavLink>
                    ))}
                </div>
                <div className="mt-auto border-t border-[var(--border-subtle)] px-1 pb-1 pt-2">
                  {renderAccountCard('sidebar')}
                </div>
              </Surface>
            </div>
          ) : null}

          {/* 收起态导航轨：平板端(md)常驻，桌面端展开时隐藏 */}
          <div
            className={cn(
              'flex min-h-full w-full flex-col items-center px-2 pb-5 pt-[calc(var(--safe-top)+14px)]',
              sidebarExpanded && 'lg:hidden',
            )}
          >
              <button
                type="button"
                onClick={() => setSidebarExpanded(true)}
                aria-label="展开侧边栏"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="mt-4 flex flex-col items-center gap-3">
                {workspaceLinks.filter((item) => item.href !== '/me').map((item) => renderCollapsedRailItem(item.href, item.label))}
              </div>

              <div className="mt-auto flex flex-col items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
                {isAuthenticated && sessionUser ? (
                  <div className="group relative">
                    <button
                      type="button"
                      title={sessionUser.nickname}
                      onClick={() => navigate('/me')}
                      className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <Avatar name={sessionUser.nickname} src={sessionUser.avatarUrl} size="md" className="h-11 w-11 border-0 bg-transparent" />
                    </button>
                    {/* 悬停浮层：头像+昵称+四个快捷入口；fixed 脱离 aside 的 overflow 裁剪，pl-6 与头像区域重叠避免悬停闪断 */}
                    <div className="invisible fixed bottom-5 left-[52px] z-50 pl-6 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                      <div className="w-60 rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-default)] p-2 shadow-[0_12px_28px_rgba(17,24,39,0.12)]">
                        <div className="flex items-center gap-3 rounded-[18px] px-3 py-3">
                          <Avatar name={sessionUser.nickname} src={sessionUser.avatarUrl} size="md" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                              {sessionUser.nickname}
                            </span>
                            <span className="block truncate text-xs text-[var(--text-secondary)]">
                              {sessionUser.isAuthor ? '继续管理作品与资料' : '继续管理书架与资料'}
                            </span>
                          </span>
                        </div>
                        <div className="my-1 border-t border-[var(--border-subtle)]" />
                        <button type="button" className={accountActionClass} onClick={() => navigate('/me')}>
                          <UserRound className="h-4 w-4 text-[var(--text-secondary)]" />
                          个人中心
                        </button>
                        <button type="button" className={accountActionClass} onClick={() => navigate('/settings')}>
                          <Settings className="h-4 w-4 text-[var(--text-secondary)]" />
                          设置
                        </button>
                        <button type="button" className={accountActionClass} onClick={() => navigate('/studio')}>
                          <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
                          我的创作
                        </button>
                        <button type="button" className={accountActionClass} onClick={() => void handleLogout()}>
                          <LogOut className="h-4 w-4 text-[var(--text-secondary)]" />
                          退出登录
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    title="登录或注册"
                    onClick={() => navigate('/login?redirect=%2Fme')}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                  >
                    <UserRound className="h-4 w-4" />
                  </button>
                )}
              </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto flex h-full max-w-[var(--shell-max-width)] flex-col px-4 md:px-6 xl:px-8">
            <header
              ref={headerRef}
              className={cn(
                'pointer-events-none fixed left-0 right-0 top-0 z-40 px-4 pt-[calc(var(--safe-top)+8px)] transition-[left] duration-200 md:px-6 md:pt-4 xl:px-8',
                !isAuthRoute && 'md:left-[64px]',
                !isAuthRoute && sidebarExpanded && 'lg:left-[284px]',
                isStudioRoute && 'hidden lg:block',
              )}
            >
          <div className="mx-auto max-w-[var(--shell-max-width)]">
            <div
              className={cn(
                'pointer-events-auto relative rounded-[28px] border transition-[background-color,border-color,box-shadow,padding,transform] duration-200 ease-out',
                'border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 shadow-[0_10px_28px_rgba(17,24,39,0.06)] backdrop-blur',
                isScrolled
                  ? 'px-3 py-3 shadow-[0_14px_32px_rgba(17,24,39,0.08)]'
                  : 'px-3 py-3 md:px-4',
              )}
            >
              <div className="relative">
            <div className="flex items-center gap-3 md:gap-4">
                  <Link to="/" className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 md:h-11 md:w-11">
                      <img
                        src="/favicon.png"
                        alt="启创墨域 Logo"
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
                        {brandMeta.productNameEn}
                      </span>
                      <span className="block truncate text-base font-semibold text-[var(--text-primary)]">{brandMeta.productName}</span>
                    </span>
                  </Link>

                  <nav className="ml-2 hidden items-center gap-1 lg:flex">
                    {desktopNavItems.map((item) => (
                      <NavLink key={item.href} to={item.href} className={topNavClass}>
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>

                  <div className="ml-auto flex items-center gap-1 md:gap-2">
                    <Button
                      onClick={toggleTheme}
                      variant="ghost"
                      className="h-10 w-10 border border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 px-0 hover:bg-[color:var(--surface-default)] md:h-11 md:w-11"
                      aria-label="切换主题"
                    >
                      {theme === 'light' ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
                    </Button>
                    <NavLink to="/messages" className="hidden md:flex">
                      {({ isActive }) => (
                        <span
                          className={cn(
                            'inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-pill)] transition-colors',
                            isActive
                              ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
                          )}
                        >
                          <span className="relative inline-flex">
                            <MessageSquareMore className="h-4 w-4" />
                            {totalUnread > 0 ? (
                              <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-rose-500" />
                            ) : null}
                          </span>
                        </span>
                      )}
                    </NavLink>
                    <Button onClick={openQuickCreate} variant="primary" className="hidden md:inline-flex lg:hidden">
                      <Plus className="h-4 w-4" />
                      开始创作
                    </Button>
                  </div>
                </div>

                <div
                  className={cn(
                    'grid gap-2 transition-[margin,transform,opacity] duration-200 ease-out md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
                    isScrolled ? 'mt-2' : 'mt-3',
                  )}
                >
                  <GlobalSearchBox />
                  <nav className="hidden items-center gap-1 overflow-x-auto md:flex lg:hidden">
                    {desktopNavItems.map((item) => (
                      <NavLink key={item.href} to={item.href} className={topNavClass}>
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <main
            ref={mainScrollRef}
            onScroll={handleMainScroll}
            className={cn(
              'app-main-scroll min-h-0 flex-1 overscroll-contain lg:self-stretch',
              isStudioRoute || isReaderRoute || isMessagesRoute
                ? 'overflow-hidden'
                : // 只声明 overflow-y-auto 时 overflow-x 会隐式变成 auto，子元素负外边距溢出会让整页可横滑，这里明确封死横向
                  'overflow-x-hidden overflow-y-auto',
            )}
          >
            <div
              className={cn(
                'space-y-4 pb-[calc(88px+var(--safe-bottom))] pr-0.5 md:space-y-6 md:pb-8',
                isReaderRoute && 'flex h-full min-h-0 flex-col space-y-4 pb-0 md:pb-0',
                // 创作区手机端由自己的底部导航接管，不再为全局底栏留白
                isStudioRoute && 'flex h-full min-h-0 flex-col space-y-4 md:space-y-4 pb-0 md:pb-0',
                // 消息页：列式铺满剩余高度，手机端避让底部导航，桌面端留少量底边距；app-messages-main 供键盘打开时收紧底部留白
                isMessagesRoute && 'app-messages-main flex h-full min-h-0 flex-col space-y-0 pb-[calc(76px+var(--safe-bottom))] md:pb-6',
              )}
              style={{ paddingTop: headerHeight + 12 }}
            >
              {!isHome ? (
                <section
                  className={cn(
                    'space-y-2 px-0.5 pt-1 md:space-y-3 md:pt-2',
                    isStudioRoute && 'hidden',
                    isReaderRoute && 'hidden',
                    isNovelDetailRoute && 'hidden',
                    isPostDetailRoute && 'hidden',
                    isMessagesRoute && 'hidden',
                    isMeListRoute && 'hidden',
                    isAuthRoute && 'pt-3 md:pt-4',
                  )}
                >
                  <h1 className="max-w-4xl text-[1.625rem] font-semibold tracking-tight text-[var(--text-primary)] md:text-[2rem]">
                    {title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)] md:text-base md:leading-7">
                    {description}
                  </p>
                </section>
              ) : null}
              {children}
            </div>
          </main>
        </div>
          </div>
        </div>
      </div>

      <nav
        className={cn(
          'app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 px-4 pb-[calc(12px+var(--safe-bottom))] pt-3 backdrop-blur md:hidden',
          isReaderRoute && 'hidden',
          // 创作区有自己的底部导航（对话/写作/章节/更多），隐藏全局底栏
          isStudioRoute && 'hidden',
        )}
      >
        <div className="mx-auto grid max-w-lg grid-cols-[1fr_1fr_auto_1fr_1fr] items-center gap-2">
          {mobileNavItems.slice(0, 2).map((item) => (
            <NavLink key={item.href} to={item.href === '/me' ? accountRoute : item.href} className={bottomNavClass}>
              <span className="relative">
                {item.label}
                {item.href === '/messages' && totalUnread > 0 ? (
                  <span className="absolute -right-3 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-none tabular-nums text-white">
                    {unreadBadgeText}
                  </span>
                ) : null}
              </span>
            </NavLink>
          ))}
          <Button onClick={() => navigate('/studio')} variant="primary" className="h-11 w-11 px-0" aria-label="进入创作区">
            <Plus className="h-4 w-4" />
          </Button>
          {mobileNavItems.slice(2).map((item) => (
            <NavLink key={item.href} to={item.href === '/me' ? accountRoute : item.href} className={bottomNavClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <QuickCreateSheet open={quickCreateOpen} onClose={closeQuickCreate} />

      {/* 首次进入网站的全屏选择弹窗：默认不开启全屏，由用户自己选；选择后不再弹出，
          「开启」按钮点击本身就是用户手势，可直接进入全屏 */}
      {!fullscreenPromptSeen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-[380px] rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">选择浏览方式</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              开启全屏模式可获得更沉浸的阅读体验；之后随时可在设置中更改。
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                type="button"
                variant="primary"
                className="flex-1"
                onClick={() => {
                  chooseFullscreen(true)
                  enterImmersiveFullscreen()
                }}
              >
                喜欢全屏
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => chooseFullscreen(false)}
              >
                不要全屏
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
