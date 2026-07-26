import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import Empty from '@/components/Empty'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createComment } from '@/features/community/api'
import { getAuthorName, getCommentBody } from '@/features/discover/api'
import { useShellStore } from '@/store/useShellStore'
import type { ReaderState } from '../useReaderState'

type ReaderCommentsPanelProps = {
  state: ReaderState
}

const COMMENT_MAX_LENGTH = 500

/** 章节评论列表面板（方案 6.3：底部支持直接发表评论） */
export default function ReaderCommentsPanel({ state }: ReaderCommentsPanelProps) {
  const { commentsQuery, chapterComments, chapterId } = state
  const authStatus = useShellStore((shell) => shell.authStatus)
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    const content = draft.trim()
    if (!content || !chapterId || isSubmitting) return

    if (authStatus !== 'authenticated') {
      toast.error('登录后才能发表评论')
      return
    }

    setIsSubmitting(true)
    try {
      await createComment({ targetType: 'chapter', targetId: chapterId, content })
      setDraft('')
      toast.success('评论已发布')
      await commentsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '评论发布失败，请稍后再试')
    } finally {
      setIsSubmitting(false)
    }
  }

  const composer = (
    <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-3">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, COMMENT_MAX_LENGTH))}
        rows={3}
        placeholder={authStatus === 'authenticated' ? '说说你对这一章的看法…' : '登录后即可发表评论'}
        className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-brand)]"
      />
      <div className="flex items-center justify-between">
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
      <div className="flex items-center gap-3 p-4 text-sm text-[var(--text-secondary)]">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        正在加载评论...
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

  if (chapterComments.length === 0) {
    return (
      <div className="space-y-3 p-2">
        <Empty title="这一章还没有读者留言" description="等第一批读者看完后，讨论会在这里慢慢出现。" />
        {composer}
      </div>
    )
  }

  return (
    <div className="space-y-3 p-1">
      {chapterComments.map((comment) => (
        <article
          key={comment.id}
          className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4"
        >
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)]">
            <span>{getAuthorName(comment.author)}</span>
            <span>{comment.replyCount} 回复</span>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--text-primary)]">{getCommentBody(comment)}</p>
        </article>
      ))}
      {composer}
    </div>
  )
}
