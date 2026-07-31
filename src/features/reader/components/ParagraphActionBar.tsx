import { Copy, Headphones, Highlighter, MessageSquare } from 'lucide-react'
import { createPortal } from 'react-dom'

/**
 * 长按选段操作条（方案 20 §2.6）：从本段听 / 发段评 / 复制 / 划线-取消划线。
 * 浮在被选段落附近，空间不足时自动翻到段落上方，并夹在视口内。
 */

export type ParagraphActionAnchor = {
  paragraphIndex: number
  /** 被选段落在视口中的位置 */
  rect: { top: number; bottom: number; left: number; right: number }
}

type ParagraphActionBarProps = {
  anchor: ParagraphActionAnchor | null
  underlined: boolean
  /** 听书是否可用（创作区预览不可用） */
  ttsAvailable: boolean
  onPlayFromHere: (paragraphIndex: number) => void
  onComment: (paragraphIndex: number) => void
  onCopy: (paragraphIndex: number) => void
  onToggleUnderline: (paragraphIndex: number) => void
  onClose: () => void
}

const BAR_WIDTH = 268
const BAR_HEIGHT = 46
const EDGE_GAP = 12

export default function ParagraphActionBar({
  anchor,
  underlined,
  ttsAvailable,
  onPlayFromHere,
  onComment,
  onCopy,
  onToggleUnderline,
  onClose,
}: ParagraphActionBarProps) {
  if (!anchor) {
    return null
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 优先放段落下方，下方不够则翻到上方
  const belowTop = anchor.rect.bottom + 10
  const aboveTop = anchor.rect.top - BAR_HEIGHT - 10
  const top =
    belowTop + BAR_HEIGHT + EDGE_GAP <= viewportHeight
      ? belowTop
      : Math.max(EDGE_GAP, aboveTop)

  const center = (anchor.rect.left + anchor.rect.right) / 2
  const left = Math.min(
    Math.max(EDGE_GAP, center - BAR_WIDTH / 2),
    Math.max(EDGE_GAP, viewportWidth - BAR_WIDTH - EDGE_GAP),
  )

  const actions = [
    ttsAvailable
      ? { key: 'tts', label: '从本段听', icon: Headphones, onClick: () => onPlayFromHere(anchor.paragraphIndex) }
      : null,
    { key: 'comment', label: '发段评', icon: MessageSquare, onClick: () => onComment(anchor.paragraphIndex) },
    { key: 'copy', label: '复制', icon: Copy, onClick: () => onCopy(anchor.paragraphIndex) },
    {
      key: 'underline',
      label: underlined ? '取消划线' : '划线',
      icon: Highlighter,
      onClick: () => onToggleUnderline(anchor.paragraphIndex),
    },
  ].filter((action): action is { key: string; label: string; icon: typeof Copy; onClick: () => void } =>
    Boolean(action),
  )

  return createPortal(
    <>
      {/* 点击空白处收起 */}
      <div className="fixed inset-0 z-[108]" onPointerDown={onClose} />
      <div
        className="fixed z-[109] flex items-center gap-0.5 rounded-[var(--radius-pill)] bg-[rgba(28,32,40,0.94)] px-1.5 py-1 text-white shadow-[0_14px_36px_rgba(15,23,42,0.34)] backdrop-blur-[6px]"
        style={{ top, left, width: BAR_WIDTH, height: BAR_HEIGHT }}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className="press-feedback flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-pill)]"
          >
            <action.icon className="h-4 w-4" />
            <span className="text-[10px] leading-none">{action.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  )
}
