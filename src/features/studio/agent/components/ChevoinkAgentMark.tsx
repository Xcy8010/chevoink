import { cn } from '@/lib/utils'

/** 原创 Agent 标识：墨滴笔尖代表创作，双轨节点代表推理与长期记忆。 */
export default function ChevoinkAgentMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('h-5 w-5', className)}
    >
      <path
        d="M16 3.5c-4.8 5.8-8 10-8 15.1A8 8 0 0 0 16 26.5a8 8 0 0 0 8-7.9c0-5.1-3.2-9.3-8-15.1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m11.6 21.1 4.4-9.8 4.4 9.8-4.4 3.1-4.4-3.1Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
      <circle cx="16" cy="18.2" r="1.35" fill="currentColor" />
      <path d="M5.2 10.2a13.4 13.4 0 0 1 21.6 0M4.4 23.2a13.5 13.5 0 0 0 23.2 0" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity=".62" />
      <circle cx="5.2" cy="10.2" r="1.55" fill="currentColor" />
      <circle cx="26.8" cy="10.2" r="1.55" fill="currentColor" />
    </svg>
  )
}
