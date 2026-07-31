import { createPortal } from 'react-dom'

import AppImage from '@/components/ui/AppImage'
import Button from '@/components/ui/Button'
import { isInShelf } from '@/features/home/local-shelf'

/**
 * 退出挽留弹窗（方案 20 §2.4）：手机端阅读器退出时，若作品还没在书架里，
 * 就地问一句要不要加入书架。已在书架、或本次会话已问过的作品不再打扰。
 */

const PROMPTED_KEY = 'chevoink-reader-shelf-prompted'

function readPrompted(): string[] {
  try {
    const raw = window.sessionStorage.getItem(PROMPTED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** 是否需要弹挽留：未在书架 且 本次会话没问过 */
export function shouldPromptShelf(novelId: string): boolean {
  if (typeof window === 'undefined' || !novelId) return false
  if (isInShelf(novelId)) return false
  return !readPrompted().includes(novelId)
}

/** 记录已问过（每书每会话只问一次，避免反复进出被打扰） */
export function markShelfPrompted(novelId: string) {
  if (typeof window === 'undefined' || !novelId) return
  try {
    const prompted = readPrompted()
    if (prompted.includes(novelId)) return
    prompted.push(novelId)
    window.sessionStorage.setItem(PROMPTED_KEY, JSON.stringify(prompted.slice(-60)))
  } catch {
    // sessionStorage 不可用时静默失败
  }
}

type AddShelfDialogProps = {
  open: boolean
  title: string
  coverUrl: string | null
  /** 已读到的章节名，让文案更有代入感 */
  chapterTitle?: string | null
  /** 加入书架并退出 */
  onConfirm: () => void
  /** 暂不加入，直接退出 */
  onDismiss: () => void
}

export default function AddShelfDialog({
  open,
  title,
  coverUrl,
  chapterTitle,
  onConfirm,
  onDismiss,
}: AddShelfDialogProps) {
  if (!open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(15,23,42,0.42)] px-8 backdrop-blur-[2px]">
      <div className="w-full max-w-[320px] rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-5 shadow-[0_24px_64px_rgba(15,23,42,0.24)]">
        <div className="flex items-center gap-3">
          {coverUrl ? (
            <AppImage
              src={coverUrl}
              alt={title}
              className="h-[72px] w-[54px] shrink-0 overflow-hidden rounded-[var(--radius-md)]"
            />
          ) : (
            <div className="flex h-[72px] w-[54px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-1 text-center text-[10px] leading-3 text-[var(--text-secondary)]">
              {title}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[15px] font-semibold text-[var(--text-primary)]">{title}</p>
            {chapterTitle ? (
              <p className="mt-1 line-clamp-1 text-xs text-[var(--text-secondary)]">读到 {chapterTitle}</p>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          加入书架，下次可以直接从这里继续读。
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button variant="secondary" className="h-11 flex-1" onClick={onDismiss}>
            暂不加入
          </Button>
          <Button variant="primary" className="h-11 flex-1" onClick={onConfirm}>
            加入书架
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
