import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 分页阅读的页码窗口与章边界导航（方案 20 §2.2）。
 *
 * - 页码范围：有代入页时从 -1 开始（-1 = 代入页），否则 0 开始；
 * - 翻到章末再往后 / 章首再往前时交给上层换章（`onOverflowNext` / `onOverflowPrev`）；
 * - 重排（改字号、旋屏）后由上层调用 `jumpTo` 回到同一处正文；
 * - 具体的跟手动画由 `ReaderPagedView` 负责，这里只管"当前是第几页"。
 */

export const COVER_PAGE_INDEX = -1

type UseReaderPagerArgs = {
  totalPages: number
  /** 是否把代入页作为第 -1 页纳入翻页序列 */
  hasCover: boolean
  /** 章末继续翻：进入下一章 */
  onOverflowNext: () => void
  /** 章首往前翻：回到上一章末页 */
  onOverflowPrev: () => void
}

export function useReaderPager({
  totalPages,
  hasCover,
  onOverflowNext,
  onOverflowPrev,
}: UseReaderPagerArgs) {
  const minIndex = hasCover ? COVER_PAGE_INDEX : 0
  const maxIndex = Math.max(0, totalPages - 1)
  const [pageIndex, setPageIndexState] = useState(minIndex)

  // 页数变化（首次分页完成/重排）后把页码夹回合法区间
  useEffect(() => {
    setPageIndexState((current) => {
      if (current > maxIndex) return maxIndex
      if (current < minIndex) return minIndex
      return current
    })
  }, [minIndex, maxIndex])

  const jumpTo = useCallback(
    (target: number) => {
      setPageIndexState(Math.min(maxIndex, Math.max(minIndex, target)))
    },
    [minIndex, maxIndex],
  )

  const overflowRef = useRef({ onOverflowNext, onOverflowPrev })
  overflowRef.current = { onOverflowNext, onOverflowPrev }

  /** 章内还有下一页/上一页（决定翻页动画是否在本章内完成） */
  const hasNextPage = pageIndex < maxIndex
  const hasPrevPage = pageIndex > minIndex

  const requestNext = useCallback(() => {
    setPageIndexState((current) => {
      if (current < maxIndex) return current + 1
      overflowRef.current.onOverflowNext()
      return current
    })
  }, [maxIndex])

  const requestPrev = useCallback(() => {
    setPageIndexState((current) => {
      if (current > minIndex) return current - 1
      overflowRef.current.onOverflowPrev()
      return current
    })
  }, [minIndex])

  return {
    pageIndex,
    minIndex,
    maxIndex,
    totalPages,
    hasNextPage,
    hasPrevPage,
    isCoverPage: pageIndex === COVER_PAGE_INDEX,
    jumpTo,
    requestNext,
    requestPrev,
  }
}

export type ReaderPager = ReturnType<typeof useReaderPager>
