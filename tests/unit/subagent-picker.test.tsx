// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubagentPicker } from '../../src/features/studio/agent/components/SubagentPicker'
import { fetchAgentSubtasks } from '../../src/features/studio/agent/agentApi'
import type { AgentSubtaskView } from '../../shared/contracts'
vi.mock('../../src/features/studio/agent/agentApi', () => ({ fetchAgentSubtasks: vi.fn() }))
const item = (id: string, enabled = true): AgentSubtaskView => ({ id, novelId: 'a', name: id, role: 'research', triggerCondition: '需要资料时', enabled } as AgentSubtaskView)
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)
describe('composer subagent picker', () => {
  it('loads on demand, hides disabled items, and selects without executing', async () => {
    vi.mocked(fetchAgentSubtasks).mockResolvedValue({ items: [item('资料助手'), item('已停用', false)] })
    const onSelect = vi.fn()
    render(<SubagentPicker novelId="a" onSelect={onSelect} />)
    expect(fetchAgentSubtasks).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /指定子 Agent/ })))
    expect(screen.queryByText('已停用')).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /资料助手/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '资料助手' }))
    expect(screen.queryByLabelText('可指定的子 Agent')).toBeNull()
  })
  it('ignores a response from the previous novel', async () => {
    let finish!: (value: { items: AgentSubtaskView[] }) => void
    vi.mocked(fetchAgentSubtasks).mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValue({ items: [item('B助手')] })
    const props = { novelId: 'a', onSelect: vi.fn() }
    const { rerender } = render(<SubagentPicker {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /指定子 Agent/ }))
    await act(async () => rerender(<SubagentPicker {...props} novelId="b" />))
    await act(async () => finish({ items: [item('A助手')] }))
    expect(screen.queryByText('A助手')).toBeNull()
    expect(screen.getByText('B助手')).toBeTruthy()
  })
  it('shows a retryable error and a useful empty state', async () => {
    vi.mocked(fetchAgentSubtasks).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [] })
    render(<SubagentPicker novelId="a" onSelect={vi.fn()} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /指定子 Agent/ })))
    expect(screen.getByRole('alert')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '重试' })))
    expect(screen.getByText(/当前作品没有已启用/)).toBeTruthy()
  })
})
