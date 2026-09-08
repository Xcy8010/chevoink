// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SettingsPage from '../../src/app/routes/SettingsPage'
import { ANDROID_APK_URL } from '../../src/app/routes/settings/client-os'

const mocks = vi.hoisted(() => ({ download: vi.fn(), external: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('../../src/lib/windows-download', async (original) => ({
  ...await original<typeof import('../../src/lib/windows-download')>(), getWindowsDownload: mocks.download,
}))
vi.mock('../../src/lib/native-app', () => ({
  isNativeApp: () => navigator.userAgent.includes('ChevoinkApp/'), getNativeAppVersion: () => '1.0.6', openExternalUrl: mocks.external,
}))
vi.mock('../../src/components/ui/toast-context', () => ({ useToast: () => ({ error: mocks.error, info: mocks.info }) }))
vi.mock('../../src/features/account/CustomModelSettingsDialog', () => ({ default: () => null }))
vi.mock('../../src/store/useShellStore', () => ({ useShellStore: (select: (state: Record<string, unknown>) => unknown) => select({
  theme: 'light', fullscreenEnabled: false, authStatus: 'guest', sessionUser: null, unreadMessageCount: 0, unreadNotificationCount: 0,
  setTheme: () => {}, setFullscreenEnabled: () => {},
}) }))

beforeEach(() => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Windows NT 10.0')
  mocks.download.mockResolvedValue({ version: '1.0.0', url: 'https://chevoink.chevolink.com/download/windows/1.0.0/Chevoink_1.0.0_x64-setup.exe', signature: 'fixture' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks() })
async function show() { await act(async () => { render(<MemoryRouter><SettingsPage /></MemoryRouter>) }) }

it('offers only Windows on a narrow desktop, and clears selection when reopened', async () => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375)
  await show()
  fireEvent.click(screen.getByText('下载客户端'))
  let dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('适用于 Windows x64')).toBeTruthy()
  expect(within(dialog).queryByText('安卓')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Windows' }))
  expect(within(dialog).getByRole('button', { name: '下载 Windows 客户端' })).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
  fireEvent.click(screen.getByText('下载客户端'))
  dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByRole('button', { name: '下载 Windows 客户端' })).toBeNull()
})

it('preserves mobile choices and the existing Android download URL', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Android')
  await show()
  expect(mocks.download).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('安装启创墨域客户端'))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByText('Windows')).toBeNull()
  expect(within(dialog).getByText('苹果')).toBeTruthy()
  expect(within(dialog).getByText('鸿蒙')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: '安卓' }))
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '立即下载安卓端' })) })
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith(ANDROID_APK_URL)
})

it.each(['Windows NT 10.0 ChevoinkDesktop/1.0.0', 'Android ChevoinkApp/1.0.6'])('does not offer a redundant client download inside %s', async (agent) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent)
  await show()
  expect(mocks.download).not.toHaveBeenCalled()
  expect(screen.queryByText('下载客户端')).toBeNull()
  expect(screen.queryByText('安装启创墨域客户端')).toBeNull()
})

it('does not advertise a stable package when discovery fails', async () => {
  mocks.download.mockRejectedValueOnce(new Error('404'))
  await show()
  expect(screen.queryByText('下载客户端')).toBeNull()
  expect(mocks.download).toHaveBeenCalledOnce()
})

it('keeps the dialog and backup release link when a selected download becomes unavailable', async () => {
  await show()
  fireEvent.click(screen.getByText('下载客户端'))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Windows' }))
  mocks.download.mockRejectedValueOnce(new Error('offline'))
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '下载 Windows 客户端' })) })
  expect(mocks.error).toHaveBeenCalledOnce()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(within(dialog).getByRole('link', { name: '查看发布说明与备用下载' }).getAttribute('href')).toBe('https://github.com/Xcy8010/chevoink/releases')
})
