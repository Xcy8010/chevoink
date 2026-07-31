import { BookOpen, ImagePlus, PenSquare, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import BottomSheet from '@/components/layout/BottomSheet'
import { useDevice } from '@/components/layout/DeviceProvider'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { listRecommendedTopics } from '@/features/community/api'
import Avatar from '@/features/community/components/Avatar'
import { communityPrompts } from '@/features/community/constants'
import { MAX_POST_IMAGE_COUNT, preparePostImage } from '@/features/community/post-image'
import type { CommunityShareDraft } from '@/features/community/share'
import { cn } from '@/lib/utils'
import { useShellStore } from '@/store/useShellStore'

type PostComposerProps = {
  onSubmit: (payload: {
    content: string
    imageDataUrls?: string[]
    relatedNovelId?: string
    sharedUserId?: string
  }) => void
  isSubmitting: boolean
  /** 从作品页/作者页带入的分享草稿：自动展开编辑器并预览卡片 */
  initialShare?: CommunityShareDraft | null
}

/**
 * 发帖入口（方案 8.3.2 / 18 §3.5）：
 * - 默认收起为"头像 + 占位提示"假输入框
 * - 手机端点击展开全屏编辑页（避免键盘遮挡）
 * - 平板/电脑端点击展开居中模态
 * - 话题改用 X 式 # 语法：正文内 #话题 由服务端解析，不再选话题按钮
 */
export default function PostComposer({ onSubmit, isSubmitting, initialShare }: PostComposerProps) {
  const { isMobile } = useDevice()
  const navigate = useNavigate()
  const toast = useToast()
  const authStatus = useShellStore((state) => state.authStatus)
  const sessionUser = useShellStore((state) => state.sessionUser)
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [imageProcessing, setImageProcessing] = useState(false)
  const [share, setShare] = useState<CommunityShareDraft | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // 推荐话题：打开编辑器才拉，点击直接插入光标处
  const recommendedTopicsQuery = useQuery({
    queryKey: ['community', 'recommended-topics'],
    queryFn: listRecommendedTopics,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const recommendedTopics = recommendedTopicsQuery.data?.items ?? []

  // 带分享草稿进入时自动展开编辑器（未登录保持收起，点假输入框会引导去登录）
  useEffect(() => {
    if (!initialShare) return
    setShare(initialShare)
    if (authStatus === 'authenticated') {
      setOpen(true)
    }
  }, [initialShare, authStatus])

  const handleOpen = () => {
    if (authStatus !== 'authenticated') {
      navigate('/auth')
      return
    }
    setOpen(true)
  }

  const handleClose = () => setOpen(false)

  /** 推荐话题点击：把 #话题 插入光标处，光标落在插入内容之后 */
  const handleInsertTopic = (name: string) => {
    const tag = `#${name} `
    const textarea = textareaRef.current
    if (!textarea) {
      setContent((value) => `${value}${tag}`)
      return
    }

    const start = textarea.selectionStart ?? content.length
    const end = textarea.selectionEnd ?? start
    setContent(`${content.slice(0, start)}${tag}${content.slice(end)}`)
    requestAnimationFrame(() => {
      textarea.focus()
      const caret = start + tag.length
      textarea.setSelectionRange(caret, caret)
    })
  }

  /** 选图后逐张校验+压缩，超出 9 张的部分直接舍弃并提示 */
  const handlePickImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || imageProcessing) return

    const remaining = MAX_POST_IMAGE_COUNT - images.length
    if (remaining <= 0) {
      toast.error(`最多上传 ${MAX_POST_IMAGE_COUNT} 张图片`)
      return
    }

    if (files.length > remaining) {
      toast.error(`最多上传 ${MAX_POST_IMAGE_COUNT} 张图片，已为你保留前 ${remaining} 张`)
    }

    setImageProcessing(true)
    try {
      const prepared: string[] = []
      for (const file of files.slice(0, remaining)) {
        try {
          prepared.push(await preparePostImage(file))
        } catch (error) {
          toast.error(error instanceof Error ? error.message : '图片处理失败，请换一张再试')
        }
      }
      if (prepared.length) {
        setImages((value) => [...value, ...prepared].slice(0, MAX_POST_IMAGE_COUNT))
      }
    } finally {
      setImageProcessing(false)
    }
  }

  const handleRemoveImage = (index: number) => {
    setImages((value) => value.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleSubmit = () => {
    const trimmed = content.trim()
    if (!trimmed || isSubmitting || imageProcessing) return
    onSubmit({
      content: trimmed,
      imageDataUrls: images,
      relatedNovelId: share?.kind === 'novel' ? share.novel.id : undefined,
      sharedUserId: share?.kind === 'author' ? share.author.id : undefined,
    })
    setContent('')
    setImages([])
    setShare(null)
    setOpen(false)
  }

  const editor = (
    <div className="flex min-h-0 flex-1 flex-col">
      <textarea
        ref={textareaRef}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- 全屏编辑页打开即输入
        autoFocus={isMobile}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={isMobile ? undefined : 7}
        placeholder={share ? '说说你的推荐理由，让更多人看到它。' : '把你的观察、追更感受或写作心得发出来。'}
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-4 text-[15px] leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] md:px-5"
      />

      {/* 分享卡片预览：不可点跳转，右上角可移除 */}
      {share ? (
        <div className="px-4 pb-3 md:px-5">
          <div className="relative flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 pr-11">
            {share.kind === 'novel' ? (
              <>
                {share.novel.coverUrl ? (
                  <img
                    src={share.novel.coverUrl}
                    alt={share.novel.title}
                    className="h-16 w-12 shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-tertiary)]">
                    <BookOpen className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--text-tertiary)]">分享作品</p>
                  <p className="mt-1 line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
                    {share.novel.title}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Avatar name={share.author.nickname} src={share.author.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--text-tertiary)]">推荐作者</p>
                  <p className="mt-1 line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
                    {share.author.nickname}
                  </p>
                  {share.author.bio ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-tertiary)]">{share.author.bio}</p>
                  ) : null}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setShare(null)}
              aria-label="移除分享卡片"
              className="press-feedback absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-default)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {/* 配图预览：缩略图网格 + 虚线添加格 */}
      {images.length > 0 || imageProcessing ? (
        <div className="grid grid-cols-3 gap-2 px-4 pb-3 md:px-5">
          {images.map((dataUrl, index) => (
            <div
              key={`${index}-${dataUrl.slice(-24)}`}
              className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
            >
              <img src={dataUrl} alt={`配图 ${index + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemoveImage(index)}
                aria-label={`移除第 ${index + 1} 张配图`}
                className="press-feedback absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {imageProcessing ? (
            <div className="flex aspect-square items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-tertiary)]">
              处理中...
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-[var(--border-subtle)] px-4 py-3 md:px-5">
        {/* X 式话题引导：纯文本两行，无卡片无胶囊无边框（方案 18 §3.5） */}
        <p className="text-xs leading-6 text-[var(--text-tertiary)]">
          使用 <span className="font-medium text-[var(--color-brand)]">#</span> 可以引用或创建一个话题
        </p>
        {recommendedTopics.length > 0 ? (
          <p className="mt-0.5 text-xs leading-6 text-[var(--text-tertiary)]">
            推荐话题
            {recommendedTopics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => handleInsertTopic(topic.name)}
                className="press-feedback ml-2.5 font-medium text-[var(--color-brand)] transition-opacity hover:opacity-80"
              >
                #{topic.name}
              </button>
            ))}
          </p>
        ) : null}

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

        <div className="mt-4 flex items-center justify-between gap-3 pb-[var(--safe-bottom)]">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={imageProcessing || images.length >= MAX_POST_IMAGE_COUNT}
            className={cn(
              'press-feedback inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-3 text-xs transition-colors',
              imageProcessing || images.length >= MAX_POST_IMAGE_COUNT
                ? 'cursor-not-allowed text-[var(--text-tertiary)] opacity-60'
                : 'text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
            )}
          >
            <ImagePlus className="h-4 w-4" />
            图片
            <span className="tabular-nums text-[var(--text-tertiary)]">
              {images.length}/{MAX_POST_IMAGE_COUNT}
            </span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(event) => void handlePickImages(event)}
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-tertiary)]">{content.trim().length} 字</span>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting || imageProcessing}
            >
              {isSubmitting ? '发布中' : '发布讨论'}
            </Button>
          </div>
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

      {/* 手机端：全屏编辑页（底边随软键盘上移，操作栏始终在键盘上方） */}
      {open && isMobile ? (
        <div className="fixed inset-x-0 top-0 bottom-[var(--keyboard-inset,0px)] z-[70] flex flex-col bg-[var(--surface-default)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-2 py-2 pt-[calc(var(--safe-top)+8px)]">
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
