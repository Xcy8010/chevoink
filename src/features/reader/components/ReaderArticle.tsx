import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import Empty from '@/components/Empty'
import { cn } from '@/lib/utils'
import type { ReaderState } from '../useReaderState'

type ReaderArticleProps = {
  state: ReaderState
  /** 头部信息形态：full 完整 / compact 紧凑 / none 隐藏 */
  header?: 'full' | 'compact' | 'none'
  /** 是否显示"本章完"与章节导航 */
  showFooter?: boolean
  /** 打开评论面板的回调（"写评论"入口） */
  onOpenComments?: () => void
  className?: string
}

/**
 * 阅读器正文：章节切换淡入过渡（方案 5.3.6）+ "本章完"操作区（方案 5.3.7）。
 * 字号/行距/背景/文字色全部来自阅读器设置令牌。
 */
export default function ReaderArticle({
  state,
  header = 'full',
  showFooter = true,
  onOpenComments,
  className,
}: ReaderArticleProps) {
  const { reader, paragraphs, fontScaleOption, toneOption, paragraphCommentCounts } = state

  // 段评气泡默认隐藏：有鼠标的设备悬停段落时显示，触屏设备点击段落时显示
  const supportsHover = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    [],
  )
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null)
  const chapterId = reader?.currentChapter.id
  useEffect(() => {
    setRevealedIndex(null)
  }, [chapterId])

  if (!reader) return null

  const textStyle = {
    fontSize: `${fontScaleOption.fontSize}px`,
    lineHeight: fontScaleOption.lineHeight,
    color: toneOption.text,
  }

  const navButtonClass = (enabled: boolean, primary = false) =>
    cn(
      'inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-pill)] border text-sm font-medium transition-colors press-feedback',
      enabled
        ? primary
          ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]'
          : 'border-current/25 hover:bg-black/5'
        : 'border-current/15 opacity-40 pointer-events-none',
    )

  return (
    <article
      key={reader.currentChapter.id}
      className={cn('animate-fade-in-up', className)}
      style={{
        color: toneOption.text,
        // 长按选段走应用内自定义手势（复制也走段操作条）：禁掉系统文本选取与
        // iOS 气泡菜单，避免长按时弹出系统「复制/分享/全选/翻译」蓝色选取框
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {header === 'full' ? (
        <header className="border-b pb-6" style={{ borderColor: 'color-mix(in srgb, currentColor 15%, transparent)' }}>
          <p className="text-sm opacity-60">{state.novelTitle}</p>
          <h1 className="mt-3 text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">
            {state.chapterTitle}
          </h1>
          <p className="mt-3 text-sm opacity-60">{state.metaLine}</p>
        </header>
      ) : null}

      {header === 'compact' ? (
        <header className="border-b pb-4" style={{ borderColor: 'color-mix(in srgb, currentColor 15%, transparent)' }}>
          <p className="text-xs opacity-60">{state.novelTitle}</p>
          <h1 className="mt-2 text-[1.5rem] font-semibold tracking-tight">{state.chapterTitle}</h1>
          <p className="mt-2 text-xs opacity-60">{state.metaLine}</p>
        </header>
      ) : null}

      <div className={cn('space-y-6', header === 'none' ? '' : 'mt-8')}>
        {paragraphs.length === 0 ? (
          <Empty
            title="这一章的正文还没有整理好"
            description={
              state.fromStudio
                ? '你可以先回到创作区继续补正文，再回来预览阅读。'
                : '稍后再回来看看，或者先回到目录选择其他已开放章节。'
            }
          />
        ) : (
          paragraphs.map((paragraph, index) => {
            const isSpeaking = state.tts.activeParagraphIndex === index
            const isFlashing = state.highlightParagraphIndex === index
            const commentCount = paragraphCommentCounts.get(index) ?? 0
            // 有评论的段落常驻显示数量气泡；无评论时悬停设备靠 CSS 显隐，触屏设备点击后才渲染
            const renderBubble =
              !state.fromStudio && (commentCount > 0 || supportsHover || revealedIndex === index)
            return (
              <p
                key={`${reader.currentChapter.id}-${index}`}
                data-tts-p={index}
                onClick={
                  !state.fromStudio && !supportsHover
                    ? () => setRevealedIndex((current) => (current === index ? null : index))
                    : undefined
                }
                className="group indent-[2em] tracking-[0.01em] rounded-[10px] transition-colors [transition-duration:var(--duration-normal)]"
                style={{
                  ...textStyle,
                  // 听书跟读高亮；段评定位时用更重的底色闪一下，都随阅读底色自适应
                  background: isFlashing
                    ? 'color-mix(in srgb, currentColor 16%, transparent)'
                    : isSpeaking
                      ? 'color-mix(in srgb, currentColor 9%, transparent)'
                      : undefined,
                }}
              >
                {paragraph}
                {renderBubble ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      state.openParagraphComments(index)
                    }}
                    aria-label={`第 ${index + 1} 段评论${commentCount > 0 ? `，共 ${commentCount} 条` : ''}`}
                    className={cn(
                      'press-feedback ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded-full px-1 align-middle text-[11px] leading-none transition-opacity',
                      commentCount > 0
                        ? 'opacity-70'
                        : supportsHover
                          ? 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-60 hover:opacity-90'
                          : 'opacity-60',
                    )}
                    style={{ background: 'color-mix(in srgb, currentColor 9%, transparent)' }}
                  >
                    <MessageSquare className="h-3 w-3" />
                    {commentCount > 0 ? <span className="tabular-nums">{commentCount}</span> : null}
                  </button>
                ) : null}
              </p>
            )
          })
        )}
      </div>

      {showFooter && paragraphs.length > 0 ? (
        <footer className="mt-12">
          {/* "本章完"分隔（方案 5.3.7） */}
          <div className="flex items-center gap-4" aria-hidden="true">
            <span className="h-px flex-1" style={{ background: 'color-mix(in srgb, currentColor 18%, transparent)' }} />
            <span className="text-xs tracking-[0.35em] opacity-50">本章完</span>
            <span className="h-px flex-1" style={{ background: 'color-mix(in srgb, currentColor 18%, transparent)' }} />
          </div>

          {onOpenComments ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={onOpenComments}
                className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border px-5 text-sm transition-colors press-feedback"
                style={{ borderColor: 'color-mix(in srgb, currentColor 25%, transparent)' }}
              >
                <MessageSquare className="h-4 w-4" />
                写评论
              </button>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            {state.previousHref ? (
              <Link to={state.previousHref} className={navButtonClass(true)}>
                <ChevronLeft className="h-4 w-4" />
                上一章
              </Link>
            ) : (
              <span className={navButtonClass(false)}>
                <ChevronLeft className="h-4 w-4" />
                上一章
              </span>
            )}
            {state.nextHref ? (
              <Link to={state.nextHref} className={navButtonClass(true, true)}>
                下一章
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className={navButtonClass(false)}>
                下一章
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
        </footer>
      ) : null}
    </article>
  )
}
