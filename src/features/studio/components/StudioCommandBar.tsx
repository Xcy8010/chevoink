import { useEffect, useRef, useState } from 'react'
import { BookOpenText, Crosshair, ExternalLink, FileText, FolderDown, Home, ImagePlus, MoreHorizontal, PenLine, Settings2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'
import type { Novel } from '../../../../shared/contracts/index.js'
import WorkspaceNovelSwitcher from './WorkspaceNovelSwitcher'
import { useAgentStore } from '../agent/agentStore'

type Props = {
  perspective: 'work' | 'ide'
  perspectiveSwitchEnabled: boolean
  onPerspectiveChange: (value: 'work' | 'ide') => void
  currentNovelId: string
  novelTitle: string
  novelOptions: Novel[]
  novelsLoading?: boolean
  switchingNovel?: boolean
  onSelectNovel: (novelId: string) => void
  onCreateNovel: () => void
  onPublish: () => void
  onOpenCover: () => void
  onOpenMeta: () => void
  onExport: () => void
  onDeleteNovel: () => void
  previewHref?: string
  detailPreviewHref?: string
  published?: boolean
}

export default function StudioCommandBar(props: Props) {
  const autoFollow = useAgentStore((state) => state.autoFollow)
  const setAutoFollow = useAgentStore((state) => state.setAutoFollow)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])
  const item = 'flex min-h-9 w-full items-center gap-2 px-2.5 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--app-bg)] px-2.5">
      {props.perspectiveSwitchEnabled ? <div className="relative inline-flex h-8 items-center overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-0.5" aria-label="切换创作模式">
        <span aria-hidden className={cn('absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] bg-[var(--surface-default)] shadow-sm transition-transform duration-200 ease-out', props.perspective === 'ide' && 'translate-x-full')} />
        {([{ key: 'work' as const, label: 'Work', icon: BookOpenText }, { key: 'ide' as const, label: 'IDE', icon: PenLine }]).map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => props.onPerspectiveChange(key)} aria-pressed={props.perspective === key} className={cn('relative inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors duration-200', props.perspective === key ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </div> : null}
      {props.perspectiveSwitchEnabled ? <div className="h-5 w-px bg-[var(--border-subtle)]" /> : null}
      <div className="max-w-[260px] min-w-[170px]">
        <WorkspaceNovelSwitcher compactTrigger currentNovelId={props.currentNovelId} currentNovelTitle={props.novelTitle} novels={props.novelOptions} busy={props.switchingNovel} loading={props.novelsLoading} onSelectNovel={props.onSelectNovel} onCreateNovel={props.onCreateNovel} />
      </div>
      <div className="h-5 w-px bg-[var(--border-subtle)]" />
      <button
        type="button"
        onClick={() => setAutoFollow(!autoFollow)}
        title={autoFollow ? '自动追踪已开启：Agent 写到哪章，编辑器跟到哪章' : '自动追踪已关闭：留在当前章节不跳转'}
        aria-pressed={autoFollow}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 border px-2.5 text-xs font-medium transition-all duration-200',
          autoFollow
            ? 'border-[var(--surface-contrast)] bg-[var(--surface-contrast)] text-[var(--text-contrast)]'
            : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]',
        )}
      >
        <Crosshair className="h-3.5 w-3.5" />
        追踪
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={props.onPublish} className="inline-flex h-8 items-center gap-1.5 bg-[var(--surface-contrast)] px-3 text-xs font-medium text-[var(--text-contrast)] hover:opacity-90"><Upload className="h-3.5 w-3.5" />{props.published ? '更新发布' : '发布'}</button>
        {props.previewHref ? <Link to={props.previewHref} className="hidden h-8 items-center gap-1.5 border border-[var(--border-subtle)] px-2.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-muted)] xl:inline-flex"><BookOpenText className="h-3.5 w-3.5" />预览</Link> : null}
        <div ref={menuRef} className="relative">
          <button type="button" onClick={() => setMenuOpen((value) => !value)} className="inline-flex h-8 w-8 items-center justify-center border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="作品操作"><MoreHorizontal className="h-4 w-4" /></button>
          {menuOpen ? <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-44 border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1 shadow-xl">
            {props.detailPreviewHref ? <Link to={props.detailPreviewHref} className={item} onClick={() => setMenuOpen(false)}><ExternalLink className="h-3.5 w-3.5" />查看作品页</Link> : null}
            {props.previewHref ? <Link to={props.previewHref} className={item} onClick={() => setMenuOpen(false)}><FileText className="h-3.5 w-3.5" />预览阅读</Link> : null}
            <button type="button" className={item} onClick={() => { setMenuOpen(false); props.onOpenCover() }}><ImagePlus className="h-3.5 w-3.5" />封面工坊</button>
            <button type="button" className={item} onClick={() => { setMenuOpen(false); props.onExport() }}><FolderDown className="h-3.5 w-3.5" />一键导出</button>
            <button type="button" className={item} onClick={() => { setMenuOpen(false); props.onOpenMeta() }}><Settings2 className="h-3.5 w-3.5" />作品设置</button>
            <button type="button" className={cn(item, 'mt-1 border-t border-[var(--border-subtle)] text-rose-600')} onClick={() => { setMenuOpen(false); props.onDeleteNovel() }}>删除作品</button>
          </div> : null}
        </div>
        <Link to="/" className="inline-flex h-8 items-center gap-1.5 border border-[var(--border-subtle)] px-2.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><Home className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">返回首页</span></Link>
      </div>
    </header>
  )
}
