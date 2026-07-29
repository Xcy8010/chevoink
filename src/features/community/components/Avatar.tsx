import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type AvatarProps = {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-base',
} as const

function DefaultAvatarGraphic() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true" className="h-full w-full">
      <path
        d="M512 512m-512 0a512 512 0 1 0 1024 0 512 512 0 1 0-1024 0Z"
        fill="#DDDDDD"
      />
      <path
        d="M512 186.181818c90.065455 0 162.909091 75.170909 162.909091 168.145455v59.345454c0 92.974545-72.843636 168.145455-162.909091 168.145455s-162.909091-75.170909-162.909091-168.145455v-59.345454c0-92.974545 72.843636-168.145455 162.909091-168.145455z m69.864727 465.454546h-139.729454c-75.752727 0-143.639273 34.443636-181.992728 87.505454l-1.000727 0.930909c-4.910545 6.516364-3.933091 15.825455 1.978182 21.410909 55.086545 51.2 138.705455 76.334545 250.88 76.334546 112.174545 0 195.793455-25.134545 250.88-76.334546a16.221091 16.221091 0 0 0 1.978182-21.410909c0-0.930909-1.000727-0.930909-1.000727-1.861818-39.330909-52.130909-106.24-86.574545-181.992728-86.574545z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

export default function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  // 三态：加载中骨架 shimmer → 整张淡入 → 失败回退默认图形，不出现半张图或破图
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  // 命中浏览器缓存的头像直接显示，不播放淡入过渡
  const instantRef = useRef(false)

  useEffect(() => {
    instantRef.current = false
    setStatus('loading')
  }, [src])

  return (
    <div
      className={cn(
        // 不加描边：头像外圈的灰色圈圈容易被误认为在线状态，在线统一用头像下方小绿点表达
        'relative inline-flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-muted)] font-medium text-[var(--text-secondary)]',
        sizeClasses[size],
        className,
      )}
    >
      {src && status !== 'error' ? (
        <>
          {status === 'loading' ? <span aria-hidden className="skeleton-shimmer absolute inset-0 rounded-full" /> : null}
          <img
            ref={(node) => {
              // 命中浏览器缓存时 onLoad 可能不触发，直接检查完成态避免骨架闪烁
              if (node && node.complete && node.naturalWidth > 0) {
                instantRef.current = true
                setStatus('loaded')
              }
            }}
            src={src}
            alt={name}
            decoding="async"
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            className={cn(
              'h-full w-full aspect-square object-cover',
              !instantRef.current && 'transition-opacity duration-200',
              status === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
          />
        </>
      ) : (
        <DefaultAvatarGraphic />
      )}
    </div>
  )
}
