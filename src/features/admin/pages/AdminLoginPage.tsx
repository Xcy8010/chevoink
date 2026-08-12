import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { useToast } from '@/components/ui/Toast'
import { ApiClientError } from '@/app/api-client'
import type { AdminCaptchaPayload } from '../../../../shared/contracts/index.js'
import { adminLogin, getAdminCaptcha } from '../api'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState<AdminCaptchaPayload | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const refreshCaptcha = useCallback(async () => {
    try {
      setCaptcha(await getAdminCaptcha())
    } catch {
      toast.error('人机验证获取失败，请稍后重试。')
    }
  }, [toast])

  useEffect(() => {
    void refreshCaptcha()
  }, [refreshCaptcha])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return

    if (!email.trim() || !password || !captcha || !captchaAnswer.trim()) {
      toast.error('请输入邮箱、密码并完成人机验证。')
      return
    }

    setIsSubmitting(true)
    try {
      await adminLogin({
        email: email.trim(),
        password,
        captchaId: captcha.captchaId,
        captchaAnswer: captchaAnswer.trim(),
      })
      toast.success('登录成功')
      navigate('/admin', { replace: true })
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : '登录失败，请稍后重试。'
      toast.error(message)
      // 验证码一次性消费：无论哪种失败都需要刷新
      setCaptchaAnswer('')
      void refreshCaptcha()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-muted)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-contrast)] text-[var(--text-contrast)]">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">启创墨域 · 管理后台</h1>
            <p className="text-sm text-[var(--text-secondary)]">仅限管理员访问，操作全程留痕</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-default)] p-5"
        >
          <div>
            <p className="mb-1.5 text-sm text-[var(--text-secondary)]">管理员邮箱</p>
            <TextInput
              type="email"
              autoComplete="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm text-[var(--text-secondary)]">密码</p>
            <TextInput
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm text-[var(--text-secondary)]">人机验证</p>
            <div className="flex items-center gap-3">
              {captcha ? (
                <button type="button" title="点击刷新" onClick={() => void refreshCaptcha()} className="shrink-0">
                  <img
                    src={captcha.imageBase64}
                    alt="验证码图片"
                    className="h-[42px] w-[112px] rounded-lg border border-[var(--border-strong)] bg-white"
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void refreshCaptcha()}
                  className="flex h-[42px] w-[112px] shrink-0 items-center justify-center rounded-lg border border-[var(--border-strong)] text-xs text-[var(--text-secondary)]"
                >
                  点击加载
                </button>
              )}
              <TextInput
                placeholder="图中字符"
                value={captchaAnswer}
                onChange={(event) => setCaptchaAnswer(event.target.value)}
              />
            </div>
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? '登录中…' : '登录管理后台'}
          </Button>

          <p className="text-center text-xs text-[var(--text-secondary)]">
            5 次失败将锁定 15 分钟 ·{' '}
            <Link to="/" className="underline hover:text-[var(--text-primary)]">
              返回主站
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
