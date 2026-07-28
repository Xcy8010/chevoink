import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useToast } from '@/components/ui/Toast'
import { requestJson } from '@/app/api-client'
import { copyToClipboard } from '@/lib/clipboard'
import { deleteComment, setNovelFavorite, updateComment } from '@/features/community/api'
import {
  asArray,
  getAuthorName,
  getCoverUrl,
  getDisplayTitle,
  getNovelDetailPayload,
  getNovelSummary,
  getSafeTags,
  isPublicReadableChapter,
  listCommentsByTarget,
} from '@/features/discover/api'
import { useStartReading } from '@/features/discover/useStartReading'
import { getReadingProgress } from '@/features/home/reading-progress'
import { isInShelf, toggleShelf } from '@/features/home/local-shelf'
import { pushShelfAdd, pushShelfRemove } from '@/features/home/reading-sync'
import { getStudioPayload, updateNovelMeta, uploadNovelCover } from '@/features/studio/api'
import { buildFixedNovelCoverDataUrl, downloadCoverAssetImage, type NovelCoverCropState } from '@/features/studio/cover-image'
import { useShellStore } from '@/store/useShellStore'
import type { Comment, CreateCommentResponse } from '../../../shared/contracts'

export type DetailTab = 'directory' | 'comments' | 'related'

export const novelStatusMap = {
  draft: '草稿',
  published: '连载中',
  archived: '已完结',
} as const

export const novelVisibilityMap = {
  public: '公开',
  followers: '关注可见',
  private: '仅自己可见',
} as const

export const formatDetailDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '暂未更新'

export const formatDetailWordCount = (value: number) => {
  if (value >= 10000) {
    const formatted = (Math.round((value / 10000) * 10) / 10).toFixed(1).replace(/\.0$/, '')
    return `${formatted}万字`
  }

  return `${new Intl.NumberFormat('zh-CN').format(value)} 字`
}

function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，、]+/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

/** 小说详情页三端共享状态层 */
export function useNovelDetailState() {
  const { novelId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const sessionUser = useShellStore((state) => state.sessionUser)
  const authStatus = useShellStore((state) => state.authStatus)

  const [activeTab, setActiveTab] = useState<DetailTab>('directory')
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const coverInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingCoverUploadFile, setPendingCoverUploadFile] = useState<File | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    displayTitle: '',
    summary: '',
    tagsText: '',
  })
  const [shelfVersion, setShelfVersion] = useState(0)
  const [commentDraft, setCommentDraft] = useState('')
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null)
  // 正在编辑的自己的评论；非空时发表按钮变为保存修改
  const [editingComment, setEditingComment] = useState<Comment | null>(null)
  // 作品根评论的评星草稿：0 表示未选星
  const [ratingDraft, setRatingDraft] = useState(0)

  const fromStudio = searchParams.get('from') === 'studio'
  const returnTo = searchParams.get('returnTo')

  const detailQuery = useQuery({
    queryKey: ['novel-detail', novelId],
    queryFn: () => getNovelDetailPayload(novelId ?? ''),
    enabled: Boolean(novelId),
  })
  const commentsQuery = useQuery({
    queryKey: ['comments', 'novel', novelId],
    queryFn: () => listCommentsByTarget('novel', novelId ?? '', { pageSize: 20 }),
    enabled: Boolean(novelId),
  })
  const { startReading, isStarting, pendingNovelId } = useStartReading()

  const detail = detailQuery.data ?? null
  const chapters = asArray(detail?.chapters)
  const topComments = asArray(detail?.topComments)
  const relatedNovels = asArray(detail?.relatedNovels)
  // 自己的根评论固定排在最前，其余保持服务端顺序（sort 稳定）
  const novelComments = useMemo(() => {
    const items = asArray(commentsQuery.data?.items)
    if (!sessionUser?.id) {
      return items
    }
    return [...items].sort(
      (left, right) =>
        Number(right.author?.id === sessionUser.id && !right.parentId) -
        Number(left.author?.id === sessionUser.id && !left.parentId),
    )
  }, [commentsQuery.data, sessionUser?.id])
  const publishedChapters = [...chapters]
    .filter(isPublicReadableChapter)
    .sort((left, right) => left.orderIndex - right.orderIndex)
  const actualWordCount = useMemo(
    () =>
      chapters.reduce(
        (total, chapter) => total + (typeof chapter.wordCount === 'number' ? chapter.wordCount : 0),
        0,
      ),
    [chapters],
  )
  const actualChapterCount = chapters.length
  const firstPublishedChapter = publishedChapters[0] ?? null
  const latestPublishedChapter = publishedChapters[publishedChapters.length - 1] ?? null
  const detailTitle = detail?.novel ? getDisplayTitle(detail.novel) : ''
  const detailSummary = getNovelSummary(detail?.novel?.summary ?? '')
  const detailTags = getSafeTags(detail?.novel?.tags ?? [])
  const detailCoverUrl = getCoverUrl(detail?.novel?.coverUrl ?? null)
  const authorName = detail?.novel ? getAuthorName(detail.novel.author) : ''
  const authorId = detail?.novel?.author?.id ?? null
  const canEditNovelPage = Boolean(sessionUser?.id && detail?.novel && sessionUser.id === detail.novel.author.id)
  const editNovelHref = detail?.novel ? `/studio/novel/${detail.novel.id}?panel=meta` : '/studio'
  const editCoverHref = detail?.novel ? `/studio/novel/${detail.novel.id}?panel=cover` : '/studio'
  const backHref = fromStudio && returnTo ? returnTo : '/discover'
  const previewSearch = fromStudio ? `?from=studio${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}` : ''

  const readingProgress = useMemo(
    () => (novelId && !fromStudio ? getReadingProgress(novelId) : null),
    // detailQuery.data 变化时重读一次，保证从阅读器返回后标记及时刷新
    [novelId, fromStudio, detailQuery.dataUpdatedAt],
  )
  const inShelf = useMemo(
    () => (novelId ? isInShelf(novelId) : false),
    // shelfVersion 用于本地书架变更后的重渲染
    [novelId, shelfVersion],
  )
  const isStartingThis = Boolean(detail?.novel && isStarting && pendingNovelId === detail.novel.id)

  const studioPayloadQuery = useQuery({
    queryKey: ['novel-detail-cover-history', novelId],
    queryFn: () => getStudioPayload(novelId ?? ''),
    enabled: Boolean(novelId && canEditNovelPage && isEditing),
  })
  const coverHistory = studioPayloadQuery.data?.coverAssets ?? []

  useEffect(() => {
    if (!detail?.novel) {
      return
    }

    setEditForm({
      title: detail.novel.title,
      displayTitle: detail.novel.displayTitle ?? '',
      summary: detail.novel.summary ?? '',
      tagsText: getSafeTags(detail.novel.tags).join('，'),
    })
  }, [detail?.novel])

  const editNovelMutation = useMutation({
    mutationFn: async () => {
      if (!detail?.novel) {
        throw new Error('作品详情还没有准备好，请稍后再试。')
      }

      return updateNovelMeta(detail.novel.id, {
        title: editForm.title.trim(),
        displayTitle: editForm.displayTitle.trim() || null,
        summary: editForm.summary.trim(),
        tags: parseTagInput(editForm.tagsText),
      })
    },
    onSuccess: async (novel) => {
      queryClient.setQueryData(['novel-detail', novelId], (current: typeof detailQuery.data) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                ...novel,
              },
            }
          : current,
      )
      setIsEditing(false)
      await queryClient.invalidateQueries({ queryKey: ['novel-detail', novelId] })
    },
  })

  const uploadCoverMutation = useMutation({
    mutationFn: async (crop: NovelCoverCropState) => {
      if (!detail?.novel) {
        throw new Error('作品详情还没有准备好，请稍后再试。')
      }

      if (!pendingCoverUploadFile) {
        throw new Error('还没有选择要上传的封面图片。')
      }

      const coverDataUrl = await buildFixedNovelCoverDataUrl(pendingCoverUploadFile, crop)
      return uploadNovelCover(detail.novel.id, { coverDataUrl })
    },
    onSuccess: async ({ novel, asset }) => {
      queryClient.setQueryData(['novel-detail', novelId], (current: typeof detailQuery.data) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                ...novel,
                coverUrl: asset.imageUrl,
                coverAssetId: asset.id,
              },
            }
          : current,
      )
      setPendingCoverUploadFile(null)
      await queryClient.invalidateQueries({ queryKey: ['novel-detail-cover-history', novelId] })
      await queryClient.invalidateQueries({ queryKey: ['novel-detail', novelId] })
    },
    onError: () => {
      setPendingCoverUploadFile(null)
    },
  })

  const applyHistoryCoverMutation = useMutation({
    mutationFn: async (assetId: string) => {
      if (!detail?.novel) {
        throw new Error('作品详情还没有准备好，请稍后再试。')
      }

      return updateNovelMeta(detail.novel.id, { coverAssetId: assetId })
    },
    onSuccess: async (novel) => {
      queryClient.setQueryData(['novel-detail', novelId], (current: typeof detailQuery.data) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                ...novel,
              },
            }
          : current,
      )
      await queryClient.invalidateQueries({ queryKey: ['novel-detail', novelId] })
      await queryClient.invalidateQueries({ queryKey: ['novel-detail-cover-history', novelId] })
    },
  })

  const createCommentMutation = useMutation({
    mutationFn: async () => {
      if (!novelId || !commentDraft.trim()) {
        throw new Error('请先写下想说的内容。')
      }

      // 编辑模式：改走 PATCH，根评论同步更新评星
      if (editingComment) {
        const payload = await updateComment(editingComment.id, {
          content: commentDraft.trim(),
          ...(editingComment.parentId ? {} : { rating: ratingDraft }),
        })
        return payload.comment
      }

      // requestJson 已解包到 data，这里的泛型必须是 data 的形状
      const payload = await requestJson<CreateCommentResponse['data']>('/api/comments', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'novel',
          targetId: novelId,
          content: commentDraft.trim(),
          parentId: replyTarget?.id,
          // 仅根评论携带评星，回复不记分
          ...(replyTarget ? {} : { rating: ratingDraft }),
        }),
      })
      return payload.comment
    },
    onSuccess: async () => {
      const wasEditing = Boolean(editingComment)
      setCommentDraft('')
      setReplyTarget(null)
      setEditingComment(null)
      setRatingDraft(0)
      toast.success(wasEditing ? '评论已更新' : '评论已发表')
      await queryClient.invalidateQueries({ queryKey: ['comments', 'novel', novelId] })
      await queryClient.invalidateQueries({ queryKey: ['novel-detail', novelId] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '评论发表失败，请稍后再试。')
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: async (_result, commentId) => {
      if (editingComment?.id === commentId) {
        setEditingComment(null)
        setCommentDraft('')
        setRatingDraft(0)
      }
      toast.success('评论已删除')
      await queryClient.invalidateQueries({ queryKey: ['comments', 'novel', novelId] })
      await queryClient.invalidateQueries({ queryKey: ['novel-detail', novelId] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除失败，请稍后再试。')
    },
  })

  const favoritedByViewer = Boolean(detail?.novel?.favoritedByViewer)

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!detail?.novel) {
        throw new Error('作品详情还没有准备好，请稍后再试。')
      }
      return setNovelFavorite(detail.novel.id, !favoritedByViewer)
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['novel-detail', novelId], (current: typeof detailQuery.data) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                favoritedByViewer: result.favorited,
                favoriteCount: result.favoriteCount,
              },
            }
          : current,
      )
      if (result.favorited) {
        toast.success('已收藏这部作品')
      } else {
        toast.info('已取消收藏')
      }
      // 个人页「收藏」面板的列表同步刷新
      void queryClient.invalidateQueries({ queryKey: ['profile', 'favorite-novels'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '操作失败，请稍后再试。')
    },
  })

  function handleStartReading() {
    if (!firstPublishedChapter || !detail?.novel) {
      return
    }

    if (fromStudio) {
      navigate(`/novel/${detail.novel.id}/read/${firstPublishedChapter.id}${previewSearch}`)
      return
    }

    startReading(detail.novel.id)
  }

  /** 继续阅读：优先回到本地进度章节 */
  function handleContinueReading() {
    if (!detail?.novel) {
      return
    }

    if (readingProgress && publishedChapters.some((chapter) => chapter.id === readingProgress.chapterId)) {
      navigate(`/novel/${detail.novel.id}/read/${readingProgress.chapterId}`)
      return
    }

    handleStartReading()
  }

  function handleToggleShelf() {
    if (!detail?.novel) {
      return
    }

    const added = toggleShelf({
      novelId: detail.novel.id,
      title: detailTitle,
      coverUrl: detailCoverUrl,
    })
    setShelfVersion((version) => version + 1)
    // 写穿服务端，保证不同设备书架内的书一致
    if (added) {
      pushShelfAdd(detail.novel.id, detailTitle, detailCoverUrl)
      toast.success('已加入书架')
    } else {
      pushShelfRemove(detail.novel.id)
      toast.info('已从书架移除')
    }
  }

  async function handleShare() {
    const shareUrl = `${window.location.origin}/novel/${novelId}`

    if (await copyToClipboard(shareUrl)) {
      toast.success('链接已复制，去分享给朋友吧')
    } else {
      toast.error('复制失败，请手动复制地址栏链接')
    }
  }

  function handleSelectLocalCover() {
    coverInputRef.current?.click()
  }

  function handleDownloadHistoryCover(imageUrl: string, createdAt: string | null) {
    const baseTitle = (detailTitle || '作品').replace(/[\\/:*?"<>|]+/g, '').trim() || '作品'
    const suffix = createdAt ? new Date(createdAt).toISOString().slice(0, 10) : 'cover'
    void downloadCoverAssetImage(imageUrl, `${baseTitle}-封面-${suffix}.jpg`)
  }

  function handleSubmitComment() {
    if (authStatus !== 'authenticated') {
      navigate('/auth')
      return
    }

    // 新发/编辑作品根评论都要求已点星；回复不需要
    const needsRating = editingComment ? !editingComment.parentId : !replyTarget
    if (needsRating && ratingDraft < 1) {
      toast.error('请先为作品点亮星级评分')
      return
    }

    createCommentMutation.mutate()
  }

  /** 把自己的评论装进输入框进入编辑模式 */
  function handleStartEditComment(comment: Comment) {
    setEditingComment(comment)
    setReplyTarget(null)
    setCommentDraft(comment.content)
    setRatingDraft(typeof comment.rating === 'number' ? comment.rating : 0)
  }

  function handleCancelEditComment() {
    setEditingComment(null)
    setCommentDraft('')
    setRatingDraft(0)
  }

  function handleDeleteComment(comment: Comment) {
    if (deleteCommentMutation.isPending) {
      return
    }
    if (!window.confirm('确定删除这条评论吗？它的回复也会一并删除。')) {
      return
    }
    deleteCommentMutation.mutate(comment.id)
  }

  function handleToggleFavorite() {
    if (authStatus !== 'authenticated') {
      navigate('/auth')
      return
    }

    if (toggleFavoriteMutation.isPending) {
      return
    }

    toggleFavoriteMutation.mutate()
  }

  return {
    novelId: novelId ?? null,
    navigate,
    sessionUser,
    authStatus,
    fromStudio,
    backHref,
    previewSearch,
    detailQuery,
    commentsQuery,
    detail,
    chapters,
    publishedChapters,
    topComments,
    relatedNovels,
    novelComments,
    actualWordCount,
    actualChapterCount,
    firstPublishedChapter,
    latestPublishedChapter,
    detailTitle,
    detailSummary,
    detailTags,
    detailCoverUrl,
    authorName,
    authorId,
    canEditNovelPage,
    editNovelHref,
    editCoverHref,
    readingProgress,
    inShelf,
    isStartingThis,
    activeTab,
    setActiveTab,
    summaryExpanded,
    setSummaryExpanded,
    isEditing,
    setIsEditing,
    editForm,
    setEditForm,
    coverInputRef,
    pendingCoverUploadFile,
    setPendingCoverUploadFile,
    coverHistory,
    studioPayloadQuery,
    editNovelMutation,
    uploadCoverMutation,
    applyHistoryCoverMutation,
    commentDraft,
    setCommentDraft,
    replyTarget,
    setReplyTarget,
    editingComment,
    ratingDraft,
    setRatingDraft,
    favoritedByViewer,
    toggleFavoriteMutation,
    createCommentMutation,
    deleteCommentMutation,
    handleStartReading,
    handleContinueReading,
    handleToggleShelf,
    handleToggleFavorite,
    handleShare,
    handleSelectLocalCover,
    handleDownloadHistoryCover,
    handleSubmitComment,
    handleStartEditComment,
    handleCancelEditComment,
    handleDeleteComment,
  }
}

export type NovelDetailState = ReturnType<typeof useNovelDetailState>
