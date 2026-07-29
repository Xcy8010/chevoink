import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Lock,
  LogOut,
  Maximize,
  Moon,
  RefreshCw,
  Smartphone,
  Sun,
  UserRound,
  UserRoundCheck,
  Users,
} from 'lucide-react'

import { ApiClientError, requestJson } from '@/app/api-client'
import AppState from '@/components/ui/AppState'
import { SettingsSkeleton } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import ImageCropperDialog from '@/components/ui/ImageCropperDialog'
import TextInput from '@/components/ui/TextInput'
import { useToast } from '@/components/ui/Toast'
import Avatar from '@/features/community/components/Avatar'
import { getMe, updateMyPrivacy } from '@/features/community/api'
import { useShellStore } from '@/store/useShellStore'
import { prepareAvatarImage } from '@/lib/image-compress'
import { checkAppUpdate, type VersionManifest } from '@/lib/app-update'
import { getNativeAppVersion, isNativeApp, openExternalUrl } from '@/lib/native-app'
import { cn } from '@/lib/utils'
import type {
  PrivacyLevel,
  PrivacySettings,
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

const DEFAULT_PRIVACY: PrivacySettings = {
  followers: 'public',
  following: 'public',
  likes: 'public',
  favorites: 'public',
  replies: 'public',
}

/** 隐私设置行：5 个维度共用一套三级选项 */
const PRIVACY_ITEMS: Array<{ key: keyof PrivacySettings; label: string; caption: string }> = [
  { key: 'followers', label: '粉丝列表', caption: '谁可以查看关注你的人' },
  { key: 'following', label: '关注列表', caption: '谁可以查看你关注的人' },
  { key: 'likes', label: '获赞', caption: '谁可以查看你收到的赞' },
  { key: 'favorites', label: '喜欢', caption: '谁可以查看你赞过的帖子' },
  { key: 'replies', label: '已回复', caption: '谁可以查看你发出的评论' },
]

const PRIVACY_LEVEL_META: Record<PrivacyLevel, { label: string; caption: string }> = {
  public: { label: '公开', caption: '所有人可见' },
  mutual: { label: '仅互相关注', caption: '只有互相关注的人可见' },
  private: { label: '仅自己', caption: '只有你自己可见' },
}

const PRIVACY_LEVEL_ORDER: PrivacyLevel[] = ['public', 'mutual', 'private']

/** 分组标题：扁平列表式设置页的分区抬头 */
function SectionTitle({ children }: { children: string }) {
  return <h2 className="px-1 pb-1 text-[13px] font-semibold text-[var(--text-tertiary)]">{children}</h2>
}

/** 单行设置项外壳：图标 + 标题/说明 + 右侧值区，行本身可点击 */
interface SettingsRowProps {
  icon: React.ReactNode
  title: string
  caption?: string
  value?: React.ReactNode
  chevron?: 'right' | 'down' | 'up' | 'none'
  onClick?: () => void
  danger?: boolean
}

function SettingsRow({ icon, title, caption, value, chevron = 'none', onClick, danger }: SettingsRowProps) {
  const content = (
    <>
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)]',
          danger ? 'text-[var(--color-danger,#dc2626)]' : 'text-[var(--text-secondary)]',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            'block text-[15px] font-medium',
            danger ? 'text-[var(--color-danger,#dc2626)]' : 'text-[var(--text-primary)]',
          )}
        >
          {title}
        </span>
        {caption ? <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">{caption}</span> : null}
      </span>
      {value ? <span className="shrink-0 text-sm text-[var(--text-tertiary)]">{value}</span> : null}
      {chevron === 'right' ? <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" /> : null}
      {chevron === 'down' || chevron === 'up' ? (
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform',
            chevron === 'up' && 'rotate-180',
          )}
        />
      ) : null}
    </>
  )

  if (!onClick) {
    return <div className="flex w-full items-center gap-3.5 py-3.5">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="press-feedback -mx-2 flex w-[calc(100%+16px)] items-center gap-3.5 rounded-[var(--radius-md)] px-2 py-3.5 text-left transition-colors hover:bg-[var(--surface-muted)]"
    >
      {content}
    </button>
  )
}

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

  /** 当前展开的行：昵称简介 / 登录密码 / 某个隐私维度 */
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [avatarSubmitting, setAvatarSubmitting] = useState(false)
  const [coverSubmitting, setCoverSubmitting] = useState(false)
  const [coverDraft, setCoverDraft] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [passwordMode, setPasswordMode] = useState<'old' | 'sms'>('old')
  const [smsSending, setSmsSending] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY)
  const [privacySubmittingKey, setPrivacySubmittingKey] = useState<keyof PrivacySettings | null>(null)
  /** 检测更新：仅 APP 壳内使用 */
  const [updateChecking, setUpdateChecking] = useState(false)
  const [availableUpdate, setAvailableUpdate] = useState<VersionManifest | null>(null)

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setNickname(sessionUser?.nickname ?? '')
    setBio(sessionUser?.bio ?? '')
  }, [sessionUser?.nickname, sessionUser?.bio])

  // 隐私设置从 /users/me 拉取（登录响应里不带），失败时保持默认公开
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return
    }

    let cancelled = false
    getMe()
      .then((payload) => {
        if (!cancelled && payload.user.privacy) {
          setPrivacy({ ...DEFAULT_PRIVACY, ...payload.user.privacy })
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [authStatus])

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

  function toggleRow(rowId: string) {
    setExpandedRow((current) => (current === rowId ? null : rowId))
  }

  /** 手动检测 APP 更新：已是最新给 toast，有新版本展开更新入口 */
  async function handleCheckUpdate() {
    if (updateChecking) return
    setUpdateChecking(true)
    try {
      const result = await checkAppUpdate()
      if (result.status === 'update') {
        setAvailableUpdate(result.manifest)
      } else {
        setAvailableUpdate(null)
        toast.success('当前已是最新版本')
      }
    } catch {
      toast.error('检测更新失败，请检查网络后重试')
    } finally {
      setUpdateChecking(false)
    }
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
      setExpandedRow(null)
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
      await uploadAvatar(await prepareAvatarImage(file))
      toast.success('头像已更新')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法上传头像，请稍后再试。')
    } finally {
      setAvatarSubmitting(false)
      event.target.value = ''
    }
  }

  // 选中封面文件后先进入裁剪弹窗，确认后才上传
  async function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      validateImageFile(file, 5, '封面')
      setCoverDraft(await readImageAsDataUrl(file))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '封面文件无效。')
    } finally {
      event.target.value = ''
    }
  }

  async function handleCoverCropConfirm(croppedDataUrl: string) {
    setCoverSubmitting(true)

    try {
      await uploadCover(croppedDataUrl)
      setCoverDraft(null)
      toast.success('个人封面已更新')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '暂时无法上传封面，请稍后再试。')
    } finally {
      setCoverSubmitting(false)
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

  async function handlePrivacyChange(key: keyof PrivacySettings, level: PrivacyLevel) {
    if (privacy[key] === level || privacySubmittingKey) {
      return
    }

    const previous = privacy
    setPrivacy((current) => ({ ...current, [key]: level }))
    setPrivacySubmittingKey(key)

    try {
      const latest = await updateMyPrivacy({ [key]: level })
      setPrivacy({ ...DEFAULT_PRIVACY, ...latest })
    } catch (error) {
      setPrivacy(previous)
      toast.error(error instanceof Error ? error.message : '暂时无法更新隐私设置，请稍后再试。')
    } finally {
      setPrivacySubmittingKey(null)
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
      setExpandedRow(null)
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

  // 显示偏好行（主题 + 全屏）：登录与未登录均可使用，保存在本机
  const appearanceRows = (
    <div className="divide-y divide-[var(--border-subtle)]">
      <div className="flex items-center gap-3.5 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)]">
          {theme === 'dark' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-[var(--text-primary)]">主题模式</span>
          <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">深浅色跟随此处设置，保存在本机</span>
        </span>
        <div className="flex shrink-0 rounded-[var(--radius-pill)] bg-[var(--surface-muted)] p-1">
          {(
            [
              { value: 'light', label: '浅色', icon: Sun },
              { value: 'dark', label: '深色', icon: Moon },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                'press-feedback flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 text-[13px] transition-colors',
                theme === option.value
                  ? 'bg-[var(--surface-default)] font-medium text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              )}
            >
              <option.icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* 全屏模式：仅网页版提供；APP 壳内天生全屏，隐藏此项 */}
      {!isNativeApp() && (
        <div className="flex items-center gap-3.5 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)]">
            <Maximize className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-[var(--text-primary)]">全屏模式</span>
            <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">开启后点击页面任意位置自动进入沉浸全屏</span>
          </span>
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
      )}
    </div>
  )

  /** 关于分组：仅 APP 壳内展示，提供手动检测更新入口；登录/未登录都可用 */
  const aboutSection = isNativeApp() ? (
    <section>
      <SectionTitle>关于</SectionTitle>
      <div className="divide-y divide-[var(--border-subtle)]">
        <div>
          <SettingsRow
            icon={<RefreshCw className={cn('h-[18px] w-[18px]', updateChecking && 'animate-spin')} />}
            title="检测更新"
            caption={`当前版本 ${getNativeAppVersion() ?? '未知'}`}
            value={
              updateChecking
                ? '检测中…'
                : availableUpdate
                  ? `发现新版本 ${availableUpdate.latestVersionName}`
                  : undefined
            }
            onClick={() => void handleCheckUpdate()}
          />
          {availableUpdate ? (
            <div className="flex items-center gap-3 pb-4 pl-[50px] pr-1">
              <p className="min-w-0 flex-1 text-xs text-[var(--text-tertiary)]">
                {availableUpdate.notes?.trim() || '点击更新以获取最新功能与修复'}
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  if (availableUpdate.url) openExternalUrl(availableUpdate.url)
                }}
              >
                立即更新
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  ) : null

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
      <div className="mx-auto max-w-[640px] space-y-8">
        <section>
          <SectionTitle>显示</SectionTitle>
          {appearanceRows}
        </section>

        {aboutSection}

        <AppState
          title="登录后可管理完整的账户设置"
          description="头像、昵称、个人封面、隐私与账号安全等设置，需要登录后才能使用。"
          primaryAction={{ label: '去登录', href: '/login?redirect=%2Fsettings' }}
          secondaryAction={{ label: '创建账户', href: '/register?redirect=%2Fsettings' }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[640px] space-y-8 pb-8">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleCoverChange}
      />

      {/* 分组一：账户 */}
      <section>
        <SectionTitle>账户</SectionTitle>
        <div className="divide-y divide-[var(--border-subtle)]">
          {/* 头像行：点击即选择文件 */}
          <div className="flex items-center gap-3.5 py-3.5">
            <Avatar name={sessionUser.nickname} src={sessionUser.avatarUrl} size="md" className="h-9 w-9 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-[var(--text-primary)]">头像</span>
              <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">PNG / JPG / WebP，不超过 2MB</span>
            </span>
            {sessionUser.avatarUrl ? (
              <button
                type="button"
                onClick={handleResetAvatar}
                disabled={avatarSubmitting}
                className="press-feedback shrink-0 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                恢复默认
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarSubmitting}
              className="press-feedback shrink-0 rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-60"
            >
              {avatarSubmitting ? '上传中…' : '更新'}
            </button>
          </div>

          {/* 封面行：选择文件后进入裁剪弹窗 */}
          <div className="flex items-center gap-3.5 py-3.5">
            <span className="relative h-9 w-[68px] shrink-0 overflow-hidden rounded-[8px] bg-[linear-gradient(135deg,#28435f_0%,#16233a_58%,#1f2f47_100%)]">
              {sessionUser.profileCoverUrl ? (
                <img src={sessionUser.profileCoverUrl} alt="个人封面" className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-[var(--text-primary)]">个人主页封面</span>
              <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">上传后可裁剪，统一按 3:1 展示</span>
            </span>
            {sessionUser.profileCoverUrl ? (
              <button
                type="button"
                onClick={handleResetCover}
                disabled={coverSubmitting}
                className="press-feedback shrink-0 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                移除
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverSubmitting}
              className="press-feedback shrink-0 rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-60"
            >
              {coverSubmitting ? '上传中…' : sessionUser.profileCoverUrl ? '更换' : '设置'}
            </button>
          </div>

          {/* 昵称与简介：展开式内联编辑 */}
          <div>
            <SettingsRow
              icon={<UserRound className="h-[18px] w-[18px]" />}
              title="昵称与简介"
              caption={sessionUser.bio || '还没有填写简介'}
              value={sessionUser.nickname}
              chevron={expandedRow === 'profile' ? 'up' : 'down'}
              onClick={() => toggleRow('profile')}
            />
            {expandedRow === 'profile' ? (
              <form className="space-y-4 pb-5 pl-[50px] pr-1" onSubmit={handleUpdateProfile}>
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
                    rows={3}
                    className="w-full resize-none rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-default)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--focus-ring)]"
                  />
                </div>
                <Button type="submit" variant="primary" size="sm" disabled={profileSubmitting}>
                  {profileSubmitting ? '保存中…' : '保存'}
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      {/* 分组二：隐私 */}
      <section>
        <SectionTitle>隐私</SectionTitle>
        <div className="divide-y divide-[var(--border-subtle)]">
          {PRIVACY_ITEMS.map((item) => {
            const rowId = `privacy-${item.key}`
            const isExpanded = expandedRow === rowId

            return (
              <div key={item.key}>
                <SettingsRow
                  icon={
                    privacy[item.key] === 'public' ? (
                      <Users className="h-[18px] w-[18px]" />
                    ) : privacy[item.key] === 'mutual' ? (
                      <UserRoundCheck className="h-[18px] w-[18px]" />
                    ) : (
                      <Lock className="h-[18px] w-[18px]" />
                    )
                  }
                  title={item.label}
                  caption={item.caption}
                  value={PRIVACY_LEVEL_META[privacy[item.key]].label}
                  chevron={isExpanded ? 'up' : 'down'}
                  onClick={() => toggleRow(rowId)}
                />
                {isExpanded ? (
                  <div className="space-y-1 pb-4 pl-[50px] pr-1">
                    {PRIVACY_LEVEL_ORDER.map((level) => {
                      const selected = privacy[item.key] === level

                      return (
                        <button
                          key={level}
                          type="button"
                          disabled={privacySubmittingKey === item.key}
                          onClick={() => void handlePrivacyChange(item.key, level)}
                          className={cn(
                            'press-feedback flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors',
                            selected ? 'bg-[var(--color-brand-soft)]' : 'hover:bg-[var(--surface-muted)]',
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block text-sm font-medium',
                                selected ? 'text-[var(--color-brand)]' : 'text-[var(--text-primary)]',
                              )}
                            >
                              {PRIVACY_LEVEL_META[level].label}
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">
                              {PRIVACY_LEVEL_META[level].caption}
                            </span>
                          </span>
                          {selected ? <Check className="h-4 w-4 shrink-0 text-[var(--color-brand)]" /> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* 分组三：显示 */}
      <section>
        <SectionTitle>显示</SectionTitle>
        {appearanceRows}
      </section>

      {/* 分组四：账号安全 */}
      <section>
        <SectionTitle>账号安全</SectionTitle>
        <div className="divide-y divide-[var(--border-subtle)]">
          <SettingsRow
            icon={<Smartphone className="h-[18px] w-[18px]" />}
            title="手机号"
            caption="登录入口统一使用手机号"
            value={maskPhoneNumber(sessionUser.phone)}
          />

          <div>
            <SettingsRow
              icon={<KeyRound className="h-[18px] w-[18px]" />}
              title="登录密码"
              caption={sessionUser.passwordConfigured ? '修改前需验证当前密码或手机验证码' : '设置后可使用手机号和密码登录'}
              value={sessionUser.passwordConfigured ? '已设置' : '未设置'}
              chevron={expandedRow === 'password' ? 'up' : 'down'}
              onClick={() => toggleRow('password')}
            />
            {expandedRow === 'password' ? (
              <form className="space-y-4 pb-5 pl-[50px] pr-1" onSubmit={handleSetPassword}>
                {sessionUser.passwordConfigured ? (
                  passwordMode === 'old' ? (
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
                  )
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-new-password">
                      {sessionUser.passwordConfigured ? '新登录密码' : '登录密码'}
                    </label>
                    <TextInput
                      id="settings-new-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="请输入至少 6 位密码"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="settings-new-password-confirm">
                      确认密码
                    </label>
                    <TextInput
                      id="settings-new-password-confirm"
                      type="password"
                      value={passwordConfirm}
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      placeholder="请再次输入密码"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" variant="primary" size="sm" disabled={passwordSubmitting}>
                  {passwordSubmitting ? '保存中…' : sessionUser.passwordConfigured ? '更新密码' : '设置密码'}
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      {/* 分组五：会话 */}
      <section>
        <SectionTitle>会话</SectionTitle>
        <div className="divide-y divide-[var(--border-subtle)]">
          <SettingsRow
            icon={<LogOut className="h-[18px] w-[18px]" />}
            title="退出登录"
            caption="退出后可随时重新登录，继续管理你的书架和草稿"
            onClick={() => void handleLogout()}
            danger
          />
        </div>
      </section>

      {/* 分组六：关于（仅 APP 壳内） */}
      {aboutSection}

      {/* 封面裁剪弹窗：选完文件后进入，确认才真正上传 */}
      <ImageCropperDialog
        open={Boolean(coverDraft)}
        imageDataUrl={coverDraft}
        aspect={3}
        submitting={coverSubmitting}
        onCancel={() => setCoverDraft(null)}
        onConfirm={(dataUrl) => void handleCoverCropConfirm(dataUrl)}
      />
    </div>
  )
}
