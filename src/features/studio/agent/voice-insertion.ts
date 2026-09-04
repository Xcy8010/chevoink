import type { ComposerReference } from './agentStore'

/** Text offsets exclude reference chips. Chips at the insertion boundary keep their side. */
export function insertVoiceTranscript(
  draft: string,
  references: ComposerReference[],
  text: string,
  offset = draft.length,
  precedingReferenceIds: readonly string[] = references.map((reference) => reference.id),
) {
  const at = Math.max(0, Math.min(draft.length, offset))
  const preceding = new Set(precedingReferenceIds)
  return {
    draft: draft.slice(0, at) + text + draft.slice(at),
    references: references.map((reference) => ({
      ...reference,
      offset: reference.offset > at || (reference.offset === at && !preceding.has(reference.id))
        ? reference.offset + text.length
        : reference.offset,
    })),
    caret: at + text.length,
  }
}
