import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Clock3, Flame, MessageSquareText, Search, TrendingUp, UserRound, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { getHotSearchKeywords, searchSuggest } from '@/features/search/api'
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistory,
} from '@/features/search/history'
import { cn } from '@/lib/utils'
import type { SearchSuggestItem } from '../../../shared/contracts/index.js'

const SUGGEST_DEBOUNCE_MS = 250

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}

function suggestIcon(type: SearchSuggestItem['type']) {
  if (type === 'novel') return <BookOpen className="h-4 w-4 text-[var(--text-tertiary)]" />
  if (type === 'author') return <UserRound className="h-4 w-4 text-[var(--text-tertiary)]" />
  return <MessageSquareText className="h-4 w-4 text-[var(--text-tertiary)]" />
}

function suggestHref(item: SearchSuggestItem): string {
  if (item.type === 'novel') return `/novel/${item.id}`
  if (item.type === 'author') return `/author/${item.id}`
  return `/post/${item.id}`
}

/** 全局搜索框：联想提示 + 搜索历史 + 热搜榜，支持键盘上下选择 */
export default function GlobalSearchBox({ className }: { className?: string }) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [keyword, setKeyword] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [history, setHistory] = useState<string[]>(() => getSearchHistory())

  const debouncedKeyword = useDebouncedValue(keyword.trim(), SUGGEST_DEBOUNCE_MS)

  const suggestQuery = useQuery({
    queryKey: ['search-suggest', debouncedKeyword],
    queryFn: () => searchSuggest(debouncedKeyword),
    enabled: open && debouncedKeyword.length > 0,
    staleTime: 30_000,
  })

  const hotQuery = useQuery({
    queryKey: ['search-hot'],
    queryFn: getHotSearchKeywords,
    enabled: open,
    staleTime: 5 * 60_000,
  })

  const suggestions = useMemo(
    () => (debouncedKeyword ? (suggestQuery.data?.items ?? []) : []),
    [debouncedKeyword, suggestQuery.data],
  )
  const hotKeywords = hotQuery.data?.keywords ?? []
  const showSuggest = keyword.trim().length > 0

  // 键盘可选项：联想项 + 最后一项“搜索 xxx”
  const optionCount = showSuggest ? suggestions.length + 1 : 0

  useEffect(() => {
    setActiveIndex(-1)
  }, [debouncedKeyword])

  // 点击组件外部关闭下拉
  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  function submitSearch(raw: string) {
    const normalized = raw.trim()
    if (!normalized) return

    setHistory(addSearchHistory(normalized))
    setOpen(false)
    inputRef.current?.blur()
    navigate(`/search?q=${encodeURIComponent(normalized)}`)
  }

  function openSuggestItem(item: SearchSuggestItem) {
    setHistory(addSearchHistory(item.type === 'post' ? keyword.trim() || item.text : item.text))
    setOpen(false)
    inputRef.current?.blur()
    navigate(suggestHref(item))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }

    if (!showSuggest) {
      if (event.key === 'Enter') submitSearch(keyword)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % Math.max(optionCount, 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + optionCount) % Math.max(optionCount, 1))
      return
    }
    if (event.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        openSuggestItem(suggestions[activeIndex])
      } else {
        submitSearch(keyword)
      }
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <label
        className={cn(
          'flex h-10 w-full items-center gap-3 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[color:var(--surface-default)]/96 px-4 text-sm backdrop-blur transition-colors md:h-11',
          'focus-within:border-[var(--accent-border)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        <input
          ref={inputRef}
          value={keyword}
          name="chevoink-search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setKeyword(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="搜索作品、作者、讨论"
          aria-label="搜索作品、作者、讨论"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
        {keyword ? (
          <button
            type="button"
            aria-label="清空搜索词"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setKeyword('')
              inputRef.current?.focus()
            }}
            className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-[var(--shadow-elevated)]">
          {showSuggest ? (
            <div className="max-h-[420px] overflow-y-auto py-2">
              {suggestions.map((item, index) => (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  onClick={() => openSuggestItem(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    index === activeIndex ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]',
                  )}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className={cn(
                        'shrink-0 object-cover',
                        item.type === 'author' ? 'h-8 w-8 rounded-full' : 'h-10 w-8 rounded-[4px]',
                      )}
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)]">
                      {suggestIcon(item.type)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--text-primary)]">{item.text}</span>
                    {item.subText ? (
                      <span className="block truncate text-xs text-[var(--text-tertiary)]">{item.subText}</span>
                    ) : null}
                  </span>
                </button>
              ))}
              {suggestQuery.isLoading && suggestions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[var(--text-tertiary)]">正在搜索...</p>
              ) : null}
              <button
                type="button"
                onClick={() => submitSearch(keyword)}
                onMouseEnter={() => setActiveIndex(suggestions.length)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                  activeIndex === suggestions.length ? 'bg-[var(--surface-muted)]' : 'hover:bg-[var(--surface-muted)]',
                )}
              >
                <Search className="h-4 w-4 shrink-0 text-[var(--color-brand)]" />
                <span className="text-[var(--color-brand)]">搜索“{keyword.trim()}”</span>
              </button>
            </div>
          ) : (
            <div className="max-h-[420px] space-y-4 overflow-y-auto p-4">
              {history.length > 0 ? (
                <section>
                  <div className="flex items-center justify-between">
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)]">
                      <Clock3 className="h-3.5 w-3.5" />
                      搜索历史
                    </p>
                    <button
                      type="button"
                      onClick={() => setHistory(clearSearchHistory())}
                      className="text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      清空
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {history.map((item) => (
                      <span
                        key={item}
                        className="group inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-muted)] py-1 pl-3 pr-1.5 text-sm text-[var(--text-secondary)]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setKeyword(item)
                            submitSearch(item)
                          }}
                          className="transition-colors hover:text-[var(--text-primary)]"
                        >
                          {item}
                        </button>
                        <button
                          type="button"
                          aria-label={`删除历史记录 ${item}`}
                          onClick={() => setHistory(removeSearchHistory(item))}
                          className="rounded-full p-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {hotKeywords.length > 0 ? (
                <section>
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)]">
                    <Flame className="h-3.5 w-3.5 text-[#f26a4b]" />
                    热搜榜
                  </p>
                  <div className="mt-1.5 grid gap-0.5 sm:grid-cols-2">
                    {hotKeywords.map((word, index) => (
                      <button
                        key={word}
                        type="button"
                        onClick={() => {
                          setKeyword(word)
                          submitSearch(word)
                        }}
                        className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-muted)]"
                      >
                        <span
                          className={cn(
                            'w-4 shrink-0 text-center text-sm font-bold italic',
                            index < 3 ? 'text-[#f26a4b]' : 'text-[var(--text-tertiary)]',
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="truncate text-sm text-[var(--text-secondary)]">{word}</span>
                        {index < 3 ? <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[#f26a4b]" /> : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {history.length === 0 && hotKeywords.length === 0 ? (
                <p className="py-2 text-sm text-[var(--text-tertiary)]">输入关键词，搜索作品、作者或讨论。</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
