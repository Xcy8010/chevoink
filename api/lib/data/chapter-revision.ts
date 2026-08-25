export const CHAPTER_REVISION_CONFLICT_CODE = 'CHAPTER_REVISION_CONFLICT'
export const CHAPTER_REVISION_CONFLICT_MESSAGE =
  '章节已在其他位置更新，请重新载入最新内容后再保存。'

/** expectedRevision 缺省仅用于兼容旧客户端；新链路必须携带并严格比对。 */
export function isChapterRevisionCurrent(
  expectedRevision: number | undefined,
  currentRevision: number,
): boolean {
  return expectedRevision === undefined || expectedRevision === currentRevision
}
