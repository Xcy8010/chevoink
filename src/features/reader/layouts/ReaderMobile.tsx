import { ChevronLeft, ChevronRight, ListOrdered, LogOut, MessageSquare, Settings2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import BottomSheet from '@/components/layout/BottomSheet'
import { cn } from '@/lib/utils'
import ReaderArticle from '../components/ReaderArticle'
import ReaderCommentsPanel from '../components/ReaderCommentsPanel'
import ReaderDirectory from '../components/ReaderDirectory'
import ReaderProgressBar from '../components/ReaderProgressBar'
import ReaderSettingsContent from '../components/ReaderSettingsContent'
import { useChapterGestures } from '../useChapterGestures'
import type { ReaderState } from '../useReaderState'

type ReaderMobileProps = {
  state: ReaderState
}

/**
 * 手机端阅读器（方案 2.5.2）：全屏沉浸、手势驱动。
 * - 默认隐藏控制栏，轻点正文呼出/隐藏（进入时先展示一次，方便找到退出入口）
 * - 左右滑动切换章节
 * - 底部操作栏：退出 | 上一章 | 目录 | 评论 | 设置 | 下一章
 * - 目录/评论/设置均为底部抽屉
 */
export default function ReaderMobile({ state }: ReaderMobileProps) {
  const [controlsVisible, setControlsVisible] = useState(true)
  const navigate = useNavigate()
  const tone = state.toneOption

  const gestures = useChapterGestures({
    onSwipeLeft: () => {
      if (state.nextHref) navigate(state.nextHref)
    },
    onSwipeRight: () => {
      if (state.previousHref) navigate(state.previousHref)
    },
    onTap: () => setControlsVisible((visible) => !visible),
  })

  const closePanel = () => state.setActivePanel(null)
  const chromeBackground = `color-mix(in srgb, ${tone.swatch} 94%, transparent)`

  // 状态栏/挖孔安全区绘制的是 html 画布颜色，fixed 层盖不到那里：
  // 阅读期间把画布与 theme-color 一起染成当前阅读底色，退出时恢复，与其他页面同色融合的原理一致
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousMeta = meta?.getAttribute('content') ?? null
    meta?.setAttribute('content', tone.swatch)

    const rootStyle = document.documentElement.style
    const bodyStyle = document.body.style
    const previousRootBg = rootStyle.background
    const previousBodyBg = bodyStyle.background
    rootStyle.background = tone.background
    bodyStyle.background = tone.background

    return () => {
      if (previousMeta) meta?.setAttribute('content', previousMeta)
      rootStyle.background = previousRootBg
      bodyStyle.background = previousBodyBg
    }
  }, [tone])

  const bottomItem = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-14 flex-col items-center justify-center gap-1 text-[11px] press-feedback',
        disabled ? 'opacity-35' : '',
      )}
      style={{ color: tone.text }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ background: tone.background, color: tone.text }}
    >
      {/* 顶部进度条恒显 */}
      <ReaderProgressBar percent={state.progressPercent} className="absolute inset-x-0 top-0 z-30" />

      {/* 正文滚动区 */}
      <div
        ref={state.contentScrollRef}
        onScroll={state.handleContentScroll}
        {...gestures}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {/* 顶部留出控制栏高度（安全区 + 栏体 56px + 呼吸感），避免章节头部被半透明控制栏遮住 */}
        <div className="mx-auto max-w-[680px] px-5 pb-32 pt-[calc(env(safe-area-inset-top)+76px)]">
          <ReaderArticle
            state={state}
            header="compact"
            onOpenComments={() => state.setActivePanel('comments')}
          />
        </div>
      </div>

      {/* 顶部控制栏（轻点呼出） */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 border-b backdrop-blur-md transition-all [transition-duration:var(--duration-normal)]',
          controlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
        )}
        style={{
          background: chromeBackground,
          borderColor: 'color-mix(in srgb, currentColor 12%, transparent)',
        }}
      >
        <div
          className="flex items-center gap-2 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]"
          style={{ color: tone.text }}
        >
          <Link
            to={state.backHref}
            aria-label={state.backLabel}
            className="touch-target inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] press-feedback"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{state.novelTitle}</p>
            <p className="truncate text-xs opacity-60">{state.chapterTitle}</p>
          </div>
          <button
            type="button"
            aria-label="阅读设置"
            onClick={() => state.setActivePanel('settings')}
            className="touch-target inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] press-feedback"
          >
            <Settings2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 底部操作栏（轻点呼出） */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 border-t backdrop-blur-md transition-all [transition-duration:var(--duration-normal)]',
          controlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
        )}
        style={{
          background: chromeBackground,
          borderColor: 'color-mix(in srgb, currentColor 12%, transparent)',
        }}
      >
        <div className="grid grid-cols-6 px-2 pb-[env(safe-area-inset-bottom)]">
          {bottomItem('退出', <LogOut className="h-5 w-5 rotate-180" />, () => navigate(state.backHref))}
          {bottomItem(
            '上一章',
            <ChevronLeft className="h-5 w-5" />,
            () => state.previousHref && navigate(state.previousHref),
            !state.previousHref,
          )}
          {bottomItem('目录', <ListOrdered className="h-5 w-5" />, () => state.setActivePanel('directory'))}
          {bottomItem('评论', <MessageSquare className="h-5 w-5" />, () => state.setActivePanel('comments'))}
          {bottomItem('设置', <Settings2 className="h-5 w-5" />, () => state.setActivePanel('settings'))}
          {bottomItem(
            '下一章',
            <ChevronRight className="h-5 w-5" />,
            () => state.nextHref && navigate(state.nextHref),
            !state.nextHref,
          )}
        </div>
      </div>

      {/* 底部抽屉：目录 / 评论 / 设置 */}
      <BottomSheet open={state.activePanel === 'directory'} onClose={closePanel} title="目录">
        <ReaderDirectory state={state} onNavigate={closePanel} />
      </BottomSheet>
      <BottomSheet open={state.activePanel === 'comments'} onClose={closePanel} title="章节评论">
        <ReaderCommentsPanel state={state} />
      </BottomSheet>
      <BottomSheet open={state.activePanel === 'settings'} onClose={closePanel} title="阅读设置">
        <ReaderSettingsContent
          fontScale={state.fontScale}
          tone={state.tone}
          onFontScaleChange={state.setFontScale}
          onToneChange={state.setTone}
        />
      </BottomSheet>
    </div>
  )
}
