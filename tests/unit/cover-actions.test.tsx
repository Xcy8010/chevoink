// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { ToastContext } from '../../src/components/ui/toast-context'
import { useCoverActions } from '../../src/features/studio/components/use-cover-actions'

const api = vi.hoisted(() => ({ prompt: vi.fn(), images: vi.fn(), upload: vi.fn(), update: vi.fn() }))
vi.mock('../../src/features/studio/api', () => ({ generateCoverPrompt: api.prompt, generateCoverImages: api.images, uploadNovelCover: api.upload, updateNovelMeta: api.update }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function fixture(overrides: Partial<Parameters<typeof useCoverActions>[0]> = {}) {
  const state: Parameters<typeof useCoverActions>[0] = {
    activeNovelId: 'novel', currentNovel: null, pendingCoverUploadFile: null,
    coverForm: { novelTitle: ' Title ', summary: ' Summary ', genre: 'fantasy', protagonist: '', stylePreference: '', prompt: 'Cover', negativePrompt: '', size: '768x1024', count: 1 },
    setCoverForm: vi.fn(), setCoverKeywords: vi.fn(), setCoverMessage: vi.fn(), setActiveToolPanel: vi.fn(),
    setMobileView: vi.fn(), setCoverAssets: vi.fn(), setSelectedCoverId: vi.fn(), setWorkspaceDialog: vi.fn(),
    setCoverGenerationBusy: vi.fn(), setCurrentNovel: vi.fn(), setPendingCoverUploadFile: vi.fn(), syncStudioPayload: vi.fn(), ...overrides,
  }
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } })
  const toast = { toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}><ToastContext.Provider value={toast}>{children}</ToastContext.Provider></QueryClientProvider>
  }
  return { ...renderHook(() => useCoverActions(state), { wrapper: Wrapper }), state, toast }
}

it('normalizes prompt inputs and preserves the cover entry point after success', async () => {
  api.prompt.mockResolvedValue({ prompt: 'Generated', negativePrompt: 'Exclude', visualKeywords: ['blue'] })
  const { result, state } = fixture()
  await act(async () => { await result.current.coverPromptMutation.mutateAsync() })
  expect(api.prompt).toHaveBeenCalledWith({ novelTitle: 'Title', summary: 'Summary', genre: 'fantasy', protagonist: undefined, stylePreference: undefined })
  expect(state.setCoverKeywords).toHaveBeenCalledWith(['blue'])
  expect(state.setActiveToolPanel).toHaveBeenCalledWith('cover')
  expect(state.setMobileView).toHaveBeenCalledWith('cover')
  const update = vi.mocked(state.setCoverForm).mock.calls[0][0]
  expect(typeof update === 'function' ? update(state.coverForm) : update).toEqual({ ...state.coverForm, prompt: 'Generated', negativePrompt: 'Exclude' })
})

it('keeps the fixed image size and clears generation state after a failed request', async () => {
  api.images.mockRejectedValue(new Error('provider unavailable'))
  const { result, state } = fixture()
  await act(async () => { await expect(result.current.coverImageMutation.mutateAsync()).rejects.toThrow('provider unavailable') })
  expect(api.images).toHaveBeenCalledWith({ prompt: 'Cover', size: '768x1024', count: 1, novelId: 'novel' })
  expect(state.setCoverGenerationBusy).toHaveBeenNthCalledWith(1, true)
  expect(state.setCoverGenerationBusy).toHaveBeenLastCalledWith(false)
  expect(state.setCoverAssets).not.toHaveBeenCalled()
})

it('does not call the provider before the prompt form exists', async () => {
  const { result } = fixture({ coverForm: null })
  await act(async () => { await expect(result.current.coverPromptMutation.mutateAsync()).rejects.toThrow('封面参数尚未准备完成') })
  await act(async () => { await expect(result.current.coverImageMutation.mutateAsync()).rejects.toThrow('请先生成或补充封面提示词') })
  expect(api.prompt).not.toHaveBeenCalled()
  expect(api.images).not.toHaveBeenCalled()
})
