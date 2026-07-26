import { PenSquare, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import BottomSheet from '@/components/layout/BottomSheet'
import { useDevice } from '@/components/layout/DeviceProvider'
import Button from '@/components/ui/Button'
import Avatar from '@/features/community/components/Avatar'
import { communityPrompts } from '@/features/community/constants'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/useShellStore'
import type { CommunityTopic } from './TopicChannelBar'

type PostComposerProps = {
  topics: CommunityTopic[]
  onSubmit: (payload: { content: string; topicId?: string }) => void
  isSubmitting: boolean
}

/**
 * 发帖入口（方案 8.3.2）：
 * - 默认收起为"头像 + 占位提示"假输入框
 * - 手机端点击展开全屏编辑页（避免键盘遮挡）
 * - 平板/电脑端点击展开居中模态
 */
export default function PostComposer({ topics, onSubmit, isSubmitting }: PostComposerProps) {
  const { isMobile } = useDevice()
  const navigate = useNavigate()
  const authStatus = useShellStore((state) => state.authStatus)
  const sessionUser = useShellStore((state) => state.sessionUser)
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [topicId, setTopicId] = useState<string | undefined>(undefined)

  const selectableTopics = topics.filter((topic) => topic.id !== 'all')

  const handleOpen = () => {
    if (authStatus !== 'authenticated') {
      navigate('/auth')
      return
    }
    setOpen(true)
  }

  const handleClose = () => setOpen(false)

  const handleSubmit = () => {
    const trimmed = content.trim()
    if (!trimmed || isSubmitting) return
    onSubmit({ content: trimmed, topicId })
    setContent('')
    setTopicId(undefined)
    setOpen(false)
  }

  const editor = (
    <div className="flex min-h-0 flex-1 flex-col">
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus -- 全屏编辑页打开即输入
        autoFocus={isMobile}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={isMobile ? undefined : 7}
        placeholder="把你的观察、追更感受或写作心得发出来。"
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-4 text-[15px] leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] md:px-5"
      />

      <div className="border-t border-[var(--border-subtle)] px-4 py-3 md:px-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTopicId(undefined)}
            className={cn(
              'press-feedback rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs transition-colors',
              topicId === undefined
                ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
            )}
          >
            不选话题
          </button>
          {selectableTopics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => setTopicId(topic.id)}
              className={cn(
                'press-feedback rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs transition-colors',
                topicId === topic.id
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]',
              )}
            >
              {topic.name}
            </button>
          ))}
        </div>

        {!content ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {communityPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setContent(prompt)}
                className="press-feedback rounded-[var(--radius-pill)] border border-dashed border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-3 pb-[env(safe-area-inset-bottom)]">
          <span className="text-xs text-[var(--text-tertiary)]">{content.trim().length} 字</span>
          <Button variant="primary" onClick={handleSubmit} disabled={!content.trim() || isSubmitting}>
            {isSubmitting ? '发布中' : '发布讨论'}
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* 收起态：假输入框 */}
      <button
        type="button"
        onClick={handleOpen}
        className="hover-lift flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-4 py-3 text-left shadow-[var(--shadow-card)] transition-shadow"
      >
        <Avatar name={sessionUser?.nickname ?? '游客'} src={sessionUser?.avatarUrl} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-tertiary)]">
          分享你的想法...
        </span>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-brand)] text-white">
          <PenSquare className="h-4 w-4" />
        </span>
      </button>

      {/* 手机端：全屏编辑页 */}
      {open && isMobile ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--surface-default)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-2 py-2 pt-[calc(env(safe-area-inset-top)+8px)]">
            <button
              type="button"
              onClick={handleClose}
              aria-label="取消"
              className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)] text-[var(--text-secondary)] press-feedback"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-[var(--text-primary)]">发讨论</span>
            <span className="w-10" />
          </header>
          {editor}
        </div>
      ) : null}

      {/* 平板/电脑端：居中模态（BottomSheet 自动降级） */}
      {!isMobile ? (
        <BottomSheet open={open} onClose={handleClose} title="发讨论" maxHeight="80dvh">
          <div className="flex min-h-[320px] flex-col">{editor}</div>
        </BottomSheet>
      ) : null}
    </>
  )
}
