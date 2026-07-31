import { Heart, MessageSquareMore, Share2, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { useToast } from '@/components/ui/Toast'
import { setPostBookmark, setPostLike } from '@/features/community/api'
import { patchPostInCaches } from '@/features/community/post-cache'
import Avatar from '@/features/community/components/Avatar'
import AuthorReferenceCard from '@/features/community/components/AuthorReferenceCard'
import NovelReferenceCard from '@/features/community/components/NovelReferenceCard'
import PostImageViewer from '@/features/community/components/PostImageViewer'
import { formatCompactCount, formatRelativeTime } from '@/features/community/utils'
import { cn } from '@/lib/utils'
import { splitContentByTopics } from '../../../../shared/contracts/index.js'
import type { Post } from '../../../../shared/contracts/index.js'

type PostCardProps = {
  post: Post
  compact?: boolean
  /** 详情页模式：去掉卡片外壳与跳转行为，正文不截断，作为页面主内容平铺展示 */
  flat?: boolean
}

const TRUNCATE_THRESHOLD = 180

/** 帖子卡片（方案 8.3.3）：人格化头部 + 5 行截断 + 互动栏动效 */
export default function PostCard({ post, compact = false, flat = false }: PostCardProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [liked, setLiked] = useState(Boolean(post.likedByViewer))
  const [favorited, setFavorited] = useState(Boolean(post.bookmarkedByViewer))
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  // 服务端 viewer 状态刷新后同步本地状态
  useEffect(() => {
    setLiked(Boolean(post.likedByViewer))
  }, [post.likedByViewer])
  useEffect(() => {
    setFavorited(Boolean(post.bookmarkedByViewer))
  }, [post.bookmarkedByViewer])

  const fullContent = compact ? post.excerpt : post.content
  const shouldTruncate = !flat && !expanded && fullContent.length > TRUNCATE_THRESHOLD
  const imageUrls = post.imageUrls.filter(Boolean)
  // 以服务端计数为基线，叠加本地乐观增量
  const likeCount = Math.max(0, post.likeCount + Number(liked) - Number(Boolean(post.likedByViewer)))
  const favoriteCount = Math.max(0, post.favoriteCount + Number(favorited) - Number(Boolean(post.bookmarkedByViewer)))

  const openDetail = () => navigate(`/post/${post.id}`)

  const handleToggleLike = (event: React.MouseEvent) => {
    event.stopPropagation()
    const next = !liked
    setLiked(next)
    setPostLike(post.id, next)
      .then((data) => {
        // 把服务端权威状态写回所有含该帖子的缓存，保证列表与详情页点赞一致
        patchPostInCaches(queryClient, post.id, { likedByViewer: data.liked, likeCount: data.likeCount })
      })
      .catch((error) => {
        setLiked(!next)
        toast.error(error instanceof Error ? error.message : '操作失败，请稍后再试')
      })
  }

  const handleToggleBookmark = (event: React.MouseEvent) => {
    event.stopPropagation()
    const next = !favorited
    setFavorited(next)
    setPostBookmark(post.id, next)
      .then((data) => {
        patchPostInCaches(queryClient, post.id, {
          bookmarkedByViewer: data.bookmarked,
          favoriteCount: data.favoriteCount,
        })
      })
      .catch((error) => {
        setFavorited(!next)
        toast.error(error instanceof Error ? error.message : '操作失败，请稍后再试')
      })
  }

  const handleShare = async (event: React.MouseEvent) => {
    event.stopPropagation()
    const url = `${window.location.origin}/post/${post.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('链接已复制，去分享给朋友吧')
    } catch {
      toast.error('复制失败，请手动复制地址栏链接')
    }
  }

  const actionButtonClass = (active: boolean) =>
    cn(
      'press-feedback inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 text-xs transition-colors',
      active ? 'text-[var(--color-brand)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
    )

  return (
    <article
      onClick={flat ? undefined : openDetail}
      className={cn(
        flat
          ? ''
          : 'hover-lift cursor-pointer rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-4 shadow-[var(--shadow-card)] sm:p-5',
      )}
    >
      {/* 人格化头部 */}
      <div className="flex items-center gap-3">
        <Link
          to={`/author/${post.author.id}`}
          aria-label={`查看 ${post.author.nickname} 的主页`}
          onClick={(event) => event.stopPropagation()}
        >
          <Avatar name={post.author.nickname} src={post.author.avatarUrl} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          {/* 昵称链接收窄到内容宽：只有点到头像/名字才进作者页，右侧空白冒泡到卡片进帖子详情 */}
          <Link
            to={`/author/${post.author.id}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-block max-w-full truncate align-top text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--color-brand)]"
          >
            {post.author.nickname}
          </Link>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{formatRelativeTime(post.createdAt)}</p>
        </div>
        {post.topic ? (
          <span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand)]">
            {post.topic.name}
          </span>
        ) : null}
      </div>

      {/* 正文：默认 5 行截断 */}
      <div className="mt-3">
        <p
          className={cn(
            'whitespace-pre-wrap text-[var(--text-primary)]',
            flat ? 'text-[15px] leading-8' : 'text-sm leading-7',
            shouldTruncate ? 'line-clamp-5' : '',
          )}
        >
          {splitContentByTopics(fullContent).map((segment, index) =>
            segment.type === 'topic' ? (
              <Link
                key={`${index}-${segment.name}`}
                to={`/community/topic/${encodeURIComponent(segment.name)}`}
                onClick={(event) => event.stopPropagation()}
                className="font-medium text-[var(--color-brand)] hover:underline"
              >
                {segment.text}
              </Link>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
        {!flat && fullContent.length > TRUNCATE_THRESHOLD ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setExpanded((value) => !value)
            }}
            className="press-feedback mt-1 text-sm font-medium text-[var(--color-brand)]"
          >
            {expanded ? '收起' : '展开全部'}
          </button>
        ) : null}
      </div>

      {/* 配图（微信朋友圈式）：单图按原始比例完整展示且限制最大高度；多图用定宽宫格
          （2/4 张两列、其余三列），九张时整体也不会撞大；点击打开全屏查看 */}
      {imageUrls.length === 1 ? (
        <button
          type="button"
          aria-label="查看配图"
          onClick={(event) => {
            event.stopPropagation()
            setPreviewIndex(0)
          }}
          className="mt-3 block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
        >
          <img
            src={imageUrls[0]}
            alt="配图 1"
            loading="lazy"
            className="block h-auto max-h-[340px] w-auto max-w-full"
          />
        </button>
      ) : imageUrls.length > 1 ? (
        <div
          className={cn(
            'mt-3 grid gap-1.5',
            imageUrls.length === 2 || imageUrls.length === 4
              ? 'max-w-[300px] grid-cols-2'
              : 'max-w-[440px] grid-cols-3',
          )}
        >
          {imageUrls.map((url, index) => (
            <button
              key={`${index}-${url}`}
              type="button"
              aria-label={`查看第 ${index + 1} 张配图`}
              onClick={(event) => {
                event.stopPropagation()
                setPreviewIndex(index)
              }}
              className="block cursor-zoom-in overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
            >
              <img src={url} alt={`配图 ${index + 1}`} loading="lazy" className="aspect-square h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {post.relatedNovel ? (
        <div className="mt-3" onClick={(event) => event.stopPropagation()}>
          <NovelReferenceCard novel={post.relatedNovel} />
        </div>
      ) : null}

      {post.sharedUser ? (
        <div className="mt-3" onClick={(event) => event.stopPropagation()}>
          <AuthorReferenceCard author={post.sharedUser} />
        </div>
      ) : null}

      {/* 互动栏 */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="点赞"
            onClick={handleToggleLike}
            className={actionButtonClass(liked)}
          >
            <Heart
              className={cn(
                'h-4 w-4 transition-transform [transition-duration:var(--duration-fast)]',
                liked ? 'scale-125 fill-[var(--color-brand)]' : '',
              )}
            />
            {formatCompactCount(likeCount)}
          </button>
          <button
            type="button"
            aria-label="评论"
            onClick={(event) => {
              event.stopPropagation()
              openDetail()
            }}
            className={actionButtonClass(false)}
          >
            <MessageSquareMore className="h-4 w-4" />
            {formatCompactCount(post.commentCount)}
          </button>
          <button
            type="button"
            aria-label="收藏"
            onClick={handleToggleBookmark}
            className={actionButtonClass(favorited)}
          >
            <Star
              className={cn(
                'h-4 w-4 transition-transform [transition-duration:var(--duration-fast)]',
                favorited ? 'scale-125 fill-[var(--color-brand)]' : '',
              )}
            />
            {formatCompactCount(favoriteCount)}
          </button>
        </div>
        <button type="button" aria-label="分享" onClick={handleShare} className={actionButtonClass(false)}>
          <Share2 className="h-4 w-4" />
          分享
        </button>
      </div>

      {previewIndex !== null && imageUrls.length > 0 ? (
        <PostImageViewer images={imageUrls} initialIndex={previewIndex} onClose={() => setPreviewIndex(null)} />
      ) : null}
    </article>
  )
}
