// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReasoningSlider } from '../../src/features/studio/agent/components/ReasoningSlider'
import { WorkConversationRestore } from '../../src/features/studio/components/WorkConversationRestore'

afterEach(cleanup)
it('uses one compact effort label without repeating the selected model, preserving actual effort values', () => {
  const change = vi.fn()
  render(<ReasoningSlider efforts={['low', 'high', 'max']} value="high" modelLabel="极速" onChange={change} />)
  expect(screen.queryByText('极速')).toBeNull()
  expect(screen.getByText('推理强度')).toBeTruthy()
  const slider = screen.getByRole('slider')
  expect(slider.getAttribute('aria-valuetext')).toBe('高 · 极速')
  fireEvent.change(slider, { target: { value: '2' } })
  expect(change).toHaveBeenCalledWith('max')
})
it('provides the explicit restore action, latest message and an ellipsis container', () => {
  const expand = vi.fn()
  render(<WorkConversationRestore onExpand={expand} recentMessage="第十二章已保存" />)
  const button = screen.getByRole('button', { name: '点击展开Agent会话区域：第十二章已保存' })
  expect(button.querySelector('svg')).toBeTruthy()
  expect(screen.queryByText(/最近一条/)).toBeNull()
  expect(button.querySelector('.truncate')?.textContent).toContain('第十二章已保存')
  fireEvent.click(button)
  expect(expand).toHaveBeenCalledOnce()
})
