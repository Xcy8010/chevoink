import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import {
  listParagraphUnderlines,
  removeParagraphUnderline,
  saveParagraphUnderline,
} from '@/features/community/api'
import { useShellStore } from '@/store/useShellStore'

/**
 * 段落划线（方案 20 §2.7）：按章拉取已划线段落序号，切换时乐观更新。
 * 未登录不请求，本地不落缓存（划线属于账号资产，跨设备一致由服务端保证）。
 */

function underlinesQueryKey(chapterId: string) {
  return ['reader-underlines', chapterId] as const
}

export function useParagraphUnderlines(novelId: string, chapterId: string) {
  const queryClient = useQueryClient()
  const authStatus = useShellStore((state) => state.authStatus)
  const enabled = authStatus === 'authenticated' && Boolean(chapterId)

  const listQuery = useQuery({
    queryKey: underlinesQueryKey(chapterId),
    queryFn: () => listParagraphUnderlines(chapterId),
    enabled,
    staleTime: 60_000,
  })

  const underlined = useMemo(() => {
    const indexes = listQuery.data?.paragraphIndexes
    return new Set(Array.isArray(indexes) ? indexes : [])
  }, [listQuery.data])

  const mutation = useMutation({
    mutationFn: async ({ paragraphIndex, next }: { paragraphIndex: number; next: boolean }) => {
      if (next) {
        await saveParagraphUnderline({ novelId, chapterId, paragraphIndex })
        return
      }

      await removeParagraphUnderline(chapterId, paragraphIndex)
    },
    onMutate: ({ paragraphIndex, next }) => {
      const key = underlinesQueryKey(chapterId)
      const previous = queryClient.getQueryData<{ paragraphIndexes: number[] }>(key)
      const current = previous?.paragraphIndexes ?? []
      const optimistic = next
        ? Array.from(new Set([...current, paragraphIndex])).sort((left, right) => left - right)
        : current.filter((index) => index !== paragraphIndex)
      queryClient.setQueryData(key, { paragraphIndexes: optimistic })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(underlinesQueryKey(chapterId), context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: underlinesQueryKey(chapterId) })
    },
  })

  /** 切换划线，返回切换后的状态（未登录返回 null，交由调用方拉登录弹窗） */
  function toggleUnderline(paragraphIndex: number): boolean | null {
    if (authStatus !== 'authenticated' || !chapterId) {
      return null
    }

    const next = !underlined.has(paragraphIndex)
    mutation.mutate({ paragraphIndex, next })
    return next
  }

  return {
    underlined,
    toggleUnderline,
    isSyncing: mutation.isPending,
  }
}

export type ParagraphUnderlines = ReturnType<typeof useParagraphUnderlines>
