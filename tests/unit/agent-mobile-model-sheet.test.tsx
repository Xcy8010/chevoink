// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentMobileModelSheet } from '../../src/features/studio/agent/components/AgentMobileModelSheet'

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  vi.stubGlobal('innerWidth', 320)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function setup() {
  const callbacks = { onTier: vi.fn(), onCustom: vi.fn(), onReasoning: vi.fn(), onSettings: vi.fn(), onClose: vi.fn() }
  const view = render(<AgentMobileModelSheet {...callbacks} modelOptions={[
    { tier: 'speed', label: '极速', available: true, multiplier: 1, selectedByDefault: true },
    { tier: 'standard', label: '标准', available: true, multiplier: 2, selectedByDefault: false },
    { tier: 'basic', label: '不可用', available: false, multiplier: 0, selectedByDefault: false },
  ]} customModels={[]} customModelId={null} modelTier="speed" activeModelLabel="极速" activeReasoningEffort="high" activeReasoningEfforts={['low', 'high']} />)
  return { ...callbacks, ...view }
}

it('exposes selected model/effort and real callbacks with a single modal surface', () => {
  const view = setup()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByRole('button', { name: /极速\s*1.0x/ }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByText('不可用')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /标准\s*2.0x/ }))
  expect(view.onTier).toHaveBeenCalledWith('standard')
  fireEvent.click(screen.getByRole('button', { name: '低' }))
  expect(view.onReasoning).toHaveBeenCalledWith('low')
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  expect(view.onClose).toHaveBeenCalledOnce()
})

it('locks background scrolling and restores it and focus when closed', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const view = setup()
  expect(document.body.style.overflow).toBe('hidden')
  expect(screen.getByRole('dialog').style.maxHeight).toBe(`${window.innerHeight - 16}px`)
  view.unmount()
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(trigger)
  trigger.remove()
})
