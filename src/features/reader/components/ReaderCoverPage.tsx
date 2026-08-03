import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Headphones, Settings2, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import AppImage from '@/components/ui/AppImage'
import Avatar from '@/features/community/components/Avatar'
import { asArray, getDisplayTitle, getNovelDetailPayload, getNovelSummary } from '@/features/discover/api'
import type { ToneOption } from '../reader-settings'

/**
 * 代入页（方案 20 §2.3）：阅读器的第 -1 页。
 * 封面 / 书名 / 作者（可点进作者页）/ 简介+标签 / 热门书评 / 底部「左滑开始阅读」提示。
 * 数据与详情页同源（React Query 缓存命中时秒出）。
 */

type ReaderCoverPageProps = {
  novelId: string
  /** reader payload 里的兜底信息，详情接口未回来时先顶上 */
  fallbackTitle: string
  fallbackCoverUrl: string | null
  tone: ToneOption
  onExit: () => void
  onOpenTts: () => void
  onOpenSettings: () => void
  /** 听书是否可用（创作区预览不可用） */
  ttsAvailable: boolean
}

const numberFormatter = new Intl.NumberFormat('zh-CN')

export default function ReaderCoverPage({
  novelId,
  fallbackTitle,
  fallbackCoverUrl,
  tone,
  onExit,
  onOpenTts,
  onOpenSettings,
  ttsAvailable,
}: ReaderCoverPageProps) {
  const navigate = useNavigate()

  const detailQuery = useQuery({
    queryKey: ['novel-detail', novelId],
    queryFn: () => getNovelDetailPayload(novelId),
    enabled: Boolean(novelId),
    staleTime: 5 * 60_000,
  })

  const novel = detailQuery.data?.novel ?? null
  const title = novel ? getDisplayTitle(novel) : fallbackTitle
  const coverUrl = novel?.coverUrl ?? fallbackCoverUrl
  const tags = asArray(novel?.tags).slice(0, 3)
  const topComments = asArray(detailQuery.data?.topComments).slice(0, 2)
  const author = novel?.author ?? null

  const softBorder = 'color-mix(in srgb, currentColor 14%, transparent)'
  const chipBackground = 'color-mix(in srgb, currentColor 8%, transparent)'

  return (
    <div className="absolute inset-0 flex flex-col" style={{ color: tone.text }}>
      {/* 顶部：退出 + 功能按钮（听书 / 阅读设置） */}
      <div
        className="flex items-center justify-between px-2"
        style={{ paddingTop: 'calc(var(--safe-top) + 6px)' }}
      >
        <button
          type="button"
          aria-label="退出阅读"
          onClick={onExit}
          className="press-feedback inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)]"
          style={{ opacity: 0.7 }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1">
          {ttsAvailable ? (
            <button
              type="button"
              aria-label="听书"
              onClick={onOpenTts}
              className="press-feedback inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)]"
              style={{ opacity: 0.7 }}
            >
              <Headphones className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="阅读设置"
            onClick={onOpenSettings}
            className="press-feedback inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)]"
            style={{ opacity: 0.7 }}
          >
            <Settings2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-6 pt-2">
        {/* 作品信息 */}
        <div className="flex flex-col items-center text-center">
          <div className="h-[30vh] max-h-[240px] w-auto">
            {coverUrl ? (
              <AppImage
                src={coverUrl}
                alt={title}
                priority
                className="h-full w-[calc(30vh*0.7)] max-w-[168px] overflow-hidden rounded-[var(--radius-lg)] shadow-[0_18px_44px_rgba(15,23,42,0.24)]"
              />
            ) : (
              <div
                className="flex h-full w-[calc(30vh*0.7)] max-w-[168px] items-center justify-center rounded-[var(--radius-lg)] px-3 text-sm"
                style={{ background: chipBackground }}
              >
                {title}
              </div>
            )}
          </div>

          <h1 className="mt-4 line-clamp-2 text-[1.35rem] font-semibold tracking-tight">{title}</h1>

          {author ? (
            <button
              type="button"
              onClick={() => navigate(`/author/${author.id}`)}
              className="press-feedback mt-2 inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-2 py-1 text-sm"
              style={{ opacity: 0.75 }}
            >
              <Avatar name={author.nickname} src={author.avatarUrl} size="sm" className="h-6 w-6 text-[10px]" />
              <span className="max-w-[9rem] truncate">{author.nickname}</span>
              <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
            </button>
          ) : null}

          {novel ? (
            <p className="mt-2 flex items-center gap-2 text-xs" style={{ opacity: 0.55 }}>
              {typeof novel.ratingAverage === 'number' && novel.ratingAverage > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {novel.ratingAverage.toFixed(1)} 分
                </span>
              ) : null}
              <span>{numberFormatter.format(novel.wordCount)} 字</span>
              <span>{novel.status === 'completed' ? '已完结' : novel.status === 'archived' ? '已下架' : '连载中'}</span>
            </p>
          ) : null}
        </div>

        {/* 简介 + 标签 */}
        <div className="mt-5 border-t pt-4" style={{ borderColor: softBorder }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">简介</span>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px]"
                  style={{ background: chipBackground, opacity: 0.8 }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-2 line-clamp-3 text-[13px] leading-6" style={{ opacity: 0.7 }}>
            {getNovelSummary(novel?.summary)}
          </p>
        </div>

        {/* 热门书评 */}
        {topComments.length > 0 ? (
          <div className="mt-4 border-t pt-4" style={{ borderColor: softBorder }}>
            <p className="text-sm font-medium">热门书评</p>
            <div className="mt-2 space-y-2.5">
              {topComments.map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <Avatar
                    name={comment.author.nickname}
                    src={comment.author.avatarUrl}
                    size="sm"
                    className="h-6 w-6 shrink-0 text-[10px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px]" style={{ opacity: 0.55 }}>
                      <span className="max-w-[8rem] truncate">{comment.author.nickname}</span>
                      {typeof comment.rating === 'number' && comment.rating > 0 ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5" />
                          {comment.rating}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-5" style={{ opacity: 0.78 }}>
                      {comment.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* 底部提示 */}
      <div
        className="flex items-center justify-center pb-[calc(var(--safe-bottom)+16px)] pt-2"
        style={{ opacity: 0.5 }}
      >
        <span
          className="animate-pulse rounded-[var(--radius-pill)] px-3 py-1 text-xs"
          style={{ background: chipBackground }}
        >
          ← 左滑开始阅读
        </span>
      </div>
    </div>
  )
}
