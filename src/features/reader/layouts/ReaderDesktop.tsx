import {
  BookOpen,
  ChevronLeft,
  ListOrdered,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'
import ReaderArticle from '../components/ReaderArticle'
import ReaderCommentsPanel from '../components/ReaderCommentsPanel'
import ReaderDirectory from '../components/ReaderDirectory'
import ReaderProgressBar from '../components/ReaderProgressBar'
import ReaderSettingsPopover from '../components/ReaderSettingsPopover'
import type { ReaderState } from '../useReaderState'

type ReaderDesktopProps = {
  state: ReaderState
}

/**
 * 电脑端阅读器（方案 2.5.2）：左目录 240px + 中正文 + 右评论 280px 三栏工作台。
 * - 左右面板均可折叠，评论常驻
 * - 键盘 ←/→ 翻章，双击正文进入沉浸，Esc 退出
 */
export default function ReaderDesktop({ state }: ReaderDesktopProps) {
  const navigate = useNavigate()
  const [directoryOpen, setDirectoryOpen] = useState(true)
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [immersive, setImmersive] = useState(false)

  const tone = state.toneOption
  const { previousHref, nextHref } = state

  // 键盘快捷键：←/→ 翻章，Esc 退出沉浸（输入框聚焦时不触发翻章）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImmersive(false)
        return
      }

      const target = event.target as HTMLElement | null
      const isTyping =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isTyping) return

      if (event.key === 'ArrowLeft' && previousHref) {
        event.preventDefault()
        navigate(previousHref)
      } else if (event.key === 'ArrowRight' && nextHref) {
        event.preventDefault()
        navigate(nextHref)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previousHref, nextHref, navigate])

  const headerIconButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    active = false,
  ) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-pill)] transition-colors press-feedback',
        active
          ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
      )}
    >
      {icon}
    </button>
  )

  // 沉浸模式：隐藏三栏与顶栏，正文居中 720px，仅保留进度条
  if (immersive) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col"
        style={{ background: tone.background, color: tone.text }}
      >
        <ReaderProgressBar percent={state.progressPercent} />
        <div className="absolute right-5 top-5 z-20">
          <button
            type="button"
            onClick={() => setImmersive(false)}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border px-4 text-sm backdrop-blur transition-colors press-feedback"
            style={{
              borderColor: 'color-mix(in srgb, currentColor 20%, transparent)',
              background: `color-mix(in srgb, ${tone.swatch} 80%, transparent)`,
            }}
          >
            <X className="h-4 w-4" />
            退出沉浸 (Esc)
          </button>
        </div>
        <div
          ref={state.contentScrollRef}
          onScroll={state.handleContentScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div
            className="mx-auto max-w-[720px] px-8 py-14"
            onDoubleClick={() => setImmersive(false)}
          >
            <ReaderArticle state={state} header="full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="-mt-4 flex min-h-0 flex-1 flex-col overflow-hidden md:-mt-6"
      style={{ background: tone.background, color: tone.text }}
    >
      <ReaderProgressBar percent={state.progressPercent} />

      {/* 顶部工具栏 */}
      <header className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2">
        <Link
          to={state.backHref}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] press-feedback"
        >
          <ChevronLeft className="h-4 w-4" />
          {state.backLabel}
        </Link>
        <div className="min-w-0 flex-1 text-center text-[var(--text-primary)]">
          <p className="truncate text-sm font-medium">
            {state.novelTitle}
            <span className="mx-2 text-[var(--text-tertiary)]">·</span>
            <span className="text-[var(--text-secondary)]">{state.chapterTitle}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {headerIconButton(
            directoryOpen ? '收起目录' : '展开目录',
            directoryOpen ? <PanelLeftClose className="h-4.5 w-4.5" /> : <PanelLeftOpen className="h-4.5 w-4.5" />,
            () => setDirectoryOpen((open) => !open),
            directoryOpen,
          )}
          {headerIconButton(
            commentsOpen ? '收起评论' : '展开评论',
            commentsOpen ? <PanelRightClose className="h-4.5 w-4.5" /> : <PanelRightOpen className="h-4.5 w-4.5" />,
            () => setCommentsOpen((open) => !open),
            commentsOpen,
          )}
          <div className="relative">
            {headerIconButton(
              '阅读设置',
              <Settings2 className="h-4.5 w-4.5" />,
              () => setSettingsOpen((open) => !open),
              settingsOpen,
            )}
            <ReaderSettingsPopover
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              fontScale={state.fontScale}
              tone={state.tone}
              onFontScaleChange={state.setFontScale}
              onToneChange={state.setTone}
            />
          </div>
          {headerIconButton('沉浸阅读（双击正文）', <BookOpen className="h-4.5 w-4.5" />, () => setImmersive(true))}
        </div>
      </header>

      {/* 三栏工作区 */}
      <div className="flex min-h-0 flex-1">
        {directoryOpen ? (
          <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-default)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
              <ListOrdered className="h-4 w-4 text-[var(--text-tertiary)]" />
              章节目录
              <span className="ml-auto text-xs font-normal text-[var(--text-tertiary)]">
                共 {state.totalChapters} 章
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <ReaderDirectory state={state} />
            </div>
          </aside>
        ) : null}

        <div
          ref={state.contentScrollRef}
          onScroll={state.handleContentScroll}
          className="min-w-0 flex-1 overflow-y-auto"
        >
          <div
            className="mx-auto max-w-[760px] px-10 py-10"
            onDoubleClick={() => setImmersive(true)}
            title="双击进入沉浸阅读"
          >
            <ReaderArticle state={state} header="full" onOpenComments={() => setCommentsOpen(true)} />
          </div>
        </div>

        {commentsOpen ? (
          <aside className="flex w-[280px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-default)]">
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
              <MessageSquare className="h-4 w-4 text-[var(--text-tertiary)]" />
              章节评论
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <ReaderCommentsPanel state={state} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
