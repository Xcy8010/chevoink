import { ReactNode, UIEvent, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronUp, Compass, FileText, Home, LogOut, MessageSquareMore, MoonStar, PenSquare, Plus, Search, Settings, SunMedium, UserRound, Users } from 'lucide-react'

import { ApiClientError, requestJson } from '@/app/api-client'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import TextInput from '@/components/ui/TextInput'
import QuickCreateSheet from '@/components/layout/QuickCreateSheet'
import Avatar from '@/features/community/components/Avatar'
import { brandMeta } from '@/lib/theme/tokens'
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
  const authStatus = useShellStore((state) => state.authStatus)
  const sessionUser = useShellStore((state) => state.sessionUser)
  const setGuest = useShellStore((state) => state.setGuest)
  const isHome = location.pathname === '/'
  const isStudioRoute = location.pathname === '/studio' || location.pathname.startsWith('/studio/')
  const isReaderRoute = /^\/novel\/[^/]+\/read\/[^/]+$/.test(location.pathname)
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register'
  const usesRaisedTopInset = ['/', '/discover', '/community', '/messages', '/me'].includes(location.pathname)
  const isAuthenticated = authStatus === 'authenticated' && !!sessionUser
  const accountRoute = authStatus === 'guest' ? '/login?redirect=%2Fme' : '/me'
  const mainScrollRef = useRef<HTMLDivElement | null>(null)
  const desktopAccountMenuRef = useRef<HTMLDivElement | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [desktopAccountMenuOpen, setDesktopAccountMenuOpen] = useState(false)
  const [inlineAccountExpanded, setInlineAccountExpanded] = useState(false)

  useEffect(() => {
    const nextScrollRoot = mainScrollRef.current

    if (nextScrollRoot) {
      nextScrollRoot.scrollTo({ top: 0, behavior: 'auto' })
    }

    setIsScrolled(false)
    setDesktopAccountMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const syncInlineAccountExpanded = () => {
      setInlineAccountExpanded(window.innerWidth >= 768)
    }

    syncInlineAccountExpanded()
    window.addEventListener('resize', syncInlineAccountExpanded)

    return () => {
      window.removeEventListener('resize', syncInlineAccountExpanded)
    }
  }, [])

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
        <Icon className="h-4 w-4" />
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
      'flex w-full min-h-[58px] items-center justify-start rounded-[var(--radius-pill)] border border-transparent px-5 py-4 text-sm font-medium transition-colors',
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
    <div className="h-[100dvh] overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex h-full max-w-[var(--shell-max-width)] flex-col px-4 md:px-6 xl:px-8">
        <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 pt-[calc(env(safe-area-inset-top)+8px)] md:px-6 md:pt-4 xl:px-8">
          <div className="mx-auto max-w-[var(--shell-max-width)]">
            <div
              className={cn(
                'pointer-events-auto relative overflow-hidden rounded-[28px] border transition-[background-color,border-color,box-shadow,padding,transform] duration-200 ease-out',
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
                          <MessageSquareMore className="h-4 w-4" />
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
                  <TextInput
                    leading={<Search className="h-4 w-4 text-[var(--text-tertiary)]" />}
                    placeholder="搜索作品、作者、话题"
                    readOnly
                    aria-label="搜索作品、作者、话题"
                    className="h-10 !border-[var(--border-subtle)] !bg-[color:var(--surface-default)]/96 md:h-11"
                  />
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

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            isStudioRoute
              ? 'lg:relative lg:flex-row lg:gap-0'
              : isAuthRoute
                ? 'lg:block'
                : sidebarExpanded
                  ? 'lg:grid lg:grid-cols-[284px_minmax(0,1fr)] lg:gap-4 xl:grid-cols-[308px_minmax(0,1fr)] xl:gap-5'
                  : 'lg:block',
          )}
        >
          <aside
            className={cn(
              'hidden self-start lg:block lg:pt-[144px]',
              isAuthRoute && 'lg:hidden',
              'lg:overflow-visible lg:transition-[width,padding-right,margin,left] lg:duration-200',
              sidebarExpanded
                ? 'lg:relative lg:shrink-0 lg:pt-[164px] lg:-ml-[4.5rem] lg:w-[284px] lg:pr-4 xl:-ml-[5.5rem] xl:w-[308px] xl:pr-5'
                : 'lg:fixed lg:left-0 lg:top-[calc(env(safe-area-inset-top)+164px)] lg:bottom-6 lg:z-30 lg:w-[68px] lg:pt-0',
            )}
          >
            {sidebarExpanded ? (
              <div className="space-y-4">
                <Surface
                  as="nav"
                  tone="muted"
                  padding={isStudioRoute ? 'md' : 'sm'}
                  className="flex flex-col border-[var(--border-strong)] bg-[color:var(--surface-default)]/72 shadow-none min-h-[34rem] rounded-[32px]"
                >
                  <div className="flex items-center justify-between gap-3 px-3 pb-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
                      主要入口
                    </p>
                    <button
                      type="button"
                      onClick={() => setSidebarExpanded(false)}
                      aria-label="收起侧边栏"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3 py-5">
                    {workspaceLinks
                      .filter((item) => item.href !== '/me')
                      .map((item) => (
                        <NavLink
                          key={item.href}
                          to={item.href === '/me' ? accountRoute : item.href}
                          className={railNavClass}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                  </div>
                </Surface>

                <Surface
                  tone="muted"
                  padding="sm"
                  className="border-[var(--border-strong)] bg-[color:var(--surface-default)]/72 shadow-none rounded-[32px]"
                >
                  {renderAccountCard('sidebar')}
                </Surface>
              </div>
            ) : (
              <aside className="flex h-full min-h-[calc(100vh-204px)] flex-col rounded-r-[28px] rounded-l-none border border-[var(--border-strong)] border-l-0 bg-[color:var(--surface-default)]/72 px-3 py-3 text-[var(--text-primary)] shadow-none backdrop-blur">
                <button
                  type="button"
                  onClick={() => setSidebarExpanded(true)}
                  aria-label="展开侧边栏"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <div className="mt-4 flex flex-1 flex-col items-center gap-3">
                  {workspaceLinks.filter((item) => item.href !== '/me').map((item) => renderCollapsedRailItem(item.href, item.label))}
                </div>

                <div className="mt-4 flex flex-col items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
                  {isAuthenticated && sessionUser ? (
                    <button
                      type="button"
                      title={sessionUser.nickname}
                      onClick={() => navigate('/me')}
                      className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-default)] transition-colors hover:bg-[var(--surface-muted)]"
                    >
                      <Avatar name={sessionUser.nickname} src={sessionUser.avatarUrl} size="md" className="h-11 w-11 border-0 bg-transparent" />
                    </button>
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
              </aside>
            )}
          </aside>

          <main
            ref={mainScrollRef}
            onScroll={handleMainScroll}
            className={cn(
              'app-main-scroll min-h-0 flex-1 overscroll-contain lg:self-stretch',
              sidebarExpanded && !isStudioRoute && !isAuthRoute && 'lg:-ml-4 xl:-ml-5',
              isStudioRoute ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto',
            )}
          >
            <div
              className={cn(
                'space-y-4 pb-[calc(88px+env(safe-area-inset-bottom))] pr-0.5 md:space-y-6 md:pb-10 lg:pb-8',
                isStudioRoute && 'lg:flex lg:h-full lg:flex-col lg:space-y-4 lg:pb-0',
              )}
              style={{
                paddingTop: isStudioRoute
                  ? 'calc(env(safe-area-inset-top) + 136px)'
                  : isReaderRoute
                    ? 'calc(env(safe-area-inset-top) + 136px)'
                    : isAuthRoute
                      ? 'calc(env(safe-area-inset-top) + 144px)'
                    : usesRaisedTopInset
                      ? 'calc(env(safe-area-inset-top) + 148px)'
                      : 'calc(env(safe-area-inset-top) + 120px)',
              }}
            >
              {!isAuthRoute ? (
                <section className="px-0.5 lg:hidden">
                  <Surface tone="muted" padding="sm" className="rounded-[28px] border-[var(--border-strong)] bg-[color:var(--surface-default)]/76 shadow-none">
                    {renderAccountCard('inline')}
                  </Surface>
                </section>
              ) : null}

              {!isHome ? (
                <section
                  className={cn(
                    'space-y-2 px-0.5 pt-1 md:space-y-3 md:pt-2',
                    isStudioRoute && 'pt-3 md:pt-4 lg:hidden',
                    isReaderRoute && 'pt-2 md:pt-3',
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-[1fr_1fr_auto_1fr_1fr] items-center gap-2">
          {mobileNavItems.slice(0, 2).map((item) => (
            <NavLink key={item.href} to={item.href === '/me' ? accountRoute : item.href} className={bottomNavClass}>
              {item.label}
            </NavLink>
          ))}
          <Button onClick={openQuickCreate} variant="primary" className="h-11 w-11 px-0" aria-label="打开快速创建">
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
    </div>
  )
}
