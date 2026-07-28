import { useState } from 'react'
import { AlignLeft, Trash2 } from 'lucide-react'

import Button from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { createComment, deleteComment } from '@/features/community/api'
import { getAuthorName, getCommentBody } from '@/features/discover/api'
import { useShellStore } from '@/store/useShellStore'
import type { ReaderState } from '../useReaderState'

type ReaderCommentsPanelProps = {
  state: ReaderState
}

const COMMENT_MAX_LENGTH = 500

/** 章节评论面板：章评总合 + 段评筛选（方案 6.3 / 任务9），底部支持直接发表 */
export default function ReaderCommentsPanel({ state }: ReaderCommentsPanelProps) {
  const { commentsQuery, chapterComments, chapterId, activeParagraphIndex, openParagraphComments, locateParagraph } =
    state
  const authStatus = useShellStore((shell) => shell.authStatus)
  const sessionUser = useShellStore((shell) => shell.sessionUser)
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isParagraphView = activeParagraphIndex !== null
  // 段评视图只看当前段；总合视图汇集本章全部评论（含各段段评）
  const visibleComments = isParagraphView
    ? chapterComments.filter((comment) => comment.paragraphIndex === activeParagraphIndex)
    : chapterComments

  const handleDelete = async (commentId: string) => {
    if (deletingId) return
    if (!window.confirm('确定删除这条评论吗？')) return

    setDeletingId(commentId)
    try {
      await deleteComment(commentId)
      toast.success('评论已删除')
      await commentsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败，请稍后再试')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSubmit = async () => {
    const content = draft.trim()
    if (!content || !chapterId || isSubmitting) return

    if (authStatus !== 'authenticated') {
      toast.error('登录后才能发表评论')
      return
    }

    setIsSubmitting(true)
    try {
      await createComment({
        targetType: 'chapter',
        targetId: chapterId,
        content,
        // 段评视图下发表的评论自动标注所属段落
        paragraphIndex: activeParagraphIndex ?? undefined,
      })
      setDraft('')
      toast.success('评论已发布')
      await commentsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '评论发布失败，请稍后再试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 段评视图顶部：X 风格纯文本行，左侧标注段落、右侧一键回到全部评论
  const paragraphHeader = isParagraphView ? (
    <div className="flex items-center justify-between pb-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand)]">
        <AlignLeft className="h-3.5 w-3.5" />
        第 {activeParagraphIndex! + 1} 段的评论
      </span>
      <button
        type="button"
        onClick={() => openParagraphComments(null)}
        className="press-feedback text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
      >
        查看全部评论
      </button>
    </div>
  ) : null

  // 扁平的发评论区：只留一个输入框，不再套外层卡片
  const composer = (
    <div className="border-t border-[var(--border-subtle)] pt-3">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, COMMENT_MAX_LENGTH))}
        rows={3}
        placeholder={
          authStatus !== 'authenticated'
            ? '登录后即可发表评论'
            : isParagraphView
              ? `对第 ${activeParagraphIndex! + 1} 段说点什么…`
              : '说说你对这一章的看法…'
        }
        className="w-full resize-none rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:ring-1 focus:ring-[var(--color-brand)]"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">
          {draft.length}/{COMMENT_MAX_LENGTH}
        </span>
        <Button variant="primary" size="sm" disabled={!draft.trim() || isSubmitting} onClick={() => void handleSubmit()}>
          {isSubmitting ? '发布中…' : '发表评论'}
        </Button>
      </div>
    </div>
  )

  if (commentsQuery.isLoading) {
    return (
      <div className="space-y-5 px-1 py-4" aria-busy="true" aria-label="评论加载中">
        <SkeletonText lines={2} />
        <SkeletonText lines={2} />
      </div>
    )
  }

  if (commentsQuery.isError) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm leading-7 text-[var(--text-secondary)]">
          {commentsQuery.error instanceof Error ? commentsQuery.error.message : '评论暂时没有打开。'}
        </p>
        <Button variant="secondary" onClick={() => void commentsQuery.refetch()}>
          重新加载评论
        </Button>
      </div>
    )
  }

  if (visibleComments.length === 0) {
    return (
      <div className="px-1">
        {paragraphHeader}
        <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">
          {isParagraphView ? '这一段还没有评论，抢个沙发。' : '还没有留言，说说你的看法吧。'}
        </p>
        {composer}
      </div>
    )
  }

  return (
    <div className="px-1">
      {paragraphHeader}
      {/* 评论直接用分隔线分行，不再逐条包卡片 */}
      <div className="divide-y divide-[var(--border-subtle)]">
        {visibleComments.map((comment) => (
          <div key={comment.id} className="py-3">
            <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
              <span className="font-medium text-[var(--text-secondary)]">{getAuthorName(comment.author)}</span>
              <span className="inline-flex items-center gap-3">
                <span>{comment.replyCount} 回复</span>
                {sessionUser?.id === comment.author?.id ? (
                  <button
                    type="button"
                    disabled={deletingId === comment.id}
                    onClick={() => void handleDelete(comment.id)}
                    className="press-feedback inline-flex items-center gap-1 transition-colors hover:text-red-500 disabled:opacity-50"
                    aria-label="删除评论"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                ) : null}
              </span>
            </div>
            {/* 段评在总合视图里标注所属段落，点击定位到正文并高亮闪一下 */}
            {!isParagraphView && typeof comment.paragraphIndex === 'number' ? (
              <button
                type="button"
                onClick={() => locateParagraph(comment.paragraphIndex!)}
                className="press-feedback mt-1.5 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-brand)]"
              >
                <AlignLeft className="h-3 w-3" />
                第 {comment.paragraphIndex + 1} 段
              </button>
            ) : null}
            <p className="mt-1.5 text-sm leading-6 text-[var(--text-primary)]">{getCommentBody(comment)}</p>
          </div>
        ))}
      </div>
      {composer}
    </div>
  )
}
