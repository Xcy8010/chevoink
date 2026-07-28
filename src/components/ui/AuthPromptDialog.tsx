import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import Button from '@/components/ui/Button'

type AuthPromptDialogProps = {
  open: boolean
  /** 弹窗标题，默认「登录后继续」 */
  title?: string
  /** 说明文案，告诉用户登录后能做什么 */
  description?: string
  /** 登录/注册完成后回跳的路径，默认当前页 */
  redirectPath?: string
  onClose: () => void
}

/**
 * 未登录拦截弹窗：替代生硬的整页跳转，让用户就地选择去登录或注册。
 * 与 ConfirmDialog 同层级（portal 到 body），关闭后停留在原页面。
 */
export default function AuthPromptDialog({
  open,
  title = '登录后继续',
  description = '登录或注册后，就可以发布内容、收藏作品并和大家互动。',
  redirectPath,
  onClose,
}: AuthPromptDialogProps) {
  const navigate = useNavigate()

  if (!open) {
    return null
  }

  const redirect = encodeURIComponent(
    redirectPath ?? `${window.location.pathname}${window.location.search}`,
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(15,23,42,0.28)] backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[28px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-6 pb-[calc(24px+var(--safe-bottom))] shadow-[0_24px_64px_rgba(15,23,42,0.18)] sm:max-w-[400px] sm:rounded-[28px] sm:pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
          </div>
          <Button onClick={onClose} variant="ghost" size="sm" className="h-9 w-9 shrink-0 px-0" aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          <Button
            variant="primary"
            className="h-11 w-full"
            onClick={() => {
              onClose()
              navigate(`/login?redirect=${redirect}`)
            }}
          >
            去登录
          </Button>
          <Button
            variant="secondary"
            className="h-11 w-full"
            onClick={() => {
              onClose()
              navigate(`/register?redirect=${redirect}`)
            }}
          >
            创建新账户
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
