import { describe, expect, it } from 'vitest'

import { BOOTSTRAP_NOVEL_SUMMARY, BOOTSTRAP_NOVEL_TITLE, shouldShowWorkspaceNovel } from '../src/features/studio/lib/agent-session.js'

const emptyBootstrapNovel = {
  title: BOOTSTRAP_NOVEL_TITLE,
  displayTitle: null,
  summary: BOOTSTRAP_NOVEL_SUMMARY,
  chapterCount: 0,
  wordCount: 0,
}

describe('shouldShowWorkspaceNovel', () => {
  it('hides a pristine onboarding work with no conversation', () => {
    expect(shouldShowWorkspaceNovel(emptyBootstrapNovel, false)).toBe(false)
  })

  it('keeps an empty work after an Agent conversation is created', () => {
    expect(shouldShowWorkspaceNovel(emptyBootstrapNovel, true)).toBe(true)
  })

  it('always keeps a named work', () => {
    expect(shouldShowWorkspaceNovel({ ...emptyBootstrapNovel, title: '雾港来信' }, false)).toBe(true)
  })
})
