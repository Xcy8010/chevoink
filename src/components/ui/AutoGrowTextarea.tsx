import type { TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type AutoGrowTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'rows' | 'style'> & {
  value: string
  /** 外层容器类名：承担外边距等布局，排版类名请放在 className 上 */
  wrapperClassName?: string
}

/**
 * 高度随内容自增的 textarea（纯 CSS 影子层，不做 JS 量高）。
 *
 * 影子 div 与 textarea 叠在同一个 grid 单元格里，用同一套排版规则渲染同一段文字，
 * 单元格高度由影子层的自然高度决定，textarea 拉伸填满，因此：
 * - 不依赖挂载时机：审查视图切回正文这类重新挂载不会停留在 rows=1；
 * - 不受 scrollHeight 量高误差影响：折叠态量高会少一行，末行文字会被裁掉；
 * - textarea 自身永远不会内部滚动，触屏拖动不会被它吞掉，滚动始终由外层容器承担。
 *
 * 影子层文本末尾补一个换行，给光标停在末行时留出空白。
 */
export default function AutoGrowTextarea({ value, className, wrapperClassName, ...textareaProps }: AutoGrowTextareaProps) {
  return (
    <div className={cn('grid shrink-0', wrapperClassName)}>
      <div aria-hidden className={cn('invisible min-w-0 whitespace-pre-wrap break-words [grid-area:1/1]', className)}>
        {`${value}\n`}
      </div>
      <textarea
        {...textareaProps}
        value={value}
        rows={1}
        className={cn('min-w-0 resize-none overflow-hidden [grid-area:1/1]', className)}
      />
    </div>
  )
}
