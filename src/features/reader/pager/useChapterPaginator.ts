/**
 * 章节分页引擎（方案 20 §2.1）：离屏测量 + 逐段落二分切割。
 *
 * - 与正文同宽同字体的隐藏容器里逐段灌入文本，按页可用高度装箱；
 * - 段落装不下时对该段做字符级二分切割，切点避开标点行首/行尾禁则；
 * - 每页保留 `{ paragraphIndex, startChar, endChar }` 映射，段评/听书高亮/划线继续按段索引工作；
 * - 结果按「章节+字号+视口」缓存，字号或旋屏变化才重排。
 */

import { useMemo } from 'react'

/** 一页内的一个正文片段（同一段落可能被切到相邻两页） */
export type PageBlock = {
  paragraphIndex: number
  startChar: number
  endChar: number
}

export type ReaderPageContent = {
  index: number
  blocks: PageBlock[]
  /** 本页首字符在整章中的全局字符偏移，供改字号后回到同一处正文 */
  startCharOffset: number
  /** 本页顶部是否带章节标题（仅本章第 1 页） */
  showTitle: boolean
}

export type PaginateLayout = {
  /** 正文可用宽度 */
  width: number
  /** 单页可用高度 */
  height: number
  fontSize: number
  lineHeight: number
  /** 段间距 */
  paragraphGap: number
}

export type PaginateResult = {
  pages: ReaderPageContent[]
  /** 段落序号 → 该段首次出现的页码 */
  paragraphPageMap: Map<number, number>
  /** 实测每页平均字数，用于估算其他章节页数 */
  avgCharsPerPage: number
  totalChars: number
}

const EMPTY_RESULT: PaginateResult = {
  pages: [],
  paragraphPageMap: new Map(),
  avgCharsPerPage: 0,
  totalChars: 0,
}

/** 不宜出现在行首的标点：切点落在它前面时把它带到上一页 */
const NO_LINE_START = '，。！？；：、）】》」』””’%…—～'
/** 不宜出现在行尾的标点：切点落在它后面时回退一个字符 */
const NO_LINE_END = '（【《「『““‘'

/**
 * 章节标题块的版式（分页测量与正文渲染必须完全一致）：
 * 标题字号按正文字号等比放大，左侧一道品牌色竖条。
 */
export const PAGE_TITLE_STYLE = {
  scale: 1.32,
  lineHeight: 1.45,
  /** 左竖条宽度 */
  barWidth: 3,
  /** 竖条与标题文字的间距 */
  barGap: 12,
  /** 标题与正文首段的间距 */
  gapBelow: 26,
}

const MEASURER_ID = 'reader-paginator-measurer'
const ASYNC_MEASURER_ID = 'reader-paginator-measurer-async'
const CACHE_LIMIT = 32
const paginateCache = new Map<string, PaginateResult>()
/** 分片预热的单片时间预算：超时就让出主线程，避免整章测量卡住触摸/翻页 */
const WARM_CHUNK_BUDGET_MS = 5
/** 异步预热任务串行队列：测量节点只有一个，并发让出时会互相覆盖文本 */
let warmQueue: Promise<unknown> = Promise.resolve()

function createMeasurer(id: string): HTMLDivElement {
  const node = document.createElement('div')
  node.id = id
  node.setAttribute('aria-hidden', 'true')
  document.body.appendChild(node)
  return node
}

function getMeasurer(): HTMLDivElement {
  const existing = document.getElementById(MEASURER_ID)
  if (existing) return existing as HTMLDivElement
  return createMeasurer(MEASURER_ID)
}

/** 把切点微调到标点禁则允许的位置 */
function adjustCut(text: string, cut: number): number {
  let next = cut
  // 下一页首字符是收尾标点：带回上一页（最多带两个，避免连续标点串把整行拖走）
  for (let i = 0; i < 2; i += 1) {
    if (next < text.length && NO_LINE_START.includes(text[next])) next += 1
    else break
  }
  // 本页末字符是开引号：回退，别把引号孤零零留在行尾
  while (next > 1 && NO_LINE_END.includes(text[next - 1])) next -= 1
  return Math.min(text.length, Math.max(1, next))
}

function paginate(
  paragraphs: string[],
  layout: PaginateLayout,
  title: string,
  yieldGuard?: () => Promise<void>,
  measurerNode?: HTMLDivElement,
): PaginateResult | Promise<PaginateResult> {
  const { width, height, fontSize, lineHeight, paragraphGap } = layout
  if (paragraphs.length === 0 || width <= 0 || height <= 0) return EMPTY_RESULT

  const node = measurerNode ?? getMeasurer()
  const style = node.style
  style.position = 'fixed'
  style.left = '-10000px'
  style.top = '0'
  style.zIndex = '-1'
  style.visibility = 'hidden'
  style.pointerEvents = 'none'
  style.letterSpacing = '0.01em'
  style.whiteSpace = 'pre-wrap'
  style.wordBreak = 'break-word'
  style.margin = '0'
  style.padding = '0'

  // 先量章节标题块（占用首页顶部高度），再切回正文版式
  let titleHeight = 0
  if (title.length > 0) {
    style.width = `${Math.max(1, width - PAGE_TITLE_STYLE.barWidth - PAGE_TITLE_STYLE.barGap)}px`
    style.fontSize = `${Math.round(fontSize * PAGE_TITLE_STYLE.scale)}px`
    style.lineHeight = String(PAGE_TITLE_STYLE.lineHeight)
    style.fontWeight = '700'
    style.textIndent = '0'
    node.textContent = title
    titleHeight = node.getBoundingClientRect().height
  }

  style.width = `${width}px`
  style.fontSize = `${fontSize}px`
  style.lineHeight = String(lineHeight)
  style.fontWeight = 'normal'

  const measure = (text: string, indent: boolean) => {
    style.textIndent = indent ? '2em' : '0'
    node.textContent = text.length > 0 ? text : '　'
    return node.getBoundingClientRect().height
  }

  const singleLine = fontSize * lineHeight
  const pages: ReaderPageContent[] = []
  const paragraphPageMap = new Map<number, number>()

  const titleReserve = titleHeight > 0 ? titleHeight + PAGE_TITLE_STYLE.gapBelow : 0

  let blocks: PageBlock[] = []
  let used = titleReserve
  let pageStartOffset = 0
  let globalOffset = 0
  let totalChars = 0

  /** 首页顶部已被标题占位：即使一段正文都放不下也要把这页发出去 */
  const titlePagePending = () => pages.length === 0 && titleReserve > 0

  const flushPage = () => {
    const showTitle = titlePagePending()
    if (blocks.length === 0 && !showTitle) return
    pages.push({ index: pages.length, blocks, startCharOffset: pageStartOffset, showTitle })
    blocks = []
    used = 0
    pageStartOffset = globalOffset
  }

  const finish = (): PaginateResult => {
    flushPage()
    node.textContent = ''

    return {
      pages,
      paragraphPageMap,
      avgCharsPerPage: pages.length > 0 ? totalChars / pages.length : 0,
      totalChars,
    }
  }

  // 分片模式（预热专用）：每处理几段就让出主线程，整章测量不再阻塞触摸/翻页帧；
  // 同步模式（渲染线程缓存未命中）保持原有行为不变。
  if (yieldGuard) {
    const run = async (): Promise<PaginateResult> => {
      for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
        consumeParagraph(paragraphIndex)
        if (paragraphIndex % 4 === 3) await yieldGuard()
      }
      return finish()
    }
    return run()
  }

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    consumeParagraph(paragraphIndex)
  }
  return finish()

  function consumeParagraph(paragraphIndex: number) {
    const text = paragraphs[paragraphIndex]
    totalChars += text.length
    let start = 0
    let continuation = false

    // 同一段落可能跨多页，循环直到本段消费完
    for (;;) {
      const gap = blocks.length > 0 ? paragraphGap : 0
      const remaining = height - used - gap
      const slice = text.slice(start)
      const fullHeight = measure(slice, !continuation)

      if (fullHeight <= remaining) {
        if (!paragraphPageMap.has(paragraphIndex)) paragraphPageMap.set(paragraphIndex, pages.length)
        blocks.push({ paragraphIndex, startChar: start, endChar: text.length })
        used += gap + fullHeight
        globalOffset += slice.length
        break
      }

      // 本页剩余高度连一行都放不下：直接翻页（页内已有内容时才有意义）
      if (remaining < singleLine * 1.1 && (blocks.length > 0 || titlePagePending())) {
        flushPage()
        continue
      }

      // 二分找本页能放下的最大字符数
      let lo = 1
      let hi = slice.length
      let best = 0
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (measure(slice.slice(0, mid), !continuation) <= remaining) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }

      if (best <= 0) {
        // 极端情况（页高小于一行）：兜底放一个字符，避免死循环
        if (blocks.length > 0 || titlePagePending()) {
          flushPage()
          continue
        }
        best = 1
      }

      const cut = adjustCut(slice, best)
      if (!paragraphPageMap.has(paragraphIndex)) paragraphPageMap.set(paragraphIndex, pages.length)
      blocks.push({ paragraphIndex, startChar: start, endChar: start + cut })
      start += cut
      globalOffset += cut
      continuation = true
      flushPage()

      if (start >= text.length) break
    }
  }
}

/** 带缓存的分页计算：同一章节/字号/视口只算一次 */
export function paginateChapter(
  cacheKey: string,
  paragraphs: string[],
  layout: PaginateLayout,
  title = '',
): PaginateResult {
  const cached = paginateCache.get(cacheKey)
  if (cached) return cached

  const result = paginate(paragraphs, layout, title) as PaginateResult
  paginateCache.set(cacheKey, result)
  if (paginateCache.size > CACHE_LIMIT) {
    const oldest = paginateCache.keys().next().value
    if (oldest) paginateCache.delete(oldest)
  }
  return result
}

/**
 * 只读查询分页缓存（不触发测量）：章边界预渲染相邻章边界页用——
 * 预热命中才渲染，未命中不落回同步测量，避免把整章测量卡进翻页帧
 */
export function getPaginationCache(cacheKey: string): PaginateResult | undefined {
  return paginateCache.get(cacheKey)
}

/**
 * 预热专用分页：命中缓存直接返回，未命中则分片异步测量（每片超预算即 setTimeout(0)
 * 让出主线程），整章测量不再一口气卡住渲染线程。与 paginateChapter 共用同一份缓存；
 * 用独立的测量节点 + 串行队列，异步让出期间不会与渲染线程的同步测量互相污染。
 */
export function paginateChapterAsync(
  cacheKey: string,
  paragraphs: string[],
  layout: PaginateLayout,
  title = '',
): Promise<PaginateResult> {
  const task = warmQueue.then(async (): Promise<PaginateResult> => {
    const cached = paginateCache.get(cacheKey)
    if (cached) return cached

    const node = document.getElementById(ASYNC_MEASURER_ID) as HTMLDivElement | null
    const measurerNode = node ?? createMeasurer(ASYNC_MEASURER_ID)

    let chunkStart = performance.now()
    const yieldGuard = async () => {
      if (performance.now() - chunkStart < WARM_CHUNK_BUDGET_MS) return
      chunkStart = performance.now()
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }

    const result = await (paginate(
      paragraphs,
      layout,
      title,
      yieldGuard,
      measurerNode,
    ) as Promise<PaginateResult>)
    paginateCache.set(cacheKey, result)
    if (paginateCache.size > CACHE_LIMIT) {
      const oldest = paginateCache.keys().next().value
      if (oldest) paginateCache.delete(oldest)
    }
    return result
  })
  // 队列失败不阻断后续预热任务
  warmQueue = task.catch((): undefined => undefined)
  return task
}

/** 页码 → 页首字符偏移；用于改字号/旋屏重排后回到同一处正文 */
export function findPageByCharOffset(pages: ReaderPageContent[], charOffset: number): number {
  if (pages.length === 0) return 0
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    if (pages[index].startCharOffset <= charOffset) return index
  }
  return 0
}

/**
 * 段落 + 段内字符位置 → 页码。
 * 一段可能被切到相邻两页，只按 paragraphPageMap（段落首次出现页）定位时，
 * 听书读到该段后半部分仍会停在上一页，必须结合段内位置取真正承载该字符的那一页。
 */
export function findPageForParagraphChar(
  pages: ReaderPageContent[],
  paragraphIndex: number,
  charOffset: number,
): number | undefined {
  let last: number | undefined
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.paragraphIndex !== paragraphIndex) continue
      last = page.index
      if (charOffset < block.endChar) return page.index
    }
  }
  // 位置折算有误差落到段尾之外时，退回该段最后出现的页
  return last
}

export const EMPTY_PAGINATE_RESULT = EMPTY_RESULT

type UseChapterPaginatorArgs = {
  /** 分页模式开启且视口尺寸就绪时才测量 */
  enabled: boolean
  paragraphs: string[]
  /** 章节身份（含 updatedAt），参与缓存键 */
  chapterKey: string
  /** 排在正文最前面的章节标题（空串则不排标题块） */
  title: string
  layout: PaginateLayout
}

/** 分页结果 hook：依赖变化（章节/字号/视口）才重排，其余时候直接命中缓存 */
export function useChapterPaginator({
  enabled,
  paragraphs,
  chapterKey,
  title,
  layout,
}: UseChapterPaginatorArgs): PaginateResult {
  const { width, height, fontSize, lineHeight, paragraphGap } = layout
  const ready = enabled && width > 0 && height > 0 && paragraphs.length > 0
  const cacheKey = `${chapterKey}|${title.length}|${fontSize}|${lineHeight}|${Math.round(width)}x${Math.round(height)}|${paragraphGap}`

  return useMemo(() => {
    if (!ready) return EMPTY_RESULT
    return paginateChapter(cacheKey, paragraphs, { width, height, fontSize, lineHeight, paragraphGap }, title)
    // paragraphs 与 cacheKey 同源变化，以 cacheKey 作为唯一重算信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cacheKey])
}
