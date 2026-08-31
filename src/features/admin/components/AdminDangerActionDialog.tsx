import { useEffect, useState } from 'react'
import { ArrowLeft, LoaderCircle, RefreshCcw, ShieldAlert, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import type { AdminCaptchaPayload } from '../../../../shared/contracts'
import { getAdminCaptcha } from '../api'

export type AdminDangerPayload = { captchaId: string; captchaAnswer: string; confirmation: string }

type Props = {
  open: boolean
  title: string
  description: string
  confirmation: string
  busy?: boolean
  onConfirm: (payload: AdminDangerPayload) => void
  onClose: () => void
}

export default function AdminDangerActionDialog({ open, title, description, confirmation, busy = false, onConfirm, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [captcha, setCaptcha] = useState<AdminCaptchaPayload | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [confirmAnswer, setConfirmAnswer] = useState('')
  const [loadingCaptcha, setLoadingCaptcha] = useState(false)

  async function refreshCaptcha() {
    setLoadingCaptcha(true)
    try {
      setCaptcha(await getAdminCaptcha())
      setCaptchaAnswer('')
    } finally {
      setLoadingCaptcha(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setStep(1)
    setConfirmAnswer('')
    void refreshCaptcha()
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]">
      <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-[18px] border border-[var(--border-strong)] bg-[var(--surface-default)] p-5 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p></div>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 border-t border-[var(--border-subtle)] pt-5">
          {step === 1 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">第 1 步 · 人机验证</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-14 min-w-36 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white">
                  {captcha ? <img src={captcha.imageBase64} alt="人机验证码" className="h-full max-w-full object-contain" /> : <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
                <button type="button" onClick={() => void refreshCaptcha()} disabled={loadingCaptcha} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-strong)]"><RefreshCcw className={`h-4 w-4 ${loadingCaptcha ? 'animate-spin' : ''}`} /></button>
              </div>
              <TextInput className="mt-3" value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value)} placeholder="输入图中字符" autoComplete="off" />
              <div className="mt-5 flex justify-end"><Button variant="primary" disabled={!captcha || !captchaAnswer.trim()} onClick={() => setStep(2)}>下一步</Button></div>
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setStep(1)} className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft className="h-3.5 w-3.5" />返回验证</button>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">第 2 步 · 最终确认</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">请输入 <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[var(--text-primary)]">{confirmation}</code> 确认执行。</p>
              <TextInput className="mt-3" value={confirmAnswer} onChange={(event) => setConfirmAnswer(event.target.value)} placeholder={confirmation} autoComplete="off" />
              <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>取消</Button><Button variant="primary" className="bg-rose-700 hover:bg-rose-800" disabled={busy || confirmAnswer.trim() !== confirmation} onClick={() => captcha && onConfirm({ captchaId: captcha.captchaId, captchaAnswer: captchaAnswer.trim(), confirmation: confirmAnswer.trim() })}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}确认执行</Button></div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
