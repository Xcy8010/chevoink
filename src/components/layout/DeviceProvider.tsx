import { createContext, useContext, type ReactNode } from 'react'

import {
  useDeviceType,
  useIsTouchDevice,
  useMobileSize,
  useOrientation,
  type DeviceType,
  type MobileSize,
} from '@/hooks/useDeviceType'

type DeviceContextValue = {
  device: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isTouch: boolean
  mobileSize: MobileSize
  orientation: 'portrait' | 'landscape'
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

export function DeviceProvider({ children }: { children: ReactNode }) {
  const device = useDeviceType()
  const isTouch = useIsTouchDevice()
  const mobileSize = useMobileSize()
  const orientation = useOrientation()

  const value: DeviceContextValue = {
    device,
    isMobile: device === 'mobile',
    isTablet: device === 'tablet',
    isDesktop: device === 'desktop',
    isTouch,
    mobileSize,
    orientation,
  }

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice(): DeviceContextValue {
  const context = useContext(DeviceContext)

  if (!context) {
    throw new Error('useDevice 必须在 DeviceProvider 内使用')
  }

  return context
}
