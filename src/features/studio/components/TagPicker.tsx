import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'

import { MAX_NOVEL_TAGS, NOVEL_TAG_GROUPS } from '@/lib/novel-tags'
import { cn } from '@/lib/utils'

type TagPickerProps = {
  value: string[]
  onChange: (tags: string[]) => void
}

/** 作品标签选择器：从统一标签体系中点选，支持输入搜索过滤 */
export default function TagPicker({ value, onChange }: TagPickerProps) {
  const [filter, setFilter] = useState('')

  const normalizedFilter = filter.trim().toLowerCase()
  const filteredGroups = useMemo(() => {
    if (!normalizedFilter) return NOVEL_TAG_GROUPS

    return NOVEL_TAG_GROUPS.map((group) => ({
      ...group,
      tags: group.tags.filter((tag) => tag.toLowerCase().includes(normalizedFilter)),
    })).filter((group) => group.tags.length > 0)
  }, [normalizedFilter])

  function toggleTag(tag: string) {
    if (value.includes(tag)) {
      onChange(value.filter((item) => item !== tag))
      return
    }
    if (value.length >= MAX_NOVEL_TAGS) return
    onChange([...value, tag])
  }

  return (
    <div className="space-y-2.5">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-contrast)] py-1 pl-3 pr-1.5 text-xs font-medium text-[var(--text-contrast)]"
            >
              {tag}
              <button
                type="button"
                aria-label={`移除标签 ${tag}`}
                onClick={() => toggleTag(tag)}
                className="rounded-full p-0.5 opacity-75 transition-opacity hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-tertiary)]">还没有选择标签，先从下面挑选最贴合作品的分类和题材。</p>
      )}

      <label className="flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-default)] px-3 text-sm focus-within:border-[var(--accent-border)]">
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="搜索标签，如：玄幻、系统、甜宠"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </label>

      <div className="max-h-56 space-y-3 overflow-y-auto rounded-[14px] border border-[var(--border-subtle)] p-3">
        {filteredGroups.length === 0 ? (
          <p className="py-2 text-center text-xs text-[var(--text-tertiary)]">没有匹配的标签，换个关键词试试。</p>
        ) : (
          filteredGroups.map((group) => (
            <section key={group.label}>
              <p className="text-xs font-medium text-[var(--text-tertiary)]">{group.label}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.tags.map((tag) => {
                  const selected = value.includes(tag)
                  const disabled = !selected && value.length >= MAX_NOVEL_TAGS
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      disabled={disabled}
                      className={cn(
                        'rounded-[var(--radius-pill)] px-2.5 py-1 text-xs transition-colors',
                        selected
                          ? 'bg-[var(--surface-contrast)] font-medium text-[var(--text-contrast)]'
                          : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                        disabled && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        已选 {value.length} / {MAX_NOVEL_TAGS} 个，第一个标签会作为作品的主分类。
      </p>
    </div>
  )
}
