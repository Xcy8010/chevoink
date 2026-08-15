import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
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
  X,
} from 'lucide-react'

import { ApiClientError, requestJson } from '@/app/api-client'
import BottomSheet from '@/components/layout/BottomSheet'
import { useDevice } from '@/components/layout/DeviceProvider'
import AppState from '@/components/ui/AppState'
import { SettingsSkeleton } from '@/components/ui/Skeleton'
import Button from '@/components/ui/Button'
import ImageCropperDialog from '@/components/ui/ImageCropperDialog'
import TextInput from '@/components/ui/TextInput'
import { useToast } from '@/components/ui/Toast'
import Avatar from '@/features/community/components/Avatar'
import { getMe, updateMyPrivacy } from '@/features/community/api'
import ConfirmDialog from '@/features/studio/components/ConfirmDialog'
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

/** 设置弹窗状态：点开设置项一律弹出自定义弹窗，不再在对应行下方内联展开 */
type SettingsDialogState =
  | { kind: 'profile' }
  | { kind: 'password' }
  | { kind: 'privacy'; key: keyof PrivacySettings }
  | { kind: 'update' }
  | null

/** 等待指定毫秒（检测更新动画至少展示 1.5 秒，哪怕请求提前返回） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** 安卓客户端 APK 下载地址（nginx /download/ 静态目录） */
const ANDROID_APK_URL = 'https://chevoink.chevolink.com/download/chevoink.apk'

/** 安卓品牌图标（Android 机器人天线头，官方标识形状） */
function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396" />
    </svg>
  )
}

/** 苹果品牌图标（Apple 咬痕苹果，官方标识形状） */
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

/** 鸿蒙品牌图标（HarmonyOS 官方字标，simple-icons v16） */
function HarmonyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M1.861 0H3.59v3.548h3.861V0H9.19v8.883H7.458V5.136H3.59v3.746H1.858Zm8.248 8.883ZM13.854 0h1.706l2.809 4.7h.1L21.278 0h1.719v8.883h-1.719v-4.38l.1-1.489h-.1l-2.334 3.983h-1.039l-2.347-3.983h-.1l.1 1.489v4.38h-1.706Zm4.702 21.648a4.082 4.082 0 0 1-1.154-.161 3.417 3.417 0 0 1-1.01-.484 3.5 3.5 0 0 1-.8-.782 3.817 3.817 0 0 1-.538-1.092l1.666-.62a2.411 2.411 0 0 0 .643 1.116 1.683 1.683 0 0 0 1.207.434 2.173 2.173 0 0 0 .524-.062 1.749 1.749 0 0 0 .459-.2 1.02 1.02 0 0 0 .328-.335.88.88 0 0 0 .118-.459 1.052 1.052 0 0 0-.092-.447 1.031 1.031 0 0 0-.315-.373 2.538 2.538 0 0 0-.564-.335 8.135 8.135 0 0 0-.852-.335l-.577-.2a4.753 4.753 0 0 1-.774-.335 3.44 3.44 0 0 1-.7-.509 2.662 2.662 0 0 1-.525-.695 2.093 2.093 0 0 1-.2-.918 2.248 2.248 0 0 1 .21-.968 2.433 2.433 0 0 1 .616-.794 2.87 2.87 0 0 1 .957-.533 3.726 3.726 0 0 1 1.246-.2 3.57 3.57 0 0 1 1.22.186 2.783 2.783 0 0 1 .879.459 2.468 2.468 0 0 1 .59.608 2.9 2.9 0 0 1 .328.633l-1.56.62a1.55 1.55 0 0 0-.485-.67 1.387 1.387 0 0 0-.944-.3 1.655 1.655 0 0 0-.957.261.754.754 0 0 0-.38.658.843.843 0 0 0 .367.682 4.232 4.232 0 0 0 1.167.534l.59.186a6.271 6.271 0 0 1 1.023.434 2.948 2.948 0 0 1 .8.57 2.191 2.191 0 0 1 .511.769 2.44 2.44 0 0 1 .183.98 2.317 2.317 0 0 1-.3 1.2 2.559 2.559 0 0 1-.747.819 3.361 3.361 0 0 1-1.036.484 4.184 4.184 0 0 1-1.128.161Zm-13.028 0a4.441 4.441 0 0 1-3.23-1.34 4.757 4.757 0 0 1-.956-1.476 4.912 4.912 0 0 1-.339-1.824 4.813 4.813 0 0 1 .339-1.811 4.569 4.569 0 0 1 .956-1.477 4.38 4.38 0 0 1 1.427-.992 4.5 4.5 0 0 1 1.8-.36 4.417 4.417 0 0 1 1.79.36 4.343 4.343 0 0 1 1.44.992 4.418 4.418 0 0 1 .944 1.477 4.67 4.67 0 0 1 .351 1.811 4.765 4.765 0 0 1-.351 1.824 4.589 4.589 0 0 1-.944 1.476 4.495 4.495 0 0 1-3.23 1.34Zm0-1.588a2.822 2.822 0 0 0 1.125-.223 2.761 2.761 0 0 0 .92-.621 2.723 2.723 0 0 0 .617-.955 3.321 3.321 0 0 0 .23-1.253 3.227 3.227 0 0 0-.23-1.24 2.7 2.7 0 0 0-.617-.968 2.759 2.759 0 0 0-.92-.62 2.821 2.821 0 0 0-1.125-.223 2.856 2.856 0 0 0-2.057.844 2.946 2.946 0 0 0-.617.968 3.388 3.388 0 0 0-.218 1.24 3.488 3.488 0 0 0 .218 1.253 2.972 2.972 0 0 0 .617.955 2.856 2.856 0 0 0 2.057.843Zm4.972 1.389Zm-8.269 1.039h6.5V24h-6.5Z" />
    </svg>
  )
}

/** 客户端安装的系统选项：安卓可直接下载，其余展示占位提示 */
const CLIENT_OS_OPTIONS = [
  { key: 'android', label: '安卓', icon: AndroidIcon, iconClassName: 'text-[#3DDC84]' },
  { key: 'ios', label: '苹果', icon: AppleIcon, iconClassName: 'text-[var(--text-primary)]' },
  { key: 'harmony', label: '鸿蒙', icon: HarmonyIcon, iconClassName: 'text-[var(--text-primary)]' },
] as const

type ClientOsKey = (typeof CLIENT_OS_OPTIONS)[number]['key']

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
  const { isMobile } = useDevice()
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

  /** 当前打开的设置弹窗：昵称简介 / 登录密码 / 某个隐私维度 / 新版本提示 */
  const [openDialog, setOpenDialog] = useState<SettingsDialogState>(null)
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
  /** 客户端下载弹窗：仅手机浏览器使用 */
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [selectedClientOs, setSelectedClientOs] = useState<ClientOsKey | null>(null)
  /** 退出登录二次确认弹窗 */
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)

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
        if (!cancelled && payload.user?.privacy) {
          setPrivacy({ ...DEFAULT_PRIVACY, ...payload.user.privacy })
        }
      })
      .catch((): undefined => undefined)

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


  /** 手动检测 APP 更新：已是最新给 toast，有新版本弹窗展示。
   * 「检测中…」动画至少持续 1.5 秒：请求提前返回时也等满时长，避免一闪而过 */
  async function handleCheckUpdate() {
    if (updateChecking) return
    setUpdateChecking(true)

    try {
      const [result] = await Promise.all([checkAppUpdate(), delay(1500)])

      if (result.status === 'update') {
        setAvailableUpdate(result.manifest)
        setOpenDialog({ kind: 'update' })
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

  /** 确认下载客户端：安卓直接前往下载 APK，苹果/鸿蒙暂未开发 */
  function handleClientDownload(os: ClientOsKey) {
    if (os === 'android') {
      openExternalUrl(ANDROID_APK_URL)
      setClientDialogOpen(false)
      return
    }
    toast.info('暂未开发，敬请期待！')
  }

  async function handleLogout() {
    setLogoutSubmitting(true)

    try {
      await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      if (!(error instanceof ApiClientError)) {
        return
      }
    } finally {
      setLogoutSubmitting(false)
      setLogoutConfirmOpen(false)
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
      setOpenDialog(null)
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
      setOpenDialog(null)
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
      setOpenDialog(null)
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

  /** 关于分组：仅 APP 壳内展示，提供手动检测更新入口；登录/未登录都可用。
   * 发现新版本不再在行下方内联展开，而是弹出版本弹窗（openDialog.kind === 'update'） */
  const aboutSection = isNativeApp() ? (
    <section>
      <SectionTitle>关于</SectionTitle>
      <div className="divide-y divide-[var(--border-subtle)]">
        <SettingsRow
          icon={<RefreshCw className={cn('h-[18px] w-[18px]', updateChecking && 'animate-spin')} />}
          title="检测更新"
          caption={`当前版本 ${getNativeAppVersion() ?? '未知'}`}
          value={
            updateChecking
              ? '检测更新中…'
              : availableUpdate
                ? `发现新版本 ${availableUpdate.latestVersionName}`
                : undefined
          }
          chevron={availableUpdate && !updateChecking ? 'right' : 'none'}
          onClick={() => {
            if (updateChecking) return
            if (availableUpdate) {
              setOpenDialog({ kind: 'update' })
              return
            }
            void handleCheckUpdate()
          }}
        />
      </div>
    </section>
  ) : null

  /** 客户端分组：仅手机浏览器展示；点击弹出选择系统的下载弹窗 */
  const clientSection =
    !isNativeApp() && isMobile ? (
      <section>
        <SectionTitle>客户端</SectionTitle>
        <div className="divide-y divide-[var(--border-subtle)]">
          <SettingsRow
            icon={<Download className="h-[18px] w-[18px]" />}
            title="安装启创墨域客户端"
            caption="安装 APP 获得更流畅的阅读与创作体验"
            chevron="right"
            onClick={() => {
              setSelectedClientOs(null)
              setClientDialogOpen(true)
            }}
          />
        </div>
      </section>
    ) : null

  /** 客户端下载弹窗：选中系统后出现「立即下载 xx 端」按钮 */
  const clientDialog =
    clientDialogOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(15,23,42,0.28)] backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-8"
            onClick={() => setClientDialogOpen(false)}
          >
            <div
              role="dialog"
              aria-label="安装启创墨域客户端"
              className="w-full rounded-t-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-6 pb-[calc(24px+var(--safe-bottom))] shadow-[0_24px_64px_rgba(15,23,42,0.18)] sm:max-w-[400px] sm:rounded-[28px] sm:pb-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">安装启创墨域客户端</h3>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">请选择你要下载的版本</p>
                </div>
                <Button
                  onClick={() => setClientDialogOpen(false)}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 shrink-0 px-0"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {CLIENT_OS_OPTIONS.map((os) => {
                  const selected = selectedClientOs === os.key

                  return (
                    <button
                      key={os.key}
                      type="button"
                      onClick={() => setSelectedClientOs(os.key)}
                      className={cn(
                        'press-feedback flex flex-col items-center gap-2 rounded-[var(--radius-md)] border py-4 transition-colors',
                        selected
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] hover:bg-[var(--surface-default)]',
                      )}
                    >
                      <os.icon className={cn('h-7 w-7', os.iconClassName)} />
                      <span
                        className={cn(
                          'text-[13px] font-medium',
                          selected ? 'text-[var(--color-brand)]' : 'text-[var(--text-primary)]',
                        )}
                      >
                        {os.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {selectedClientOs ? (
                <Button
                  variant="primary"
                  className="mt-6 h-11 w-full"
                  onClick={() => handleClientDownload(selectedClientOs)}
                >
                  立即下载{CLIENT_OS_OPTIONS.find((os) => os.key === selectedClientOs)?.label}端
                </Button>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null

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

        {clientSection}

        {clientDialog}
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

          {/* 昵称与简介：点开弹出编辑弹窗，不在行下方展开 */}
          <SettingsRow
            icon={<UserRound className="h-[18px] w-[18px]" />}
            title="昵称与简介"
            caption={sessionUser.bio || '还没有填写简介'}
            value={sessionUser.nickname}
            chevron="right"
            onClick={() => setOpenDialog({ kind: 'profile' })}
          />
        </div>
      </section>

      {/* 分组二：隐私 */}
      <section>
        <SectionTitle>隐私</SectionTitle>
        <div className="divide-y divide-[var(--border-subtle)]">
          {/* 隐私维度：点开弹出选项弹窗，不在行下方展开 */}
          {PRIVACY_ITEMS.map((item) => (
            <SettingsRow
              key={item.key}
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
              chevron="right"
              onClick={() => setOpenDialog({ kind: 'privacy', key: item.key })}
            />
          ))}
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

          {/* 登录密码：点开弹出设置弹窗，不在行下方展开 */}
          <SettingsRow
            icon={<KeyRound className="h-[18px] w-[18px]" />}
            title="登录密码"
            caption={sessionUser.passwordConfigured ? '修改前需验证当前密码或手机验证码' : '设置后可使用手机号和密码登录'}
            value={sessionUser.passwordConfigured ? '已设置' : '未设置'}
            chevron="right"
            onClick={() => setOpenDialog({ kind: 'password' })}
          />
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
            onClick={() => setLogoutConfirmOpen(true)}
            danger
          />
        </div>
      </section>

      {/* 分组六：关于（仅 APP 壳内） */}
      {aboutSection}

      {/* 分组七：客户端安装（仅手机浏览器） */}
      {clientSection}

      {clientDialog}

      {/* 退出登录二次确认弹窗 */}
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="确认要退出登录吗？"
        description="退出后可随时重新登录，继续管理你的书架和草稿。"
        confirmLabel="退出登录"
        tone="danger"
        busy={logoutSubmitting}
        onConfirm={() => void handleLogout()}
        onCancel={() => setLogoutConfirmOpen(false)}
      />

      {/* 封面裁剪弹窗：选完文件后进入，确认才真正上传 */}
      <ImageCropperDialog
        open={Boolean(coverDraft)}
        imageDataUrl={coverDraft}
        aspect={3}
        submitting={coverSubmitting}
        onCancel={() => setCoverDraft(null)}
        onConfirm={(dataUrl) => void handleCoverCropConfirm(dataUrl)}
      />

      {/* 设置弹窗统一出口：点开设定项不再在行下方展开，而是弹出自定义弹窗。
          弹窗挂在 body 上且遮罩独占一层，点弹窗内按钮不会误触到下方页面内容 */}
      {typeof document !== 'undefined' && openDialog?.kind === 'profile'
        ? createPortal(
            <BottomSheet open onClose={() => setOpenDialog(null)} title="昵称与简介">
              <form className="space-y-4 px-4 pb-[calc(20px+var(--safe-bottom))] pt-4 md:px-5" onSubmit={handleUpdateProfile}>
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
                <Button type="submit" variant="primary" className="h-11 w-full" disabled={profileSubmitting}>
                  {profileSubmitting ? '保存中…' : '保存'}
                </Button>
              </form>
            </BottomSheet>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && openDialog?.kind === 'privacy'
        ? createPortal(
            <BottomSheet
              open
              onClose={() => setOpenDialog(null)}
              title={PRIVACY_ITEMS.find((item) => item.key === openDialog.key)?.label ?? '隐私设置'}
            >
              <p className="px-4 pb-1 pt-3 text-xs text-[var(--text-tertiary)] md:px-5">
                {PRIVACY_ITEMS.find((item) => item.key === openDialog.key)?.caption}
              </p>
              <div className="space-y-1 px-2 pb-[calc(20px+var(--safe-bottom))] md:px-3">
                {PRIVACY_LEVEL_ORDER.map((level) => {
                  const selected = privacy[openDialog.key] === level

                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={privacySubmittingKey === openDialog.key}
                      onClick={() => void handlePrivacyChange(openDialog.key, level)}
                      className={cn(
                        'press-feedback flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left transition-colors',
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
            </BottomSheet>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && openDialog?.kind === 'password'
        ? createPortal(
            <BottomSheet open onClose={() => setOpenDialog(null)} title="登录密码">
              <form className="space-y-4 px-4 pb-[calc(20px+var(--safe-bottom))] pt-4 md:px-5" onSubmit={handleSetPassword}>
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

                <Button type="submit" variant="primary" className="h-11 w-full" disabled={passwordSubmitting}>
                  {passwordSubmitting ? '保存中…' : sessionUser.passwordConfigured ? '更新密码' : '设置密码'}
                </Button>
              </form>
            </BottomSheet>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && openDialog?.kind === 'update' && availableUpdate
        ? createPortal(
            <BottomSheet open onClose={() => setOpenDialog(null)} title="发现新版本">
              <div className="space-y-4 px-4 pb-[calc(20px+var(--safe-bottom))] pt-4 md:px-5">
                <p className="text-[15px] font-medium text-[var(--text-primary)]">
                  新版本 {availableUpdate.latestVersionName} 已发布
                </p>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  {availableUpdate.notes?.trim() || '点击更新以获取最新功能与修复'}
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 flex-1"
                    onClick={() => setOpenDialog(null)}
                  >
                    稍后再说
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="h-11 flex-1"
                    onClick={() => {
                      if (availableUpdate.url) openExternalUrl(availableUpdate.url)
                    }}
                  >
                    立即更新
                  </Button>
                </div>
              </div>
            </BottomSheet>,
            document.body,
          )
        : null}
    </div>
  )
}
