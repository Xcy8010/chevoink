/**
 * 书架 + 阅读进度的云端同步层（跨设备一致性）。
 *
 * 设计：localStorage 仍作为各处同步读取的缓存，服务端为最终数据源。
 * - 写操作：本地写入后 fire-and-forget 写穿服务端（pushXxx），失败静默不打断交互；
 * - 登录时水合（hydrateReadingSync）：拉取服务端数据合并进本地，首次同步把本地独有条目迁移上云。
 */

import type { ReadingProgressItem, SaveReadingProgressRequest } from '../../../shared/contracts/index.js'
import {
  listReadingProgress,
  removeReadingProgress as apiRemoveReadingProgress,
  saveReadingProgress as apiSaveReadingProgress,
} from '../community/api'
import {
  getLocalShelf,
  removeFromShelf,
  upsertShelfRaw,
} from './local-shelf'
import {
  getAllReadingProgress,
  getReadingProgress,
  removeReadingProgressRaw,
  upsertReadingProgressRaw,
} from './reading-progress'

/** 首次迁移标记：置位后水合以服务端为准（清理别处已删除的条目） */
const MIGRATED_KEY = 'chevoink-reading-synced'

// ── 写穿服务端（fire-and-forget，失败静默） ────────────────────────────

/** 打开章节时写回完整阅读进度（章节 + 章内位置语义由服务端处理） */
export function pushProgress(input: SaveReadingProgressRequest) {
  void apiSaveReadingProgress(input).catch(() => {})
}

/** 章内滚动防抖写回（仅更新滚动位置，章节不匹配服务端忽略） */
export function pushScrollProgress(novelId: string, novelTitle: string, chapterId: string, scrollPercent: number) {
  void apiSaveReadingProgress({ novelId, novelTitle, chapterId, scrollPercent, scrollOnly: true }).catch(() => {})
}

/** 加入书架（未开始阅读，保留已有进度） */
export function pushShelfAdd(novelId: string, novelTitle: string, coverUrl: string | null) {
  void apiSaveReadingProgress({ novelId, novelTitle, coverUrl, shelfOnly: true }).catch(() => {})
}

/** 移出书架：同步清理本地进度并删除服务端行 */
export function pushShelfRemove(novelId: string) {
  removeReadingProgressRaw(novelId)
  void apiRemoveReadingProgress(novelId).catch(() => {})
}

// ── 登录水合 ──────────────────────────────────────────────────────────

let hydrating: Promise<boolean> | null = null

/**
 * 拉取服务端书架/进度并与本地合并。返回本地是否发生变更（供调用方触发重渲染）。
 * 并发去重：同一时刻只跑一次。未登录/网络失败时保持本地缓存不变。
 */
export function hydrateReadingSync(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (hydrating) return hydrating
  hydrating = doHydrate().finally(() => {
    hydrating = null
  })
  return hydrating
}

async function doHydrate(): Promise<boolean> {
  const migrated = window.localStorage.getItem(MIGRATED_KEY) === '1'

  let items: ReadingProgressItem[]
  try {
    const data = await listReadingProgress()
    items = data.items
  } catch {
    // 未登录或网络失败：保留本地缓存，不做任何改动
    return false
  }

  let changed = false
  const serverIds = new Set(items.map((item) => item.novelId))
  // 本地封面兜底：云端快照封面为空时保留本地已有封面，不让空值把本地图覆盖掉
  const localCoverByNovelId = new Map(getLocalShelf().map((entry) => [entry.novelId, entry.coverUrl] as const))

  // 1) 服务端 → 本地：书架成员身份 + 阅读进度（进度按 updatedAt 取新）
  for (const item of items) {
    upsertShelfRaw({
      novelId: item.novelId,
      title: item.novelTitle,
      coverUrl: item.coverUrl ?? localCoverByNovelId.get(item.novelId) ?? null,
      addedAt: Date.parse(item.addedAt) || Date.now(),
    })
    changed = true

    if (item.chapterId) {
      const local = getReadingProgress(item.novelId)
      const serverUpdated = Date.parse(item.updatedAt) || Date.now()
      if (!local || serverUpdated >= local.updatedAt) {
        upsertReadingProgressRaw({
          novelId: item.novelId,
          novelTitle: item.novelTitle,
          chapterId: item.chapterId,
          chapterTitle: item.chapterTitle ?? '',
          chapterOrder: item.chapterOrder,
          totalChapters: item.totalChapters,
          scrollPercent: item.scrollPercent,
          updatedAt: serverUpdated,
        })
      }
    }
  }

  // 2) 本地独有条目
  const localShelf = getLocalShelf()
  const localProgress = getAllReadingProgress()
  const localOnlyIds = new Set<string>()
  for (const entry of localShelf) {
    if (!serverIds.has(entry.novelId)) localOnlyIds.add(entry.novelId)
  }
  for (const novelId of Object.keys(localProgress)) {
    if (!serverIds.has(novelId)) localOnlyIds.add(novelId)
  }

  if (!migrated) {
    // 首次同步：把本地独有条目迁移上云（多端合并）
    for (const novelId of localOnlyIds) {
      const progress = localProgress[novelId]
      const shelfEntry = localShelf.find((entry) => entry.novelId === novelId)
      try {
        if (progress && progress.chapterId) {
          await apiSaveReadingProgress({
            novelId,
            novelTitle: progress.novelTitle || shelfEntry?.title || '未命名作品',
            coverUrl: shelfEntry?.coverUrl ?? null,
            chapterId: progress.chapterId,
            chapterTitle: progress.chapterTitle,
            chapterOrder: progress.chapterOrder,
            totalChapters: progress.totalChapters,
            scrollPercent: progress.scrollPercent ?? 0,
          })
        } else if (shelfEntry) {
          await apiSaveReadingProgress({
            novelId,
            novelTitle: shelfEntry.title,
            coverUrl: shelfEntry.coverUrl,
            shelfOnly: true,
          })
        }
      } catch {
        // 单条迁移失败（如作品已删除）不阻断整体
      }
    }
    window.localStorage.setItem(MIGRATED_KEY, '1')
  } else {
    // 已迁移过：服务端为准，清除别处已移出书架的条目
    for (const novelId of localOnlyIds) {
      removeFromShelf(novelId)
      removeReadingProgressRaw(novelId)
      changed = true
    }
  }

  return changed
}
