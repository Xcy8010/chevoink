// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StudioWorkspaceSidebar from '../../src/features/studio/components/StudioWorkspaceSidebar'

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../src/components/ui/toast-context', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
const noop = () => undefined
function Fixture() {
  const [open, setOpen] = useState(true)
  return <StudioWorkspaceSidebar open={open} onOpenChange={setOpen} perspective="work" perspectiveSwitchEnabled onPerspectiveChange={noop} currentNovelId="preview" currentNovelTitle="预览" novels={[]} currentTasks={[]} activeTaskId={null} taskSwitchLocked={false} onSelectNovel={noop} onCreateNovel={noop} onCreateTask={noop} onSelectTask={noop} onRenameTask={noop} onCreateTaskInNovel={noop} onTaskDeleted={noop} onTaskForked={noop} onNovelDeleted={noop} autoFollow={false} onAutoFollowChange={noop} onOpenStudioSettings={noop} />
}
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 1 })
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => true })
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.documentElement.dataset.studioResizing })
it('keeps the outer capture element alive through collapse and reverse expansion', () => {
  const view = render(<Fixture />)
  const sidebar = view.container.querySelector('[data-workspace-sidebar]')!
  fireEvent.pointerDown(screen.getByRole('separator', { name: '调整左侧栏宽度' }), { button: 0, clientX: 280 })
  fireEvent.pointerMove(sidebar, { clientX: 150 })
  expect(sidebar.getAttribute('data-workspace-sidebar')).toBe('collapsed')
  expect(view.container.querySelector('[data-workspace-sidebar]')).toBe(sidebar)
  fireEvent.pointerMove(sidebar, { clientX: 330 })
  expect(sidebar.getAttribute('data-workspace-sidebar')).toBe('open')
  expect((sidebar as HTMLElement).style.width).toBe('330px')
  fireEvent.pointerUp(sidebar)
  expect(document.documentElement.dataset.studioResizing).toBeUndefined()
  expect(localStorage.getItem('chevoink:studio-sidebar-width')).toBe('330')
})
