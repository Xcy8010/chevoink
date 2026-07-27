import type { QueryClient } from '@tanstack/react-query'

import type { Post } from '../../../shared/contracts/index.js'

type PostPatch = Partial<Pick<Post, 'likeCount' | 'favoriteCount' | 'likedByViewer' | 'bookmarkedByViewer'>>

/**
 * 把帖子互动的服务端权威状态写回所有含该帖子的 community 缓存
 * （社区列表、帖子详情、作者页、个人主页喜欢列表等），保证点赞/收藏跨页面一致。
 * 对不含该帖子的缓存原样返回引用，不触发无关重渲染。
 */
export function patchPostInCaches(queryClient: QueryClient, postId: string, patch: PostPatch) {
  const patchItems = (items: unknown): unknown => {
    if (!Array.isArray(items)) return items
    let changed = false
    const next = items.map((item) => {
      if (item && typeof item === 'object' && (item as Post).id === postId) {
        changed = true
        return { ...(item as Post), ...patch }
      }
      return item
    })
    return changed ? next : items
  }

  queryClient.setQueriesData({ queryKey: ['community'] }, (data: unknown) => {
    if (!data || typeof data !== 'object') return data
    const record = data as Record<string, unknown>

    // 无限滚动列表：{ pages: [{ items: Post[] }] }
    if (Array.isArray(record.pages)) {
      let changed = false
      const pages = record.pages.map((page) => {
        if (!page || typeof page !== 'object') return page
        const pageRecord = page as Record<string, unknown>
        const items = patchItems(pageRecord.items)
        if (items === pageRecord.items) return page
        changed = true
        return { ...pageRecord, items }
      })
      return changed ? { ...record, pages } : data
    }

    // 普通列表：{ items: Post[] }
    if (Array.isArray(record.items)) {
      const items = patchItems(record.items)
      return items === record.items ? data : { ...record, items }
    }

    // 帖子详情：{ post: Post, ... }
    const post = record.post
    if (post && typeof post === 'object' && (post as Post).id === postId) {
      return { ...record, post: { ...(post as Post), ...patch } }
    }

    return data
  })
}
