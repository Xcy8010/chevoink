import type { ReactNode } from 'react'

import { useDeviceType, useIsTouchDevice, useMobileSize, useOrientation } from '@/hooks/useDeviceType'
import { DeviceContext, type DeviceContextValue } from './device-context'

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
