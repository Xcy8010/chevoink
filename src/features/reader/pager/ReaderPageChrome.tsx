import { ChevronLeft, MoreHorizontal } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import type { ToneOption } from '../reader-settings'

/**
 * 沉浸阅读信息层（方案 20 §2.5）：左上「‹ 书名」返回、左下页码、右下时间+电量、右上「…」菜单入口。
 * 常驻显示但低对比度，不随控制栏显隐闪动。
 * 由 ReaderPagedView 画进每一个页面图层（每页各一份），翻页时随页面一起进出，不会先被盖掉再重新出现。
 */

type BatteryLike = {
  level: number
  charging: boolean
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/** 电量：仅 Chrome/Android 支持 Battery Status API，不支持时返回 null 只显示时间 */
function useBatteryLevel(): { level: number; charging: boolean } | null {
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null)

  useEffect(() => {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery
    if (typeof getBattery !== 'function') return

    let disposed = false
    let handle: BatteryLike | null = null
    const sync = () => {
      if (!handle || disposed) return
      setBattery({ level: handle.level, charging: handle.charging })
    }

    void getBattery
      .call(navigator)
      .then((result: BatteryLike) => {
        if (disposed) return
        handle = result
        sync()
        handle.addEventListener('levelchange', sync)
        handle.addEventListener('chargingchange', sync)
      })
      .catch((): undefined => undefined)

    return () => {
      disposed = true
      handle?.removeEventListener('levelchange', sync)
      handle?.removeEventListener('chargingchange', sync)
    }
  }, [])

  return battery
}

/** 实时时间 HH:MM，每 20s 对一次 */
function useClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000)
    return () => window.clearInterval(timer)
  }, [])
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
}

/**
 * 时间与电量：每页各画一份信息层，故由上层调用一次再把值分发下去，
 * 避免每个页面图层各起一个定时器/电量监听，也避免各页显示的时间彼此差一分钟。
 */
export function useReaderChromeStatus(): { clock: string; batteryPercent: number | null } {
  const clock = useClock()
  const battery = useBatteryLevel()
  return { clock, batteryPercent: battery ? Math.round(battery.level * 100) : null }
}

type ReaderPageChromeProps = {
  tone: ToneOption
  /** 左上角返回按钮上的作品名 */
  novelTitle: string
  /** 全书当前页码（1 起） */
  currentPage: number
  /** 全书总页数（其余章节按字数估算） */
  totalPages: number
  /** 页码是否可用（分页未就绪时隐藏） */
  showPageNumber: boolean
  /** 实时时间 HH:MM（由 useReaderChromeStatus 提供） */
  clock: string
  /** 电量百分比，不支持 Battery API 时为 null */
  batteryPercent: number | null
  /**
   * 底部信息行的中间区（听书胶囊）：与页码、时间同一行 flex 排布，
   * 布局上就不可能互相遮挡；不听书时不要传，否则这一行会白白变高。
   */
  bottomCenter?: ReactNode
  /** 返回作品页 */
  onBack: () => void
  onMoreClick: () => void
}

export default function ReaderPageChrome({
  tone,
  novelTitle,
  currentPage,
  totalPages,
  showPageNumber,
  clock,
  batteryPercent,
  bottomCenter,
  onBack,
  onMoreClick,
}: ReaderPageChromeProps) {
  return (
    <>
      {/* 左上角「‹ 书名」：返回对应作品页 */}
      <button
        type="button"
        aria-label={`返回《${novelTitle}》作品页`}
        onClick={onBack}
        className="press-feedback absolute left-1 inline-flex h-10 max-w-[62%] items-center gap-0.5 rounded-[var(--radius-pill)] px-2 text-[13px]"
        style={{ top: 'calc(var(--safe-top) + 4px)', color: tone.text, opacity: 0.55 }}
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        <span className="truncate">{novelTitle}</span>
      </button>

      {/* 右上角「…」菜单入口 */}
      <button
        type="button"
        aria-label="更多功能"
        onClick={onMoreClick}
        className="press-feedback absolute right-1 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-pill)]"
        style={{ top: 'calc(var(--safe-top) + 4px)', color: tone.text, opacity: 0.55 }}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {/* 底部信息层：左页码 / 中听书胶囊 / 右时间+电量，同一行 flex 排布互不侵占 */}
      <div
        className="pointer-events-none absolute inset-x-0 flex items-center justify-between gap-2 px-5 text-[11px] tabular-nums"
        style={{
          // 有胶囊时整行变高，但把行的垂直中心保持在原位（页码/时间不跟着位移），
          // 且整行仍收在 PAGE_INSET.bottom 的预留带内，正文一个字都不挡
          bottom: bottomCenter ? 'calc(var(--safe-bottom) + 4px)' : 'calc(var(--safe-bottom) + 12px)',
          color: tone.text,
        }}
      >
        <span className="shrink-0" style={{ opacity: 0.45 }}>
          {showPageNumber ? `${currentPage}/${totalPages}` : ''}
        </span>
        {bottomCenter ? (
          <span className="pointer-events-auto flex min-w-0 flex-1 justify-center">{bottomCenter}</span>
        ) : null}
        <span className="flex shrink-0 items-center gap-1.5" style={{ opacity: 0.45 }}>
          <span>{clock}</span>
          {batteryPercent !== null ? (
            <span className="flex items-center gap-1">
              {/* 电池外壳 + 电量填充，跟随阅读底色自适应 */}
              <span
                className="relative inline-flex h-[10px] w-[20px] items-center rounded-[3px] border"
                style={{ borderColor: 'currentColor' }}
              >
                <span
                  className="ml-[1px] h-[6px] rounded-[1px]"
                  style={{
                    width: `${Math.max(4, (batteryPercent / 100) * 16)}px`,
                    background: 'currentColor',
                  }}
                />
                <span
                  className="absolute -right-[3px] h-[4px] w-[2px] rounded-r-[1px]"
                  style={{ background: 'currentColor' }}
                />
              </span>
              <span>{batteryPercent}%</span>
            </span>
          ) : null}
        </span>
      </div>
    </>
  )
}
