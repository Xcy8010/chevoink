import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { findFirstReadableChapterId, getNovelDetailPayload } from '@/features/discover/api'

export function useStartReading() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (novelId: string) => {
      const detail = await queryClient.ensureQueryData({
        queryKey: ['novel-detail', novelId],
        queryFn: () => getNovelDetailPayload(novelId),
      })

      return {
        novelId,
        chapterId: findFirstReadableChapterId(detail.chapters),
      }
    },
    onSuccess: ({ novelId, chapterId }) => {
      if (chapterId) {
        navigate(`/novel/${novelId}/read/${chapterId}`)
        return
      }

      navigate(`/novel/${novelId}`)
    },
  })

  return {
    startReading: mutation.mutate,
    isStarting: mutation.isPending,
    pendingNovelId: mutation.variables ?? null,
  }
}
