import AppState from '@/components/ui/AppState'
import { ReaderSkeleton } from '@/components/ui/Skeleton'
import { useDevice } from '@/components/layout/device-context'
import ReaderDesktop from '@/features/reader/layouts/ReaderDesktop'
import ReaderMobile from '@/features/reader/layouts/ReaderMobile'
import ReaderTablet from '@/features/reader/layouts/ReaderTablet'
import { useReaderState } from '@/features/reader/useReaderState'

/**
 * 阅读器入口：共享数据层 + 三端布局分发。
 * - 手机：全屏沉浸手势阅读（ReaderMobile）
 * - 平板：横屏双栏 / 竖屏单栏（ReaderTablet）
 * - 电脑：目录 + 正文 + 评论三栏（ReaderDesktop）
 */
export default function ReaderPage() {
  const { device } = useDevice()
  const state = useReaderState()

  if (!state.novelId || !state.chapterId) {
    return (
      <AppState
        tone="error"
        title="这一章暂时没找到"
        description="换一章继续看看，或者回到详情页重新选择目录。"
        primaryAction={{ label: '回到发现页', href: '/discover' }}
      />
    )
  }

  if (state.readerQuery.isLoading) {
    return <ReaderSkeleton />
  }

  if (state.readerQuery.isError) {
    return (
      <AppState
        tone="error"
        title="这一章暂时没有打开"
        description={
          state.readerQuery.error instanceof Error
            ? state.readerQuery.error.message
            : '连接似乎中断了，请稍后再试。'
        }
        primaryAction={{
          label: state.readerQuery.isFetching ? '重新连接中...' : '重新连接',
          onClick: () => void state.readerQuery.refetch(),
        }}
        secondaryAction={{ label: '回到详情页', href: `/novel/${state.novelId}` }}
      />
    )
  }

  if (device === 'mobile') {
    return <ReaderMobile state={state} />
  }

  if (device === 'tablet') {
    return <ReaderTablet state={state} />
  }

  return <ReaderDesktop state={state} />
}
