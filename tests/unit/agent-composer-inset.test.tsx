// @vitest-environment jsdom
import { useRef } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useComposerInset } from '@/features/studio/agent/components/use-composer-inset'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('reserves measured footer space, follows only when pinned, and disconnects', () => {
  let resize: () => void = () => {}
  let height = 180
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect = disconnect })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height } as DOMRect))
  const pinned = { current: true }, last = { current: 0 }
  function Fixture({ collapsed = false }) {
    const scroll = useRef<HTMLDivElement>(null)
    const footer = useComposerInset(scroll, pinned, last, collapsed)
    return <><div ref={scroll} data-testid="scroll" /><div ref={footer} /></>
  }
  const view = render(<Fixture />)
  const scroll = view.getByTestId('scroll')
  Object.defineProperty(scroll, 'scrollHeight', { configurable: true, get: () => 1000 + height })
  expect(scroll.style.getPropertyValue('--agent-footer-height')).toBe('180px')
  act(() => { height = 240; resize() })
  expect(scroll.scrollTop).toBe(1240)
  expect(last.current).toBe(1240)
  pinned.current = false; scroll.scrollTop = 100
  act(() => { height = 320; resize() })
  expect(scroll.style.getPropertyValue('--agent-footer-height')).toBe('320px')
  expect(scroll.scrollTop).toBe(100)
  view.rerender(<Fixture collapsed />)
  expect(disconnect).toHaveBeenCalledOnce()
  view.unmount()
})
