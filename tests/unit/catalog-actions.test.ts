import { expect, it, vi, afterEach } from 'vitest'
import { createCatalogActions } from '../../src/features/studio/components/catalog-actions'

const api = vi.hoisted(() => ({ createVolume: vi.fn(), deleteChapterDraft: vi.fn(), listNovelPlanFiles: vi.fn(), moveChapter: vi.fn(), updateChapterDraft: vi.fn(), updateNovelPlanFile: vi.fn() }))
vi.mock('../../src/features/studio/api', () => api)
afterEach(() => vi.clearAllMocks())

function fixture(overrides: Partial<Parameters<typeof createCatalogActions>[0]> = {}) {
  const state: Parameters<typeof createCatalogActions>[0] = {
    activeNovelId: 'novel', volumes: [], chapters: [], chapterDirty: false, chapterDraft: null,
    selectedChapterId: null, savedPlanFiles: [], setVolumes: vi.fn(), setChapters: vi.fn(),
    setSelectedChapterId: vi.fn(), setServerPlanFiles: vi.fn(), setChapterSaveState: vi.fn(),
    setChapterSaveMessage: vi.fn(), syncStudioPayload: vi.fn(), refreshWorkspaceAfterAgentWrite: vi.fn(),
    handleChapterDraftChange: vi.fn(), toast: { toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }, ...overrides,
  }
  return { state, actions: createCatalogActions(state) }
}

const chapter: Parameters<typeof createCatalogActions>[0]['chapters'][number] = {
  id: 'chapter', novelId: 'novel', title: 'Old', summary: null, orderIndex: 1, volumeId: 'volume', orderInVolume: 1,
  wordCount: 10, status: 'draft', visibility: 'private', commentCount: 0, revision: 7, publishedAt: null,
}

it('sends revision-checked rename and applies only its returned title/revision', async () => {
  api.updateChapterDraft.mockResolvedValue({ title: 'New', revision: 8 })
  const { state, actions } = fixture({ chapters: [chapter] })
  await actions.handleRenameChapterById('chapter', ' New ')
  expect(api.updateChapterDraft).toHaveBeenCalledWith('novel', 'chapter', { title: 'New', expectedRevision: 7 })
  const update = vi.mocked(state.setChapters).mock.calls[0][0]
  expect(typeof update === 'function' ? update([chapter]) : update).toEqual([{ ...chapter, title: 'New', revision: 8 }])
})

it('moves a chapter with its revision and refreshes the authoritative catalog', async () => {
  api.moveChapter.mockResolvedValue(undefined)
  const { state, actions } = fixture({ chapters: [chapter] })
  await actions.handleMoveChapterInTree('chapter', 'volume', 1)
  expect(api.moveChapter).not.toHaveBeenCalled()
  await actions.handleMoveChapterInTree('chapter', 'other-volume', 2)
  expect(api.moveChapter).toHaveBeenCalledWith('novel', 'chapter', { targetVolumeId: 'other-volume', position: 2, expectedRevision: 7 })
  expect(state.refreshWorkspaceAfterAgentWrite).toHaveBeenCalledOnce()
})

it('deletes the selected last chapter with revision protection and clears selection', async () => {
  api.deleteChapterDraft.mockResolvedValue(undefined)
  const { state, actions } = fixture({ chapters: [chapter], selectedChapterId: chapter.id })
  await actions.handleDeleteChapterById(chapter.id)
  expect(api.deleteChapterDraft).toHaveBeenCalledWith('novel', chapter.id, 7)
  expect(state.setSelectedChapterId).toHaveBeenCalledWith(null)
  const update = vi.mocked(state.setChapters).mock.calls[0][0]
  expect(typeof update === 'function' ? update([chapter]) : update).toEqual([])
})

it('creates an empty volume and updates the local list without inventing chapters', async () => {
  const volume = { id: 'volume', novelId: 'novel', title: '第 1 卷', summary: null, orderIndex: 1, revision: 1 }
  api.createVolume.mockResolvedValue(volume)
  const { state, actions } = fixture()
  await actions.handleCreateLocalVolume()
  expect(api.createVolume).toHaveBeenCalledWith('novel', { title: '第 1 卷', position: 1 })
  const update = vi.mocked(state.setVolumes).mock.calls[0][0]
  expect(typeof update === 'function' ? update([]) : update).toEqual([{ ...volume, chapterCount: 0, wordCount: 0 }])
  expect(state.setChapterSaveState).toHaveBeenLastCalledWith('saved')
})

it('sorts only synchronized plans and reloads their server order', async () => {
  api.updateNovelPlanFile.mockResolvedValue(undefined)
  api.listNovelPlanFiles.mockResolvedValue([{ id: 'plan', title: 'Plan', content: 'Body', createdAt: '2026-09-08T00:00:00Z', orderIndex: 2 }])
  const { state, actions } = fixture({ savedPlanFiles: [{ id: 'local-plan', title: 'Plan', content: 'Body', createdAt: '', artifactId: 'local', backendArtifactId: 'plan' }] })
  await actions.handleMovePlanInTree('local-plan', 1)
  expect(api.updateNovelPlanFile).not.toHaveBeenCalled()
  await actions.handleMovePlanInTree('local-plan', 2)
  expect(api.updateNovelPlanFile).toHaveBeenCalledWith('plan', { position: 2 })
  expect(state.setServerPlanFiles).toHaveBeenCalledWith([expect.objectContaining({ id: 'server-plan', orderIndex: 2 })])
})

it('keeps failed catalog writes visible without applying success updates', async () => {
  api.createVolume.mockRejectedValue(new Error('create failed'))
  api.moveChapter.mockRejectedValue(new Error('move failed'))
  api.updateChapterDraft.mockRejectedValue(new Error('rename failed'))
  const { state, actions } = fixture({ chapters: [chapter] })
  await actions.handleCreateLocalVolume()
  await actions.handleMoveChapterInTree('chapter', 'other', 1)
  await actions.handleRenameChapterById('chapter', 'new')
  expect(state.setVolumes).not.toHaveBeenCalled()
  expect(state.setChapters).not.toHaveBeenCalled()
  expect(state.setChapterSaveMessage).toHaveBeenLastCalledWith('create failed')
  expect(state.toast.error).toHaveBeenCalledWith('move failed')
  expect(state.toast.error).toHaveBeenCalledWith('rename failed')
})

it('prevents catalog reorder while editor changes are unsaved', async () => {
  const { state, actions } = fixture({ chapterDirty: true })
  await actions.handleMoveChapterInTree('chapter', 'volume', 1)
  expect(api.moveChapter).not.toHaveBeenCalled()
  expect(state.toast.error).toHaveBeenCalledWith('请等待当前章节自动保存后再调整顺序。')
})

it('keeps current chapter renaming on the editor autosave path', async () => {
  const { state, actions } = fixture({ chapterDraft: {
    id: 'chapter', title: 'old', summary: '', content: 'unsaved', status: 'draft', visibility: 'private', orderIndex: 1, revision: 2, localOnly: false,
  } })
  await actions.handleRenameChapterById('chapter', ' new ')
  expect(state.handleChapterDraftChange).toHaveBeenCalledWith({ ...state.chapterDraft, title: 'new' })
  expect(api.updateChapterDraft).not.toHaveBeenCalled()
})

it('does not mutate missing chapters or unsynced plans', async () => {
  const { actions } = fixture()
  await actions.handleDeleteChapterById('missing')
  await actions.handleRenameChapterById('missing', 'title')
  await actions.handleMovePlanInTree('missing', 1)
  expect(api.deleteChapterDraft).not.toHaveBeenCalled()
  expect(api.updateChapterDraft).not.toHaveBeenCalled()
  expect(api.updateNovelPlanFile).not.toHaveBeenCalled()
})
