import { useEffect, useState } from 'react'

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function getDeviceType(width: number): DeviceType {
  if (width < 768) return 'mobile'
  if (width < 1280) return 'tablet'
  return 'desktop'
}

export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>(() =>
    typeof window === 'undefined' ? 'desktop' : getDeviceType(window.innerWidth),
  )

  useEffect(() => {
    let rafId = 0
    const handleResize = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setDevice(getDeviceType(window.innerWidth))
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return device
}

export function useIsTouchDevice(): boolean {
  const [isTouch] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  )

  return isTouch
}

/** 手机端内部细分：小屏 / 标准 / 大屏 */
export type MobileSize = 'small' | 'standard' | 'large'

export function useMobileSize(): MobileSize {
  const [size, setSize] = useState<MobileSize>(() => {
    if (typeof window === 'undefined') return 'standard'
    const width = window.innerWidth
    if (width < 375) return 'small'
    if (width < 415) return 'standard'
    return 'large'
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setSize(width < 375 ? 'small' : width < 415 ? 'standard' : 'large')
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return size
}

/** 平板横竖屏方向检测（仅平板端有意义） */
export function useOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() =>
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight
      ? 'landscape'
      : 'portrait',
  )

  useEffect(() => {
    const handleResize = () => {
      setOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return orientation
}
