// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { useAgentStore } from '../../src/features/studio/agent/agentStore'
import { activateComposerDraft, promoteComposerDraft, updateComposerDraft } from '../../src/features/studio/agent/composer-drafts'
it('isolates same-novel windows and synchronously persists even the last keystroke', () => {
  activateComposerDraft('draft-test:u:n:a')
  useAgentStore.getState().setComposerContent('123', [])
  activateComposerDraft('draft-test:u:n:b')
  expect(useAgentStore.getState().composerDraft).toBe('')
  useAgentStore.getState().setComposerDraft('321')
  activateComposerDraft('draft-test:u:n:a')
  expect(useAgentStore.getState().composerDraft).toBe('123')
  expect(JSON.parse(localStorage.getItem('chevoink:task-draft:v1:draft-test:u:n:b')!).composerDraft).toBe('321')
  activateComposerDraft('draft-test:other-user:n:a')
  expect(useAgentStore.getState().composerDraft).toBe('')
})
it('restores persisted content after entry and never restores a stale uploading spinner', () => {
  localStorage.setItem('chevoink:task-draft:v1:reload-test', JSON.stringify({ composerDraft: '换行\n草稿', composerAttachments: [], composerReferences: [], composerSkillIds: ['skill'], composerUploading: 2 }))
  activateComposerDraft('reload-test')
  expect(useAgentStore.getState().composerDraft).toBe('换行\n草稿')
  expect(useAgentStore.getState().composerUploading).toBe(0)
  expect(useAgentStore.getState().composerSkillIds).toEqual(['skill'])
})
it('promotes a temporary window and routes late async results only to its original task', () => {
  activateComposerDraft('temporary-test')
  useAgentStore.getState().setComposerDraft('待发')
  promoteComposerDraft('temporary-test', 'session-test')
  activateComposerDraft('session-test')
  expect(useAgentStore.getState().composerDraft).toBe('待发')
  activateComposerDraft('other-test')
  useAgentStore.getState().setComposerDraft('别覆盖')
  updateComposerDraft('temporary-test', draft => ({ ...draft, composerDraft: '' }))
  expect(useAgentStore.getState().composerDraft).toBe('别覆盖')
  activateComposerDraft('session-test')
  expect(useAgentStore.getState().composerDraft).toBe('')
})
