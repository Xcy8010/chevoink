import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookMarked, BookOpen, ChevronLeft, ChevronRight, Clapperboard, Feather, Globe, HeartHandshake,
  History, Library, LoaderCircle, PenLine, PencilLine, Quote, Route, ScrollText, ShieldCheck,
  Telescope, UserRound, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { fetchStoryMemories, fetchStoryMemorySets, updateStoryMemory } from '../agentApi'
import { useAgentStore } from '../agentStore'
import type { StoryMemoryCard, StoryMemorySet } from '../../../../../shared/contracts/index.js'

type Props = {
  novelId: string
}

const PAGE_SIZE = 12

/** 14 种记忆类型：中文名 + 专属线性图标（低饱和细描边，封面与覆层共用同一视觉语言） */
const MEMORY_TYPE_META: Record<string, { label: string; icon: LucideIcon }> = {
  characterCard: { label: '人物', icon: UserRound },
  worldbuilding: { label: '世界观', icon: Globe },
  novelSummary: { label: '作品概要', icon: BookOpen },
  chapterSummary: { label: '章节摘要', icon: ScrollText },
  volumeSummary: { label: '卷摘要', icon: Library },
  timelineEvent: { label: '时间线', icon: History },
  foreshadowing: { label: '伏笔', icon: Telescope },
  stylePreference: { label: '文风偏好', icon: Feather },
  continuityRule: { label: '连贯性规则', icon: ShieldCheck },
  storyArc: { label: '故事线', icon: Route },
  sceneState: { label: '场景状态', icon: Clapperboard },
  relationshipState: { label: '人物关系', icon: HeartHandshake },
  storyBible: { label: '设定集', icon: BookMarked },
  authorProfile: { label: '作者画像', icon: PenLine },
}

function typeMeta(memoryType: string) {
  return MEMORY_TYPE_META[memoryType] ?? { label: memoryType, icon: BookMarked }
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
 * 点击封面进入覆层手牌模式——整叠牌在模糊覆层中扇形摊开，← → 拨牌、点击翻面读全文、Esc 收叠。
 * 单卡保留右键编辑/引用入口。
 */
export default function AgentMemoryCards({ novelId }: Props) {
  const [sets, setSets] = useState<StoryMemorySet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overlayType, setOverlayType] = useState<string | null>(null)
  const [setCards, setSetCards] = useState<Record<string, SetCardsState>>({})
  const [menu, setMenu] = useState<MenuState>(null)
  const [detail, setDetail] = useState<StoryMemoryCard | null>(null)
  const [editing, setEditing] = useState<StoryMemoryCard | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fanSpotlight, setFanSpotlight] = useState<{ index: number; nonce: number } | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const lastSpotlightNonceRef = useRef(0)
  const pendingSpotlightRef = useRef<{ nonce: number; memoryType: string; title: string } | null>(null)
  const novelIdRef = useRef(novelId)
  novelIdRef.current = novelId
  const toastTimerRef = useRef<number | null>(null)

  const addComposerReference = useAgentStore((state) => state.addComposerReference)
  const composerDraft = useAgentStore((state) => state.composerDraft)
  const memorySpotlight = useAgentStore((state) => state.memorySpotlight)

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
    setOverlayType(null)
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

  const openSet = (memoryType: string) => {
    setOverlayType(memoryType)
    if (!setCards[memoryType]) void loadSetCards(memoryType, 1)
  }
  const openSetRef = useRef(openSet)
  openSetRef.current = openSet

  // 记忆沉淀卡点击：仅当前可见实例响应（隐藏实例 offsetParent 为 null），开对应卡片集等待定位
  useEffect(() => {
    if (!memorySpotlight) return
    if (memorySpotlight.nonce === lastSpotlightNonceRef.current) return
    if (Date.now() - memorySpotlight.nonce > 8000) return
    if (!sectionRef.current || sectionRef.current.offsetParent === null) return
    lastSpotlightNonceRef.current = memorySpotlight.nonce
    pendingSpotlightRef.current = memorySpotlight
    openSetRef.current(memorySpotlight.memoryType)
  }, [memorySpotlight])

  // 卡片集首页回来后定位沉淀卡：标题精确匹配优先，否则取最近更新一张（沉淀动作刚刷新 updatedAt）
  useEffect(() => {
    const pending = pendingSpotlightRef.current
    if (!pending || overlayType !== pending.memoryType) return
    const state = setCards[pending.memoryType]
    if (!state || state.loading || state.items.length === 0) return
    const matched = state.items.findIndex((item) => item.title === pending.title)
    pendingSpotlightRef.current = null
    setFanSpotlight({ index: matched >= 0 ? matched : 0, nonce: pending.nonce })
  }, [overlayType, setCards])

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

  /** 引用后收叠覆层，让用户直接看到输入框里的引用 chip */
  const quoteAndClose = (card: StoryMemoryCard) => {
    applyToComposer(card)
    setOverlayType(null)
    setDetail(null)
    setMenu(null)
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

  const totalCards = sets.reduce((sum, set) => sum + set.count, 0)
  const overlaySet = overlayType ? sets.find((set) => set.memoryType === overlayType) ?? null : null
  const overlaySuspended = Boolean(menu) || Boolean(detail) || Boolean(editing)

  return (
    <section ref={sectionRef} className="px-4 pb-6 pt-1">
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
        .fan-card { transition: transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease-out; }
        @keyframes fan-flash {
          0%, 100% { box-shadow: 0 0 0 0 rgba(148,163,184,0); }
          22%, 55% { box-shadow: 0 0 0 3px rgba(148,163,184,0.6), 0 24px 64px rgba(15,23,42,0.35); }
        }
        .fan-flip { transition: transform 520ms cubic-bezier(0.22,1,0.36,1); }
        .fan-flipped { transform: rotateY(180deg); }
        .fan-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .fan-back { transform: rotateY(180deg); }
      `}</style>

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-baseline gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
          创作记忆
          {totalCards > 0 ? <span className="text-[10px] font-normal tabular-nums text-[var(--text-tertiary)]">{sets.length} 集 · {totalCards} 张</span> : null}
        </h3>
        <p className="shrink-0 text-[9px] text-[var(--text-tertiary)]">点封面进入手牌审阅 · 点击翻面 · Esc 收叠</p>
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
            const Icon = meta.icon
            return (
              <div key={set.memoryType} className="memory-stack" data-thick={thicknessTier(set.count)} style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}>
                <article
                  role="button"
                  tabIndex={0}
                  onClick={() => openSet(set.memoryType)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSet(set.memoryType) } }}
                  className="memory-card group flex h-[136px] cursor-pointer flex-col overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3.5 pb-3 pt-2.5"
                  title={`${meta.label} ${set.count} 张 · 点击摊开手牌`}
                  aria-label={`${meta.label}卡片集 ${set.count} 张，点击摊开手牌`}
                >
                  <p className="relative truncate text-[10px] text-[var(--text-tertiary)]">{set.previews[0] ?? '暂无卡片'}</p>
                  <span className="relative mx-auto mt-2 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors duration-300 group-hover:border-[var(--text-tertiary)]">
                    <Icon className="h-[18px] w-[18px] opacity-70" strokeWidth={1.5} />
                  </span>
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

      {overlaySet ? (
        <MemoryFanOverlay
          set={overlaySet}
          state={setCards[overlaySet.memoryType]}
          spotlight={fanSpotlight}
          suspended={overlaySuspended}
          onClose={() => { setOverlayType(null); setFanSpotlight(null) }}
          onLoadMore={() => {
            const state = setCards[overlaySet.memoryType]
            if (state) void loadSetCards(overlaySet.memoryType, state.page + 1)
          }}
          onMenu={handleContextMenu}
          onQuote={quoteAndClose}
          onEdit={(card) => { setEditing(card); setMenu(null) }}
        />
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
            onClick={() => quoteAndClose(menu.card)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
          ><Quote className="h-3.5 w-3.5 text-[var(--text-secondary)]" />引用到对话</button>
        </div>,
        document.body,
      ) : null}

      {detail ? <MemoryCardDetailDialog
        card={detail}
        onClose={() => setDetail(null)}
        onEdit={() => { setEditing(detail); setDetail(null) }}
        onQuote={() => quoteAndClose(detail)}
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

type FanOverlayProps = {
  set: StoryMemorySet
  state: SetCardsState | undefined
  /** 工具卡定位请求：打开后聚焦到该张并闪一下 */
  spotlight: { index: number; nonce: number } | null
  /** 右键菜单/详情/编辑打开时挂起键盘监听，避免 Esc 一次关两层 */
  suspended: boolean
  onClose: () => void
  onLoadMore: () => void
  onMenu: (event: React.MouseEvent, card: StoryMemoryCard) => void
  onQuote: (card: StoryMemoryCard) => void
  onEdit: (card: StoryMemoryCard) => void
}

/** 覆层手牌模式：整叠牌扇形摊在模糊覆层中央，← → 拨牌、点击翻面读全文、Esc 收叠回封面墙 */
function MemoryFanOverlay({ set, state, spotlight, suspended, onClose, onLoadMore, onMenu, onQuote, onEdit }: FanOverlayProps) {
  const meta = typeMeta(set.memoryType)
  const Icon = meta.icon
  const items = state?.items ?? []
  const [focus, setFocus] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [flash, setFlash] = useState<{ index: number; nonce: number } | null>(null)

  // 工具卡定位：聚焦到沉淀卡并闪一下
  useEffect(() => {
    if (!spotlight) return
    setFocus(Math.min(spotlight.index, Math.max(items.length - 1, 0)))
    setFlipped(false)
    setFlash(spotlight)
  }, [spotlight, items.length])

  // 卡片数量变化（加载更多/切换作品）时把焦点钳回有效范围
  useEffect(() => {
    setFocus((current) => Math.min(current, Math.max(items.length - 1, 0)))
  }, [items.length])

  useEffect(() => {
    if (suspended) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (flipped) setFlipped(false)
        else onClose()
      } else if (event.key === 'ArrowLeft') {
        setFlipped(false)
        setFocus((current) => Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        setFlipped(false)
        setFocus((current) => Math.min(Math.max(items.length - 1, 0), current + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suspended, flipped, items.length, onClose])

  // 自动翻页加载：拨牌接近末尾两张时无声加载下一页，不设手动按钮（作者要求流畅自然）
  useEffect(() => {
    if (!state || state.loading || state.loadingMore || state.error) return
    if (items.length >= state.total) return
    if (focus >= items.length - 2) onLoadMore()
  }, [focus, items.length, state, onLoadMore])

  const step = (delta: number) => {
    setFlipped(false)
    setFocus((current) => Math.max(0, Math.min(Math.max(items.length - 1, 0), current + delta)))
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[165] flex flex-col bg-[rgba(15,23,42,0.5)] backdrop-blur-md"
      style={{ animation: 'memory-fade-in 200ms ease-out' }}
      onClick={onClose}
    >
      <header className="flex shrink-0 items-center gap-2.5 px-5 pb-1 pt-4" onClick={(event) => event.stopPropagation()}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 text-white/85">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <span className="text-sm font-medium text-white">{meta.label}</span>
        <span className="text-[10px] tabular-nums text-white/60">{set.count} 张</span>
        <span className="ml-auto text-[10px] tabular-nums text-white/60">{items.length ? focus + 1 : 0} / {state?.total ?? 0}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="收叠手牌"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        ><X className="h-4 w-4" /></button>
      </header>

      <div className="relative min-h-0 flex-1" onClick={(event) => event.stopPropagation()}>
        {!state || state.loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-white/70"><LoaderCircle className="h-4 w-4 animate-spin" />摊开手牌…</div>
        ) : state.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-xs text-white/70">{state.error}</p>
            <button type="button" onClick={onLoadMore} className="text-[11px] text-white underline underline-offset-4">重试</button>
          </div>
        ) : items.length === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-white/60">这一集暂时没有卡片。</p>
        ) : (
          <>
            <div className="flex h-full items-center justify-center [perspective:1400px]">
              {items.map((card, index) => {
                const offset = index - focus
                const away = Math.abs(offset) > 3
                const cardMeta = typeMeta(card.memoryType)
                const style: React.CSSProperties = away
                  ? { transform: `translateX(${offset > 0 ? 480 : -480}px) translateY(56px) rotate(${offset > 0 ? 16 : -16}deg) scale(0.72)`, opacity: 0, zIndex: 10, pointerEvents: 'none' }
                  : { transform: `translateX(${offset * 76}px) translateY(${Math.abs(offset) * 12}px) rotate(${offset * 5}deg) scale(${1 - Math.abs(offset) * 0.05})`, opacity: 1 - Math.abs(offset) * 0.15, zIndex: 40 - Math.abs(offset) }
                const isFlash = flash?.index === index
                return (
                  <div
                    key={isFlash ? `${card.id}-f${flash?.nonce}` : card.id}
                    className="fan-card absolute cursor-pointer"
                    style={isFlash ? { ...style, animation: 'fan-flash 1.6s cubic-bezier(0.22,1,0.36,1)' } : style}
                    onClick={() => {
                      if (offset === 0) setFlipped((current) => !current)
                      else { setFlipped(false); setFocus(index) }
                    }}
                    onContextMenu={(event) => onMenu(event, card)}
                  >
                    <div className={`fan-flip relative h-[380px] w-[300px] [transform-style:preserve-3d] ${flipped && offset === 0 ? 'fan-flipped' : ''}`}>
                      <article className="fan-face flex flex-col overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-5 pb-4 pt-4 shadow-[0_24px_64px_rgba(15,23,42,0.35)]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[9px] tracking-wide text-[var(--text-tertiary)]">{cardMeta.label}</span>
                          {card.version > 1 ? <span className="shrink-0 text-[9px] tabular-nums text-[var(--text-tertiary)]">v{card.version}</span> : null}
                          <span className="ml-auto shrink-0 text-[9px] text-[var(--text-tertiary)]">点击翻面</span>
                        </div>
                        <h4 className="mt-2.5 line-clamp-2 break-words text-sm font-semibold leading-6 text-[var(--text-primary)]">{card.title}</h4>
                        <p className="mt-2 line-clamp-[11] text-xs leading-6 text-[var(--text-secondary)]">{card.content}</p>
                        <div className="mt-auto flex items-center justify-between pt-3 text-[9px] text-[var(--text-tertiary)]">
                          <span>重要性 {card.importance}</span>
                          <span>{formatMemoryDate(card.updatedAt)}</span>
                        </div>
                      </article>
                      <article className="fan-face fan-back flex flex-col overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[0_24px_64px_rgba(15,23,42,0.35)]">
                        <header className="shrink-0 px-5 pb-2.5 pt-4">
                          <p className="flex items-center gap-2 text-[9px] tracking-wide text-[var(--text-tertiary)]">
                            {cardMeta.label}
                            {card.version > 1 ? <span className="tabular-nums">v{card.version}</span> : null}
                            <span>重要性 {card.importance}</span>
                          </p>
                          <h4 className="mt-1.5 line-clamp-2 break-words text-sm font-semibold leading-6 text-[var(--text-primary)]">{card.title}</h4>
                        </header>
                        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--border-subtle)] px-5 py-3.5">
                          <p className="whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-secondary)]">{card.content}</p>
                        </div>
                        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
                          <button type="button" onClick={() => onQuote(card)} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"><Quote className="h-3.5 w-3.5" />引用到对话</button>
                          <button type="button" onClick={() => onEdit(card)} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"><PencilLine className="h-3.5 w-3.5" />编辑卡片</button>
                        </footer>
                      </article>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={focus <= 0}
              aria-label="上一张"
              className="absolute left-5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-25"
            ><ChevronLeft className="h-4 w-4" /></button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={focus >= items.length - 1}
              aria-label="下一张"
              className="absolute right-5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-25"
            ><ChevronRight className="h-4 w-4" /></button>
          </>
        )}
      </div>

      <footer className="flex shrink-0 flex-col items-center gap-1.5 px-5 pb-5 pt-1" onClick={(event) => event.stopPropagation()}>
        <p className="text-[10px] text-white/50">← → 拨牌翻阅 · 点击卡片翻面读全文 · 右键编辑/引用 · Esc 收叠</p>
      </footer>
    </div>,
    document.body,
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
      className="fixed inset-0 z-[175] flex items-center justify-center bg-[rgba(15,23,42,0.32)] px-4 backdrop-blur-[3px]"
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
      className="fixed inset-0 z-[175] flex items-center justify-center bg-[rgba(15,23,42,0.32)] px-4 backdrop-blur-[3px]"
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
