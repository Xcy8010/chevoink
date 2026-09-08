// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn(), navigate: vi.fn(), error: vi.fn(), setGuest: vi.fn(), sync: vi.fn() }))
vi.mock('../../src/app/api-client', async original => ({ ...await original<object>(), requestJson: mocks.request }))
vi.mock('react-router-dom', async original => ({ ...await original<object>(), useNavigate: () => mocks.navigate }))
vi.mock('../../src/components/ui/toast-context', () => ({ useToast: () => ({ error: mocks.error }) }))
vi.mock('../../src/features/account/AccountLayout', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../src/store/useShellStore', () => ({
  useShellStore: (select: (state: { sessionUser: null; setGuest: typeof mocks.setGuest; syncSessionUser: typeof mocks.sync }) => unknown) => select({ sessionUser: null, setGuest: mocks.setGuest, syncSessionUser: mocks.sync }),
}))
import AccountProfilePage from '../../src/features/account/AccountProfilePage'

beforeEach(() => { vi.resetAllMocks(); localStorage.setItem('logout-fixture-draft', '尚未发送的正文') })
afterEach(() => { cleanup(); localStorage.removeItem('logout-fixture-draft') })
function openLogout() {
  render(<MemoryRouter><AccountProfilePage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: '高级账号设置' }))
  fireEvent.click(screen.getByRole('button', { name: '退出' }))
}
describe('R03 logout interaction', () => {
  it('retains the page and local draft when revocation cannot be confirmed', async () => {
    mocks.request.mockRejectedValue(new Error('503 unavailable'))
    openLogout()
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('暂时无法确认退出登录，请稍后重试。'))
    expect(mocks.setGuest).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(localStorage.getItem('logout-fixture-draft')).toBe('尚未发送的正文')
    expect(screen.getByRole('button', { name: '退出' })).toBeTruthy()
  })
  it('clears local identity and navigates only after a successful server response', async () => {
    let confirm!: (value: { ok: boolean }) => void
    mocks.request.mockReturnValue(new Promise(resolve => { confirm = resolve }))
    openLogout()
    expect(mocks.setGuest).not.toHaveBeenCalled()
    confirm({ ok: true })
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true }))
    expect(mocks.setGuest).toHaveBeenCalledOnce()
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
