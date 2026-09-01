import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpenText, Crosshair, ExternalLink, FilePlus2, FolderDown, FolderPlus, GitBranch, Home, ImagePlus, MoreHorizontal, NotebookPen, PanelLeftClose, PanelLeftOpen, PenLine, PencilLine, Pin, Settings2, Trash2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'
import type { Novel } from '../../../../shared/contracts/index.js'
import WorkspaceNovelSwitcher from './WorkspaceNovelSwitcher'
import { useAgentStore } from '../agent/agentStore'

type Props = {
  workspaceSidebarOpen?: boolean
  onWorkspaceSidebarToggle?: () => void
  workspaceControls?: boolean
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
  /** 顶部「作品」菜单的结构操作 */
  onCreateVolume?: () => void
  onCreateChapter?: () => void
  onCreatePlan?: () => void
  previewHref?: string
  detailPreviewHref?: string
  published?: boolean
  activeTaskTitle?: string | null
  activeTaskCanPersist?: boolean
  onPinTask?: () => void
  onRenameTask?: (title: string) => void
  onOpenBranches?: () => void
}

type StudioMenuKey = 'task' | 'novel' | 'view' | 'design' | 'publish' | 'export'

/** 参考 Codex 顶栏：菜单名最多两个字，点击展开操作卡片 */
const STUDIO_MENUS: { key: Exclude<StudioMenuKey, 'task'>; label: string }[] = [
  { key: 'novel', label: '作品' },
  { key: 'view', label: '查看' },
  { key: 'design', label: '设计' },
  { key: 'publish', label: '发布' },
  { key: 'export', label: '导出' },
]

const dropdownClass = 'absolute left-0 top-[calc(100%+7px)] z-50 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-1 shadow-[0_18px_50px_rgba(15,23,42,.18)] motion-safe:origin-top-left motion-safe:animate-[agent-menu-in_150ms_cubic-bezier(.2,.8,.2,1)]'

export default function StudioCommandBar(props: Props) {
  const autoFollow = useAgentStore((state) => state.autoFollow)
  const setAutoFollow = useAgentStore((state) => state.setAutoFollow)
  const [openMenu, setOpenMenu] = useState<StudioMenuKey | null>(null)
  const [renamingTask, setRenamingTask] = useState(false)
  const [taskTitleDraft, setTaskTitleDraft] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!openMenu) return
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpenMenu(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openMenu])
  const item = 'flex min-h-9 w-full items-center gap-2 px-2.5 text-left text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)]'
  const toggleMenu = (key: StudioMenuKey) => setOpenMenu((current) => (current === key ? null : key))
  const closeMenu = () => setOpenMenu(null)
  const triggerClass = (active: boolean) => cn('inline-flex h-8 items-center justify-center rounded-[8px] px-2 text-xs transition-colors', active ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]')
  const renderDropdown = (key: StudioMenuKey, widthClass: string, children: ReactNode) => (
    openMenu === key ? <div className={cn(dropdownClass, widthClass)}>{children}</div> : null
  )
  const publishLabel = props.published ? '更新发布' : '发布'

  function renderStudioMenuBody(key: Exclude<StudioMenuKey, 'task'>) {
    switch (key) {
      case 'novel':
        return <>
          {props.onCreateVolume ? <button type="button" className={item} onClick={() => { closeMenu(); props.onCreateVolume?.() }}><FolderPlus className="h-3.5 w-3.5" />新建卷</button> : null}
          <button type="button" className={item} onClick={() => { closeMenu(); props.onCreateChapter?.() }}><FilePlus2 className="h-3.5 w-3.5" />新建章</button>
          <button type="button" className={item} onClick={() => { closeMenu(); props.onCreatePlan?.() }}><NotebookPen className="h-3.5 w-3.5" />新建计划</button>
          <div className="mx-2 my-1 border-t border-[var(--border-subtle)]" />
          <button type="button" className={item} onClick={() => { closeMenu(); props.onOpenMeta() }}><Settings2 className="h-3.5 w-3.5" />作品设置</button>
          <button type="button" className={item} onClick={() => { closeMenu(); props.onPublish() }}><Upload className="h-3.5 w-3.5" />{publishLabel}</button>
          <button type="button" className={item} onClick={() => { closeMenu(); props.onExport() }}><FolderDown className="h-3.5 w-3.5" />一键导出</button>
          <div className="mx-2 my-1 border-t border-[var(--border-subtle)]" />
          <button type="button" className={cn(item, 'text-rose-600')} onClick={() => { closeMenu(); props.onDeleteNovel() }}><Trash2 className="h-3.5 w-3.5" />删除作品</button>
        </>
      case 'view':
        return <>
          {props.detailPreviewHref ? <Link to={props.detailPreviewHref} className={item} onClick={closeMenu}><ExternalLink className="h-3.5 w-3.5" />查看作品页</Link> : null}
          {props.previewHref ? <Link to={props.previewHref} className={item} onClick={closeMenu}><BookOpenText className="h-3.5 w-3.5" />预览阅读</Link> : null}
        </>
      case 'design':
        return <button type="button" className={item} onClick={() => { closeMenu(); props.onOpenCover() }}><ImagePlus className="h-3.5 w-3.5" />封面工坊</button>
      case 'publish':
        return <button type="button" className={item} onClick={() => { closeMenu(); props.onPublish() }}><Upload className="h-3.5 w-3.5" />{publishLabel}</button>
      case 'export':
        return <button type="button" className={item} onClick={() => { closeMenu(); props.onExport() }}><FolderDown className="h-3.5 w-3.5" />一键导出</button>
      default:
        return null
    }
  }

  return (
    <header data-studio-command-bar={props.perspective} className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-default)] px-3">
      {props.onWorkspaceSidebarToggle ? <button
        type="button"
        onClick={props.onWorkspaceSidebarToggle}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        aria-label={props.workspaceSidebarOpen ? '折叠左侧栏' : '展开左侧栏'}
        title={props.workspaceSidebarOpen ? '折叠左侧栏' : '展开左侧栏'}
      >{props.workspaceSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button> : null}
      {props.onWorkspaceSidebarToggle ? <div className="h-5 w-px shrink-0 bg-[var(--border-subtle)]" /> : null}
      {props.workspaceControls !== false && props.perspectiveSwitchEnabled ? <div className="relative inline-flex h-8 items-center overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-0.5" aria-label="切换创作模式">
        <span aria-hidden className={cn('absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] bg-[var(--surface-default)] shadow-sm transition-transform duration-200 ease-out', props.perspective === 'ide' && 'translate-x-full')} />
        {([{ key: 'work' as const, label: 'Work', icon: BookOpenText }, { key: 'ide' as const, label: 'IDE', icon: PenLine }]).map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => props.onPerspectiveChange(key)} aria-pressed={props.perspective === key} className={cn('relative inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors duration-200', props.perspective === key ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </div> : null}
      {props.workspaceControls !== false && props.perspectiveSwitchEnabled ? <div className="h-5 w-px bg-[var(--border-subtle)]" /> : null}
      {/* 任务标题展示已移至 Agent 面板顶栏；菜单区随之左移补位 */}
      {/* 菜单区：任务三点 + 顶栏菜单（参考 Codex 的文件/视图/帮助）；菜单名最多两个字 */}
      <div ref={menuRef} className="flex shrink-0 items-center gap-0.5">
        <div className="relative">
          <button type="button" onClick={() => toggleMenu('task')} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]" aria-label="任务操作" aria-expanded={openMenu === 'task'}><MoreHorizontal className="h-4 w-4" /></button>
          {renderDropdown('task', 'w-52', <>
            {props.onPinTask ? <button type="button" disabled={!props.activeTaskCanPersist} className={item} onClick={() => { closeMenu(); props.onPinTask?.() }}><Pin className="h-3.5 w-3.5" />置顶当前任务</button> : null}
            {props.onRenameTask ? <button type="button" className={item} onClick={() => { setTaskTitleDraft(props.activeTaskTitle?.trim() || '新任务'); setRenamingTask(true); closeMenu() }}><PencilLine className="h-3.5 w-3.5" />编辑任务名称</button> : null}
            {props.onOpenBranches ? <button type="button" className={item} onClick={() => { closeMenu(); props.onOpenBranches?.() }}><GitBranch className="h-3.5 w-3.5" />创建分支与版本</button> : null}
          </>)}
        </div>
        <div className="hidden items-center gap-0.5 md:flex">
          {STUDIO_MENUS.map(({ key, label }) => (
            <div key={key} className="relative">
              <button type="button" onClick={() => toggleMenu(key)} className={triggerClass(openMenu === key)} aria-expanded={openMenu === key}>{label}</button>
              {renderDropdown(key, 'w-44', renderStudioMenuBody(key))}
            </div>
          ))}
        </div>
      </div>
      {props.workspaceControls !== false ? <div className="w-fit min-w-0 max-w-[220px] shrink-0">
        <WorkspaceNovelSwitcher compactTrigger currentNovelId={props.currentNovelId} currentNovelTitle={props.novelTitle} novels={props.novelOptions} busy={props.switchingNovel} loading={props.novelsLoading} onSelectNovel={props.onSelectNovel} onCreateNovel={props.onCreateNovel} />
      </div> : null}
      {props.workspaceControls !== false ? <div className="h-5 w-px shrink-0 bg-[var(--border-subtle)]" /> : null}
      {props.workspaceControls !== false ? <button
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
      </button> : null}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {/* 发布/预览已收进顶栏「发布」「查看」菜单；最右侧返回首页保持不变 */}
        <Link to="/" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--border-subtle)] px-2.5 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"><Home className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">返回首页</span></Link>
      </div>
      {renamingTask ? <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/25 p-4" onMouseDown={() => setRenamingTask(false)}><form onSubmit={(event) => { event.preventDefault(); if (taskTitleDraft.trim()) props.onRenameTask?.(taskTitleDraft.trim()); setRenamingTask(false) }} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-default)] p-5 shadow-2xl"><h2 className="text-sm font-semibold">编辑任务名称</h2><input autoFocus maxLength={160} value={taskTitleDraft} onChange={(event) => setTaskTitleDraft(event.target.value)} className="mt-4 h-10 w-full rounded-[9px] border border-[var(--border-subtle)] bg-transparent px-3 text-sm outline-none focus:border-[var(--border-strong)]" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRenamingTask(false)} className="h-9 rounded-[9px] px-3 text-xs hover:bg-[var(--surface-muted)]">取消</button><button type="submit" disabled={!taskTitleDraft.trim()} className="h-9 rounded-[9px] bg-[var(--surface-contrast)] px-4 text-xs font-medium text-[var(--text-contrast)] disabled:opacity-45">保存</button></div></form></div> : null}
    </header>
  )
}
