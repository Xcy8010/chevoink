import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import {
  asArray,
  getDisplayTitle,
  getReaderPayload,
  listCommentsByTarget,
  splitReaderParagraphs,
} from '@/features/discover/api'
import { saveReadingProgress } from '@/features/home/reading-progress'
import { getChapterContent, getStudioPayload } from '@/features/studio/api'
import type { ReaderPayload } from '../../../shared/contracts/index.js'
import {
  getFontScaleOption,
  getToneOption,
  loadReaderSettings,
  saveReaderSettings,
  type ReaderFontScale,
  type ReaderTone,
} from './reader-settings'
import { useTtsPlayer } from './tts/useTtsPlayer'

export type ReaderPanelId = 'directory' | 'comments' | 'settings' | null

const numberFormatter = new Intl.NumberFormat('zh-CN')

// 阅读正文内容基本不变，拉长缓存时间，配合预加载实现秒开翻章
const READER_STALE_TIME = 5 * 60_000
const READER_GC_TIME = 15 * 60_000

const readerQueryKey = (novelId: string, chapterId: string, fromStudio: boolean) =>
  ['reader', novelId, chapterId, fromStudio ? 'studio-preview' : 'public'] as const

/** 拉取阅读器 payload：公开阅读走 reader 接口，创作区预览用 studio 数据拼装 */
async function fetchReaderPayload(
  novelId: string,
  chapterId: string,
  fromStudio: boolean,
): Promise<ReaderPayload> {
  if (!fromStudio) {
    return getReaderPayload(novelId, chapterId)
  }

  const [studio, chapter] = await Promise.all([
    getStudioPayload(novelId),
    getChapterContent(novelId, chapterId),
  ])

  const chapterList = asArray(studio.chapters)
  const currentIndex = chapterList.findIndex((item) => item.id === chapter.id)

  return {
    novel: {
      id: studio.novel.id,
      title: studio.novel.title,
      displayTitle: studio.novel.displayTitle,
      slug: studio.novel.slug,
      coverUrl: studio.novel.coverUrl,
    },
    currentChapter: chapter,
    chapterList,
    previousChapterId: currentIndex > 0 ? chapterList[currentIndex - 1].id : null,
    nextChapterId:
      currentIndex >= 0 && currentIndex < chapterList.length - 1
        ? chapterList[currentIndex + 1].id
        : null,
  }
}

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '暂未更新'

/**
 * 阅读器共享状态层：数据查询、显示设置、滚动进度、本机阅读进度写回。
 * 三端布局（ReaderMobile / ReaderTablet / ReaderDesktop）共用。
 */
export function useReaderState() {
  const { novelId, chapterId } = useParams()
  const [searchParams] = useSearchParams()
  const fromStudio = searchParams.get('from') === 'studio'
  const returnTo = searchParams.get('returnTo')

  const initialSettings = useMemo(() => loadReaderSettings(), [])
  const [fontScale, setFontScaleState] = useState<ReaderFontScale>(initialSettings.fontScale)
  const [tone, setToneState] = useState<ReaderTone>(initialSettings.tone)
  const [activePanel, setActivePanel] = useState<ReaderPanelId>(null)
  const [scrollPercent, setScrollPercent] = useState(0)
  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()

  const readerQuery = useQuery({
    queryKey: readerQueryKey(novelId ?? '', chapterId ?? '', fromStudio),
    queryFn: async (): Promise<ReaderPayload> => {
      if (!novelId || !chapterId) {
        throw new Error('未找到章节内容。')
      }

      return fetchReaderPayload(novelId, chapterId, fromStudio)
    },
    enabled: Boolean(novelId && chapterId),
    staleTime: READER_STALE_TIME,
    gcTime: READER_GC_TIME,
  })

  const commentsQuery = useQuery({
    queryKey: ['chapter-comments', chapterId],
    queryFn: () => listCommentsByTarget('chapter', chapterId ?? '', { page: 1, pageSize: 20 }),
    enabled: Boolean(chapterId && readerQuery.isSuccess),
  })

  const reader = readerQuery.data ?? null

  // 后台静默预加载相邻章节：点击上一章/下一章时直接命中缓存，无任何 UI 表现
  useEffect(() => {
    if (!reader || !novelId) return

    for (const targetChapterId of [reader.nextChapterId, reader.previousChapterId]) {
      if (!targetChapterId) continue
      void queryClient.prefetchQuery({
        queryKey: readerQueryKey(novelId, targetChapterId, fromStudio),
        queryFn: () => fetchReaderPayload(novelId, targetChapterId, fromStudio),
        staleTime: READER_STALE_TIME,
        gcTime: READER_GC_TIME,
      })
    }
  }, [queryClient, reader, novelId, fromStudio])

  const paragraphs = useMemo(
    () => splitReaderParagraphs(reader?.currentChapter.content ?? ''),
    [reader?.currentChapter.content],
  )
  const chapterComments = asArray(commentsQuery.data?.items)
  const chapterList = asArray(reader?.chapterList)
  const chapterTitle = reader?.currentChapter.title?.trim() || '未命名章节'
  const novelTitle = reader ? getDisplayTitle(reader.novel) : '未命名作品'
  const currentIndex = reader
    ? chapterList.findIndex((chapter) => chapter.id === reader.currentChapter.id)
    : -1
  const totalChapters = chapterList.length

  /** 章节级进度 + 章内滚动进度（方案 5.3.1） */
  const progressPercent =
    totalChapters > 0 && currentIndex >= 0
      ? Math.min(100, ((currentIndex + scrollPercent) / totalChapters) * 100)
      : 0

  const fontScaleOption = getFontScaleOption(fontScale)
  const toneOption = getToneOption(tone)

  const setFontScale = (next: ReaderFontScale) => {
    setFontScaleState(next)
    saveReaderSettings({ fontScale: next })
  }
  const setTone = (next: ReaderTone) => {
    setToneState(next)
    saveReaderSettings({ tone: next })
  }

  const backHref = reader ? (fromStudio && returnTo ? returnTo : `/novel/${reader.novel.id}`) : '/discover'
  const backLabel = fromStudio ? '返回创作区' : '返回详情'
  const previewSearch = fromStudio
    ? `?from=studio${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`
    : ''
  const buildReadHref = (targetChapterId: string) =>
    reader ? `/novel/${reader.novel.id}/read/${targetChapterId}${previewSearch}` : '#'
  const previousHref = reader?.previousChapterId ? buildReadHref(reader.previousChapterId) : null
  const nextHref = reader?.nextChapterId ? buildReadHref(reader.nextChapterId) : null

  const metaLine = reader
    ? `第 ${reader.currentChapter.orderIndex} 章 · ${numberFormatter.format(reader.currentChapter.wordCount)} 字 · ${formatDateTime(reader.currentChapter.publishedAt)}`
    : ''

  // 听书播放引擎（方案 17）：三端共用，创作区预览（fromStudio）不启用
  const tts = useTtsPlayer({
    novelId,
    chapterId,
    fromStudio,
    paragraphs,
    nextHref,
    novelTitle,
    chapterTitle,
    coverUrl: reader?.novel.coverUrl ?? null,
    contentScrollRef,
    initialVoice: initialSettings.ttsVoice,
    initialRate: initialSettings.ttsRate,
    initialAutoNext: initialSettings.ttsAutoNext,
  })

  /** 绑定到各布局的正文滚动容器 */
  const handleContentScroll = () => {
    const element = contentScrollRef.current
    if (!element) return
    const max = element.scrollHeight - element.clientHeight
    setScrollPercent(max > 0 ? Math.min(1, element.scrollTop / max) : 1)
  }

  // 章节切换后回到顶部并重置章内进度
  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    setScrollPercent(0)
  }, [chapterId])

  // 写回本机阅读进度（首页"继续阅读"数据源），创作区预览不记录
  useEffect(() => {
    if (!reader || !novelId || !chapterId || fromStudio) return
    saveReadingProgress({
      novelId,
      novelTitle,
      chapterId,
      chapterTitle,
      chapterOrder: Math.max(0, currentIndex),
      totalChapters,
    })
  }, [reader, novelId, chapterId, fromStudio, currentIndex, totalChapters, novelTitle, chapterTitle])

  return {
    novelId,
    chapterId,
    fromStudio,
    readerQuery,
    commentsQuery,
    reader,
    paragraphs,
    chapterComments,
    chapterList,
    chapterTitle,
    novelTitle,
    currentIndex,
    totalChapters,
    progressPercent,
    metaLine,
    fontScale,
    fontScaleOption,
    setFontScale,
    tone,
    toneOption,
    setTone,
    activePanel,
    setActivePanel,
    contentScrollRef,
    handleContentScroll,
    backHref,
    backLabel,
    buildReadHref,
    previousHref,
    nextHref,
    tts,
  }
}

export type ReaderState = ReturnType<typeof useReaderState>
