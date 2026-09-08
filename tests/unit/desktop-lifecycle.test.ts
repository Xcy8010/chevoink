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
it('allows an idle desktop page to close without inventing pending work', async () => {
  desktop()
  expect(await flushDesktopSaves()).toBe(true)
})
it('save exceptions and scope changes fail closed', async () => {
  desktop()
  const remove = registerDesktopSave(() => { throw new Error('offline') })
  expect(await flushDesktopSaves()).toBe(false)
  remove()
  const changed = registerDesktopSave(() => { changed(); return true })
  expect(await flushDesktopSaves()).toBe(false)
})

it.each(['input', 'beforeinput', 'compositionstart', 'change'])('does not close over %s arriving during persistence', async (type) => {
  desktop()
  const remove = registerDesktopSave(async () => {
    document.dispatchEvent(new Event(type))
    return true
  })
  expect(await flushDesktopSaves()).toBe(false)
  remove()
  expect(await flushDesktopSaves()).toBe(true)
})

it('does not blur or flush inputs on Web/Android', async () => {
  const input = document.createElement('input')
  document.body.appendChild(input)
  input.focus()
  expect(await flushDesktopSaves()).toBe(true)
  expect(document.activeElement).toBe(input)
  input.remove()
})

it('releases change listeners when a save never settles', async () => {
  desktop()
  vi.useFakeTimers()
  const removed = vi.spyOn(document, 'removeEventListener')
  const unregister = registerDesktopSave(() => new Promise<boolean>(() => {}))
  try {
    const result = flushDesktopSaves()
    await vi.advanceTimersByTimeAsync(7600)
    expect(await result).toBe(false)
    expect(removed).toHaveBeenCalledWith('input', expect.any(Function), true)
    expect(vi.getTimerCount()).toBe(0)
  } finally { unregister(); vi.useRealTimers() }
})
