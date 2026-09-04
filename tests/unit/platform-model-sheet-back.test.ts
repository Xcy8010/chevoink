// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { subscribePlatformLifecycle } from '../../src/features/studio/platform-capabilities'

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals() })

it('Android back dismisses the foreground model sheet before leaving the workspace', async () => {
  let back: (() => void) | undefined
  const remove = vi.fn()
  vi.stubGlobal('Capacitor', { Plugins: { App: { addListener: vi.fn(async (event: string, callback: () => void) => {
    if (event === 'backButton') back = callback
    return { remove }
  }) } } })
  const onBack = vi.fn()
  const dispose = subscribePlatformLifecycle({ onBack, onResume: vi.fn() })
  const dialog = document.createElement('dialog')
  dialog.setAttribute('open', '')
  dialog.setAttribute('data-native-back-dismiss', '')
  const cancel = vi.fn(() => dialog.remove())
  dialog.addEventListener('cancel', cancel)
  document.body.append(dialog)
  back!()
  expect(cancel).toHaveBeenCalledOnce()
  expect(onBack).not.toHaveBeenCalled()
  back!()
  expect(onBack).toHaveBeenCalledOnce()
  await Promise.resolve()
  dispose()
  expect(remove).toHaveBeenCalledTimes(2)
})
