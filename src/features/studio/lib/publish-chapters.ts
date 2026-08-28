import type { ChapterListItem } from '../../../../shared/contracts/index.js'

/** 已公开章节只有创作稿版本与发布快照一致时才无需再次发布。 */
export function hasUnpublishedChapterChanges(chapter: ChapterListItem): boolean {
  return chapter.status === 'published' && chapter.publishedRevision !== chapter.revision
}

export function getPublishableChapters(chapters: ChapterListItem[]): ChapterListItem[] {
  return chapters.filter(
    (chapter) =>
      chapter.status !== 'published' ||
      chapter.visibility !== 'public' ||
      hasUnpublishedChapterChanges(chapter),
  )
}
