import { ChevronRight } from 'lucide-react'

/** The cap shares its straight lower edge with the compact composer's upper edge. */
export function WorkConversationRestore({ onExpand, recentMessage }: { onExpand: () => void; recentMessage?: string }) {
  return <button type="button" data-agent-compact-restore onClick={onExpand} className="mx-4 flex min-h-10 items-center justify-between gap-3 rounded-t-2xl border border-b-0 border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-2 text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
    <span className="min-w-0 flex-1 truncate"><span>点击展开Agent会话区域：</span><span>{recentMessage?.trim() || '暂无会话记录'}</span></span><ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
  </button>
}
