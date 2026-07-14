import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import AppState from '@/components/ui/AppState'
import { getMe } from '@/features/community/api'
import { createNovelWorkspace } from '@/features/studio/api'
import StudioWorkspace from '@/features/studio/StudioWorkspace'

const INITIAL_NOVEL_TITLE = '我的第一部作品'
const INITIAL_NOVEL_SUMMARY = '先创建一部作品，再继续完善简介、章节和封面。'
const STUDIO_LAST_NOVEL_STORAGE_KEY = 'studio-last-novel-id'

export default function StudioPage() {
  const { novelId } = useParams()
  const navigate = useNavigate()

  const meQuery = useQuery({
    queryKey: ['community', 'me'],
    queryFn: getMe,
    enabled: !novelId,
    refetchOnWindowFocus: false,
  })

  const createNovelMutation = useMutation({
    mutationFn: () =>
      createNovelWorkspace({
        title: INITIAL_NOVEL_TITLE,
        summary: INITIAL_NOVEL_SUMMARY,
        tags: [],
        visibility: 'private',
        status: 'draft',
      }),
    onSuccess: (novel) => {
      window.localStorage.setItem(STUDIO_LAST_NOVEL_STORAGE_KEY, novel.id)
      navigate(`/studio/novel/${novel.id}`, { replace: true })
    },
  })

  const studioEntryNovelId = useMemo(() => {
    const authoredNovels = [...(meQuery.data?.authoredNovels ?? [])].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    const draftNovelId = meQuery.data?.drafts?.[0]?.novelId ?? null
    const draftNovel = authoredNovels.find((item) => item.id === draftNovelId) ?? null
    const lastNovelId =
      typeof window !== 'undefined' ? window.localStorage.getItem(STUDIO_LAST_NOVEL_STORAGE_KEY) : null
    const lastNovel =
      lastNovelId ? authoredNovels.find((item) => item.id === lastNovelId) ?? null : null

    if (lastNovel) {
      return lastNovel.id
    }

    if (draftNovel) {
      return draftNovel.id
    }

    if (authoredNovels[0]) {
      return authoredNovels[0].id
    }

    if (draftNovelId) {
      return draftNovelId
    }

    if (!meQuery.data?.user?.id) {
      return null
    }

    return null
  }, [meQuery.data?.authoredNovels, meQuery.data?.drafts, meQuery.data?.user?.id])

  useEffect(() => {
    if (novelId) {
      return
    }

    if (!meQuery.isSuccess || !studioEntryNovelId) {
      return
    }

    navigate(`/studio/novel/${studioEntryNovelId}`, { replace: true })
  }, [meQuery.isSuccess, navigate, novelId, studioEntryNovelId])

  if (novelId) {
    return <StudioWorkspace />
  }

  if (meQuery.isError) {
    return (
      <AppState
        tone="error"
        title="创作中心暂时无法打开"
        description={
          (meQuery.error instanceof Error && meQuery.error.message) ||
          '请稍后重试。'
        }
        primaryAction={{
          label: '重新连接',
          onClick: () => {
            void meQuery.refetch()
          },
        }}
        className="min-h-[360px]"
      />
    )
  }

  if (createNovelMutation.isError) {
    return (
      <AppState
        tone="error"
        title="新建作品暂时失败"
        description={
          createNovelMutation.error instanceof Error ? createNovelMutation.error.message : '请稍后重试。'
        }
        primaryAction={{
          label: '重新创建',
          onClick: () => {
            createNovelMutation.reset()
            createNovelMutation.mutate()
          },
        }}
        className="min-h-[360px]"
      />
    )
  }

  if (meQuery.isSuccess && !studioEntryNovelId) {
    return (
      <AppState
        tone="empty"
        title="当前没有作品"
        description="点击新建一个作品吧！"
        primaryAction={{
          label: createNovelMutation.isPending ? '正在创建作品...' : '新建一个作品',
          onClick: () => {
            if (createNovelMutation.isPending) {
              return
            }

            createNovelMutation.mutate()
          },
        }}
        className="min-h-[360px]"
      />
    )
  }

  return (
    <AppState
      tone="loading"
      title="正在打开创作中心"
      description={
        createNovelMutation.isPending ? '正在为你创建新的作品。' : '正在整理你上次退出的作品和最近创作记录。'
      }
      className="min-h-[360px]"
    />
  )
}
