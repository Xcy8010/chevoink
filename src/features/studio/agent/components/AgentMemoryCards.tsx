import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, GripVertical, LoaderCircle, PencilLine, Quote, X } from 'lucide-react'

import { fetchStoryMemories, fetchStoryMemorySets, updateStoryMemory } from '../agentApi'
import { COMPOSER_REFERENCE_MIME, serializeComposerReferenceTransfer } from '../composer-content'
import { useAgentStore } from '../agentStore'
import type { StoryMemoryCard, StoryMemorySet } from '../../../../../shared/contracts/index.js'

type Props = {
  novelId: string
}

const PAGE_SIZE = 12

/** 14 种记忆类型：中文名 + 封面单字水印（墨色低透明，不用彩色图标，保持纸牌质感） */
const MEMORY_TYPE_META: Record<string, { label: string; glyph: string }> = {
  characterCard: { label: '人物', glyph: '人' },
  worldbuilding: { label: '世界观', glyph: '世' },
  novelSummary: { label: '作品概要', glyph: '书' },
  chapterSummary: { label: '章节摘要', glyph: '章' },
  volumeSummary: { label: '卷摘要', glyph: '卷' },
  timelineEvent: { label: '时间线', glyph: '时' },
  foreshadowing: { label: '伏笔', glyph: '伏' },
  stylePreference: { label: '文风偏好', glyph: '文' },
  continuityRule: { label: '连贯性规则', glyph: '规' },
  storyArc: { label: '故事线', glyph: '线' },
  sceneState: { label: '场景状态', glyph: '景' },
  relationshipState: { label: '人物关系', glyph: '系' },
  storyBible: { label: '设定集', glyph: '典' },
  authorProfile: { label: '作者画像', glyph: '笔' },
}

function typeMeta(memoryType: string) {
  return MEMORY_TYPE_META[memoryType] ?? { label: memoryType, glyph: '忆' }
}

/** 堆边厚度档位：单卡无堆边，1-9 薄、10-29 中、30+ 厚，一眼看出哪类记忆沉淀得多 */
function thicknessTier(count: number): number {
  if (count <= 1) return 0
  if (count < 10) return 1
  if (count < 30) return 2
  return 3
}

function formatMemoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

type MenuState = { x: number; y: number; card: StoryMemoryCard } | null

type SetCardsState = {
  items: StoryMemoryCard[]
  page: number
  total: number
  loading: boolean
  loadingMore: boolean
  error: string | null
}

/**
 * 创作记忆卡片集画廊：一个类型一叠牌，默认封面墙全收起（一屏看全记忆版图）；
 * 点击封面就地展开为该集头部条 + 摊开的堆叠卡片，再点收起。
 * 单卡保留悬停翻出、点击详情、右键编辑/引用、拖拽进输入框。
 */
export default function AgentMemoryCards({ novelId }: Props) {
  const [sets, setSets] = useState<StoryMemorySet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, true>>({})
  const [setCards, setSetCards] = useState<Record<string, SetCardsState>>({})
  const [menu, setMenu] = useState<MenuState>(null)
  const [detail, setDetail] = useState<StoryMemoryCard | null>(null)
  const [editing, setEditing] = useState<StoryMemoryCard | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const novelIdRef = useRef(novelId)
  novelIdRef.current = novelId
  const toastTimerRef = useRef<number | null>(null)

  const addComposerReference = useAgentStore((state) => state.addComposerReference)
  const composerDraft = useAgentStore((state) => state.composerDraft)

  const loadSets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchStoryMemorySets(novelIdRef.current)
      if (novelIdRef.current !== novelId) return
      setSets(result.sets)
    } catch (loadError) {
      if (novelIdRef.current !== novelId) return
      setError(loadError instanceof Error ? loadError.message : '记忆卡片集读取失败。')
    } finally {
      if (novelIdRef.current === novelId) setLoading(false)
    }
  }, [novelId])

  useEffect(() => {
    setSets([])
    setExpanded({})
    setSetCards({})
    void loadSets()
  }, [novelId, loadSets])

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

  const loadSetCards = useCallback(async (memoryType: string, targetPage: number) => {
    const patch = (updater: (current: SetCardsState) => SetCardsState) => {
      setSetCards((current) => ({ ...current, [memoryType]: updater(current[memoryType] ?? { items: [], page: 0, total: 0, loading: false, loadingMore: false, error: null }) }))
    }
    patch((state) => ({ ...state, error: null, ...(targetPage === 1 ? { loading: true } : { loadingMore: true }) }))
    try {
      const result = await fetchStoryMemories(novelIdRef.current, { memoryType, page: targetPage, pageSize: PAGE_SIZE })
      if (novelIdRef.current !== novelId) return
      patch((state) => ({
        items: targetPage === 1 ? result.items : [...state.items, ...result.items.filter((item) => !state.items.some((existing) => existing.id === item.id))],
        page: targetPage,
        total: result.total,
        loading: false,
        loadingMore: false,
        error: null,
      }))
    } catch (loadError) {
      if (novelIdRef.current !== novelId) return
      patch((state) => ({ ...state, loading: false, loadingMore: false, error: loadError instanceof Error ? loadError.message : '卡片读取失败。' }))
    }
  }, [novelId])

  const expandSet = (memoryType: string) => {
    setExpanded((current) => ({ ...current, [memoryType]: true }))
    if (!setCards[memoryType]) void loadSetCards(memoryType, 1)
  }

  const collapseSet = (memoryType: string) => {
    setExpanded((current) => {
      const next = { ...current }
      delete next[memoryType]
      return next
    })
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

  const totalCards = sets.reduce((sum, set) => sum + set.count, 0)

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
        .memory-stack[data-thick="0"]::before, .memory-stack[data-thick="0"]::after { content: none; }
        .memory-stack[data-thick="2"]::before { bottom: -8px; }
        .memory-stack[data-thick="2"]::after { bottom: -12px; }
        .memory-stack[data-thick="3"]::before { bottom: -9px; transform: rotate(1.8deg); }
        .memory-stack[data-thick="3"]::after { bottom: -14px; transform: rotate(-1.6deg); }
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
          {totalCards > 0 ? <span className="text-[10px] font-normal tabular-nums text-[var(--text-tertiary)]">{sets.length} 集 · {totalCards} 张</span> : null}
        </h3>
        <p className="shrink-0 text-[9px] text-[var(--text-tertiary)]">点封面摊开卡片集 · 单卡右键/拖拽/点击</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-[var(--text-secondary)]"><LoaderCircle className="h-4 w-4 animate-spin" />读取创作记忆…</div>
      ) : error ? (
        <div className="py-8 text-center">
          <p className="text-xs text-[var(--text-secondary)]">{error}</p>
          <button type="button" onClick={() => void loadSets()} className="mt-2 text-[11px] text-[var(--text-primary)] underline underline-offset-4">重试</button>
        </div>
      ) : sets.length === 0 ? (
        <p className="py-8 text-center text-[11px] leading-6 text-[var(--text-secondary)]">Agent 工作时会把人物设定、世界观、伏笔等沉淀为记忆卡片集，集中显示在这里。</p>
      ) : (
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-5">
          {sets.map((set, index) => {
            const meta = typeMeta(set.memoryType)
            if (expanded[set.memoryType]) {
              const state = setCards[set.memoryType]
              const hasMore = state ? state.items.length < state.total : false
              return (
                <section key={set.memoryType} className="col-span-full" style={{ animation: 'memory-card-in 320ms cubic-bezier(0.22,1,0.36,1) both' }}>
                  <header className="flex items-center gap-2 pb-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-muted)] text-[13px] text-[var(--text-secondary)]">{meta.glyph}</span>
                    <span className="text-xs font-medium text-[var(--text-primary)]">{meta.label}</span>
                    <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">{set.count} 张</span>
                    <button
                      type="button"
                      onClick={() => collapseSet(set.memoryType)}
                      className="ml-auto inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)]"
                    ><ChevronDown className="h-3 w-3 rotate-180" />收起</button>
                  </header>
                  {!state || state.loading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-secondary)]"><LoaderCircle className="h-4 w-4 animate-spin" />摊开卡片…</div>
                  ) : state.error ? (
                    <div className="py-6 text-center">
                      <p className="text-xs text-[var(--text-secondary)]">{state.error}</p>
                      <button type="button" onClick={() => void loadSetCards(set.memoryType, 1)} className="mt-2 text-[11px] text-[var(--text-primary)] underline underline-offset-4">重试</button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-3 gap-y-5">
                        {state.items.map((card, cardIndex) => (
                          <MemoryCardTile
                            key={card.id}
                            card={card}
                            index={cardIndex}
                            onOpen={setDetail}
                            onMenu={handleContextMenu}
                            onDragStart={handleDragStart}
                          />
                        ))}
                      </div>
                      {hasMore ? (
                        <div className="mt-4 flex justify-center">
                          <button
                            type="button"
                            onClick={() => void loadSetCards(set.memoryType, state.page + 1)}
                            disabled={state.loadingMore}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-[10px] text-[var(--text-tertiary)] transition-colors duration-200 hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)] disabled:opacity-50"
                          >
                            {state.loadingMore ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                            {state.loadingMore ? '加载中…' : '加载更多'}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              )
            }
            return (
              <div key={set.memoryType} className="memory-stack" data-thick={thicknessTier(set.count)} style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}>
                <article
                  role="button"
                  tabIndex={0}
                  onClick={() => expandSet(set.memoryType)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expandSet(set.memoryType) } }}
                  className="memory-card group flex h-[132px] cursor-pointer flex-col overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3.5 pb-3 pt-2.5"
                  title={`${meta.label} ${set.count} 张 · 点击摊开`}
                  aria-label={`${meta.label}卡片集 ${set.count} 张，点击摊开`}
                >
                  <span aria-hidden className="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-[46px] font-semibold text-[var(--text-primary)] opacity-[0.07]">{meta.glyph}</span>
                  <p className="relative truncate text-[10px] text-[var(--text-tertiary)]">{set.previews[0] ?? '暂无卡片'}</p>
                  <div className="relative mt-auto flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-[var(--text-primary)]">{meta.label}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-tertiary)]">{set.count} 张</span>
                  </div>
                  <p className="relative mt-0.5 text-[9px] text-[var(--text-tertiary)]">更新于 {formatMemoryDate(set.latestUpdatedAt)}</p>
                </article>
              </div>
            )
          })}
        </div>
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
          setSetCards((current) => {
            const state = current[updated.memoryType]
            if (!state) return current
            return { ...current, [updated.memoryType]: { ...state, items: state.items.map((item) => (item.id === updated.id ? updated : item)) } }
          })
          setEditing(null)
          void loadSets()
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

type TileProps = {
  card: StoryMemoryCard
  index: number
  onOpen: (card: StoryMemoryCard) => void
  onMenu: (event: React.MouseEvent, card: StoryMemoryCard) => void
  onDragStart: (event: React.DragEvent, card: StoryMemoryCard) => void
}

/** 单张记忆牌：悬停翻出堆顶、点击详情、右键菜单、拖拽引用 */
function MemoryCardTile({ card, index, onOpen, onMenu, onDragStart }: TileProps) {
  const meta = typeMeta(card.memoryType)
  return (
    <div className="memory-stack" data-thick={1} style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}>
      <article
        draggable
        onDragStart={(event) => onDragStart(event, card)}
        onContextMenu={(event) => onMenu(event, card)}
        onClick={() => onOpen(card)}
        className="memory-card group flex h-[152px] cursor-pointer flex-col rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3.5 pb-2.5 pt-3"
        title={card.title}
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[9px] tracking-wide text-[var(--text-tertiary)]">{meta.label}</span>
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
              {typeMeta(card.memoryType).label}
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
