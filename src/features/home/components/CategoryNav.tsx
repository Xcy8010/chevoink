import { useState } from 'react'
import { ChevronUp, LayoutGrid } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PRIMARY_CATEGORIES } from '../../../../shared/contracts/novel-tags'

type CategoryNavProps = {
  categories: string[]
  /** 当前高亮分类（可选） */
  activeCategory?: string
  /** 点击分类回调：再次点击已选中分类时传空字符串表示取消筛选 */
  onSelect: (category: string) => void
}

/** 收起态只露出的主流频道，顺序即展示顺序 */
const MAINSTREAM_CATEGORIES = ['玄幻', '都市', '仙侠', '奇幻', '科幻', '悬疑', '历史', '游戏', '古代言情', '现代言情']

/** 分类快捷导航：默认展示主流频道，点击末尾按钮展开全部分类；点击分类在首页内筛选作品 */
export default function CategoryNav({ activeCategory, onSelect }: CategoryNavProps) {
  const [expanded, setExpanded] = useState(false)

  // 分类内容与创作区作品设置保持同源：男频 + 女频全部主分类（shared/contracts/novel-tags）
  const categories = PRIMARY_CATEGORIES

  const mainstream = categories.filter((category) => MAINSTREAM_CATEGORIES.includes(category))
  const collapsedCategories = mainstream.length > 0 ? mainstream : categories.slice(0, 10)
  // 收起态下若当前选中的分类不在主流频道里，也要保持可见，避免高亮“消失”
  const visibleCategories = expanded
    ? categories
    : activeCategory && !collapsedCategories.includes(activeCategory)
      ? [...collapsedCategories, activeCategory]
      : collapsedCategories

  return (
    // 展开按钮放在滚动区之外固定右侧：收起态窄屏横滑时按钮始终可见，不会随内容滚出屏幕
    <nav aria-label="作品分类" className="-mx-1 flex items-start gap-1 px-1">
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1',
          // 展开态用流式排布 + 行内两端对齐：标签按自身宽度依次排满每一行，
          // 行尾不留空位（水平方向撑满），按钮不缩不换行保证文字完整
          expanded ? 'flex-wrap justify-between gap-x-2 gap-y-2' : 'rail-scroll',
        )}
      >
        {visibleCategories.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={category === activeCategory}
            onClick={(event) => {
              onSelect(category === activeCategory ? '' : category)
              // 触屏（尤其 APP 壳 WebView）tap 后按钮会残留 focus/hover 淡色态：
              // 再次点击取消选中后外面仍围着一圈淡色圈，点击后立即收回焦点
              event.currentTarget.blur()
            }}
            className={cn(
              'press-feedback shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] px-3.5 py-1.5 text-sm transition-colors',
              category === activeCategory
                ? 'bg-[var(--color-brand)] font-semibold text-white'
                // hover 背景仅在支持 hover 的设备（鼠标）生效：触屏 tap 会粘住 :hover，
                // 取消选中后残留淡色背景圈，用 @media(hover:hover) 门控后与网页端一致
                : 'text-[var(--text-secondary)] [@media(hover:hover)]:hover:bg-[var(--surface-muted)] [@media(hover:hover)]:hover:text-[var(--text-primary)]',
            )}
          >
            {category}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={expanded ? '收起分类' : '展开全部分类'}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="press-feedback inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-pill)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
      >
        {expanded ? <ChevronUp className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
      </button>
    </nav>
  )
}
