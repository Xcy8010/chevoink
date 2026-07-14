import { useQuery } from '@tanstack/react-query'
import { BookText, ChevronLeft, ChevronRight, ListOrdered, LoaderCircle, MessageSquare, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import Button from '@/components/ui/Button'
import Empty from '@/components/Empty'
import {
  asArray,
  getAuthorName,
  getCommentBody,
  getDisplayTitle,
  getReaderPayload,
  isPublicReadableChapter,
  listCommentsByTarget,
  splitReaderParagraphs,
} from '@/features/discover/api'

const numberFormatter = new Intl.NumberFormat('zh-CN')

const fontScaleOptions = [
  { id: 'compact', label: '紧凑', className: 'text-[16px] leading-[2.05] sm:text-[17px]' },
  { id: 'comfortable', label: '舒适', className: 'text-[17px] leading-[2.15] sm:text-[18px]' },
  { id: 'relaxed', label: '宽松', className: 'text-[18px] leading-[2.3] sm:text-[19px]' },
] as const

const paperToneOptions = [
  {
    id: 'paper',
    label: '纸感',
    articleClassName: 'border-slate-200/80 bg-[#f8f4eb] dark:border-slate-800 dark:bg-[#151515]',
    textClassName: 'text-slate-800 dark:text-slate-100',
  },
  {
    id: 'mist',
    label: '浅灰',
    articleClassName: 'border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-[#10161f]',
    textClassName: 'text-slate-800 dark:text-slate-100',
  },
  {
    id: 'night',
    label: '夜读',
    articleClassName: 'border-slate-800 bg-[#111318] dark:border-slate-700 dark:bg-[#0d1015]',
    textClassName: 'text-slate-100 dark:text-slate-100',
  },
] as const

type FontScaleId = (typeof fontScaleOptions)[number]['id']
type PaperToneId = (typeof paperToneOptions)[number]['id']
type ReaderPanel = 'directory' | 'comments' | 'settings' | null

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '暂未更新'

export default function ReaderPage() {
  const { novelId, chapterId } = useParams()
  const [activePanel, setActivePanel] = useState<ReaderPanel>(null)
  const [fontScale, setFontScale] = useState<FontScaleId>('comfortable')
  const [paperTone, setPaperTone] = useState<PaperToneId>('paper')

  const readerQuery = useQuery({
    queryKey: ['reader', novelId, chapterId],
    queryFn: () => getReaderPayload(novelId ?? '', chapterId ?? ''),
    enabled: Boolean(novelId && chapterId),
  })

  const commentsQuery = useQuery({
    queryKey: ['chapter-comments', chapterId],
    queryFn: () => listCommentsByTarget('chapter', chapterId ?? '', { page: 1, pageSize: 20 }),
    enabled: Boolean(chapterId && readerQuery.isSuccess),
  })

  const currentFontScale = fontScaleOptions.find((item) => item.id === fontScale) ?? fontScaleOptions[1]
  const currentPaperTone = paperToneOptions.find((item) => item.id === paperTone) ?? paperToneOptions[0]

  if (!novelId || !chapterId) {
    return (
      <AppState
        tone="error"
        title="这一章暂时没有找到"
        description="换一章继续看看，或者回到详情页重新选择目录。"
        primaryAction={{
          label: '回到发现页',
          href: '/discover',
        }}
      />
    )
  }

  if (readerQuery.isLoading) {
    return (
      <AppState
        tone="loading"
        title="正在打开正文"
        description="章节内容、目录和评论入口正在陆续出现。"
      />
    )
  }

  if (readerQuery.isError) {
    return (
      <AppState
        tone="error"
        title="这一章暂时没有打开"
        description={readerQuery.error instanceof Error ? readerQuery.error.message : '连接似乎中断了，请稍后再试。'}
        primaryAction={{
          label: readerQuery.isFetching ? '重新连接中...' : '重新连接',
          onClick: () => void readerQuery.refetch(),
        }}
        secondaryAction={{
          label: '回到详情页',
          href: `/novel/${novelId}`,
        }}
      />
    )
  }

  const reader = readerQuery.data
  const paragraphs = splitReaderParagraphs(reader.currentChapter.content)
  const chapterComments = asArray(commentsQuery.data?.items)
  const chapterList = asArray(reader.chapterList)
  const chapterTitle = reader.currentChapter.title?.trim() || '未命名章节'
  const novelTitle = getDisplayTitle(reader.novel)
  const panelButtonClass = (panel: Exclude<ReaderPanel, null>) =>
    `inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
      activePanel === panel
        ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50'
    }`

  const panelTitleMap: Record<Exclude<ReaderPanel, null>, string> = {
    directory: '章节目录',
    comments: '章节评论',
    settings: '阅读设置',
  }

  const panelIconMap = {
    directory: <ListOrdered className="h-4 w-4 text-slate-500 dark:text-slate-400" />,
    comments: <MessageSquare className="h-4 w-4 text-slate-500 dark:text-slate-400" />,
    settings: <Settings2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />,
  } as const
  const buildReadHref = (targetChapterId: string) => `/novel/${reader.novel.id}/read/${targetChapterId}`

  const renderPanelContent = () => {
    if (!activePanel) {
      return null
    }

    if (activePanel === 'directory') {
      return (
        <div className="space-y-2">
          {chapterList.length === 0 ? (
            <Empty
              title="目录暂时没有整理好"
              description="公开章节准备好后，会直接显示在这里。"
            />
          ) : chapterList.map((chapter) => {
            const isReadable = isPublicReadableChapter(chapter)
            const isActive = chapter.id === reader.currentChapter.id

            if (!isReadable) {
              return (
                <div
                  key={chapter.id}
                  className="rounded-[18px] border border-slate-200/60 px-3 py-3 text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500"
                >
                  <p className="font-medium">{chapter.title}</p>
                  <p className="mt-1 text-xs">第 {chapter.orderIndex} 章 · 待更新</p>
                </div>
              )
            }

            return (
              <Link
                key={chapter.id}
                to={buildReadHref(chapter.id)}
                onClick={() => setActivePanel(null)}
                className={`block rounded-[18px] px-3 py-3 text-sm transition ${
                  isActive
                    ? 'bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'border border-slate-200/80 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900'
                }`}
              >
                <p className="font-medium">{chapter.title}</p>
                <p className={`mt-1 text-xs ${isActive ? 'text-white/80 dark:text-slate-700' : 'text-slate-500 dark:text-slate-400'}`}>
                  第 {chapter.orderIndex} 章
                </p>
              </Link>
            )
          })}
        </div>
      )
    }

    if (activePanel === 'settings') {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-slate-950 dark:text-slate-50">字号节奏</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {fontScaleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFontScale(option.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    fontScale === option.id
                      ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-950 dark:text-slate-50">页面底色</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {paperToneOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPaperTone(option.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    paperTone === option.id
                      ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (commentsQuery.isLoading) {
      return (
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在加载评论...
        </div>
      )
    }

    if (commentsQuery.isError) {
      return (
        <div className="space-y-3">
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
            {commentsQuery.error instanceof Error ? commentsQuery.error.message : '评论暂时没有打开。'}
          </p>
          <Button variant="secondary" onClick={() => void commentsQuery.refetch()}>
            重新加载评论
          </Button>
        </div>
      )
    }

    if (chapterComments.length === 0) {
      return (
        <Empty
          title="这一章还没有读者留言"
          description="等第一批读者看完后，讨论会在这里慢慢出现。"
        />
      )
    }

    return (
      <div className="space-y-3">
        {chapterComments.map((comment) => (
          <article
            key={comment.id}
            className="rounded-[18px] border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70"
          >
            <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>{getAuthorName(comment.author)}</span>
              <span>{comment.replyCount} 回复</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-200">{getCommentBody(comment)}</p>
          </article>
        ))}
      </div>
    )
  }

  return (
    <div className="-mt-2 space-y-4 md:-mt-3 md:space-y-5">
      {activePanel ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 md:hidden" onClick={() => setActivePanel(null)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-slate-200/80 bg-white px-4 pb-6 pt-4 dark:border-slate-800 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                {panelIconMap[activePanel]}
                {panelTitleMap[activePanel]}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActivePanel(null)}>
                收起
              </Button>
            </div>
            <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">{renderPanelContent()}</div>
          </div>
        </div>
      ) : null}

      <section className="rounded-[22px] border border-slate-200/80 bg-white/88 px-4 py-3 sm:px-5 dark:border-slate-800 dark:bg-slate-950/86">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {novelTitle}
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[1.6rem]">
              {chapterTitle}
            </h1>
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
              第 {reader.currentChapter.orderIndex} 章 · {numberFormatter.format(reader.currentChapter.wordCount)} 字 ·{' '}
              {formatDateTime(reader.currentChapter.publishedAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setActivePanel((current) => (current === 'directory' ? null : 'directory'))} className={panelButtonClass('directory')}>
              <ListOrdered className="h-4 w-4" />
              目录
            </button>
            <button type="button" onClick={() => setActivePanel((current) => (current === 'comments' ? null : 'comments'))} className={panelButtonClass('comments')}>
              <MessageSquare className="h-4 w-4" />
              评论
            </button>
            <button type="button" onClick={() => setActivePanel((current) => (current === 'settings' ? null : 'settings'))} className={panelButtonClass('settings')}>
              <Settings2 className="h-4 w-4" />
              设置
            </button>
            <Link
              to={`/novel/${reader.novel.id}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50"
            >
              <BookText className="h-4 w-4" />
              返回详情
            </Link>
          </div>
        </div>
      </section>

      <div className={`grid gap-4 ${activePanel ? 'md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <article
          className={`rounded-[30px] border px-5 py-6 sm:px-8 lg:px-12 lg:py-10 ${currentPaperTone.articleClassName}`}
        >
          <header className="border-b border-slate-200/80 pb-5 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">{novelTitle}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span>{numberFormatter.format(chapterList.length)} 章目录</span>
              <span>{numberFormatter.format(reader.currentChapter.commentCount)} 条评论</span>
            </div>
          </header>

          <div className="mx-auto mt-8 max-w-3xl space-y-8">
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, index) => (
                <p
                  key={`${reader.currentChapter.id}-${index}`}
                  className={`${currentFontScale.className} tracking-[0.01em] ${currentPaperTone.textClassName}`}
                >
                  {paragraph}
                </p>
              ))
            ) : (
              <Empty
                title="这一章的正文还没有整理好"
                description="稍后再回来看看，或者先回到目录选择其他已开放章节。"
              />
            )}
          </div>

          <footer className="mt-10 border-t border-slate-200/80 pt-6 dark:border-slate-800">
            <div className="grid gap-3 md:grid-cols-2">
              {reader.previousChapterId ? (
                <Link
                  to={buildReadHref(reader.previousChapterId)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一章
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200/60 text-sm font-medium text-slate-400 dark:border-slate-800 dark:text-slate-600"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一章
                </button>
              )}
              {reader.nextChapterId ? (
                <Link
                  to={buildReadHref(reader.nextChapterId)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-slate-950 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                  下一章
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-slate-200 text-sm font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                >
                  下一章
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </footer>
        </article>

        {activePanel ? (
          <aside className="hidden md:block md:self-start md:pt-1 md:sticky md:top-24">
            <section
              id={activePanel === 'comments' ? 'reader-comments' : undefined}
              className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4 dark:border-slate-800 dark:bg-slate-950/86 md:max-h-[calc(100vh-8rem)] md:overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-50">
                  {panelIconMap[activePanel]}
                  {panelTitleMap[activePanel]}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActivePanel(null)}>
                  收起
                </Button>
              </div>
              <div className="mt-4 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto md:pr-1">{renderPanelContent()}</div>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
