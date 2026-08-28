import { describe, expect, it } from 'vitest'

import { getPublishableChapters, hasUnpublishedChapterChanges } from '../../src/features/studio/lib/publish-chapters.js'
import type { ChapterListItem } from '../../shared/contracts/index.js'

function chapter(overrides: Partial<ChapterListItem> = {}): ChapterListItem {
  return {
    id: 'chapter-1',
    novelId: 'novel-1',
    title: '第一章',
    summary: null,
    orderIndex: 1,
    volumeId: 'volume-1',
    orderInVolume: 1,
    wordCount: 1000,
    status: 'published',
    visibility: 'public',
    commentCount: 0,
    revision: 3,
    publishedRevision: 3,
    publishedAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  }
}

describe('发布章节筛选', () => {
  it('公开已发布章节修改后重新进入更新发布列表', () => {
    const changed = chapter({ revision: 4, publishedRevision: 3 })
    expect(hasUnpublishedChapterChanges(changed)).toBe(true)
    expect(getPublishableChapters([changed])).toEqual([changed])
  })

  it('发布快照与创作稿一致时不重复发布', () => {
    expect(getPublishableChapters([chapter()])).toEqual([])
  })
})
