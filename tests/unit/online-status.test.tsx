// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useOnlineStatus } from '../../src/hooks/useOnlineStatus'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function desktopOffline() {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows NT 10.0 ChevoinkDesktop/1.0.2')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
}
it('does not mistake Windows offline metadata for an unreachable website', async () => {
  desktopOffline()
  const fetcher = vi.fn().mockResolvedValue({ status: 200 })
  vi.stubGlobal('fetch', fetcher)
  const { result, unmount } = renderHook(useOnlineStatus)
  expect(result.current).toBe(true)
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  expect(result.current).toBe(true)
  unmount()
})
it('shows genuine connection failure without retry loops', async () => {
  desktopOffline()
  const fetcher = vi.fn().mockRejectedValue(new Error('network'))
  vi.stubGlobal('fetch', fetcher)
  const { result, unmount } = renderHook(useOnlineStatus)
  await waitFor(() => expect(result.current).toBe(false))
  expect(fetcher).toHaveBeenCalledTimes(1)
  act(() => window.dispatchEvent(new Event('online')))
  expect(result.current).toBe(true)
  unmount()
})
it('ignores a late failed probe after an online event', async () => {
  desktopOffline()
  let reject!: (error: Error) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise((_, fail) => { reject = fail })))
  const { result, unmount } = renderHook(useOnlineStatus)
  await act(async () => { window.dispatchEvent(new Event('online')); reject(new Error('late')) })
  expect(result.current).toBe(true)
  unmount()
})
it('preserves browser offline behavior without probing', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const { result, unmount } = renderHook(useOnlineStatus)
  expect(result.current).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
  unmount()
})
