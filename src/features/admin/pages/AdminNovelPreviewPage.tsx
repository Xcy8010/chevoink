import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronLeft, ChevronRight, Eye } from 'lucide-react'

import Button from '@/components/ui/Button'
import { getAdminChapterContent, getAdminNovelDetail } from '../api'
import { AdminCard, AdminPanelState, StatusPill } from '../AdminLayout'
import { formatDateTime, isNovelTakenDown, NOVEL_STATUS_LABELS } from '../admin-shared'

/**
 * 管理端内部预览：不经过前台可见性过滤，
 * 草稿、仅自己可见、已下架的作品与章节均可阅读全文。
 */
export default function AdminNovelPreviewPage() {
  const { novelId = '' } = useParams()
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['admin', 'novels', novelId],
    queryFn: () => getAdminNovelDetail(novelId),
    enabled: Boolean(novelId),
  })

  const chapters = detailQuery.data?.chapters ?? []
  const activeChapterId = selectedChapterId ?? chapters[0]?.id ?? null
  const activeIndex = chapters.findIndex((chapter) => chapter.id === activeChapterId)

  const chapterQuery = useQuery({
    queryKey: ['admin', 'novels', novelId, 'chapter-content', activeChapterId],
    queryFn: () => getAdminChapterContent(novelId, activeChapterId ?? ''),
    enabled: Boolean(novelId) && Boolean(activeChapterId),
  })

  const paragraphs = useMemo(() => {
    if (!chapterQuery.data) return []
    return chapterQuery.data.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }, [chapterQuery.data])

  const novel = detailQuery.data?.novel
  const takenDown = novel ? isNovelTakenDown(novel) : false

  const selectChapter = (chapterId: string) => {
    setSelectedChapterId(chapterId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      <Link
        to={`/admin/novels/${novelId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={15} />
        返回作品详情
      </Link>

      <AdminPanelState state={detailQuery.isLoading ? 'loading' : detailQuery.isError ? 'error' : 'ready'}>
        {novel && detailQuery.data ? (
          <div className="space-y-4">
            <AdminCard>
              <div className="flex min-w-0 gap-4">
                {novel.coverUrl ? (
                  <img
                    src={novel.coverUrl}
                    alt="作品封面"
                    className="aspect-[3/4] w-20 shrink-0 self-start rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-20 shrink-0 self-start items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] text-xs text-[var(--text-secondary)]">
                    暂无封面
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h1 className="min-w-0 break-words text-lg font-semibold">{novel.displayTitle ?? novel.title}</h1>
                    {takenDown ? (
                      <StatusPill tone="danger">已下架</StatusPill>
                    ) : (
                      <StatusPill tone="success">{NOVEL_STATUS_LABELS[novel.status] ?? novel.status}</StatusPill>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    作者：{novel.author.nickname}
                    <span className="mx-1.5">·</span>
                    {novel.categoryName ?? '未分类'}
                    <span className="mx-1.5">·</span>
                    {novel.wordCount.toLocaleString('zh-CN')} 字 · {novel.chapterCount} 章
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <Eye size={13} />
                    内部预览：草稿与已下架内容仅管理后台可见，前台不展示。
                  </p>
                </div>
              </div>
            </AdminCard>

            {chapters.length === 0 ? (
              <AdminCard>
                <p className="py-6 text-center text-sm text-[var(--text-secondary)]">该作品暂无章节</p>
              </AdminCard>
            ) : (
              <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                {/* 章节导航：桌面侧栏 + 移动端下拉 */}
                <AdminCard className="md:self-start">
                  <h2 className="mb-2 text-sm font-semibold">目录（{chapters.length}）</h2>
                  <select
                    aria-label="选择章节"
                    className="mb-2 h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-card)] px-2 text-sm text-[var(--text-primary)] md:hidden"
                    value={activeChapterId ?? ''}
                    onChange={(event) => selectChapter(event.target.value)}
                  >
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.orderIndex}. {chapter.title}
                        {chapter.status === 'published' ? '' : '（草稿）'}
                      </option>
                    ))}
                  </select>
                  <ul className="hidden max-h-[62vh] divide-y divide-[var(--border-default)] overflow-y-auto pr-1 md:block">
                    {chapters.map((chapter) => (
                      <li key={chapter.id}>
                        <button
                          type="button"
                          onClick={() => selectChapter(chapter.id)}
                          className={`flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:text-[var(--text-primary)] ${
                            chapter.id === activeChapterId ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <span className="truncate">
                            {chapter.orderIndex}. {chapter.title}
                          </span>
                          {chapter.status === 'published' ? (
                            <StatusPill tone="success">已发布</StatusPill>
                          ) : (
                            <StatusPill tone="warning">草稿</StatusPill>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </AdminCard>

                <AdminCard>
                  <AdminPanelState state={chapterQuery.isLoading ? 'loading' : chapterQuery.isError ? 'error' : 'ready'}>
                    {chapterQuery.data ? (
                      <article>
                        <header className="border-b border-[var(--border-default)] pb-3">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h2 className="min-w-0 break-words text-base font-semibold">
                              {chapterQuery.data.orderIndex}. {chapterQuery.data.title}
                            </h2>
                            {chapterQuery.data.status === 'published' ? (
                              <StatusPill tone="success">已发布</StatusPill>
                            ) : (
                              <StatusPill tone="warning">草稿</StatusPill>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {chapterQuery.data.wordCount.toLocaleString('zh-CN')} 字 · 更新于{' '}
                            {formatDateTime(chapterQuery.data.updatedAt)}
                          </p>
                        </header>
                        <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-[var(--text-primary)]">
                          {paragraphs.length > 0 ? (
                            paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                          ) : (
                            <p className="text-sm text-[var(--text-secondary)]">该章节暂无正文。</p>
                          )}
                        </div>
                        <footer className="mt-6 flex items-center justify-between border-t border-[var(--border-default)] pt-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={activeIndex <= 0}
                            onClick={() => activeIndex > 0 && selectChapter(chapters[activeIndex - 1].id)}
                          >
                            <ChevronLeft size={14} />
                            上一章
                          </Button>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {activeIndex + 1} / {chapters.length}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={activeIndex < 0 || activeIndex >= chapters.length - 1}
                            onClick={() => activeIndex < chapters.length - 1 && selectChapter(chapters[activeIndex + 1].id)}
                          >
                            下一章
                            <ChevronRight size={14} />
                          </Button>
                        </footer>
                      </article>
                    ) : null}
                  </AdminPanelState>
                </AdminCard>
              </div>
            )}
          </div>
        ) : null}
      </AdminPanelState>
    </div>
  )
}
