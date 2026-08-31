import type { ComposerReference } from './agentStore'

export const COMPOSER_REFERENCE_MIME = 'application/x-chevoink-reference'

export function serializeComposerReferenceTransfer(reference: Omit<ComposerReference, 'offset'>): string {
  return JSON.stringify(reference)
}

export function parseComposerReferenceTransfer(value: string): Omit<ComposerReference, 'offset'> | null {
  if (!value) return null
  try {
    const item = JSON.parse(value) as Partial<ComposerReference>
    if (
      typeof item.id !== 'string'
      || (item.kind !== 'chapter' && item.kind !== 'plan' && item.kind !== 'catalog')
      || typeof item.name !== 'string'
      || typeof item.text !== 'string'
      || typeof item.startLine !== 'number'
      || typeof item.endLine !== 'number'
    ) return null
    return {
      id: item.id,
      kind: item.kind,
      name: item.name,
      text: item.text,
      startLine: item.startLine,
      endLine: item.endLine,
    }
  } catch {
    return null
  }
}

function referenceLineLabel(reference: ComposerReference): string {
  return reference.startLine === reference.endLine
    ? `${reference.startLine}`
    : `${reference.startLine}-${reference.endLine}`
}

export function referenceKindLabel(reference: ComposerReference): string {
  if (reference.kind === 'catalog') return '目录'
  if (reference.kind === 'plan') return '计划'
  return '章节'
}

/** 按输入框中的真实位置组装提示词；已从 DOM 删除的引用不会进入请求。 */
export function buildComposerPrompt(draft: string, references: ComposerReference[]): string {
  const ordered = [...references].sort((left, right) => left.offset - right.offset)
  let cursor = 0
  const parts: string[] = []
  for (const reference of ordered) {
    const offset = Math.max(cursor, Math.min(draft.length, reference.offset))
    parts.push(draft.slice(cursor, offset))
    parts.push(`\n\n[${referenceKindLabel(reference)}引用：${reference.name} L${referenceLineLabel(reference)}]\n${reference.text}\n\n`)
    cursor = offset
  }
  parts.push(draft.slice(cursor))
  return parts.join('').trim()
}

export function formatReferenceLineLabel(reference: ComposerReference): string {
  return referenceLineLabel(reference)
}
