import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/** 「正在处理...」占位：无容器、银色文字光泽；首个思考/动作事件到达后 visible 翻假，自然淡出再卸载 */
export function ProcessingHint({ visible }: { visible: boolean }) {
  const [leaving, setLeaving] = useState(false)
  const wasVisibleRef = useRef(false)

  useEffect(() => {
    if (visible) {
      wasVisibleRef.current = true
      setLeaving(false)
    } else if (wasVisibleRef.current) {
      setLeaving(true)
    }
  }, [visible])

  if (!visible && !leaving) {
    return null
  }

  return (
    <p
      className={cn('px-1 text-xs', leaving ? 'animate-agent-fade-out' : 'animate-fade-in')}
      onAnimationEnd={(event) => {
        if (leaving && event.animationName === 'agent-fade-out') {
          setLeaving(false)
        }
      }}
    >
      <span className="agent-processing-shimmer">正在处理...</span>
    </p>
  )
}
