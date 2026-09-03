import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, LoaderCircle, PencilLine, Quote, X } from 'lucide-react'

import { fetchStoryMemories, updateStoryMemory } from '../agentApi'
import { COMPOSER_REFERENCE_MIME, serializeComposerReferenceTransfer } from '../composer-content'
import { useAgentStore } from '../agentStore'
import type { StoryMemoryCard } from '../../../../../shared/contracts/index.js'

type Props = {
  novelId: string
}

const PAGE_SIZE = 12

/** 14 种记忆类型的中文名：仅作文案区分，不做彩色标记，保持整轨低饱和的纸牌质感 */
const MEMORY_TYPE_LABELS: Record<string, string> = {
  characterCard: '人物',
  worldbuilding: '世界观',
  novelSummary: '作品概要',
  chapterSummary: '章节摘要',
  volumeSummary: '卷摘要',
  timelineEvent: '时间线',
  foreshadowing: '伏笔',
  stylePreference: '文风偏好',
  continuityRule: '连贯性规则',
  storyArc: '故事线',
  sceneState: '场景状态',
  relationshipState: '人物关系',
  storyBible: '设定集',
  authorProfile: '作者画像',
}

function typeLabel(memoryType: string): string {
  return MEMORY_TYPE_LABELS[memoryType] ?? memoryType
}

function formatMemoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

type MenuState = { x: number; y: number; card: StoryMemoryCard } | null

/**
 * 创作记忆牌堆：Agent 沉淀的人物/世界观/情节等记忆以「牌堆」形式平铺。
 * 每排张数随面板宽度自适应；悬停时顶牌翻出牌堆浮到最上层；点击看详情、右键编辑/引用、拖拽进输入框。
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
  const [detail, setDetail] = useState<StoryMemoryCard | null>(null)
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
    const height = 116
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
    <section className="px-4 pb-6 pt-1">
      <style>{`
        @keyframes memory-card-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes memory-pop-in { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes memory-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .memory-stack { position: relative; animation: memory-card-in 420ms cubic-bezier(0.22,1,0.36,1) both; }
        .memory-stack::before, .memory-stack::after {
          content: '';
          position: absolute;
          left: 7px; right: 7px; top: 7px; bottom: -6px;
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          background: var(--surface-muted);
          pointer-events: none;
          transition: transform 360ms cubic-bezier(0.22,1,0.36,1);
        }
        .memory-stack::before { transform: rotate(1.3deg); opacity: 0.7; }
        .memory-stack::after { transform: rotate(-1.1deg); opacity: 0.4; }
        .memory-stack:hover { z-index: 30; }
        .memory-stack:hover::before { transform: rotate(2.4deg) translateY(3px); }
        .memory-stack:hover::after { transform: rotate(-2.2deg) translateY(3px); }
        .memory-card {
          position: relative;
          z-index: 1;
          transition: transform 360ms cubic-bezier(0.22,1,0.36,1), box-shadow 360ms cubic-bezier(0.22,1,0.36,1);
        }
        .memory-stack:hover .memory-card {
          transform: translateY(-7px) rotate(-1deg) scale(1.02);
          box-shadow: 0 18px 44px rgba(15,23,42,0.14);
        }
      `}</style>

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-baseline gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
          创作记忆
          {total > 0 ? <span className="text-[10px] font-normal tabular-nums text-[var(--text-tertiary)]">{total} 张</span> : null}
        </h3>
        <p className="shrink-0 text-[9px] text-[var(--text-tertiary)]">点击看详情 · 右键编辑/引用 · 拖到输入框</p>
      </div>

      {filterChips.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <button
            type="button"
            onClick={() => { setTypeFilter(null); void load(1, null) }}
            className={`border-b pb-0.5 text-[10px] transition-colors duration-200 ${typeFilter === null ? 'border-[var(--text-primary)] font-medium text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
          >全部</button>
          {filterChips.map(([type, count]) => (
            <button
              key={type}
              type="button"
              onClick={() => { setTypeFilter(type); void load(1, type) }}
              className={`border-b pb-0.5 text-[10px] transition-colors duration-200 ${typeFilter === type ? 'border-[var(--text-primary)] font-medium text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            >{typeLabel(type)} <span className="tabular-nums opacity-70">{count}</span></button>
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
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-3 gap-y-5">
          {items.map((card, index) => (
            <div key={card.id} className="memory-stack" style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}>
              <article
                draggable
                onDragStart={(event) => handleDragStart(event, card)}
                onContextMenu={(event) => handleContextMenu(event, card)}
                onClick={() => setDetail(card)}
                className="memory-card group flex h-[152px] cursor-pointer flex-col rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3.5 pb-2.5 pt-3"
                title={card.title}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[9px] tracking-wide text-[var(--text-tertiary)]">{typeLabel(card.memoryType)}</span>
                  {card.version > 1 ? <span className="shrink-0 text-[9px] tabular-nums text-[var(--text-tertiary)]">v{card.version}</span> : null}
                  <GripVertical className="ml-auto h-3 w-3 shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity duration-300 group-hover:opacity-60" />
                </div>
                <h4 className="mt-2 truncate text-xs font-medium text-[var(--text-primary)]">{card.title}</h4>
                <p className="mt-1.5 line-clamp-3 text-[11px] leading-[1.7] text-[var(--text-secondary)]">{card.content}</p>
                <div className="mt-auto flex items-center justify-between pt-2 text-[9px] text-[var(--text-tertiary)]">
                  <span>重要性 {card.importance}</span>
                  <span>{formatMemoryDate(card.updatedAt)}</span>
                </div>
              </article>
            </div>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void load(page + 1, typeFilter)}
            disabled={loadingMore}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-[10px] text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)] disabled:opacity-50"
          >
            {loadingMore ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        </div>
      ) : null}

      {menu ? createPortal(
        <div
          className="fixed z-[170] w-[168px] rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] py-1 shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
          style={{ left: menu.x, top: menu.y, animation: 'memory-pop-in 160ms cubic-bezier(0.16,1,0.3,1)' }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <p className="truncate px-3 pb-1 pt-0.5 text-[9px] text-[var(--text-tertiary)]">{menu.card.title}</p>
          <button
            type="button"
            onClick={() => { setDetail(menu.card); setMenu(null) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
          ><Quote className="h-3.5 w-3.5 rotate-180 text-[var(--text-secondary)]" />查看详情</button>
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

      {detail ? <MemoryCardDetailDialog
        card={detail}
        onClose={() => setDetail(null)}
        onEdit={() => { setEditing(detail); setDetail(null) }}
        onQuote={() => { applyToComposer(detail); setDetail(null) }}
      /> : null}

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

type DetailDialogProps = {
  card: StoryMemoryCard
  onClose: () => void
  onEdit: () => void
  onQuote: () => void
}

/** 卡片详情弹窗：完整正文 + 引用/编辑入口，正文过长时弹窗内滚动 */
function MemoryCardDetailDialog({ card, onClose, onEdit, onQuote }: DetailDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-[rgba(15,23,42,0.32)] px-4 backdrop-blur-[3px]"
      style={{ animation: 'memory-fade-in 180ms ease-out' }}
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`记忆卡片 ${card.title}`}
        className="flex max-h-[82dvh] w-full max-w-md flex-col rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_28px_80px_rgba(15,23,42,0.28)]"
        style={{ animation: 'memory-pop-in 220ms cubic-bezier(0.16,1,0.3,1)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[9px] tracking-wide text-[var(--text-tertiary)]">
              {typeLabel(card.memoryType)}
              {card.version > 1 ? <span className="tabular-nums">v{card.version}</span> : null}
              <span>重要性 {card.importance}</span>
            </p>
            <h3 className="mt-1.5 break-words text-sm font-semibold leading-6 text-[var(--text-primary)]">{card.title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭卡片详情" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border-subtle)] px-5 py-4">
          <p className="whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-secondary)]">{card.content}</p>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
          <span className="text-[9px] text-[var(--text-tertiary)]">更新于 {formatMemoryDate(card.updatedAt)}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onQuote} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"><Quote className="h-3.5 w-3.5" />引用到对话</button>
            <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--surface-contrast)] px-3 text-[11px] font-medium text-[var(--text-contrast)] transition-opacity hover:opacity-85"><PencilLine className="h-3.5 w-3.5" />编辑卡片</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
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
        className="flex max-h-[86dvh] w-full max-w-lg flex-col rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_28px_80px_rgba(15,23,42,0.28)]"
        style={{ animation: 'memory-pop-in 220ms cubic-bezier(0.16,1,0.3,1)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">编辑记忆卡片</h3>
            <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{typeLabel(card.memoryType)}</span>
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
