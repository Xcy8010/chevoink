import type { WorkspaceActivity } from './agentStore'
import { buildReviewDiff } from '../components/diff'

export type BodyChange = { key: string; title: string; added: number; removed: number; activity: WorkspaceActivity }
/** One entry per document, initial body -> latest successful body. Non-body tools never enter this view. */
export function workspaceBodyChanges(activities: WorkspaceActivity[]): BodyChange[] {
  const documents = new Map<string, { before: string; after: string; title: string; activity: WorkspaceActivity }>()
  for (const activity of activities) {
    if (activity.status !== 'done') continue
    const display = activity.display
    let key: string, title: string, before: string, after: string
    if (display?.kind === 'chapterDiff') {
      key = `chapter:${display.chapterId}`; title = display.chapterTitle; before = display.before; after = display.after
    } else if (display?.kind === 'planDiff') {
      key = `plan:${display.artifactId}`; title = display.title; before = display.before; after = display.after
    } else if (display?.kind === 'planFile' && activity.toolName === 'plan_save') {
      key = `plan:${display.artifactId}`; title = display.title; before = ''; after = display.content
    } else if (activity.chapterId && typeof activity.before === 'string' && typeof activity.after === 'string') {
      key = `chapter:${activity.chapterId}`; title = activity.label; before = activity.before; after = activity.after
    } else continue
    if (before === after) continue
    const existing = documents.get(key)
    documents.delete(key) // insertion order is last changed order, including re-edits
    documents.set(key, { before: existing?.before ?? before, after, title, activity })
  }
  return [...documents.entries()].flatMap(([key, item]) => {
    if (item.before === item.after) return []
    const { segments } = buildReviewDiff(item.before, item.after)
    let added = 0, removed = 0
    for (const segment of segments) {
      if (segment.kind === 'added') added += Array.from(segment.text).length
      if (segment.kind === 'removed') removed += Array.from(segment.text).length
    }
    return [{ key, title: item.title, added, removed, activity: item.activity }]
  })
}
