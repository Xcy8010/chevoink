import { describe, expect, it } from 'vitest'

import {
  toChapter,
  toPublishedChapter,
  toPublishedVolumeListItem,
} from '../../api/lib/data/internal.js'

const chapterRecord = {
  id: 'chapter-1',
  novelId: 'novel-1',
  title: '创作稿新标题',
  summary: '创作稿新摘要',
  content: '创作稿新正文',
  orderIndex: 1,
  volumeId: 'volume-1',
  orderInVolume: 1,
  wordCount: 7,
  status: 'published' as const,
  visibility: 'public' as const,
  revision: 5,
  publishedTitle: '已发布标题',
  publishedSummary: '已发布摘要',
  publishedContent: '已发布正文',
  publishedWordCount: 6,
  publishedRevision: 3,
}

describe('章节发布快照', () => {
  it('作者读取创作稿，读者读取最近一次显式发布的内容', () => {
    expect(toChapter(chapterRecord)).toMatchObject({
      title: '创作稿新标题',
      content: '创作稿新正文',
      revision: 5,
      publishedRevision: 3,
    })
    expect(toPublishedChapter(chapterRecord)).toMatchObject({
      title: '已发布标题',
      summary: '已发布摘要',
      content: '已发布正文',
      wordCount: 6,
      revision: 3,
      publishedRevision: 3,
    })
  })

  it('公开卷统计不提前计入尚未发布的创作稿字数', () => {
    expect(toPublishedVolumeListItem({
      id: 'volume-1',
      novelId: 'novel-1',
      title: '第一卷',
      orderIndex: 1,
      chapters: [
        { wordCount: 900, publishedWordCount: 600, publishedRevision: 3 },
        { wordCount: 400, publishedRevision: null },
      ],
    }).wordCount).toBe(1000)
  })
})
