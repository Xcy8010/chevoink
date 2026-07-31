import { useEffect, useState } from 'react'

/** 软键盘占高（px）：基于 visualViewport，键盘收起或不支持时为 0 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) {
      return
    }

    const update = () => {
      const next = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      // 小于 80px 视为地址栏收放等噪声，不算键盘
      setInset(next < 80 ? 0 : Math.round(next))
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
