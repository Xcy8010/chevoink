// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AgentMemoryCards from '../../src/features/studio/agent/components/AgentMemoryCards'
import { fetchStoryMemories, fetchStoryMemorySets } from '../../src/features/studio/agent/agentApi'

const store = vi.hoisted(() => ({ addComposerReference: vi.fn(), composerDraft: '', memorySpotlight: null as null | { nonce: number; memoryType: string; title: string } }))
vi.mock('../../src/features/studio/agent/agentStore', () => ({ useAgentStore: (select: (s: unknown) => unknown) => select(store) }))
vi.mock('../../src/store/useShellStore', () => ({ useShellStore: (select: (s: unknown) => unknown) => select({ sessionUser: { id: 'u' } }) }))
vi.mock('../../src/features/studio/agent/agentApi', () => ({ fetchStoryMemories: vi.fn(), fetchStoryMemorySets: vi.fn(), deleteStoryMemory: vi.fn(), updateStoryMemory: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks(); store.memorySpotlight = null
  vi.mocked(fetchStoryMemorySets).mockResolvedValue({ sets: [{ memoryType: 'worldbuilding', count: 1, latestUpdatedAt: '2026-09-12T00:00:00Z', previews: ['真正的卡片'] }] })
  vi.mocked(fetchStoryMemories).mockResolvedValue({ total: 1, typeCounts: { worldbuilding: 1 }, items: [{ id: 'card', title: '真正的卡片', content: '内容', memoryType: 'worldbuilding', layer: 'L1', importance: 50, status: 'inferred', reviewStatus: 'pending', version: 1, createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z' }] })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('only explicit view button flips the card; body clicks/scroll cannot flip it back', async () => {
  render(<AgentMemoryCards novelId="n" />)
  fireEvent.click(await screen.findByRole('button', { name: '世界观卡片集 1 张，点击摊开手牌' }))
  await screen.findByRole('button', { name: '查看全文' })
  const actions = screen.getByRole('group', { name: '卡片操作' })
  expect(actions.parentElement?.className).toContain('right-3 top-4')
  for (const label of ['编辑卡片', '删除卡片']) {
    const button = screen.getByRole('button', { name: label })
    expect(button.textContent).toBe('')
    expect(button.getAttribute('title')).toBe(label)
    expect(button.querySelector('svg')).toBeTruthy()
    expect(button.className).toContain('h-11 w-11')
  }
  fireEvent.click(await screen.findByRole('button', { name: '查看全文' }))
  const back = document.querySelector('.fan-back')!
  fireEvent.click(back.querySelector('p.whitespace-pre-wrap')!)
  fireEvent.scroll(back.querySelector('.overflow-y-auto')!)
  expect(document.querySelector('.fan-flipped')).toBeTruthy()
  expect(screen.getByRole('group', { name: '卡片操作' })).toBe(actions)
  expect(screen.getByRole('button', { name: '删除卡片' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '返回摘要' }))
  expect(document.querySelector('.fan-flipped')).toBeNull()
})
it('missing spotlight does not silently navigate to the newest unrelated card', async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(() => document.body)
  store.memorySpotlight = { nonce: Date.now(), memoryType: 'worldbuilding', title: '并不存在的目标卡' }
  vi.mocked(fetchStoryMemories).mockResolvedValue({ total: 0, items: [], typeCounts: {} })
  render(<AgentMemoryCards novelId="n" />)
  await screen.findByText(/未能唯一定位该记忆/)
  await waitFor(() => expect(screen.queryByRole('button', { name: '收叠手牌' })).toBeNull())
  expect(fetchStoryMemories).toHaveBeenCalledWith('n', expect.objectContaining({ title: '并不存在的目标卡' }))
})
