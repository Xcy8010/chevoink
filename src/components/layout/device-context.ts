import { createContext, useContext } from 'react'

import type { DeviceType, MobileSize } from '@/hooks/useDeviceType'

export type DeviceContextValue = {
  device: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isTouch: boolean
  mobileSize: MobileSize
  orientation: 'portrait' | 'landscape'
}

export const DeviceContext = createContext<DeviceContextValue | null>(null)

export function useDevice(): DeviceContextValue {
  const context = useContext(DeviceContext)

  if (!context) {
    throw new Error('useDevice 必须在 DeviceProvider 内使用')
  }

  return context
}
