// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StyleLearningDialog from '../../src/features/studio/components/StyleLearningDialog'
import { getStyleWorkspace, getStyleSamples, startStyleLearningApi, changeStyleLearningApi } from '../../src/features/studio/style-learning-api'
import type { StyleLearningWorkspace } from '../../shared/contracts/style-learning'

vi.mock('../../src/features/studio/style-learning-api', () => ({ getStyleWorkspace: vi.fn(), getStyleSamples: vi.fn(), startStyleLearningApi: vi.fn(), changeStyleLearningApi: vi.fn() }))
vi.mock('../../src/features/account/credits-api', () => ({ fetchCreditSummary: vi.fn(async () => ({ models: [{ tier: 'speed', label: '极速', available: true, reasoningEfforts: ['high'], defaultReasoningEffort: 'high' }] })), fetchCustomModels: vi.fn(async () => ({ models: [] })) }))
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
let state: StyleLearningWorkspace
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  state = { privateStyleEnabled: true, samples: [{ id: 'p', sourceId: 's', name: '剧本', createdAt: '2026-09-11T00:00:00Z', files: [{ name: '剧本.md', chars: 999 }], canLearn: true, chars: 999 }], jobs: [] }
  vi.mocked(getStyleWorkspace).mockImplementation(async () => structuredClone(state))
  vi.mocked(getStyleSamples).mockResolvedValue({ exact: true, files: [{ name: '剧本.md', content: '甲：走。乙：等等。' }] })
})
afterEach(() => {
  cleanup()
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})
function setup() {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><StyleLearningDialog novelId="n" initialModel={{ modelTier: 'speed', customModelId: null, reasoningEffort: 'high' }} onClose={onClose} /></QueryClientProvider>)
  return { onClose }
}
it('does not analyze on upload/list; previews only on explicit action and requires consent', async () => {
  setup()
  await screen.findByText('剧本.md')
  expect(startStyleLearningApi).not.toHaveBeenCalled()
  expect(getStyleSamples).not.toHaveBeenCalled()
  const start = screen.getByRole('button', { name: '开始分段学习' }) as HTMLButtonElement
  expect(start.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '查看保存的样章' }))
  await screen.findByText('甲：走。乙：等等。')
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(start.disabled).toBe(false))
  fireEvent.click(start)
  await waitFor(() => expect(startStyleLearningApi).toHaveBeenCalledWith('n', expect.objectContaining({ consent: true, profileId: 'p', model: { modelTier: 'speed', customModelId: null, reasoningEffort: 'high' } })))
})
it('legacy sources are visible but cannot be silently learned', async () => {
  state.samples[0].canLearn = false
  setup()
  await screen.findByText(/这是旧版统计画像/)
  expect(screen.queryByRole('button', { name: '开始分段学习' })).toBeNull()
  expect(startStyleLearningApi).not.toHaveBeenCalled()
})
it('shows evidence and sends edited rules only after confirmation', async () => {
  state.jobs = [{ id: 'j', profileId: 'p', status: 'ready', revision: 4, enabled: false, processed: 1, total: 1, pauseRequested: false, modelLabel: 'fixture', rules: [{ dimension: '对白', rule: '短促对白', evidence: '甲：走。' }], reports: [{ chunk: 1, rules: [{ dimension: '对白', rule: '短促对白', evidence: '甲：走。' }] }], error: null, updatedAt: '2026-09-11T00:00:00Z' }]
  setup()
  await screen.findByRole('button', { name: '确认规则并启用' })
  expect(changeStyleLearningApi).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: '对白' }), { target: { value: '用行动推动短对白' } })
  fireEvent.click(screen.getByRole('button', { name: '确认规则并启用' }))
  await waitFor(() => expect(changeStyleLearningApi).toHaveBeenCalledWith('n', 'j', { action: 'enable', revision: 4, rules: [{ dimension: '对白', rule: '用行动推动短对白', evidence: '甲：走。' }] }))
})
it('shows load errors and restores body scrolling on close', async () => {
  vi.mocked(getStyleWorkspace).mockRejectedValue(new Error('无法读取'))
  const { onClose } = setup()
  await screen.findByText('无法读取')
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByRole('button', { name: '关闭样章学习' }))
  expect(onClose).toHaveBeenCalledOnce()
  cleanup()
  expect(document.body.style.overflow).not.toBe('hidden')
})
