import { useEffect, useState } from 'react'

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
