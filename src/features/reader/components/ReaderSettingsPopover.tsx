import ReaderSettingsContent from './ReaderSettingsContent'
import type { ReaderFontScale, ReaderTone } from '../reader-settings'

type ReaderSettingsPopoverProps = {
  open: boolean
  onClose: () => void
  fontScale: ReaderFontScale
  tone: ReaderTone
  onFontScaleChange: (next: ReaderFontScale) => void
  onToneChange: (next: ReaderTone) => void
}

/**
 * 平板/电脑端阅读设置弹出面板。
 * 需放置在 relative 定位的触发按钮容器内，向下弹出，点击遮罩关闭。
 */
export default function ReaderSettingsPopover({
  open,
  onClose,
  fontScale,
  tone,
  onFontScaleChange,
  onToneChange,
}: ReaderSettingsPopoverProps) {
  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="关闭阅读设置"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div className="animate-fade-in-up absolute right-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[var(--shadow-modal)]">
        <ReaderSettingsContent
          fontScale={fontScale}
          tone={tone}
          onFontScaleChange={onFontScaleChange}
          onToneChange={onToneChange}
        />
      </div>
    </>
  )
}
