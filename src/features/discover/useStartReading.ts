import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { asArray, findFirstReadableChapterId, getNovelDetailPayload, isPublicReadableChapter } from '@/features/discover/api'
import { getReadingProgress } from '@/features/home/reading-progress'

export function useStartReading() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (vars: { novelId: string; navState?: { fromDetailIdx: number } }) => {
      const { novelId } = vars
      const detail = await queryClient.ensureQueryData({
        queryKey: ['novel-detail', novelId],
        queryFn: () => getNovelDetailPayload(novelId),
      })

      // 读过的书优先回到上次读到的章节（章内位置由阅读器恢复）
      const progress = getReadingProgress(novelId)
      const chapters = asArray(detail.chapters)
      const progressChapter = progress
        ? chapters.find((chapter) => chapter.id === progress.chapterId && isPublicReadableChapter(chapter))
        : null

      return {
        novelId,
        chapterId: progressChapter?.id ?? findFirstReadableChapterId(chapters),
        navState: vars.navState,
      }
    },
    onSuccess: ({ novelId, chapterId, navState }) => {
      if (chapterId) {
        navigate(`/novel/${novelId}/read/${chapterId}`, navState ? { state: navState } : undefined)
        return
      }

      navigate(`/novel/${novelId}`)
    },
  })

  return {
    startReading: (novelId: string, navState?: { fromDetailIdx: number }) => mutation.mutate({ novelId, navState }),
    isStarting: mutation.isPending,
    pendingNovelId: mutation.variables?.novelId ?? null,
  }
}
