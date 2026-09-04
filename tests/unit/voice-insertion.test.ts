import { describe, expect, it } from 'vitest'
import { insertVoiceTranscript } from '../../src/features/studio/agent/voice-insertion'
import type { ComposerReference } from '../../src/features/studio/agent/agentStore'

const chip = (id: string, offset: number): ComposerReference => ({ id, offset, kind: 'chapter', name: id, startLine: 1, endLine: 1, text: '章节' })

describe('voice transcript insertion', () => {
  it('inserts without replacing existing draft or reference content', () => {
    const refs = [chip('before', 1), chip('after', 2)]
    const result = insertVoiceTranscript('续写下一章', refs, 'Please ', 2, ['before'])
    expect(result.draft).toBe('续写Please 下一章')
    expect(result.references.map((ref) => ref.offset)).toEqual([1, 9])
    expect(refs[1].offset).toBe(2)
  })
  it('keeps chips on both sides of the same text offset', () => {
    const result = insertVoiceTranscript('AB', [chip('left', 1), chip('right', 1)], '中文', 1, ['left'])
    expect(result.references.map((ref) => ref.offset)).toEqual([1, 3])
    expect(result.caret).toBe(3)
  })
  it('appends after the last chip when no bookmark is available', () => {
    const result = insertVoiceTranscript('', [chip('end', 0)], '你好')
    expect(result.references[0].offset).toBe(0)
    expect(result.draft).toBe('你好')
  })
  it('clamps stale offsets and treats transcript as plain text', () => {
    expect(insertVoiceTranscript('原文', [], '<img onerror=evil()>', 100).draft).toBe('原文<img onerror=evil()>')
  })
})
