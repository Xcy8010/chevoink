// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readWorkPanelUi, useWorkPanelState, writeWorkPanelUi, type WorkPanelUiState } from '../../src/features/studio/components/use-work-panel-state'

beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function useFixture(scope: string | undefined) {
  const [rightOpen, setRightOpen] = useState(false)
  const [viewer, setViewer] = useState<WorkPanelUiState['viewer']>(null)
  const [inspectorTab, setInspectorTab] = useState<WorkPanelUiState['inspectorTab']>('work')
  const [selectedTreeItemId, setSelectedTreeItemId] = useState<string | null>(null)
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const state = { rightOpen, viewer, inspectorTab, selectedTreeItemId, selectedChapterId }
  const hydratedScope = useWorkPanelState(scope, state, { setRightOpen, setViewer, setInspectorTab, setSelectedTreeItemId, setSelectedChapterId })
  return { state, hydratedScope, setRightOpen, setViewer }
}

it('keeps same-novel task panels independent and restores them after remount', () => {
  const a = 'user:novel:a', b = 'user:novel:b'
  writeWorkPanelUi(b, { rightOpen: true, viewer: 'chapter', inspectorTab: 'changes', selectedChapterId: 'chapter-b' })
  const hook = renderHook(({ scope }) => useFixture(scope), { initialProps: { scope: a } })
  expect(hook.result.current.state.rightOpen).toBe(false)
  hook.rerender({ scope: b })
  expect(hook.result.current.state).toMatchObject({ rightOpen: true, viewer: 'chapter', selectedChapterId: 'chapter-b' })
  hook.rerender({ scope: a })
  expect(hook.result.current.state).toMatchObject({ rightOpen: false, viewer: null })
  expect(readWorkPanelUi(b)?.rightOpen).toBe(true)
  act(() => { hook.result.current.setRightOpen(true); hook.result.current.setViewer('document') })
  hook.unmount()
  const restored = renderHook(() => useFixture(a))
  expect(restored.result.current.state).toMatchObject({ rightOpen: true, viewer: 'document' })
})

it('does not persist transient unowned state and tolerates unavailable storage', () => {
  const hook = renderHook(() => useFixture(undefined))
  act(() => hook.result.current.setRightOpen(true))
  expect(localStorage.getItem('chevoink:studio-work-panel-ui')).toBeNull()
  localStorage.setItem('chevoink:studio-work-panel-ui', '{broken')
  expect(readWorkPanelUi('missing')).toBeNull()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
  expect(() => writeWorkPanelUi('a', { rightOpen: false, viewer: null, inspectorTab: 'work' })).not.toThrow()
})

it('does not overwrite a saved layout during StrictMode mount replay', () => {
  writeWorkPanelUi('strict', { rightOpen: true, viewer: 'document', inspectorTab: 'changes' })
  const hook = renderHook(() => useFixture('strict'), { wrapper: StrictMode })
  expect(hook.result.current.state).toMatchObject({ rightOpen: true, viewer: 'document', inspectorTab: 'changes' })
  expect(readWorkPanelUi('strict')).toMatchObject({ rightOpen: true, viewer: 'document' })
})
