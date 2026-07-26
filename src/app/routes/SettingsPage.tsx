import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Moon, Palette, ShieldCheck, Sun, UserRound } from 'lucide-react'

import { ApiClientError, requestJson } from '@/app/api-client'
import AppState from '@/components/ui/AppState'
import { SettingsSkeleton } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import TextInput from '@/components/ui/TextInput'
import { useToast } from '@/components/ui/Toast'
import Avatar from '@/features/community/components/Avatar'
import { useShellStore } from '@/store/useShellStore'
import { cn } from '@/lib/utils'
import type {
  UpdateMyAvatarRequest,
  UpdateMyCoverRequest,
  UpdateMyPasswordRequest,
  UpdateMyProfileRequest,
  User,
} from '../../../shared/contracts'

function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) {
    return '暂未绑定'
  }

  const normalized = phone.replace(/^\+86/, '')

  if (normalized.length < 7) {
    return phone
  }

  return `+86 ${normalized.slice(0, 3)}****${normalized.slice(-4)}`
}

/** 设置页分区锚点（方案 3.3：左侧锚点导航 + 右侧分区卡片） */
const settingsSections = [
  { id: 'settings-profile', label: '个人资料', icon: UserRound },
  { id: 'settings-appearance', label: '外观', icon: Palette },
  { id: 'settings-security', label: '账号安全', icon: ShieldCheck },
  { id: 'settings-session', label: '会话', icon: LogOut },
] as const

export default function SettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const theme = useShellStore((state) => state.theme)
  const setTheme = useShellStore((state) => state.setTheme)
  const fullscreenEnabled = useShellStore((state) => state.fullscreenEnabled)
  const setFullscreenEnabled = useShellStore((state) => state.setFullscreenEnabled)
  const authStatus = useShellStore((state) => state.authStatus)
  const sessionUser = useShellStore((state) => state.sessionUser)
  const setGuest = useShellStore((state) => state.setGuest)
  const syncSessionUser = useShellStore((state) => state.syncSessionUser)
  const unreadMessageCount = useShellStore((state) => state.unreadMessageCount)
  const unreadNotificationCount = useShellStore((state) => state.unreadNotificationCount)

  const [activeSectionId, setActiveSectionId] = useState<string>(settingsSections[0].id)
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [avatarSubmitting, setAvatarSubmitting] = useState(false)
  const [coverSubmitting, setCoverSubmitting] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [passwordMode, setPasswordMode] = useState<'old' | 'sms'>('old')
  const [smsSending, setSmsSending] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setNickname(sessionUser?.nickname ?? '')
    setBio(sessionUser?.bio ?? '')
  }, [sessionUser?.nickname, sessionUser?.bio])

  // 验证码发送后的倒计时
  useEffect(() => {
    if (smsCooldown <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      setSmsCooldown((value) => (value > 1 ? value - 1 : 0))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [smsCooldown])

  function syncUser(user: User) {
    syncSessionUser({
      user,
      unreadMessageCount,
      unreadNotificationCount,
    })
  }

  function scrollToSection(sectionId: string) {
    setActiveSectionId(sectionId)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleLogout() {
    try {
      await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (!(error instanceof ApiClientError)) {
        return
      }
    } finally {
      setGuest()
      navigate('/login', { replace: true })
    }
  }

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!nickname.trim()) {
      toast.error('请输入昵称。')
      return
    }

    setProfileSubmitting(true)

    try {
      const payload = await requestJson<{ user: User }>('/api/users/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          nickname: nickname.trim(),
          bio: bio.trim(),
        } satisfies UpdateMyProfileRequest),
      })

      syncUser(payload.user)
      toast.success('个人信息已保存')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法保存个人信息，请稍后再试。')
    } finally {
      setProfileSubmitting(false)
    }
  }

  async function uploadAvatar(avatarDataUrl: string | null) {
    const payload = await requestJson<{ user: User }>('/api/users/me/avatar', {
      method: 'PATCH',
      body: JSON.stringify({
        avatarDataUrl,
      } satisfies UpdateMyAvatarRequest),
    })

    syncUser(payload.user)
  }

  async function uploadCover(coverDataUrl: string | null) {
    const payload = await requestJson<{ user: User }>('/api/users/me/cover', {
      method: 'PATCH',
      body: JSON.stringify({
        coverDataUrl,
      } satisfies UpdateMyCoverRequest),
    })

    syncUser(payload.user)
  }

  async function readImageAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('读取图片文件失败。'))
      reader.readAsDataURL(file)
    })
  }

  function validateImageFile(file: File, maxSizeMb: number, label: string) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error(`${label}仅支持 PNG、JPG 或 WebP 图片。`)
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      throw new Error(`${label}图片不能超过 ${maxSizeMb}MB。`)
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      validateImageFile(file, 2, '头像')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '头像文件无效。')
      event.target.value = ''
      return
    }

    setAvatarSubmitting(true)

    try {
      await uploadAvatar(await readImageAsDataUrl(file))
      toast.success('头像已更新')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法上传头像，请稍后再试。')
    } finally {
      setAvatarSubmitting(false)
      event.target.value = ''
    }
  }

  async function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      validateImageFile(file, 3, '封面')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '封面文件无效。')
      event.target.value = ''
      return
    }

    setCoverSubmitting(true)

    try {
      await uploadCover(await readImageAsDataUrl(file))
      toast.success('个人封面已更新')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法上传封面，请稍后再试。')
    } finally {
      setCoverSubmitting(false)
      event.target.value = ''
    }
  }

  async function handleResetAvatar() {
    setAvatarSubmitting(true)

    try {
      await uploadAvatar(null)
      toast.success('已恢复默认头像')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法恢复默认头像，请稍后再试。')
    } finally {
      setAvatarSubmitting(false)
    }
  }

  async function handleResetCover() {
    setCoverSubmitting(true)

    try {
      await uploadCover(null)
      toast.success('已移除个人封面')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法移除封面，请稍后再试。')
    } finally {
      setCoverSubmitting(false)
    }
  }

  async function handleSendPasswordResetCode() {
    if (smsSending || smsCooldown > 0) {
      return
    }

    setSmsSending(true)

    try {
      const payload = await requestJson<{ ok: boolean; cooldownSeconds: number }>('/api/users/me/password/sms-code', {
        method: 'POST',
      })

      setSmsCooldown(payload.cooldownSeconds > 0 ? payload.cooldownSeconds : 60)
      toast.success('验证码已发送至绑定手机号，请查收')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法发送验证码，请稍后再试。')
    } finally {
      setSmsSending(false)
    }
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (password.trim().length < 6) {
      toast.error('登录密码至少需要 6 位。')
      return
    }

    if (password !== passwordConfirm) {
      toast.error('两次输入的密码不一致，请重新确认。')
      return
    }

    const passwordConfigured = Boolean(sessionUser?.passwordConfigured)

    if (passwordConfigured && passwordMode === 'old' && !oldPassword.trim()) {
      toast.error('请输入当前密码。')
      return
    }

    if (passwordConfigured && passwordMode === 'sms' && !smsCode.trim()) {
      toast.error('请输入手机验证码。')
      return
    }

    setPasswordSubmitting(true)

    try {
      const payload = await requestJson<{ user: User }>('/api/users/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          password: password.trim(),
          ...(passwordConfigured && passwordMode === 'old' ? { oldPassword: oldPassword.trim() } : {}),
          ...(passwordConfigured && passwordMode === 'sms' ? { code: smsCode.trim() } : {}),
        } satisfies UpdateMyPasswordRequest),
      })

      syncUser(payload.user)
      setPassword('')
      setPasswordConfirm('')
      setOldPassword('')
      setSmsCode('')
      setPasswordMode('old')
      toast.success(
        passwordConfigured ? '登录密码已更新，下次登录请使用新密码' : '登录密码已设置成功，之后可以直接使用手机号和密码登录',
      )
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法设置登录密码，请稍后再试。')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  // 会话校验中：先给骨架，避免闪现登录引导
  if (authStatus === 'checking') {
    return <SettingsSkeleton />
  }

  // 显示偏好（主题 + 全屏）：登录与未登录均可使用，保存在本机
  const displayPreferences = (
    <>
      <div className="space-y-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">主题模式</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={cn(
              'press-feedback flex items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2 text-sm transition-colors',
              theme === 'light'
                ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <Sun className="h-4 w-4" />
            浅色模式
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={cn(
              'press-feedback flex items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2 text-sm transition-colors',
              theme === 'dark'
                ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            <Moon className="h-4 w-4" />
            深色模式
          </button>
        </div>
      </div>

      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">全屏模式</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
              开启后，点击页面任意位置会自动进入沉浸全屏；关闭后立即退出全屏且不再自动进入。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={fullscreenEnabled}
            aria-label="全屏模式开关"
            onClick={() => setFullscreenEnabled(!fullscreenEnabled)}
            className={cn(
              'relative h-7 w-12 shrink-0 rounded-full border transition-colors',
              fullscreenEnabled
                ? 'border-[var(--color-brand)] bg-[var(--color-brand)]'
                : 'border-[var(--border-strong)] bg-[var(--surface-muted)]',
            )}
          >
            <span
              className={cn(
                'absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200',
                fullscreenEnabled ? 'left-[calc(100%-24px)]' : 'left-1',
              )}
            />
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">当前状态：{fullscreenEnabled ? '已开启' : '已关闭'}</p>
      </div>
    </>
  )

  if (authStatus === 'unavailable') {
    return (
      <AppState
        tone="error"
        title="暂时无法打开账户设置"
        description="账户状态还没有准备好，请稍后再试，或先回到首页继续浏览。"
        primaryAction={{ label: '返回首页', href: '/' }}
        secondaryAction={{ label: '重新加载', onClick: () => window.location.reload() }}
      />
    )
  }

  if (authStatus !== 'authenticated' || !sessionUser) {
    return (
      <div className="mx-auto max-w-[720px] space-y-5">
        {/* 未登录也能用的基础设置：仅全屏与主题，保存在本机 */}
        <Surface as="section" padding="md" className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">显示偏好</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">不登录也可以调整主题颜色与全屏模式，设置会保存在本机。</p>
          </div>
          {displayPreferences}
        </Surface>

        <AppState
          title="登录后可管理完整的账户设置"
          description="头像、昵称、个人封面与账号安全等设置，需要登录后才能使用。"
          primaryAction={{ label: '去登录', href: '/login?redirect=%2Fsettings' }}
          secondaryAction={{ label: '创建账户', href: '/register?redirect=%2Fsettings' }}
        />
      </div>
    )
  }

  const sectionNav = (
    <nav aria-label="设置分区" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1.5 lg:overflow-visible">
      {settingsSections.map((section) => {
        const Icon = section.icon
        const isActive = activeSectionId === section.id

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollToSection(section.id)}
            className={cn(
              'press-feedback flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-[var(--color-brand-soft)] font-medium text-[var(--color-brand)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            <Icon className="h-4 w-4" />
            {section.label}
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
      {/* 左侧锚点导航（移动端退化为顶部横滑分组条） */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Surface as="div" padding="sm">
          <p className="hidden px-3 pb-2 pt-1 text-xs font-medium text-[var(--text-tertiary)] lg:block">账户设置</p>
          {sectionNav}
        </Surface>
      </aside>

      <div className="min-w-0 space-y-5">
        {/* 分区一：个人资料 */}
        <Surface as="section" padding="md" className="scroll-mt-24 space-y-5" id="settings-profile">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">个人资料</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">昵称、简介与头像，保存后个人中心立即同步。</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-4">
            <Avatar name={sessionUser.nickname} src={sessionUser.avatarUrl} size="lg" className="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">头像</p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">支持 PNG / JPG / WebP，不超过 2MB。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => avatarInputRef.current?.click()} disabled={avatarSubmitting}>
                {avatarSubmitting ? '上传中…' : '上传头像'}
              </Button>
              {sessionUser.avatarUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={handleResetAvatar} disabled={avatarSubmitting}>
                  恢复默认
                </Button>
              ) : null}
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleUpdateProfile}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-nickname">
                昵称
              </label>
              <TextInput
                id="settings-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="请输入昵称"
                autoComplete="nickname"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-bio">
                个人简介
              </label>
              <textarea
                id="settings-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="简单介绍一下你自己"
                rows={4}
                className="w-full resize-none rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={profileSubmitting}>
                {profileSubmitting ? '保存中…' : '保存个人信息'}
              </Button>
            </div>
          </form>
        </Surface>

        {/* 分区二：外观 */}
        <Surface as="section" padding="md" className="scroll-mt-24 space-y-5" id="settings-appearance">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">外观</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">个人主页封面、全站主题模式与全屏模式。</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">个人主页封面</p>
            <div
              className="relative min-h-[140px] overflow-hidden rounded-[var(--radius-lg)] bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_40%),linear-gradient(135deg,#1e1b4b,#111827_58%,#312e81)] bg-cover bg-center"
              style={
                sessionUser.profileCoverUrl
                  ? { backgroundImage: `url(${sessionUser.profileCoverUrl})` }
                  : undefined
              }
            >
              {!sessionUser.profileCoverUrl ? (
                <p className="absolute inset-x-0 bottom-3 px-4 text-xs text-white/70">尚未设置封面，当前展示品牌默认背景。</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleCoverChange}
              />
              <Button type="button" variant="primary" size="sm" onClick={() => coverInputRef.current?.click()} disabled={coverSubmitting}>
                {coverSubmitting ? '上传中…' : sessionUser.profileCoverUrl ? '更换封面' : '设置封面'}
              </Button>
              {sessionUser.profileCoverUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={handleResetCover} disabled={coverSubmitting}>
                  移除封面
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">支持 PNG / JPG / WebP，不超过 3MB。</p>
          </div>

          <div className="space-y-5 border-t border-[var(--border-subtle)] pt-4">{displayPreferences}</div>
        </Surface>

        {/* 分区三：账号安全 */}
        <Surface as="section" padding="md" className="scroll-mt-24 space-y-5" id="settings-security">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">账号安全</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">登录入口统一使用手机号，可在这里补充登录密码。</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-4">
              <p className="text-sm text-[var(--text-secondary)]">绑定手机号</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{maskPhoneNumber(sessionUser.phone)}</p>
            </div>
            <div className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-4">
              <p className="text-sm text-[var(--text-secondary)]">登录密码</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {sessionUser.passwordConfigured ? '已设置' : '未设置'}
              </p>
            </div>
          </div>

          {!sessionUser.passwordConfigured ? (
            <form className="space-y-4" onSubmit={handleSetPassword}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-password">
                    登录密码
                  </label>
                  <TextInput
                    id="settings-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入至少 6 位密码"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-password-confirm">
                    确认密码
                  </label>
                  <TextInput
                    id="settings-password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="请再次输入登录密码"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" disabled={passwordSubmitting}>
                  {passwordSubmitting ? '保存中…' : '设置登录密码'}
                </Button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSetPassword}>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">当前账号已可使用手机号和密码登录，如需修改密码请先完成验证。</p>

              {passwordMode === 'old' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-old-password">
                      当前密码
                    </label>
                    <button
                      type="button"
                      className="text-sm text-[var(--color-brand)] transition-opacity hover:opacity-80"
                      onClick={() => setPasswordMode('sms')}
                    >
                      忘记密码？使用验证码重置
                    </button>
                  </div>
                  <TextInput
                    id="settings-old-password"
                    type="password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                    placeholder="请输入当前登录密码"
                    autoComplete="current-password"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-sms-code">
                      手机验证码（发送至 {maskPhoneNumber(sessionUser.phone)}）
                    </label>
                    <button
                      type="button"
                      className="text-sm text-[var(--color-brand)] transition-opacity hover:opacity-80"
                      onClick={() => setPasswordMode('old')}
                    >
                      改用当前密码验证
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <TextInput
                      id="settings-sms-code"
                      value={smsCode}
                      onChange={(event) => setSmsCode(event.target.value)}
                      placeholder="请输入短信验证码"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      required
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      onClick={handleSendPasswordResetCode}
                      disabled={smsSending || smsCooldown > 0}
                    >
                      {smsCooldown > 0 ? `${smsCooldown}s 后重发` : smsSending ? '发送中…' : '发送验证码'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-new-password">
                    新登录密码
                  </label>
                  <TextInput
                    id="settings-new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入至少 6 位新密码"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-new-password-confirm">
                    确认新密码
                  </label>
                  <TextInput
                    id="settings-new-password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="请再次输入新密码"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" disabled={passwordSubmitting}>
                  {passwordSubmitting ? '保存中…' : '更新登录密码'}
                </Button>
              </div>
            </form>
          )}
        </Surface>

        {/* 分区四：会话（危险区样式） */}
        <Surface
          as="section"
          padding="md"
          className="scroll-mt-24 space-y-4 border border-[var(--color-danger,#dc2626)]/25"
          id="settings-session"
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-danger,#dc2626)]">会话</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">退出后，可随时重新登录继续管理你的书架和草稿。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="press-feedback inline-flex h-10 items-center justify-center rounded-[var(--radius-pill)] border border-[var(--color-danger,#dc2626)]/40 px-4 text-sm font-medium text-[var(--color-danger,#dc2626)] transition-colors hover:bg-[var(--color-danger,#dc2626)]/10"
            >
              退出登录
            </button>
          </div>
        </Surface>
      </div>
    </div>
  )
}
