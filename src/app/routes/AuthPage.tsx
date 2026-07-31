import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { ApiClientError, requestJson } from '@/app/api-client'
import Button from '@/components/ui/Button'
import Surface from '@/components/ui/Surface'
import TextInput from '@/components/ui/TextInput'
import { useShellStore } from '@/store/useShellStore'
import type {
  AuthSessionPayload,
  LoginRequest,
  SendSmsCodeRequest,
  SmsAccountStatus,
  SmsLoginRequest,
  SmsRegisterRequest,
} from '../../../shared/contracts'

type AuthPageMode = 'login' | 'register'

type AuthPageProps = {
  mode: AuthPageMode
}

type LoginMethod = 'password' | 'sms'

type CaptchaPayload = {
  captchaId: string
  imageBase64: string
  expiresInSeconds: number
}

type SmsCodePayload = {
  ok: true
  expireInSeconds: number
  cooldownSeconds: number
  provider: 'tencentcloud'
  accountStatus: SmsAccountStatus
  normalizedPhone: string
}

const DEFAULT_CN_PHONE_PREFIX = '+86'
const CN_PHONE_LENGTH = 11

function normalizePhoneInputValue(input: string): string {
  const digits = input.replace(/\D/g, '')

  if (!digits || digits === '86' || digits === '0086') {
    return ''
  }

  if (digits.startsWith('0086')) {
    return digits.slice(4, 4 + CN_PHONE_LENGTH)
  }

  if (digits.startsWith('86') && digits.length > CN_PHONE_LENGTH) {
    return digits.slice(2, 2 + CN_PHONE_LENGTH)
  }

  return digits.slice(0, CN_PHONE_LENGTH)
}

function buildPhoneSubmitValue(input: string): string {
  const normalizedPhone = normalizePhoneInputValue(input)

  return normalizedPhone ? `${DEFAULT_CN_PHONE_PREFIX}${normalizedPhone}` : ''
}

function normalizeRedirectPath(input: string | null): string {
  if (!input || !input.startsWith('/')) {
    return '/me'
  }

  if (input.startsWith('//')) {
    return '/me'
  }

  return input
}

export default function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuthenticated = useShellStore((state) => state.setAuthenticated)
  const isAuthenticated = useShellStore((state) => state.authStatus === 'authenticated' && !!state.sessionUser)

  const redirectPath = useMemo(() => normalizeRedirectPath(searchParams.get('redirect')), [searchParams])
  const isRegisterPage = mode === 'register'

  const [loginMethod, setLoginMethod] = useState<LoginMethod>(isRegisterPage ? 'sms' : 'password')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImageBase64, setCaptchaImageBase64] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaDialogVisible, setCaptchaDialogVisible] = useState(false)
  const [smsAccountStatus, setSmsAccountStatus] = useState<SmsAccountStatus | null>(isRegisterPage ? 'new' : null)
  const [submitting, setSubmitting] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [loadingCaptcha, setLoadingCaptcha] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [errorMessage, setErrorMessage] = useState('')
  const [hintMessage, setHintMessage] = useState('')

  const isSmsFlow = isRegisterPage || loginMethod === 'sms'
  const shouldCollectProfile = isRegisterPage || smsAccountStatus === 'new'

  useEffect(() => {
    if (!isSmsFlow || !captchaDialogVisible) {
      return
    }

    void refreshCaptcha()
  }, [isSmsFlow, captchaDialogVisible])

  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) {
      return
    }

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [cooldownUntil])

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  async function refreshCaptcha() {
    setLoadingCaptcha(true)

    try {
      const payload = await requestJson<CaptchaPayload>('/api/auth/captcha')
      setCaptchaId(payload.captchaId)
      setCaptchaImageBase64(payload.imageBase64)
      setCaptchaAnswer('')
    } catch (error) {
      setErrorMessage(error instanceof ApiClientError ? error.message : '人机验证获取失败，请稍后重试。')
    } finally {
      setLoadingCaptcha(false)
    }
  }

  function openCaptchaDialog() {
    const trimmedPhone = phone.trim()

    if (!trimmedPhone) {
      setErrorMessage('请先输入手机号。')
      return
    }

    setErrorMessage('')
    setHintMessage('')
    setCaptchaDialogVisible(true)
  }

  async function handleSendCode() {
    setSendingCode(true)
    setErrorMessage('')
    setHintMessage('')

    try {
      const payload = await requestJson<SmsCodePayload>('/api/auth/sms/send-code', {
        method: 'POST',
        body: JSON.stringify({
          phone: buildPhoneSubmitValue(phone),
          purpose: 'auth',
          captchaId,
          captchaAnswer: captchaAnswer.trim(),
        } satisfies SendSmsCodeRequest),
      })

      setPhone(normalizePhoneInputValue(payload.normalizedPhone))
      setSmsAccountStatus(payload.accountStatus)
      setCooldownUntil(Date.now() + payload.cooldownSeconds * 1000)
      setNow(Date.now())
      setHintMessage(
        payload.accountStatus === 'existing'
          ? `验证码已发送，该手机号已有账号，验证后将直接登录。`
          : '验证码已发送，该手机号尚未注册，验证后会直接完成注册。',
      )
      setCaptchaDialogVisible(false)
      setCaptchaAnswer('')
    } catch (error) {
      setSmsAccountStatus(isRegisterPage ? 'new' : null)
      setErrorMessage(error instanceof ApiClientError ? error.message : '验证码发送失败，请稍后再试。')
      await refreshCaptcha()
    } finally {
      setSendingCode(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage('')
    setHintMessage('')

    try {
      const payload = !isSmsFlow
        ? await requestJson<AuthSessionPayload>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              phone: buildPhoneSubmitValue(account),
              password,
            } satisfies LoginRequest),
          })
        : shouldCollectProfile
          ? await requestJson<AuthSessionPayload>('/api/auth/sms/register', {
              method: 'POST',
              body: JSON.stringify({
                phone: buildPhoneSubmitValue(phone),
                code: code.trim(),
              } satisfies SmsRegisterRequest),
            })
          : await requestJson<AuthSessionPayload>('/api/auth/sms/login', {
              method: 'POST',
              body: JSON.stringify({
                phone: buildPhoneSubmitValue(phone),
                code: code.trim(),
              } satisfies SmsLoginRequest),
            })

      setAuthenticated({
        user: payload.user,
        tokens: payload.tokens,
        unreadMessageCount: payload.user.unreadMessageCount,
        unreadNotificationCount: payload.user.unreadNotificationCount,
      })

      if (isSmsFlow && shouldCollectProfile) {
        navigate('/me', {
          replace: true,
          state: {
            showPostRegisterPrompt: true,
          },
        })
        return
      }

      navigate(redirectPath, { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof ApiClientError ? error.message : '暂时无法完成提交，请稍后再试。')
    } finally {
      setSubmitting(false)
    }
  }

  if (isAuthenticated) {
    return (
      <Surface as="section" padding="lg" className="mx-auto max-w-[680px]">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]">账户状态</p>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">你已经登录</h2>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">可以直接回到个人中心，继续查看书架、草稿和互动记录。</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => navigate(redirectPath, { replace: true })}>
              继续前往
            </Button>
            <Button variant="secondary" onClick={() => navigate('/settings')}>
              打开设置
            </Button>
          </div>
        </div>
      </Surface>
    )
  }

  return (
    <Surface as="section" padding="lg" className="mx-auto max-w-[680px]">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]">
            {isRegisterPage ? '手机号注册' : '欢迎回来'}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {isSmsFlow ? '手机号验证码登录与注册' : '登录后继续阅读与创作'}
          </h2>
          <p className="text-sm leading-7 text-[var(--text-secondary)]">
            {isSmsFlow
              ? '先完成人机验证并获取验证码。若手机号已存在，将直接登录；若手机号未注册，会继续提示你填写个人信息完成注册。'
              : '请输入手机号和登录密码继续访问你的账户。'}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {!isRegisterPage ? (
            <div className="flex gap-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-1">
              <button
                type="button"
                className={`flex-1 rounded-[calc(var(--radius-md)-4px)] px-3 py-2 text-sm font-medium transition ${
                  loginMethod === 'password'
                    ? 'bg-black text-white shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
                onClick={() => {
                  setLoginMethod('password')
                  setErrorMessage('')
                  setHintMessage('')
                }}
              >
                密码登录
              </button>
              <button
                type="button"
                className={`flex-1 rounded-[calc(var(--radius-md)-4px)] px-3 py-2 text-sm font-medium transition ${
                  loginMethod === 'sms'
                    ? 'bg-black text-white shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
                onClick={() => {
                  setLoginMethod('sms')
                  setErrorMessage('')
                  setHintMessage('')
                }}
              >
                手机验证码
              </button>
            </div>
          ) : null}

          {!isSmsFlow ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="account">
                  手机号
                </label>
                <TextInput
                  id="account"
                  value={account}
                  onChange={(event) => setAccount(normalizePhoneInputValue(event.target.value))}
                  placeholder="输入手机号"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="password">
                  密码
                </label>
                <TextInput
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入当前密码"
                  autoComplete="current-password"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="phone">
                  手机号
                </label>
                <TextInput
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(normalizePhoneInputValue(event.target.value))}
                  placeholder="输入手机号"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="code">
                  短信验证码
                </label>
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <TextInput
                      id="code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="输入 6 位验证码"
                      autoComplete="one-time-code"
                      required
                    />
                  </div>
                  <Button type="button" variant="secondary" disabled={sendingCode || cooldownSeconds > 0} onClick={openCaptchaDialog}>
                    {sendingCode ? '发送中…' : cooldownSeconds > 0 ? `${cooldownSeconds}s 后重发` : '获取验证码'}
                  </Button>
                </div>
              </div>

            </>
          )}

          {hintMessage ? (
            <p className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              {hintMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? '提交中…' : !isSmsFlow ? '登录' : shouldCollectProfile ? '完成注册' : '验证后直接登录'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/')}>
              返回首页
            </Button>
            {/* 未登录也能调整基础设置（全屏与主题颜色） */}
            <Button type="button" variant="ghost" onClick={() => navigate('/settings')}>
              前往设置
            </Button>
          </div>
        </form>

        <p className="text-sm text-[var(--text-secondary)]">
          {isRegisterPage ? '已经有账户？' : '还没有账户？'}{' '}
          <Link
            to={isRegisterPage ? `/login?redirect=${encodeURIComponent(redirectPath)}` : `/register?redirect=${encodeURIComponent(redirectPath)}`}
            className="font-medium text-[var(--text-primary)]"
          >
            {isRegisterPage ? '去登录' : '创建账户'}
          </Link>
        </p>
      </div>

      {captchaDialogVisible ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-[440px] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-white p-5 shadow-xl dark:bg-[#111827]">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">完成人机验证</h3>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">请输入图片中的数字和字母，验证通过后才会发送短信验证码。</p>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                {loadingCaptcha ? (
                  <span className="inline-flex h-[64px] min-w-[168px] items-center text-sm text-[var(--text-secondary)]">加载中…</span>
                ) : captchaImageBase64 ? (
                  <img src={captchaImageBase64} alt="图形验证码" className="h-[64px] w-[168px] object-contain" />
                ) : (
                  <span className="inline-flex h-[64px] min-w-[168px] items-center text-sm text-[var(--text-secondary)]">请刷新验证码</span>
                )}
                <Button type="button" variant="secondary" onClick={() => void refreshCaptcha()} disabled={loadingCaptcha}>
                  刷新验证码
                </Button>
              </div>

              <TextInput
                id="captchaAnswer"
                value={captchaAnswer}
                onChange={(event) => setCaptchaAnswer(event.target.value)}
                placeholder="请输入图片中的数字和字母"
                autoComplete="off"
                maxLength={4}
                required
              />
            </div>

            <div className="mt-5 flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCaptchaDialogVisible(false)
                  setCaptchaAnswer('')
                }}
              >
                取消
              </Button>
              <Button type="button" variant="primary" disabled={sendingCode || !captchaId || !captchaAnswer.trim()} onClick={handleSendCode}>
                {sendingCode ? '发送中…' : '确认并发送'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

    </Surface>
  )
}
