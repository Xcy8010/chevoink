// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { activateComposerDraft, hasComposerDraft, promoteComposerDraft, updateComposerDraft } from '../../src/features/studio/agent/composer-drafts'
import { useAgentStore } from '../../src/features/studio/agent/agentStore'
import { createLocalAgentTaskWindow, shouldRetainAgentTaskWindow } from '../../src/features/studio/lib/agent-session'

describe('unsent local task discoverability', () => {
  it('keeps A after switching to B even though A has no legacy prompt or server session', () => {
    const a = createLocalAgentTaskWindow({ id: 'retention-a' })
    const b = createLocalAgentTaskWindow({ id: 'retention-b' })
    const scope = (id: string) => `retention-user:novel:${id}`
    activateComposerDraft(scope(a.id))
    useAgentStore.getState().setComposerDraft('123')
    activateComposerDraft(scope(b.id))
    expect(useAgentStore.getState().composerDraft).toBe('')
    useAgentStore.getState().setComposerDraft('321')
    expect([a, b].filter(task => shouldRetainAgentTaskWindow(task, b.id, hasComposerDraft(scope(task.id))))).toEqual([a, b])
    activateComposerDraft(scope(a.id))
    expect(useAgentStore.getState().composerDraft).toBe('123')
  })

  it('registers an active empty window before typing, but prunes an unused inactive placeholder', () => {
    const task = createLocalAgentTaskWindow({ id: 'empty-local' })
    expect(shouldRetainAgentTaskWindow(task, task.id, false)).toBe(true)
    expect(shouldRetainAgentTaskWindow(task, 'next-local', false)).toBe(false)
    expect(shouldRetainAgentTaskWindow({ ...task, customNamed: true }, 'next-local', false)).toBe(true)
  })

  it('reads a persisted inactive draft without borrowing the active user or task contents', () => {
    localStorage.setItem('chevoink:task-draft:v1:persisted-owner:n:a', JSON.stringify({ composerDraft: '刷新后仍可见', composerAttachments: [], composerReferences: [], composerSkillIds: [] }))
    expect(hasComposerDraft('persisted-owner:n:a')).toBe(true)
    expect(hasComposerDraft('different-owner:n:a')).toBe(false)
  })

  it('keeps uploading/skill-only drafts and follows lazy promotion', () => {
    const scope = 'retention:uploading'
    activateComposerDraft(scope)
    updateComposerDraft(scope, draft => ({ ...draft, composerDraft: '', composerUploading: 1 }))
    expect(hasComposerDraft(scope)).toBe(true)
    updateComposerDraft(scope, draft => ({ ...draft, composerUploading: 0, composerSkillIds: ['skill'] }))
    promoteComposerDraft(scope, 'retention:server-session')
    expect(hasComposerDraft(scope)).toBe(true)
    expect(hasComposerDraft('retention:server-session')).toBe(true)
    updateComposerDraft(scope, draft => ({ ...draft, composerSkillIds: [], composerDraft: '   ' }))
    expect(hasComposerDraft(scope)).toBe(false)
  })

  it.each(['composerAttachments', 'composerReferences'])('keeps a persisted %s-only draft', (field) => {
    const scope = `retention:persisted:${field}`
    localStorage.setItem(`chevoink:task-draft:v1:${scope}`, JSON.stringify({
      composerDraft: '', composerAttachments: [], composerReferences: [], composerSkillIds: [],
      [field]: [{ id: 'fixture-reference' }],
    }))
    expect(hasComposerDraft(scope)).toBe(true)
  })
})
