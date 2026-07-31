import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  ListOrdered,
  LogOut,
  MessageSquare,
  Settings2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import BottomSheet from '@/components/layout/BottomSheet'
import AuthPromptDialog from '@/components/ui/AuthPromptDialog'
import { useToast } from '@/components/ui/Toast'
import { addToShelf } from '@/features/home/local-shelf'
import { pushShelfAdd } from '@/features/home/reading-sync'
import {
  enterNativeImmersive,
  exitNativeImmersive,
  isDarkColor,
  isNativeApp,
  syncNativeSystemBars,
} from '@/lib/native-app'
import { setNativeImmersiveSafeArea } from '@/lib/safe-area'
import { cn } from '@/lib/utils'
import AddShelfDialog, { markShelfPrompted, shouldPromptShelf } from '../components/AddShelfDialog'
import ParagraphActionBar, { type ParagraphActionAnchor } from '../components/ParagraphActionBar'
import ReaderArticle from '../components/ReaderArticle'
import ReaderCommentsPanel from '../components/ReaderCommentsPanel'
import ReaderCoverPage from '../components/ReaderCoverPage'
import ReaderDirectory from '../components/ReaderDirectory'
import ReaderProgressBar from '../components/ReaderProgressBar'
import ReaderSettingsContent from '../components/ReaderSettingsContent'
import ReaderPageChrome, { useReaderChromeStatus } from '../pager/ReaderPageChrome'
import ReaderPagedView, { PAGE_PARAGRAPH_GAP } from '../pager/ReaderPagedView'
import { findPageForParagraphChar, useChapterPaginator } from '../pager/useChapterPaginator'
import { COVER_PAGE_INDEX, useReaderPager } from '../pager/useReaderPager'
import TtsControlSheet from '../tts/TtsControlSheet'
import TtsMiniBar from '../tts/TtsMiniBar'
import TtsPagedPill from '../tts/TtsPagedPill'
import { useParagraphUnderlines } from '../useParagraphUnderlines'
import type { ReaderState } from '../useReaderState'

type ReaderMobileProps = {
  state: ReaderState
}

/** 手动翻页后暂停听书自动跟随的时长（与滚动模式让位用户手动滚动的时长一致） */
const TTS_FOLLOW_HOLD_MS = 5000
/** 听书跟读的轮询间隔：段内朗读位置不进 state，只能定时查 */
const TTS_FOLLOW_POLL_MS = 400

/**
 * 手机端阅读器（方案 20）：全屏沉浸的横向分页阅读。
 * - 代入页（第 -1 页）→ 本章分页正文，左滑下一页 / 右滑上一页，章边界自动换章
 * - 信息层常驻：左下全书页码、右下时间+电量、右上「…」菜单
 * - 长按选段：从本段听 / 发段评 / 复制 / 划线
 * - 退出未在书架时挽留一次；「上下滑动」模式保留原滚动阅读
 */
export default function ReaderMobile({ state }: ReaderMobileProps) {
  const [controlsVisible, setControlsVisible] = useState(false)
  const [ttsSheetOpen, setTtsSheetOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [shelfDialogOpen, setShelfDialogOpen] = useState(false)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [selection, setSelection] = useState<ParagraphActionAnchor | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const navigate = useNavigate()
  const toast = useToast()
  const tone = state.toneOption
  // 时间/电量只订阅一次，再分发给每页的信息层
  const chromeStatus = useReaderChromeStatus()

  const paged = state.pageTurnMode !== 'scroll'
  const underlines = useParagraphUnderlines(state.novelId ?? '', state.chapterId ?? '')

  // ── 分页 ────────────────────────────────────────────────────────────
  const chapterKey = `${state.chapterId ?? ''}|${state.reader?.currentChapter.wordCount ?? 0}`
  const pagination = useChapterPaginator({
    enabled: paged,
    paragraphs: state.paragraphs,
    chapterKey,
    title: state.chapterTitle,
    layout: {
      width: viewport.width,
      height: viewport.height,
      fontSize: state.fontScaleOption.fontSize,
      lineHeight: state.fontScaleOption.lineHeight,
      paragraphGap: PAGE_PARAGRAPH_GAP,
    },
  })
  const pages = pagination.pages

  // 代入页：仅公开阅读的第一章带（创作区预览不出）
  const coverEligible = !state.fromStudio && state.currentIndex === 0

  /** 换章落点：从上一章左滑进来落第 1 页，从下一章右滑回来落末页 */
  const pendingLandingRef = useRef<'first' | 'last' | null>(null)

  const pager = useReaderPager({
    totalPages: pages.length,
    hasCover: coverEligible,
    onOverflowNext: () => {
      if (state.nextHref) {
        pendingLandingRef.current = 'first'
        navigate(state.nextHref)
        return
      }
      toast.info('已经是最新章节了')
    },
    onOverflowPrev: () => {
      if (state.previousHref) {
        pendingLandingRef.current = 'last'
        navigate(state.previousHref)
      }
    },
  })

  // 换章后先把页码归零，避免沿用上一章的页号
  const chapterRef = useRef(state.chapterId)
  if (chapterRef.current !== state.chapterId) {
    chapterRef.current = state.chapterId
    setSelection(null)
  }

  // 首次分页完成后定位：换章落点 > 上次读到的位置 > 代入页
  const landedChapterRef = useRef<string | null>(null)
  useEffect(() => {
    if (!paged || pages.length === 0) return
    if (landedChapterRef.current === state.chapterId) return
    landedChapterRef.current = state.chapterId ?? null

    const pending = pendingLandingRef.current
    pendingLandingRef.current = null
    if (pending === 'last') {
      pager.jumpTo(pages.length - 1)
      return
    }
    if (pending === 'first') {
      pager.jumpTo(0)
      return
    }

    const savedPercent = state.getSavedScrollPercent()
    if (savedPercent > 0.01) {
      pager.jumpTo(Math.round(savedPercent * (pages.length - 1)))
      return
    }

    pager.jumpTo(coverEligible ? COVER_PAGE_INDEX : 0)
  }, [paged, pages.length, state.chapterId, coverEligible, pager, state])

  // 全屏沉浸（方案 20）：进入阅读区让 WebView 铺满整屏并隐藏系统栏，
  // 顶/底安全区由 setNativeImmersiveSafeArea 注入的 --safe-top/--safe-bottom 避让。
  // 旧 APK 没有 ImmersiveMode 插件，enter 返回 null → 保持既有染色形态，零布局改动。
  // 退出时还原系统栏并把配色交回主题；串行队列保证交错调用不乱序。
  const immersiveMountedRef = useRef(true)
  useEffect(() => {
    if (!isNativeApp()) return
    immersiveMountedRef.current = true
    void enterNativeImmersive().then((insets) => {
      if (insets && immersiveMountedRef.current) setNativeImmersiveSafeArea(true, insets)
    })
    return () => {
      immersiveMountedRef.current = false
      setNativeImmersiveSafeArea(false)
      void exitNativeImmersive()
    }
  }, [])
  // 章节评论面板期间临时退出沉浸：评论输入依赖 adjustResize 的键盘避让，
  // 沉浸态下窗口不 resize，键盘会盖住输入框（方案 20 第 6 节唯一风险点）。
  // cleanup 里的 re-enter 需过卸载守卫：面板开着直接退出阅读区时不能再回沉浸态
  // （unmount 时 React 按声明顺序执行 cleanup，上面的沉浸 effect 已先置 false）。
  const commentsOpen = state.activePanel === 'comments'
  useEffect(() => {
    if (!isNativeApp() || !commentsOpen) return
    setNativeImmersiveSafeArea(false)
    void exitNativeImmersive()
    return () => {
      if (!immersiveMountedRef.current) return
      void enterNativeImmersive().then((insets) => {
        if (insets && immersiveMountedRef.current) setNativeImmersiveSafeArea(true, insets)
      })
    }
  }, [commentsOpen])
  // 状态栏染色跟随阅读底色：沉浸态下状态栏不可见，此调用无副作用；
  // 但评论面板临时退出沉浸期间状态栏重新可见，需要它保持与阅读底色一致
  useEffect(() => {
    syncNativeSystemBars(tone.swatch, isDarkColor(tone.swatch))
  }, [tone.swatch])

  // 翻页写回章内进度（语义：当前页/本章总页），退出时由防抖 flush
  useEffect(() => {
    if (!paged || pages.length === 0 || pager.pageIndex < 0) return
    const percent = pages.length > 1 ? pager.pageIndex / (pages.length - 1) : 1
    state.commitScrollPercent(percent)
    // 仅页码变化时写回，state 每次渲染都是新对象故不入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, pager.pageIndex, pages.length])

  // 分页模式下由翻页接管"从评论定位段落"
  useEffect(() => {
    if (!paged) {
      state.registerParagraphLocator(null)
      return
    }

    state.registerParagraphLocator((index) => {
      const target = pagination.paragraphPageMap.get(index)
      if (target === undefined) return false
      pager.jumpTo(target)
      return true
    })

    return () => state.registerParagraphLocator(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, pagination.paragraphPageMap, pager.jumpTo])

  // 听书跟读：朗读位置不在当前页时自动翻页（替代滚动模式的自动滚动）。
  // 一段被切到相邻两页时只看段号会卡在上一页（必须整段读完才翻），故按段内字符位置定位；
  // 段内位置在 TTS 里是 ref（不逐帧重渲染），因此播放期间轮询检查。
  const speakingParagraphIndex = state.tts.activeParagraphIndex
  const ttsPlaying = state.tts.status === 'playing'
  /** 上次由跟读自己翻到的页码；null = 基准未知（换章/重排后），下次以当前页为准 */
  const followPageRef = useRef<number | null>(pager.pageIndex)
  const followHoldUntilRef = useRef(0)
  const followSpeakingRef = useRef<() => void>(() => {})
  followSpeakingRef.current = () => {
    if (!paged || speakingParagraphIndex === null || pages.length === 0) return
    // 页码不是自己翻的（用户手动滑动/跳转）：让位 5s，别把人拽回朗读页
    if (followPageRef.current !== null && pager.pageIndex !== followPageRef.current) {
      followPageRef.current = pager.pageIndex
      followHoldUntilRef.current = Date.now() + TTS_FOLLOW_HOLD_MS
      return
    }
    if (Date.now() < followHoldUntilRef.current) return

    const target =
      findPageForParagraphChar(pages, speakingParagraphIndex, state.tts.getActiveCharOffset()) ??
      pagination.paragraphPageMap.get(speakingParagraphIndex)
    if (target === undefined || target === pager.pageIndex) return
    followPageRef.current = target
    pager.jumpTo(target)
  }

  // 换章/重排后页码基准作废（须排在跟读 effect 之前生效）
  useEffect(() => {
    followPageRef.current = null
    followHoldUntilRef.current = 0
  }, [pages])

  // 段落切换立刻跟一次，段内跨页由轮询兜住
  useEffect(() => {
    followSpeakingRef.current()
  }, [speakingParagraphIndex, pages])

  useEffect(() => {
    if (!paged || !ttsPlaying) return
    const timer = window.setInterval(() => followSpeakingRef.current(), TTS_FOLLOW_POLL_MS)
    return () => window.clearInterval(timer)
  }, [paged, ttsPlaying])

  /**
   * 全书页码：当前章精确分页 + 其余章按字数估算（番茄 3/11242 语义）。
   * 信息层每页一份，故这里只算「本章之前的页数 + 全书总页数」，具体页号由各页自己加。
   */
  const bookPaging = useMemo(() => {
    if (!paged || pages.length === 0) return { before: 0, total: 0 }
    const avgChars = pagination.avgCharsPerPage > 0 ? pagination.avgCharsPerPage : 0
    let before = 0
    let total = 0
    state.chapterList.forEach((chapter, index) => {
      const estimated =
        index === state.currentIndex
          ? pages.length
          : Math.max(1, Math.ceil((chapter.wordCount ?? 0) / Math.max(1, avgChars)))
      if (index < state.currentIndex) before += estimated
      total += estimated
    })
    return { before, total }
  }, [paged, pages.length, pagination.avgCharsPerPage, state.chapterList, state.currentIndex])

  // ── 交互 ────────────────────────────────────────────────────────────
  const closePanel = () => state.setActivePanel(null)
  const chromeBackground = `color-mix(in srgb, ${tone.swatch} 94%, transparent)`

  const openTts = () => {
    // 正在播/暂停/加载中：直接开面板，续播位置就是原位
    const ttsStatus = state.tts.status
    if (ttsStatus === 'playing' || ttsStatus === 'paused' || ttsStatus === 'loading') {
      setTtsSheetOpen(true)
      return
    }
    // 其余状态（未开始/播完/出错）一律按当前看到的位置重新起播，不复用上次朗读位置
    if (paged) {
      // 分页模式下正文没有滚动容器：代入页与首页都从开头第一段读起
      const currentPage = pages[Math.max(0, pager.pageIndex)]
      state.tts.startFromParagraph(currentPage?.blocks[0]?.paragraphIndex ?? 0)
      return
    }
    state.tts.start()
  }

  /** 退出：未在书架先挽留一次 */
  const handleExit = () => {
    if (!state.fromStudio && state.novelId && shouldPromptShelf(state.novelId)) {
      setShelfDialogOpen(true)
      return
    }
    navigate(state.backHref)
  }

  const handleShelfConfirm = () => {
    if (!state.novelId) return
    markShelfPrompted(state.novelId)
    addToShelf({
      novelId: state.novelId,
      title: state.novelTitle,
      coverUrl: state.reader?.novel.coverUrl ?? null,
    })
    pushShelfAdd(state.novelId, state.novelTitle, state.reader?.novel.coverUrl ?? null)
    toast.success('已加入书架')
    setShelfDialogOpen(false)
    window.setTimeout(() => navigate(state.backHref), 300)
  }

  const handleShelfDismiss = () => {
    if (state.novelId) markShelfPrompted(state.novelId)
    setShelfDialogOpen(false)
    navigate(state.backHref)
  }

  const handleLongPressParagraph = useCallback((paragraphIndex: number, rect: DOMRect) => {
    setSelection({
      paragraphIndex,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    })
  }, [])

  const handleCopyParagraph = async (paragraphIndex: number) => {
    const text = state.paragraphs[paragraphIndex] ?? ''
    setSelection(null)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制本段')
    } catch {
      toast.error('复制失败，请长按文字手动复制')
    }
  }

  const handleToggleUnderline = (paragraphIndex: number) => {
    const next = underlines.toggleUnderline(paragraphIndex)
    setSelection(null)
    if (next === null) {
      setAuthPromptOpen(true)
      return
    }
    toast.success(next ? '已划线' : '已取消划线')
  }

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

  const moreMenuItem = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      onClick={() => {
        setMoreMenuOpen(false)
        onClick()
      }}
      className={cn(
        'press-feedback flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] py-4 text-xs text-[var(--text-secondary)]',
        disabled ? 'opacity-35' : '',
      )}
    >
      {icon}
      {label}
    </button>
  )

  // 直接挂到 body 渲染：阅读区是覆盖全屏的 fixed 层，留在 AppShell 的滚动容器里时
  // 会被某个祖先当成定位包含块（实测 fixed inset-0 的顶部落在 16px，上方露出 body 的
  // --app-bg 主题色，形成一条不跟随阅读底色的色带）。挂到 body 后 fixed 必然贴视口顶部。
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ background: tone.background, color: tone.text }}
    >
      {paged ? (
        <ReaderPagedView
          pages={pages}
          paragraphs={state.paragraphs}
          chapterTitle={state.chapterTitle}
          pager={pager}
          mode={state.pageTurnMode === 'cover' ? 'cover' : 'simulate'}
          tone={tone}
          fontScaleOption={state.fontScaleOption}
          underlined={underlines.underlined}
          speakingParagraphIndex={speakingParagraphIndex}
          selectedParagraphIndex={selection?.paragraphIndex ?? state.highlightParagraphIndex}
          renderCover={
            coverEligible
              ? () => (
                  <ReaderCoverPage
                    novelId={state.novelId ?? ''}
                    fallbackTitle={state.novelTitle}
                    fallbackCoverUrl={state.reader?.novel.coverUrl ?? null}
                    tone={tone}
                    onExit={handleExit}
                    onOpenTts={openTts}
                    onOpenSettings={() => state.setActivePanel('settings')}
                    ttsAvailable={state.tts.available}
                  />
                )
              : undefined
          }
          renderChrome={(pageIndex) => {
            // 信息层画进每一页（代入页自带功能入口，由 ReaderPagedView 跳过），
            // 这样右滑露出上一页时它跟着页面一起进来，不会先被盖掉再重新出现。
            const pageNumber = bookPaging.before + pageIndex + 1
            return (
              <ReaderPageChrome
                tone={tone}
                novelTitle={state.novelTitle}
                currentPage={pageNumber}
                totalPages={Math.max(bookPaging.total, pageNumber)}
                showPageNumber={bookPaging.total > 0}
                clock={chromeStatus.clock}
                batteryPercent={chromeStatus.batteryPercent}
                bottomCenter={
                  // 听书胶囊排在页码与时间之间：flex 分配宽度，胶囊撑满空隙又绝不越界
                  state.tts.isActive ? (
                    <TtsPagedPill tts={state.tts} tone={tone} onExpand={() => setTtsSheetOpen(true)} />
                  ) : undefined
                }
                onBack={handleExit}
                onMoreClick={() => setMoreMenuOpen(true)}
              />
            )
          }}
          onExitByGesture={handleExit}
          onViewportChange={setViewport}
          onTapCenter={() => setMoreMenuOpen(true)}
          onLongPressParagraph={handleLongPressParagraph}
          onDismissSelection={() => setSelection(null)}
          fallback={
            <p className="text-sm opacity-55">
              {state.readerQuery.isLoading ? '正在载入章节…' : '本章暂无内容。'}
            </p>
          }
        />
      ) : (
        <>
          {/* 上下滑动模式：保留原整章滚动阅读与顶部进度条 */}
          <ReaderProgressBar percent={state.progressPercent} className="absolute inset-x-0 top-0 z-30" />
          <div
            ref={state.contentScrollRef}
            onScroll={state.handleContentScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            onClick={() => setControlsVisible((visible) => !visible)}
          >
            <div className="mx-auto max-w-[680px] px-5 pb-32 pt-[calc(var(--safe-top)+76px)]">
              <ReaderArticle
                state={state}
                header="compact"
                onOpenComments={() => state.setActivePanel('comments')}
              />
            </div>
          </div>
        </>
      )}

      {/* 顶部/底部控制栏只服务上下滑动模式；分页模式的入口由 ReaderPageChrome + 「更多」菜单承载 */}
      {paged ? null : (
        <>
          {/* 顶部控制栏（轻点呼出） */}
          <div
            className={cn(
              'absolute inset-x-0 top-0 z-[50] border-b backdrop-blur-md transition-all [transition-duration:var(--duration-normal)]',
              controlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
            )}
            style={{
              background: chromeBackground,
              borderColor: 'color-mix(in srgb, currentColor 12%, transparent)',
            }}
          >
            <div
              className="flex items-center gap-2 px-2 pb-2 pt-[calc(var(--safe-top)+8px)]"
              style={{ color: tone.text }}
            >
              <button
                type="button"
                aria-label={state.backLabel}
                onClick={handleExit}
                className="touch-target inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] press-feedback"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{state.novelTitle}</p>
                <p className="truncate text-xs opacity-60">{state.chapterTitle}</p>
              </div>
              {state.tts.available ? (
                <button
                  type="button"
                  aria-label="听书"
                  onClick={openTts}
                  className="touch-target inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] press-feedback"
                >
                  <Headphones className="h-5 w-5" />
                </button>
              ) : null}
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

          {/* 底部操作栏（轻点呼出，手势能力的按钮兜底） */}
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 z-[50] border-t backdrop-blur-md transition-all [transition-duration:var(--duration-normal)]',
              controlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
            )}
            style={{
              background: chromeBackground,
              borderColor: 'color-mix(in srgb, currentColor 12%, transparent)',
            }}
          >
            <div className="grid grid-cols-6 px-2 pb-[var(--safe-bottom)]">
              {bottomItem('退出', <LogOut className="h-5 w-5 rotate-180" />, handleExit)}
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
        </>
      )}

      {/*
        听书播放器：分页模式的胶囊由每页的信息层自己带（见 renderChrome），
        上下滑动模式正文留了 pb-32，仍用全宽迷你条。
      */}
      {paged ? null : (
        <TtsMiniBar
          tts={state.tts}
          tone={tone}
          onExpand={() => setTtsSheetOpen(true)}
          className={cn(
            'absolute inset-x-0 z-[50] transition-all [transition-duration:var(--duration-normal)]',
            controlsVisible ? 'bottom-[calc(var(--safe-bottom)+56px)]' : 'bottom-0 pb-[var(--safe-bottom)]',
          )}
        />
      )}

      {/* 长按选段操作条 */}
      <ParagraphActionBar
        anchor={selection}
        underlined={selection ? underlines.underlined.has(selection.paragraphIndex) : false}
        ttsAvailable={state.tts.available}
        onPlayFromHere={(index) => {
          setSelection(null)
          state.tts.startFromParagraph(index)
        }}
        onComment={(index) => {
          setSelection(null)
          state.openParagraphComments(index)
        }}
        onCopy={(index) => void handleCopyParagraph(index)}
        onToggleUnderline={handleToggleUnderline}
        onClose={() => setSelection(null)}
      />

      {/* 「…」更多菜单：听书 / 换章 / 目录 / 评论 / 阅读设置（分页模式的功能总入口） */}
      <BottomSheet open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)} title="更多">
        <div className="grid grid-cols-3 gap-3 p-4">
          {state.tts.available
            ? moreMenuItem('听书', <Headphones className="h-5 w-5" />, openTts)
            : null}
          {moreMenuItem(
            '上一章',
            <ChevronLeft className="h-5 w-5" />,
            () => state.previousHref && navigate(state.previousHref),
            !state.previousHref,
          )}
          {moreMenuItem(
            '下一章',
            <ChevronRight className="h-5 w-5" />,
            () => state.nextHref && navigate(state.nextHref),
            !state.nextHref,
          )}
          {moreMenuItem('目录', <ListOrdered className="h-5 w-5" />, () => state.setActivePanel('directory'))}
          {moreMenuItem('评论', <MessageSquare className="h-5 w-5" />, () => state.setActivePanel('comments'))}
          {moreMenuItem('阅读设置', <Settings2 className="h-5 w-5" />, () => state.setActivePanel('settings'))}
        </div>
      </BottomSheet>

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
          pageTurnMode={state.pageTurnMode}
          onPageTurnModeChange={state.setPageTurnMode}
        />
      </BottomSheet>
      <BottomSheet open={ttsSheetOpen} onClose={() => setTtsSheetOpen(false)} title="听书">
        {/* 分页模式的吸底胶囊只留暂停/退出，上下段等操作由面板顶部的播放器承担 */}
        <TtsControlSheet
          tts={state.tts}
          showPlayer={paged}
          onStopped={() => setTtsSheetOpen(false)}
        />
      </BottomSheet>

      {/* 退出挽留 / 未登录划线引导 */}
      <AddShelfDialog
        open={shelfDialogOpen}
        title={state.novelTitle}
        coverUrl={state.reader?.novel.coverUrl ?? null}
        chapterTitle={state.chapterTitle}
        onConfirm={handleShelfConfirm}
        onDismiss={handleShelfDismiss}
      />
      <AuthPromptDialog
        open={authPromptOpen}
        title="登录后可划线"
        description="登录或注册后，划线会保存到你的账号，换设备继续读也在。"
        onClose={() => setAuthPromptOpen(false)}
      />
    </div>,
    document.body,
  )
}
