import type { ComposerReference } from './agentStore'

function referenceLineLabel(reference: ComposerReference): string {
  return reference.startLine === reference.endLine
    ? `${reference.startLine}`
    : `${reference.startLine}-${reference.endLine}`
}

/** 按输入框中的真实位置组装提示词；已从 DOM 删除的引用不会进入请求。 */
export function buildComposerPrompt(draft: string, references: ComposerReference[]): string {
  const ordered = [...references].sort((left, right) => left.offset - right.offset)
  let cursor = 0
  const parts: string[] = []
  for (const reference of ordered) {
    const offset = Math.max(cursor, Math.min(draft.length, reference.offset))
    parts.push(draft.slice(cursor, offset))
    parts.push(`\n\n[引用：${reference.name} L${referenceLineLabel(reference)}]\n${reference.text}\n\n`)
    cursor = offset
  }
  parts.push(draft.slice(cursor))
  return parts.join('').trim()
}

export function formatReferenceLineLabel(reference: ComposerReference): string {
  return referenceLineLabel(reference)
}
