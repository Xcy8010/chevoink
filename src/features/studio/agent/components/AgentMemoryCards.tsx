import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, Layers, LoaderCircle, PencilLine, Quote, X } from 'lucide-react'

import { fetchStoryMemories, updateStoryMemory } from '../agentApi'
import { COMPOSER_REFERENCE_MIME, serializeComposerReferenceTransfer } from '../composer-content'
import { useAgentStore } from '../agentStore'
import type { StoryMemoryCard } from '../../../../../shared/contracts/index.js'

type Props = {
  novelId: string
}

const PAGE_SIZE = 12

/** 14 种记忆类型的中文名与点缀色：卡片轨按类型形成克制的色彩节奏，避免大片同色塑料感 */
const MEMORY_TYPE_META: Record<string, { label: string; dot: string; text: string }> = {
  characterCard: { label: '人物', dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' },
  worldbuilding: { label: '世界观', dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
  novelSummary: { label: '作品概要', dot: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  chapterSummary: { label: '章节摘要', dot: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400' },
  volumeSummary: { label: '卷摘要', dot: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400' },
  timelineEvent: { label: '时间线', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  foreshadowing: { label: '伏笔', dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  stylePreference: { label: '文风偏好', dot: 'bg-pink-500', text: 'text-pink-600 dark:text-pink-400' },
  continuityRule: { label: '连贯性规则', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  storyArc: { label: '故事线', dot: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  sceneState: { label: '场景状态', dot: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400' },
  relationshipState: { label: '人物关系', dot: 'bg-fuchsia-500', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
  storyBible: { label: '设定集', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  authorProfile: { label: '作者画像', dot: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-400' },
}

function typeMeta(memoryType: string) {
  return MEMORY_TYPE_META[memoryType] ?? { label: memoryType, dot: 'bg-slate-400', text: 'text-[var(--text-secondary)]' }
}

function formatMemoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

type MenuState = { x: number; y: number; card: StoryMemoryCard } | null

/**
 * 创作记忆卡片轨：Agent 沉淀的人物/世界观/情节等记忆集中翻阅。
 * 右键（或按住）弹出编辑/引用菜单；卡片可拖拽到聊天输入框成为行内引用。
 */
export default function AgentMemoryCards({ novelId }: Props) {
  const [items, setItems] = useState<StoryMemoryCard[]>([])
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [editing, setEditing] = useState<StoryMemoryCard | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const novelIdRef = useRef(novelId)
  novelIdRef.current = novelId
  const toastTimerRef = useRef<number | null>(null)

  const addComposerReference = useAgentStore((state) => state.addComposerReference)
  const composerDraft = useAgentStore((state) => state.composerDraft)

  const load = useCallback(async (targetPage: number, memoryType: string | null) => {
    if (targetPage === 1) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchStoryMemories(novelIdRef.current, { memoryType: memoryType ?? undefined, page: targetPage, pageSize: PAGE_SIZE })
      if (novelIdRef.current !== novelId) return
      setItems((current) => (targetPage === 1 ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]))
      setTypeCounts(result.typeCounts)
      setTotal(result.total)
      setPage(targetPage)
    } catch (loadError) {
      if (novelIdRef.current !== novelId) return
      setError(loadError instanceof Error ? loadError.message : '记忆卡片读取失败。')
    } finally {
      if (novelIdRef.current === novelId) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [novelId])

  useEffect(() => {
    setItems([])
    setTotal(0)
    setTypeFilter(null)
    void load(1, null)
  }, [novelId, load])

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
  }, [])

  // 右键菜单：任意点击 / Esc / 滚动即关闭，避免菜单悬在过期位置上
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', close, { passive: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', close, { capture: true } as EventListenerOptions)
    }
  }, [menu])

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200)
  }

  const applyToComposer = (card: StoryMemoryCard) => {
    addComposerReference({
      id: `memory:${card.id}`,
      kind: 'memory',
      name: card.title,
      startLine: 0,
      endLine: 0,
      text: card.content.slice(0, 4000),
      offset: composerDraft.length,
    })
    showToast(`「${card.title}」已加入输入框引用`)
  }

  const handleContextMenu = (event: React.MouseEvent, card: StoryMemoryCard) => {
    event.preventDefault()
    const width = 168
    const height = 84
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 12),
      y: Math.min(event.clientY, window.innerHeight - height - 12),
      card,
    })
  }

  const handleDragStart = (event: React.DragEvent, card: StoryMemoryCard) => {
    event.dataTransfer.setData(COMPOSER_REFERENCE_MIME, serializeComposerReferenceTransfer({
      id: `memory:${card.id}`,
      kind: 'memory',
      name: card.title,
      startLine: 0,
      endLine: 0,
      text: card.content.slice(0, 4000),
    }))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const hasMore = items.length < total
  const filterChips = Object.entries(typeCounts).sort((left, right) => right[1] - left[1])

  return (
    <section className="px-4 pb-5 pt-1">
      <style>{`
        @keyframes memory-pop-in { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes memory-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .memory-rail::-webkit-scrollbar { height: 4px; }
        .memory-rail::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 999px; }
      `}</style>

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
          <Layers className="h-4 w-4 text-[var(--text-secondary)]" />
          创作记忆
          {total > 0 ? <span className="text-[10px] font-normal tabular-nums text-[var(--text-tertiary)]">{total} 张卡片</span> : null}
        </h3>
        <p className="shrink-0 text-[9px] text-[var(--text-tertiary)]">右键编辑或引用 · 拖到输入框</p>
      </div>

      {filterChips.length > 1 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => { setTypeFilter(null); void load(1, null) }}
            className={`rounded-full px-2.5 py-1 text-[10px] transition-colors duration-200 ${typeFilter === null ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >全部</button>
          {filterChips.map(([type, count]) => (
            <button
              key={type}
              type="button"
              onClick={() => { setTypeFilter(type); void load(1, type) }}
              className={`rounded-full px-2.5 py-1 text-[10px] transition-colors duration-200 ${typeFilter === type ? 'bg-[var(--surface-contrast)] text-[var(--text-contrast)]' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >{typeMeta(type).label} {count}</button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-[var(--text-secondary)]"><LoaderCircle className="h-4 w-4 animate-spin" />读取创作记忆…</div>
      ) : error ? (
        <div className="py-8 text-center">
          <p className="text-xs text-[var(--text-secondary)]">{error}</p>
          <button type="button" onClick={() => void load(1, typeFilter)} className="mt-2 text-[11px] text-[var(--text-primary)] underline underline-offset-4">重试</button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-[11px] leading-6 text-[var(--text-secondary)]">
          {typeFilter ? '该类型下还没有记忆卡片。' : 'Agent 工作时会把人物设定、世界观、伏笔等沉淀为记忆卡片，集中显示在这里。'}
        </p>
      ) : (
        <>
          <div className="memory-rail mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2">
            {items.map((card) => {
              const meta = typeMeta(card.memoryType)
              return (
                <article
                  key={card.id}
                  draggable
                  onDragStart={(event) => handleDragStart(event, card)}
                  onContextMenu={(event) => handleContextMenu(event, card)}
                  className="group flex h-[168px] w-[224px] shrink-0 snap-start cursor-grab flex-col rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3.5 py-3 transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:border-[var(--text-tertiary)]/50 hover:shadow-[0_10px_28px_rgba(15,23,42,0.10)] active:cursor-grabbing"
                  title={`${meta.label} · ${card.title}（右键编辑或引用）`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                    <span className={`text-[10px] font-medium ${meta.text}`}>{meta.label}</span>
                    {card.version > 1 ? <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-px text-[9px] tabular-nums text-[var(--text-tertiary)]">v{card.version}</span> : null}
                    <GripVertical className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity duration-200 group-hover:opacity-70" />
                  </div>
                  <h4 className="mt-2 truncate text-[13px] font-semibold text-[var(--text-primary)]">{card.title}</h4>
                  <p className="mt-1.5 min-h-0 flex-1 overflow-hidden text-[11px] leading-[1.7] text-[var(--text-secondary)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">{card.content}</p>
                  <div className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-[9px] text-[var(--text-tertiary)]">
                    <span>重要性 {card.importance}</span>
                    <span>更新于 {formatMemoryDate(card.updatedAt)}</span>
                  </div>
                </article>
              )
            })}
            {hasMore ? (
              <button
                type="button"
                onClick={() => void load(page + 1, typeFilter)}
                disabled={loadingMore}
                className="flex h-[168px] w-[84px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] transition-colors duration-200 hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <span className="text-base leading-none">+</span>}
                加载更多
              </button>
            ) : null}
          </div>
        </>
      )}

      {menu ? createPortal(
        <div
          className="fixed z-[170] w-[168px] rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1 shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
          style={{ left: menu.x, top: menu.y, animation: 'memory-pop-in 160ms cubic-bezier(0.16,1,0.3,1)' }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="truncate px-3 pb-1 pt-0.5 text-[9px] text-[var(--text-tertiary)]">{menu.card.title}</p>
          <button
            type="button"
            onClick={() => { setEditing(menu.card); setMenu(null) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
          ><PencilLine className="h-3.5 w-3.5 text-[var(--text-secondary)]" />编辑卡片</button>
          <button
            type="button"
            onClick={() => { applyToComposer(menu.card); setMenu(null) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
          ><Quote className="h-3.5 w-3.5 text-[var(--text-secondary)]" />引用到对话</button>
        </div>,
        document.body,
      ) : null}

      {editing ? <MemoryCardEditDialog
        card={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
          setEditing(null)
          showToast(`「${updated.title}」已更新，后续创作按最新设定召回`)
        }}
      /> : null}

      {toast ? createPortal(
        <div
          className="pointer-events-none fixed bottom-24 left-1/2 z-[180] -translate-x-1/2 rounded-full bg-[rgba(15,23,42,0.88)] px-4 py-2 text-[11px] text-white shadow-[0_12px_32px_rgba(15,23,42,0.3)]"
          style={{ animation: 'memory-pop-in 200ms cubic-bezier(0.16,1,0.3,1)' }}
        >{toast}</div>,
        document.body,
      ) : null}
    </section>
  )
}

type EditDialogProps = {
  card: StoryMemoryCard
  onClose: () => void
  onSaved: (updated: StoryMemoryCard) => void
}

/** 就地编辑弹窗：保存后后端记录修订历史并重算检索向量，Agent 之后按最新设定写作 */
function MemoryCardEditDialog({ card, onClose, onSaved }: EditDialogProps) {
  const [title, setTitle] = useState(card.title)
  const [content, setContent] = useState(card.content)
  const [importance, setImportance] = useState(card.importance)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const save = async () => {
    if (saving) return
    if (!title.trim() || !content.trim()) {
      setError('标题与内容不能为空。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await updateStoryMemory(card.id, { title: title.trim(), content: content.trim(), importance })
      onSaved(result.memory)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后再试。')
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-[rgba(15,23,42,0.32)] px-4 backdrop-blur-[3px]"
      style={{ animation: 'memory-fade-in 180ms ease-out' }}
      onClick={() => { if (!saving) onClose() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`编辑记忆卡片 ${card.title}`}
        className="flex max-h-[86dvh] w-full max-w-lg flex-col rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_28px_80px_rgba(15,23,42,0.28)]"
        style={{ animation: 'memory-pop-in 220ms cubic-bezier(0.16,1,0.3,1)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${typeMeta(card.memoryType).dot}`} />
            <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">编辑记忆卡片</h3>
            <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{typeMeta(card.memoryType).label}</span>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="关闭编辑弹窗" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
          <label className="block">
            <span className="text-[10px] text-[var(--text-tertiary)]">标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              className="mt-1 h-9 w-full rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--text-tertiary)]"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-[var(--text-tertiary)]">内容（保存后 Agent 按这份最新设定写作）</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={10}
              maxLength={8000}
              className="mt-1 w-full resize-y rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 py-2 text-xs leading-6 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--text-tertiary)]"
            />
          </label>
          <label className="block">
            <span className="flex items-baseline justify-between text-[10px] text-[var(--text-tertiary)]">重要性<span className="tabular-nums text-[var(--text-secondary)]">{importance}</span></span>
            <input
              type="range"
              min={1}
              max={100}
              value={importance}
              onChange={(event) => setImportance(Number(event.target.value))}
              className="mt-1.5 w-full accent-[var(--text-primary)]"
            />
          </label>
          {error ? <p className="rounded-[9px] bg-rose-500/8 px-3 py-2 text-[10px] leading-5 text-rose-500">{error}</p> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-[10px] px-4 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:opacity-40">取消</button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[var(--surface-contrast)] px-4 text-xs font-medium text-[var(--text-contrast)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >{saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}{saving ? '保存中…' : '保存修订'}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
