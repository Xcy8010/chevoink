// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { isMobileClientPlatform, isWindowsDesktopApp } from '../../src/lib/desktop-app'
import { flushDesktopSaves, registerDesktopSave } from '../../src/lib/desktop-lifecycle'
import { getSessionToken, setSessionToken } from '../../src/lib/auth-token'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
const desktop = () => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows NT 10.0 ChevoinkDesktop/1.0.0')

it('distinguishes the shell from Android and does not classify a narrow PC as a phone', () => {
  desktop()
  expect(isWindowsDesktopApp()).toBe(true)
  expect(isMobileClientPlatform()).toBe(false)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android ChevoinkApp/1.0.6')
  expect(isWindowsDesktopApp()).toBe(false)
  expect(isMobileClientPlatform()).toBe(true)
})
it('Windows stops Bearer persistence without deleting drafts or prematurely deleting old tokens on read', () => {
  desktop()
  localStorage.setItem('chevoink-session-token', 'old-token')
  localStorage.setItem('task-draft', '123')
  expect(getSessionToken()).toBeNull()
  expect(localStorage.getItem('chevoink-session-token')).toBe('old-token')
  setSessionToken('authenticated-new-token')
  expect(localStorage.getItem('chevoink-session-token')).toBeNull()
  expect(localStorage.getItem('task-draft')).toBe('123')
})
it('Web and Android retain the existing token compatibility behavior', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android ChevoinkApp/1.0.6')
  setSessionToken('token')
  expect(getSessionToken()).toBe('token')
})
it('acknowledges only after every editor has persisted', async () => {
  desktop()
  const first = registerDesktopSave(async () => true)
  const second = registerDesktopSave(async () => false)
  expect(await flushDesktopSaves()).toBe(false)
  second()
  expect(await flushDesktopSaves()).toBe(true)
  first()
})
it('save exceptions and scope changes fail closed', async () => {
  desktop()
  const remove = registerDesktopSave(() => { throw new Error('offline') })
  expect(await flushDesktopSaves()).toBe(false)
  remove()
  const changed = registerDesktopSave(() => { changed(); return true })
  expect(await flushDesktopSaves()).toBe(false)
})
