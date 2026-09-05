// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentQueueTray } from '../../src/features/studio/agent/components/AgentQueueTray'
import WorkspaceNovelSwitcher from '../../src/features/studio/components/WorkspaceNovelSwitcher'
afterEach(cleanup)
const item = { id: 'q', sessionId: 's', prompt: '继续执行新要求', attachmentCount: 1, status: 'pending', revision: 3, error: null }
describe('queued request controls', () => {
  it('edits in its own field without disturbing composer draft and keeps revision', async () => {
    const action = vi.fn(async () => {})
    render(<AgentQueueTray items={[item]} onAction={action} />)
    fireEvent.click(screen.getByRole('button', { name: '更多待发操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑' }))
    fireEvent.change(screen.getByRole('textbox', { name: '编辑待发需求' }), { target: { value: '新方向' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存修改' })))
    expect(action).toHaveBeenCalledWith(item, 'edit', '新方向')
  })
  it.each([['在新任务窗口发送', 'new'], ['创建分支并发送', 'fork']])('dispatches %s explicitly', async (label, actionName) => {
    const action = vi.fn(async () => {})
    render(<AgentQueueTray items={[item]} onAction={action} />)
    fireEvent.click(screen.getByRole('button', { name: '更多待发操作' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: label })))
    expect(action).toHaveBeenCalledWith(item, actionName, undefined)
  })
  it('shows action failures rather than losing the pending prompt', async () => {
    render(<AgentQueueTray items={[item]} onAction={async () => { throw new Error('网络断开') }} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '调整方向' })))
    expect(screen.getByRole('alert').textContent).toBe('网络断开')
    expect(screen.getByText(item.prompt)).toBeTruthy()
  })
  it('mobile novel popup is viewport-wide, outside clipped toolbar, and Escape closes it', () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })
    const { container } = render(<WorkspaceNovelSwitcher fullWidth novels={[]} currentNovelId="n" currentNovelTitle="长作品名" onSelectNovel={vi.fn()} onCreateNovel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '选择作品：长作品名' }))
    const popup = screen.getByRole('region', { name: '我的作品' })
    expect(popup.style.width).toBe('304px')
    expect(container.contains(popup)).toBe(false)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region')).toBeNull()
  })
})
