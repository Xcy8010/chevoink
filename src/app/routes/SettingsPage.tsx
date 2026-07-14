import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiClientError, requestJson } from '@/app/api-client'
import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import TextInput from '@/components/ui/TextInput'
import Avatar from '@/features/community/components/Avatar'
import { useShellStore } from '@/store/useShellStore'
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

export default function SettingsPage() {
  const navigate = useNavigate()
  const theme = useShellStore((state) => state.theme)
  const toggleTheme = useShellStore((state) => state.toggleTheme)
  const authStatus = useShellStore((state) => state.authStatus)
  const sessionUser = useShellStore((state) => state.sessionUser)
  const setGuest = useShellStore((state) => state.setGuest)
  const syncSessionUser = useShellStore((state) => state.syncSessionUser)
  const unreadMessageCount = useShellStore((state) => state.unreadMessageCount)
  const unreadNotificationCount = useShellStore((state) => state.unreadNotificationCount)

  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [avatarSubmitting, setAvatarSubmitting] = useState(false)
  const [avatarMessage, setAvatarMessage] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [coverSubmitting, setCoverSubmitting] = useState(false)
  const [coverMessage, setCoverMessage] = useState('')
  const [coverError, setCoverError] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setNickname(sessionUser?.nickname ?? '')
    setBio(sessionUser?.bio ?? '')
  }, [sessionUser?.nickname, sessionUser?.bio])

  function syncUser(user: User) {
    syncSessionUser({
      user,
      unreadMessageCount,
      unreadNotificationCount,
    })
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
    setProfileError('')
    setProfileMessage('')

    if (!nickname.trim()) {
      setProfileError('请输入昵称。')
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
      setProfileMessage('个人信息已保存。')
    } catch (error) {
      setProfileError(error instanceof ApiClientError ? error.message : '暂时无法保存个人信息，请稍后再试。')
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

    setAvatarError('')
    setAvatarMessage('')

    try {
      validateImageFile(file, 2, '头像')
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : '头像文件无效。')
      event.target.value = ''
      return
    }

    setAvatarSubmitting(true)

    try {
      await uploadAvatar(await readImageAsDataUrl(file))
      setAvatarMessage('头像已更新。')
    } catch (error) {
      setAvatarError(error instanceof ApiClientError ? error.message : '暂时无法上传头像，请稍后再试。')
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

    setCoverError('')
    setCoverMessage('')

    try {
      validateImageFile(file, 3, '封面')
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : '封面文件无效。')
      event.target.value = ''
      return
    }

    setCoverSubmitting(true)

    try {
      await uploadCover(await readImageAsDataUrl(file))
      setCoverMessage('个人封面已更新。')
    } catch (error) {
      setCoverError(error instanceof ApiClientError ? error.message : '暂时无法上传封面，请稍后再试。')
    } finally {
      setCoverSubmitting(false)
      event.target.value = ''
    }
  }

  async function handleResetAvatar() {
    setAvatarError('')
    setAvatarMessage('')
    setAvatarSubmitting(true)

    try {
      await uploadAvatar(null)
      setAvatarMessage('已恢复默认头像。')
    } catch (error) {
      setAvatarError(error instanceof ApiClientError ? error.message : '暂时无法恢复默认头像，请稍后再试。')
    } finally {
      setAvatarSubmitting(false)
    }
  }

  async function handleResetCover() {
    setCoverError('')
    setCoverMessage('')
    setCoverSubmitting(true)

    try {
      await uploadCover(null)
      setCoverMessage('已移除个人封面。')
    } catch (error) {
      setCoverError(error instanceof ApiClientError ? error.message : '暂时无法移除封面，请稍后再试。')
    } finally {
      setCoverSubmitting(false)
    }
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')
    setPasswordMessage('')

    if (password.trim().length < 6) {
      setPasswordError('登录密码至少需要 6 位。')
      return
    }

    if (password !== passwordConfirm) {
      setPasswordError('两次输入的密码不一致，请重新确认。')
      return
    }

    setPasswordSubmitting(true)

    try {
      const payload = await requestJson<{ user: User }>('/api/users/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          password: password.trim(),
        } satisfies UpdateMyPasswordRequest),
      })

      syncUser(payload.user)
      setPassword('')
      setPasswordConfirm('')
      setPasswordMessage('登录密码已设置成功，之后可以直接使用手机号和密码登录。')
    } catch (error) {
      setPasswordError(error instanceof ApiClientError ? error.message : '暂时无法设置登录密码，请稍后再试。')
    } finally {
      setPasswordSubmitting(false)
    }
  }

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
      <AppState
        title="登录后即可管理账户与偏好"
        description="显示方式、账户信息和登录状态都会在这里集中维护。"
        primaryAction={{ label: '去登录', href: '/login?redirect=%2Fsettings' }}
        secondaryAction={{ label: '创建账户', href: '/register?redirect=%2Fsettings' }}
      />
    )
  }

  const profileCoverStyle = sessionUser.profileCoverUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.62)), url(${sessionUser.profileCoverUrl})`,
      }
    : undefined

  return (
    <div className="space-y-5 md:space-y-6">
      <Surface as="section" padding="none" className="overflow-hidden">
        <div
          className="relative min-h-[220px] bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_40%),linear-gradient(135deg,#1e1b4b,#111827_58%,#312e81)] px-5 py-5 md:min-h-[260px] md:px-6 md:py-6"
          style={profileCoverStyle}
        >
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative flex min-h-[180px] flex-col justify-between gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar name={sessionUser.nickname} src={sessionUser.avatarUrl} size="lg" className="h-20 w-20 border border-white/20 sm:h-24 sm:w-24" />
                <div className="space-y-2 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">账户资料</p>
                  <h2 className="text-[1.75rem] font-semibold tracking-tight">{sessionUser.nickname}</h2>
                  <p className="max-w-2xl text-sm leading-7 text-white/80">
                    {sessionUser.bio || '在这里整理你的封面、头像、简介与登录方式，让个人主页保持完整。'}
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => navigate('/me')} className="shrink-0">
                返回个人中心
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleCoverChange}
              />
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button type="button" variant="primary" onClick={() => coverInputRef.current?.click()} disabled={coverSubmitting}>
                {coverSubmitting ? '上传中…' : '设置封面'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => avatarInputRef.current?.click()} disabled={avatarSubmitting}>
                {avatarSubmitting ? '上传中…' : '上传头像'}
              </Button>
              {sessionUser.profileCoverUrl ? (
                <Button type="button" variant="ghost" onClick={handleResetCover} disabled={coverSubmitting}>
                  移除封面
                </Button>
              ) : null}
              {sessionUser.avatarUrl ? (
                <Button type="button" variant="ghost" onClick={handleResetAvatar} disabled={avatarSubmitting}>
                  恢复默认头像
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Surface>

      {coverMessage ? (
        <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{coverMessage}</p>
      ) : null}
      {coverError ? (
        <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{coverError}</p>
      ) : null}
      {avatarMessage ? (
        <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{avatarMessage}</p>
      ) : null}
      {avatarError ? (
        <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{avatarError}</p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Surface as="section" padding="md" className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">个人资料</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">修改昵称和个人简介，个人中心会立即同步更新。</p>
          </div>

          {profileMessage ? (
            <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{profileMessage}</p>
          ) : null}

          {profileError ? (
            <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{profileError}</p>
          ) : null}

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
                rows={5}
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

        <div className="space-y-5">
          <Surface as="section" padding="md" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">账号信息</h2>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">登录入口统一使用手机号，这里只保留当前绑定号码。</p>
            </div>

            <div className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-4">
              <p className="text-sm text-[var(--text-secondary)]">绑定手机号</p>
              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{maskPhoneNumber(sessionUser.phone)}</p>
            </div>

            <div className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-4">
              <p className="text-sm text-[var(--text-secondary)]">账户身份</p>
              <p className="mt-2 text-base font-medium text-[var(--text-primary)]">{sessionUser.isAuthor ? '创作者账户' : '读者账户'}</p>
            </div>
          </Surface>

          <Surface as="section" padding="md" className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">显示方式</h2>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">切换日常阅读和写作时更顺手的主题模式。</p>
            </div>
            <Button variant="secondary" onClick={toggleTheme}>
              当前为{theme === 'light' ? '浅色模式' : '深色模式'}
            </Button>
          </Surface>
        </div>
      </div>

      <Surface as="section" padding="md" className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">登录密码</h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            {sessionUser.passwordConfigured
              ? '当前账号已经设置登录密码，可继续使用手机号和密码登录。'
              : '当前账号还没有登录密码，你可以现在设置，之后就能直接使用手机号和密码登录。'}
          </p>
        </div>

        <div className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-4">
          <p className="text-sm text-[var(--text-secondary)]">当前状态</p>
          <p className="mt-2 text-base font-medium text-[var(--text-primary)]">
            {sessionUser.passwordConfigured ? '已设置登录密码' : '未设置登录密码'}
          </p>
        </div>

        {passwordMessage ? (
          <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{passwordMessage}</p>
        ) : null}

        {passwordError ? (
          <p className="rounded-[24px] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">{passwordError}</p>
        ) : null}

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
        ) : null}
      </Surface>

      <Surface as="section" padding="md" className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">登录状态</h2>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">退出后，可随时重新登录继续管理你的书架和草稿。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={handleLogout}>
            退出登录
          </Button>
        </div>
      </Surface>
    </div>
  )
}
