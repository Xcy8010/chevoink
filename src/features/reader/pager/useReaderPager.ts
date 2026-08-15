import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * 换章落点意图：换章后首次分页就绪（页数变化）时用它钉页码。
 * 落点必须按「新章」页数计算，而换章 navigate 那一帧 pages 还是旧章的，
 * 上层直接 jumpTo 会把旧章页号带进新章，因此意图延后到页数就绪时执行。
 */
export type PagerLanding = 'first' | 'last' | 'cover' | { percent: number } | null

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
  /**
   * 换章落点意图：由上层在提交后的 layout effect 里写入（非空即待消费），
   * 本 hook 在新章分页就绪（页数变化）时读取并消费一次。
   * 不能走渲染期 prop：渲染期 setState 会触发「丢弃本次渲染再重渲染」，
   * 意图产出渲染被丢弃时 prop 在提交的渲染里永远是 null，意图送不进来
   */
  landingRef: { current: PagerLanding }
  /** 落点归属标识（如章节 id）：换章时必变，保证新旧章页数相同时落点 effect 也会触发 */
  landingKey: string | null
  /** 章末继续翻：进入下一章 */
  onOverflowNext: () => void
  /** 章首往前翻：回到上一章末页 */
  onOverflowPrev: () => void
}

export function useReaderPager({
  totalPages,
  hasCover,
  landingRef,
  landingKey,
  onOverflowNext,
  onOverflowPrev,
}: UseReaderPagerArgs) {
  const minIndex = hasCover ? COVER_PAGE_INDEX : 0
  const maxIndex = Math.max(0, totalPages - 1)
  const [pageIndex, setPageIndexState] = useState(minIndex)

  // 页数变化（首次分页完成/新章分页就绪/重排）：有待消费的落点意图就钉页码，
  // 否则只把页码夹回合法区间（重排场景）。
  // 用 useLayoutEffect：绘制前钉页码，跟手跨章的落定帧不会先画出「旧页号拼新章」
  useLayoutEffect(() => {
    if (totalPages === 0) return
    const pendingLanding = landingRef.current
    if (!pendingLanding) {
      setPageIndexState((current) => {
        if (current > maxIndex) return maxIndex
        if (current < minIndex) return minIndex
        return current
      })
      return
    }
    landingRef.current = null
    const target =
      pendingLanding === 'last'
        ? maxIndex
        : pendingLanding === 'cover'
          ? COVER_PAGE_INDEX
          : typeof pendingLanding === 'object'
            ? Math.round(pendingLanding.percent * maxIndex)
            : 0
    setPageIndexState(Math.min(maxIndex, Math.max(minIndex, target)))
  }, [totalPages, minIndex, maxIndex, landingKey, landingRef])

  const jumpTo = useCallback(
    (target: number) => {
      landingRef.current = null
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
      if (current < maxIndex) {
        // 章内翻页成功：页码已是用户当前位置，作废未消费的换章落点
        landingRef.current = null
        return current + 1
      }
      overflowRef.current.onOverflowNext()
      return current
    })
  }, [maxIndex])

  const requestPrev = useCallback(() => {
    setPageIndexState((current) => {
      if (current > minIndex) {
        landingRef.current = null
        return current - 1
      }
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
