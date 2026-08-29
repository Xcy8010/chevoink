import {
  BookOpen,
  ChevronLeft,
  Headphones,
  ListOrdered,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'
import ReaderArticle from '../components/ReaderArticle'
import ReaderCommentsPanel from '../components/ReaderCommentsPanel'
import ReaderDirectory from '../components/ReaderDirectory'
import ReaderProgressBar from '../components/ReaderProgressBar'
import ReaderSettingsPopover from '../components/ReaderSettingsPopover'
import TtsControlSheet from '../tts/TtsControlSheet'
import TtsMiniBar from '../tts/TtsMiniBar'
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
  const [ttsPanelOpen, setTtsPanelOpen] = useState(false)
  // 进出沉浸前记录视口第一个可见段落，布局重建后恢复到同一阅读位置
  const immersiveAnchorRef = useRef<number | null>(null)

  const toggleImmersive = useCallback(
    (next: boolean) => {
      immersiveAnchorRef.current = null
      const container = state.contentScrollRef.current
      if (container) {
        const containerTop = container.getBoundingClientRect().top
        const nodes = container.querySelectorAll<HTMLElement>('[data-tts-p]')
        for (const node of nodes) {
          if (node.getBoundingClientRect().bottom > containerTop + 8) {
            immersiveAnchorRef.current = Number(node.dataset.ttsP)
            break
          }
        }
      }
      setImmersive(next)
    },
    [state.contentScrollRef],
  )

  // 布局重建完成后滚回锚点段落（绘制前执行，避免闪动）
  useLayoutEffect(() => {
    const anchor = immersiveAnchorRef.current
    if (anchor === null) return
    immersiveAnchorRef.current = null
    const node = state.contentScrollRef.current?.querySelector<HTMLElement>(
      `[data-tts-p="${anchor}"]`,
    )
    node?.scrollIntoView({ block: 'start' })
  }, [immersive, state.contentScrollRef])

  const tone = state.toneOption
  const { previousHref, nextHref, activePanel, activeParagraphIndex } = state

  // 段评气泡打开评论时同步展开右侧评论栏
  useEffect(() => {
    if (activePanel === 'comments') setCommentsOpen(true)
  }, [activePanel, activeParagraphIndex])

  // 键盘快捷键：←/→ 翻章，Esc 退出沉浸（输入框聚焦时不触发翻章）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        toggleImmersive(false)
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
  }, [previousHref, nextHref, navigate, toggleImmersive])

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

  /* 听书控制面板浮层（桌面端用卡片浮层而非底部抽屉） */
  const ttsFloatingPanel = ttsPanelOpen ? (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setTtsPanelOpen(false)} />
      <div className="fixed bottom-24 left-1/2 z-50 w-[380px] -translate-x-1/2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-primary)] shadow-[var(--shadow-lg)]">
        <TtsControlSheet tts={state.tts} />
      </div>
    </>
  ) : null

  /* 听书迷你条：居中悬浮胶囊 */
  const ttsMiniBar = (
    <TtsMiniBar
      tts={state.tts}
      tone={tone}
      onExpand={() => setTtsPanelOpen(true)}
      className="absolute bottom-5 left-1/2 z-30 w-[min(480px,92%)] -translate-x-1/2 rounded-[var(--radius-pill)] border shadow-[var(--shadow-lg)]"
    />
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
            onClick={() => toggleImmersive(false)}
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
            onDoubleClick={() => toggleImmersive(false)}
          >
            <ReaderArticle state={state} header="full" />
          </div>
        </div>

        {ttsMiniBar}
        {ttsFloatingPanel}
      </div>
    )
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: tone.background, color: tone.text }}
    >
      <ReaderProgressBar percent={state.progressPercent} />

      {/* 顶部工具栏 */}
      <header className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2">
        <button
          type="button"
          onClick={state.exitReader}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] press-feedback"
        >
          <ChevronLeft className="h-4 w-4" />
          {state.backLabel}
        </button>
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
            () => {
              // 收起评论栏时重置段评筛选，避免下次展开仍停留在旧段落视图
              if (commentsOpen) state.setActivePanel(null)
              setCommentsOpen((open) => !open)
            },
            commentsOpen,
          )}
          {state.tts.available
            ? headerIconButton(
                '听书',
                <Headphones className="h-4.5 w-4.5" />,
                () => {
                  if (state.tts.isActive) {
                    setTtsPanelOpen((open) => !open)
                  } else {
                    state.tts.start()
                  }
                },
                state.tts.isActive,
              )
            : null}
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
          {headerIconButton('沉浸阅读（双击正文）', <BookOpen className="h-4.5 w-4.5" />, () => toggleImmersive(true))}
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
            onDoubleClick={() => toggleImmersive(true)}
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

      {ttsMiniBar}
      {ttsFloatingPanel}
    </div>
  )
}
