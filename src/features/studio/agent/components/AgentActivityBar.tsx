import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Circle, CircleCheck, FileText, ListTodo, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentTodoItem } from '../../../../../shared/contracts/index.js'
import { useAgentStore, type WorkspaceActivity } from '../agentStore'
import { workspaceBodyChanges } from '../workspace-body-changes'

type Props = {
  activities: WorkspaceActivity[]; activitiesVersion: number
  todos: AgentTodoItem[]; todosVersion: number; runActive: boolean
  pendingReviewCount: number; reviewBusy: boolean
  onApproveAllReviews?: () => void; onRejectAllReviews?: () => void
  appearance?: 'inline' | 'dock'
}
const capsule = 'agent-activity-capsule flex min-h-9 min-w-0 items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-sm font-medium leading-5 text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--border-strong)] mobile:min-h-11 mobile:w-full mobile:rounded-none mobile:border-0 mobile:bg-transparent motion-reduce:transition-none'
function Counts({ added, removed }: { added: number; removed: number }) {
  return <span className="flex shrink-0 gap-1.5 tabular-nums" aria-label={`新增 ${added} 字，减少 ${removed} 字`}><span className="text-emerald-600">+{added}</span><span className="text-rose-500">-{removed}</span></span>
}
/** Both capsules share positioning, surface, animation and viewport constraints. */
function ActivityPopover({ anchor, open, label, onClose, onEnter, onLeave, children }: {
  anchor: RefObject<HTMLDivElement>; open: boolean; label: string; onClose: () => void
  onEnter?: () => void; onLeave?: () => void; children: ReactNode
}) {
  const [retained, setRetained] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320, height: 240, above: true })
  const popup = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (open) { setRetained(true); return }
    const timer = setTimeout(() => setRetained(false), 160)
    return () => clearTimeout(timer)
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const viewport = window.visualViewport
      const vw = viewport?.width ?? window.innerWidth
      const vh = viewport?.height ?? window.innerHeight
      const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0
      const width = Math.min(420, vw - 16)
      const spaceAbove = Math.max(0, rect.top - vy - 14), spaceBelow = Math.max(0, vy + vh - rect.bottom - 14)
      const above = spaceAbove >= Math.min(200, spaceBelow)
      setPosition({ left: Math.max(vx + 8, Math.min(rect.left + rect.width / 2 - width / 2, vx + vw - width - 8)), top: above ? rect.top - 6 : rect.bottom + 6, width, height: Math.min(300, above ? spaceAbove : spaceBelow), above })
    }
    place()
    const outside = (event: PointerEvent | FocusEvent) => { if (!anchor.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) close.current() }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close.current(); anchor.current?.querySelector('button')?.focus() }
      if (event.key === 'ArrowDown' && anchor.current?.contains(document.activeElement)) {
        event.preventDefault()
        const target = popup.current?.querySelector<HTMLElement>('button') ?? popup.current
        target?.focus()
      }
    }
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place)
    window.addEventListener('pointerdown', outside); window.addEventListener('focusin', outside); window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place)
      window.removeEventListener('pointerdown', outside); window.removeEventListener('focusin', outside); window.removeEventListener('keydown', escape)
    }
  }, [open, anchor])
  if (!open && !retained) return null
  return createPortal(<div ref={popup} role="dialog" tabIndex={-1} aria-hidden={!open} {...(!open ? { inert: '' } : {})} aria-label={label} onPointerEnter={onEnter} onPointerLeave={onLeave}
    className="studio-workspace z-[180] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-default)] text-[var(--text-primary)] shadow-xl animate-[studio-change-reveal_160ms_ease-out] motion-reduce:animate-none"
    style={{ opacity: open ? 1 : 0, pointerEvents: open ? undefined : 'none', transition: 'opacity 160ms ease-out', position: 'fixed', left: position.left, top: position.top, transform: position.above ? 'translateY(-100%)' : undefined, width: position.width, maxHeight: position.height }}>{children}</div>, document.fullscreenElement ?? document.body)
}
/** The right task-status card keeps its expanded, vertical lists; capsules belong only above the composer. */
function DockSection({ title, summary, icon, children }: { title: string; summary: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return <section>
    <button type="button" aria-label={`${title} ${summary}`} aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex min-h-9 w-full min-w-0 items-center gap-2 px-2 py-2 text-left">
      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)] transition-transform duration-200 motion-reduce:transition-none', !open && '-rotate-90')} />
      {icon}<span className="shrink-0 text-xs font-medium text-[var(--text-primary)]">{title}</span><span className="min-w-0 truncate text-[11px] tabular-nums text-[var(--text-secondary)]">{summary}</span>
    </button>
    <div aria-hidden={!open} {...(!open ? { inert: '' } : {})} className={cn('grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0')}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  </section>
}
function AgentActivityDock({ activities, todos, runActive, pendingReviewCount, reviewBusy, onApproveAllReviews, onRejectAllReviews }: Props) {
  const changes = useMemo(() => workspaceBodyChanges(activities), [activities])
  if (!changes.length && !todos.length && !pendingReviewCount) return null
  return <div data-agent-activity-dock className="flex min-w-0 flex-col gap-1">
    {todos.length > 0 ? <DockSection title="待办" summary={`${todos.filter(item => item.status === 'completed').length}/${todos.length} 已完成`} icon={<ListTodo className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />}>
      <ul className="max-h-60 overflow-y-auto overscroll-contain pb-1">{todos.map((item, index) => <li key={index} className="flex items-start gap-2 px-2 py-1.5 text-xs">
        {item.status === 'completed' ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : item.status === 'in_progress' && runActive ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />}
        <span className={cn('min-w-0 flex-1 break-words leading-5', item.status === 'completed' ? 'text-[var(--text-secondary)] line-through' : item.status === 'in_progress' ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>{item.content}</span>
      </li>)}</ul>
    </DockSection> : null}
    {changes.length > 0 || pendingReviewCount > 0 ? <DockSection title="工作区变更" summary={`${changes.length} 个变更`} icon={<FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />}>
      <ul aria-label="工作区变更列表" className="max-h-[11.25rem] overflow-y-auto overscroll-contain">{[...changes].reverse().map(change => <li key={change.key}>
        <button type="button" onClick={() => useAgentStore.getState().requestToolNavigation(change.activity.toolName, { chapterId: change.activity.chapterId }, change.activity.display)} className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-[var(--surface-default)] focus-visible:bg-[var(--surface-default)]">
          <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" /><span className="min-w-0 flex-1 truncate text-[var(--text-primary)]" title={change.title}>{change.title}</span><Counts added={change.added} removed={change.removed} />
        </button>
      </li>)}</ul>
    </DockSection> : null}
    {pendingReviewCount > 0 ? <div className="flex flex-wrap items-center gap-2 px-2 text-xs text-[var(--text-secondary)]"><span>{pendingReviewCount} 项待审</span><button type="button" disabled={reviewBusy} onClick={onApproveAllReviews} className="min-h-9 rounded-lg px-2 hover:bg-[var(--surface-default)] disabled:opacity-40">接受全部</button><button type="button" disabled={reviewBusy} onClick={onRejectAllReviews} className="min-h-9 rounded-lg px-2 hover:bg-[var(--surface-default)] disabled:opacity-40">拒绝全部</button></div> : null}
  </div>
}
export function AgentActivityBar(props: Props) {
  return props.appearance === 'dock' ? <AgentActivityDock {...props} /> : <AgentActivityCapsules {...props} />
}
function AgentActivityCapsules({ activities, todos, runActive, pendingReviewCount, reviewBusy, onApproveAllReviews, onRejectAllReviews }: Props) {
  const [expanded, setExpanded] = useState<'todos' | 'changes' | null>(null)
  const todoAnchor = useRef<HTMLDivElement>(null), changeAnchor = useRef<HTMLDivElement>(null)
  const touchSummary = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const cancelClose = () => clearTimeout(closeTimer.current)
  const closeSoon = () => { cancelClose(); closeTimer.current = setTimeout(() => setExpanded(value => value === 'changes' ? null : value), 160) }
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  const changes = useMemo(() => workspaceBodyChanges(activities), [activities])
  const total = useMemo(() => changes.reduce((sum, item) => ({ added: sum.added + item.added, removed: sum.removed + item.removed }), { added: 0, removed: 0 }), [changes])
  const completed = todos.filter(item => item.status === 'completed').length
  const current = todos.find(item => item.status === 'in_progress') ?? todos.find(item => item.status === 'pending')
  const paired = todos.length > 0 && changes.length > 0
  if (!changes.length && !todos.length && !pendingReviewCount) return null
  return <div className="flex min-w-0 flex-col gap-2">
    <div data-agent-activity-capsules data-mobile-fused={paired} className="flex min-w-0 flex-wrap items-center justify-center gap-2 mobile:w-fit mobile:max-w-full mobile:flex-nowrap mobile:self-center mobile:gap-0 mobile:overflow-hidden mobile:rounded-2xl mobile:border mobile:border-[var(--border-subtle)] mobile:bg-[var(--surface-muted)]">
      {todos.length > 0 ? <div ref={todoAnchor} className={cn('min-w-0 max-w-full', paired && 'mobile:max-w-[50%] mobile:flex-1')}>
        <button type="button" aria-label="待办进度" aria-haspopup="dialog" aria-expanded={expanded === 'todos'} onClick={() => { cancelClose(); setExpanded(value => value === 'todos' ? null : 'todos') }} className={cn(capsule, 'max-w-full gap-2 px-3 text-left mobile:gap-1.5 mobile:px-2.5')}>
          <ListTodo className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)] mobile:hidden" /><span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{completed}/{todos.length}</span>
          <span className="min-w-0 max-w-48 truncate font-medium" title={current?.content}>{current?.content ?? '全部完成'}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', expanded === 'todos' && 'rotate-180')} />
        </button>
        <ActivityPopover anchor={todoAnchor} open={expanded === 'todos'} label="任务待办列表" onClose={() => setExpanded(value => value === 'todos' ? null : value)}>
          <ul className="p-2">{todos.map((item, index) => <li key={index} className={cn('flex items-start gap-2 rounded-lg px-2 py-2 text-xs', item.status === 'completed' ? 'text-[var(--text-tertiary)]' : item.status === 'in_progress' ? 'bg-[var(--surface-muted)] font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
            {item.status === 'completed' ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" /> : item.status === 'in_progress' && runActive ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span className={cn('min-w-0 break-words', item.status === 'completed' && 'line-through')}>{item.content}</span>
          </li>)}</ul>
        </ActivityPopover>
      </div> : null}
      {changes.length > 0 ? <div ref={changeAnchor} className={cn('min-w-0 max-w-full', paired && 'mobile:max-w-[50%] mobile:flex-1 mobile:border-l mobile:border-[var(--border-subtle)]')} onPointerEnter={event => { if (event.pointerType !== 'touch') { cancelClose(); setExpanded('changes') } }} onPointerLeave={closeSoon}>
        <div className={capsule}>
          <button type="button" title="悬停查看正文变更，点击打开最近一次变更（单位：字）" aria-haspopup="dialog" aria-expanded={expanded === 'changes'} onPointerDown={event => { touchSummary.current = event.pointerType === 'touch' }} onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); cancelClose(); setExpanded('changes') }
          }} onClick={() => {
            if (touchSummary.current && expanded !== 'changes') { cancelClose(); setExpanded('changes'); return }
            setExpanded(null)
            const change = changes[changes.length - 1]
            useAgentStore.getState().requestToolNavigation(change.activity.toolName, { chapterId: change.activity.chapterId }, change.activity.display)
          }} className="flex min-h-9 min-w-0 items-center gap-2 px-3 py-1.5 mobile:min-h-11 mobile:w-full mobile:gap-1.5 mobile:px-2.5"><span className="truncate mobile:hidden">{changes.length} 个工作区变更</span><span className="hidden truncate mobile:inline">{changes.length} 项变更</span><Counts {...total} /></button>
        </div>
        <ActivityPopover anchor={changeAnchor} open={expanded === 'changes'} label="工作区正文变更" onClose={() => setExpanded(value => value === 'changes' ? null : value)} onEnter={cancelClose} onLeave={closeSoon}>
          <ul className="p-1">{[...changes].reverse().map(change => <li key={change.key}><button type="button" onClick={() => {
            setExpanded(null)
            useAgentStore.getState().requestToolNavigation(change.activity.toolName, { chapterId: change.activity.chapterId }, change.activity.display)
          }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs transition-colors hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] mobile:min-h-11"><FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" /><span className="min-w-0 flex-1 truncate" title={change.title}>{change.title}</span><Counts added={change.added} removed={change.removed} /></button></li>)}</ul>
        </ActivityPopover>
      </div> : null}
    </div>
    {pendingReviewCount > 0 ? <div className="flex flex-wrap items-center justify-center gap-2 px-3 text-xs text-[var(--text-secondary)]"><span>{pendingReviewCount} 项待审</span><button type="button" disabled={reviewBusy} onClick={onApproveAllReviews} className="min-h-9 rounded-lg px-2 hover:bg-[var(--surface-muted)] disabled:opacity-40">接受全部</button><button type="button" disabled={reviewBusy} onClick={onRejectAllReviews} className="min-h-9 rounded-lg px-2 hover:bg-[var(--surface-muted)] disabled:opacity-40">拒绝全部</button></div> : null}
  </div>
}
