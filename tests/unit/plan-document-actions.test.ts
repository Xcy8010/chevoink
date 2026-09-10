import { afterEach, expect, it, vi } from 'vitest'
import { createPlanDocumentActions } from '../../src/features/studio/components/plan-document-actions'

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
vi.mock('../../src/features/studio/api', () => ({ createNovelPlanFile: api.create, updateNovelPlanFile: api.update }))
afterEach(() => vi.clearAllMocks())
function fixture(overrides: Partial<Parameters<typeof createPlanDocumentActions>[0]> = {}) {
  const options: Parameters<typeof createPlanDocumentActions>[0] = {
    activeNovelId: 'novel', savedPlanFiles: [{ id: 'plan', title: 'Title', content: 'Body', createdAt: '', artifactId: 'plan', backendArtifactId: 'server' }],
    agentArtifacts: [], selectedTreeItemId: 'plan:plan', catalogPreview: { title: 'Catalog', content: 'Outline' },
    setSelectedTreeItemId: vi.fn(), setWorkViewer: vi.fn(), setMobileView: vi.fn(), setActiveAgentArtifactId: vi.fn(),
    setAgentArtifacts: vi.fn(), setServerPlanFiles: vi.fn(), setChapterSaveState: vi.fn(), setChapterSaveMessage: vi.fn(),
    setAgentRunState: vi.fn(), setWorkspaceDialog: vi.fn(), setCatalogDocument: vi.fn(), updateAgentArtifact: vi.fn(),
    schedulePlanServerSync: vi.fn(), ...overrides,
  }
  return { options, actions: createPlanDocumentActions(options) }
}

it('opens the selected plan in the document viewer', () => {
  const { options, actions } = fixture()
  actions.handleSelectPlanFromTree('plan')
  expect(options.setSelectedTreeItemId).toHaveBeenCalledWith('plan:plan')
  expect(options.setWorkViewer).toHaveBeenCalledWith('document')
  expect(options.setMobileView).toHaveBeenCalledWith('editor')
})

it('requires confirmation before creating a server-backed plan', async () => {
  api.create.mockResolvedValue({ id: 'new', title: 'New', content: '', createdAt: '', orderIndex: 1 })
  const { options, actions } = fixture()
  actions.handleRequestCreatePlan()
  expect(api.create).not.toHaveBeenCalled()
  await vi.mocked(options.setWorkspaceDialog).mock.calls[0][0].onConfirm()
  expect(api.create).toHaveBeenCalledExactlyOnceWith('novel')
  expect(options.setSelectedTreeItemId).toHaveBeenCalledWith('plan:server-new')
})

it('requires confirmation before removing a saved plan', async () => {
  api.update.mockResolvedValue(undefined)
  const { options, actions } = fixture()
  actions.handleRequestDeletePlan('plan')
  expect(api.update).not.toHaveBeenCalled()
  expect(options.setServerPlanFiles).not.toHaveBeenCalled()
  await vi.mocked(options.setWorkspaceDialog).mock.calls[0][0].onConfirm()
  expect(api.update).toHaveBeenCalledExactlyOnceWith('server', { saved: false })
  const update = vi.mocked(options.setServerPlanFiles).mock.calls[0][0]
  expect(typeof update === 'function' ? update(options.savedPlanFiles) : update).toEqual([])
})

it('renames using the backend artifact id while retaining body content', () => {
  const { options, actions } = fixture()
  actions.handleRenamePlan('plan', ' Renamed ')
  expect(options.schedulePlanServerSync).toHaveBeenCalledWith('server', 'Renamed', 'Body')
  expect(options.updateAgentArtifact).toHaveBeenCalledWith('plan', expect.any(Function))
})

it('keeps manual catalog edits separate from plan server mutations', () => {
  const { options, actions } = fixture({ selectedTreeItemId: 'catalog' })
  actions.handleWorkspaceDocumentChange({ title: 'Edited', content: 'New outline' })
  const update = vi.mocked(options.setCatalogDocument).mock.calls[0][0]
  expect(typeof update === 'function' ? update(null) : update).toEqual({ title: 'Edited', content: 'New outline', manualTitle: true, manualContent: true })
  expect(options.schedulePlanServerSync).not.toHaveBeenCalled()
})

it('queues the full current plan text without changing chapter state', () => {
  const { options, actions } = fixture()
  actions.handleWorkspaceDocumentChange({ title: 'Title', content: 'New body' })
  expect(options.schedulePlanServerSync).toHaveBeenCalledWith('server', 'Title', 'New body')
  expect(options.setCatalogDocument).not.toHaveBeenCalled()
})

it('writes and renames a canonical plan through its original local artifact id', () => {
  const {options, actions} = fixture({
    selectedTreeItemId: 'plan:server-backend',
    savedPlanFiles: [{id: 'server-backend', artifactId: 'history-local', backendArtifactId: 'backend', title: 'Title', content: 'Body', createdAt: ''}],
  })
  actions.handleWorkspaceDocumentChange({title: 'Title', content: 'Edited'})
  actions.handleRenamePlan('server-backend', 'Renamed')
  expect(options.updateAgentArtifact).toHaveBeenCalledWith('history-local', expect.any(Function))
  expect(options.updateAgentArtifact).not.toHaveBeenCalledWith('server-backend', expect.any(Function))
  expect(options.schedulePlanServerSync).toHaveBeenCalledWith('backend', 'Title', 'Edited')
})
