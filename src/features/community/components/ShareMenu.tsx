import { Link2, Send } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { useToast } from '@/components/ui/Toast'
import type { CommunityShareDraft } from '@/features/community/share'
import { cn } from '@/lib/utils'

type ShareMenuProps = {
  /** 分享草稿：跳社区发帖时经 router state 传递 */
  share: CommunityShareDraft
  /** 复制链接使用的完整 URL */
  url: string
  triggerClassName: string
  triggerContent: ReactNode
  ariaLabel?: string
  /** 菜单弹出方向：底部操作栏用 up，页面顶部按钮用 down */
  placement?: 'up' | 'down'
  wrapperClassName?: string
}

const menuItemClass =
  'flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]'

/** 分享弹出菜单（任务7）：分享到社区 + 复制链接，作品页/作者页共用 */
export default function ShareMenu({
  share,
  url,
  triggerClassName,
  triggerContent,
  ariaLabel = '分享',
  placement = 'down',
  wrapperClassName,
}: ShareMenuProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  const handleShareToCommunity = () => {
    setOpen(false)
    navigate('/community', { state: { share } })
  }

  const handleCopyLink = async () => {
    setOpen(false)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('链接已复制，去分享给朋友吧')
    } catch {
      toast.error('复制失败，请手动复制地址栏链接')
    }
  }

  return (
    <div className={cn('relative', wrapperClassName)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        {triggerContent}
      </button>

      {open ? (
        <>
          {/* 透明遮罩：点菜单外任意处收起 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={cn(
              'absolute right-0 z-50 w-44 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1.5 shadow-[var(--shadow-modal)]',
              placement === 'up' ? 'bottom-[52px]' : 'top-[48px]',
            )}
          >
            <button type="button" onClick={handleShareToCommunity} className={menuItemClass}>
              <Send className="h-4 w-4 text-[var(--text-secondary)]" />
              分享到社区
            </button>
            <button type="button" onClick={() => void handleCopyLink()} className={menuItemClass}>
              <Link2 className="h-4 w-4 text-[var(--text-secondary)]" />
              复制链接
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
