import { describe, expect, it } from 'vitest'
import { fitWorkSplit, resizeWorkSplit, type WorkSplit } from '../../src/features/studio/components/work-split'

const state: WorkSplit = { viewer: 600, inspector: 400, chatCollapsed: false, viewerCollapsed: false, inspectorCollapsed: false }
const width = 1600
describe('continuous Work gestures', () => {
  it('shrinks viewer first, then inspector, folds the pair and reverses without a new gesture', () => {
    const start = fitWorkSplit(state, width, true)
    const a = resizeWorkSplit(start, state, width, 200, 'content', true)
    expect([a.viewer, a.inspector]).toEqual([400, 400])
    const b = resizeWorkSplit(start, a, width, 350, 'content', true)
    expect([b.viewer, b.inspector]).toEqual([320, 330])
    const c = resizeWorkSplit(start, b, width, 470, 'content', true)
    expect(c.viewerCollapsed && c.inspectorCollapsed).toBe(true)
    const d = resizeWorkSplit(start, c, width, 380, 'content', true)
    expect(d.viewerCollapsed || d.inspectorCollapsed).toBe(false)
    expect([d.viewer, d.inspector]).toEqual([320, 300])
    expect(resizeWorkSplit(start, d, width, 0, 'content', true)).toMatchObject(state)
  })
  it('collapses chat at the same 360px minimum and reverses in the held gesture', () => {
    const start = fitWorkSplit(state, width, true)
    const folded = resizeWorkSplit(start, state, width, -250, 'content', true)
    expect(folded.chatCollapsed).toBe(true)
    const back = resizeWorkSplit(start, folded, width, -100, 'content', true)
    expect(back.chatCollapsed).toBe(false)
    expect(back.inspector).toBe(400)
  })
  it('can reopen a previously folded chat with a fresh pointer gesture', () => {
    const folded = { ...state, chatCollapsed: true }
    const start = fitWorkSplit(folded, width, true)
    expect(resizeWorkSplit(start, folded, width, 40, 'content', true).chatCollapsed).toBe(false)
  })
  it('keeps an independently closed inspector closed while resizing the viewer', () => {
    const closed = { ...state, inspectorCollapsed: true }
    const result = resizeWorkSplit(fitWorkSplit(closed, width, true), closed, width, -80, 'content', true)
    expect(result.inspectorCollapsed).toBe(true)
    expect(result.inspector).toBe(46)
  })
  it('folds and unfolds the inspector independently without dropping the viewer', () => {
    const start = fitWorkSplit(state, width, true)
    const folded = resizeWorkSplit(start, state, width, 180, 'inspector', true)
    expect(folded.inspectorCollapsed).toBe(true)
    const back = resizeWorkSplit(start, folded, width, 0, 'inspector', true)
    expect(back.inspectorCollapsed).toBe(false)
    expect(back.viewer).toBe(600)
  })
  it('fits measured workspace widths without accidentally hiding chat on narrower screens', () => {
    for (const size of [600, 768, 980, 1120, 1440, 1920]) {
      const result = fitWorkSplit(state, size, true)
      expect(result.chatCollapsed).toBe(false)
      expect(result.chat).toBeGreaterThanOrEqual(360)
      expect(result.chat + result.rail + result.viewer + result.inspector).toBe(size)
    }
  })
  it('uses hysteresis instead of oscillating at the fold boundary', () => {
    const start = fitWorkSplit(state, width, true)
    const folded = resizeWorkSplit(start, state, width, 470, 'content', true)
    expect(resizeWorkSplit(start, folded, width, 420, 'content', true).viewerCollapsed).toBe(true)
    expect(resizeWorkSplit(start, folded, width, 390, 'content', true).viewerCollapsed).toBe(false)
  })
  it('opens a collapsed inspector after a short drag even without a viewer', () => {
    const closed = { ...state, inspectorCollapsed: true }
    const start = fitWorkSplit(closed, width, false)
    expect(resizeWorkSplit(start, closed, width, -30, 'content', false).inspectorCollapsed).toBe(false)
  })
})
