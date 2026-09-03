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
      || (item.kind !== 'chapter' && item.kind !== 'plan' && item.kind !== 'catalog' && item.kind !== 'memory')
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
  // 记忆卡片没有行号概念，标签置空，由 referencePositionLabel 统一给出「卡片」文案
  if (reference.kind === 'memory') return ''
  return reference.startLine === reference.endLine
    ? `${reference.startLine}`
    : `${reference.startLine}-${reference.endLine}`
}

/** 引用 chip 右侧的位置文案：行号或「卡片」 */
export function referencePositionLabel(reference: ComposerReference): string {
  return reference.kind === 'memory' ? '卡片' : referenceLineLabel(reference)
}

/** 提示词中的引用后缀：记忆引用不带 L 行号 */
function referencePromptSuffix(reference: ComposerReference): string {
  return reference.kind === 'memory' ? '' : ` L${referenceLineLabel(reference)}`
}

export function referenceKindLabel(reference: ComposerReference): string {
  if (reference.kind === 'catalog') return '目录'
  if (reference.kind === 'plan') return '计划'
  if (reference.kind === 'memory') return '记忆'
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
    parts.push(`\n\n[${referenceKindLabel(reference)}引用：${reference.name}${referencePromptSuffix(reference)}]\n${reference.text}\n\n`)
    cursor = offset
  }
  parts.push(draft.slice(cursor))
  return parts.join('').trim()
}

export function formatReferenceLineLabel(reference: ComposerReference): string {
  return referenceLineLabel(reference)
}
