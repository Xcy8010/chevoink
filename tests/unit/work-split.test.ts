import { describe, expect, it } from 'vitest'
import { advanceWorkSplitGesture, fitWorkSplit, resizeWorkSplit, WORK_SPLIT, type WorkSplit, type WorkSplitGesture } from '../../src/features/studio/components/work-split'

const state: WorkSplit = { viewer: 600, inspector: 400, chatCollapsed: false, viewerCollapsed: false, inspectorCollapsed: false }
const width = 1600
describe('continuous Work gestures', () => {
  it('shrinks viewer first, then inspector, folds the pair and reverses without a new gesture', () => {
    const start = fitWorkSplit(state, width, true)
    const a = resizeWorkSplit(start, state, width, 200, 'content', true)
    expect([a.viewer, a.inspector]).toEqual([400, 400])
    const b = resizeWorkSplit(start, a, width, 500, 'content', true)
    expect([b.viewer, b.inspector]).toEqual([220, 280])
    const c = resizeWorkSplit(start, b, width, 670, 'content', true)
    expect(c.viewerCollapsed && c.inspectorCollapsed).toBe(true)
    const d = resizeWorkSplit(start, c, width, 500, 'content', true)
    expect(d.viewerCollapsed || d.inspectorCollapsed).toBe(false)
    expect([d.viewer, d.inspector]).toEqual([220, 280])
    expect(resizeWorkSplit(start, d, width, 0, 'content', true)).toMatchObject(state)
  })
  it('collapses chat at the same 360px minimum and reverses in the held gesture', () => {
    const start = fitWorkSplit(state, width, true)
    const folded = resizeWorkSplit(start, state, width, -290, 'content', true)
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
    const folded = resizeWorkSplit(start, state, width, 290, 'inspector', true)
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
    const folded = resizeWorkSplit(start, state, width, 670, 'content', true)
    expect(resizeWorkSplit(start, folded, width, 560, 'content', true).viewerCollapsed).toBe(true)
    expect(resizeWorkSplit(start, folded, width, 530, 'content', true).viewerCollapsed).toBe(false)
  })
  it('opens a collapsed inspector after a short drag even without a viewer', () => {
    const closed = { ...state, inspectorCollapsed: true }
    const start = fitWorkSplit(closed, width, false)
    expect(resizeWorkSplit(start, closed, width, -30, 'content', false).inspectorCollapsed).toBe(false)
  })
  it('holds both panes at smaller minima until deliberate overdrag', () => {
    const start = fitWorkSplit(state, width, true)
    const atMinimum = resizeWorkSplit(start, state, width, 580, 'content', true)
    expect([atMinimum.viewer, atMinimum.inspector]).toEqual([220, 200])
    expect(resizeWorkSplit(start, atMinimum, width, 663, 'content', true).viewerCollapsed).toBe(false)
    expect(resizeWorkSplit(start, atMinimum, width, 665, 'content', true).viewerCollapsed).toBe(true)
  })
  it.each(['content', 'inspector'] as const)('reopens %s after 30px reversal even after overshooting to the window edge', boundary => {
    const gesture: WorkSplitGesture = { x: 600, start: fitWorkSplit(state, width, true), width, boundary, hasViewer: true }
    const folded = advanceWorkSplitGesture(gesture, state, 1400)
    expect(folded.inspectorCollapsed).toBe(true)
    const edge = advanceWorkSplitGesture(gesture, folded, 1599)
    expect(edge.inspectorCollapsed).toBe(true)
    const back = advanceWorkSplitGesture(gesture, edge, 1569)
    expect(back.inspectorCollapsed).toBe(false)
    expect(back.viewerCollapsed).toBe(false)
  })
  it('reopens chat after a short rightward reversal from the left edge', () => {
    const gesture: WorkSplitGesture = { x: 600, start: fitWorkSplit(state, width, true), width, boundary: 'content', hasViewer: true }
    const folded = advanceWorkSplitGesture(gesture, state, 250)
    const edge = advanceWorkSplitGesture(gesture, folded, 0)
    expect(edge.chatCollapsed).toBe(true)
    expect(advanceWorkSplitGesture(gesture, edge, WORK_SPLIT.hysteresis + 1).chatCollapsed).toBe(false)
  })
  it('restores chat if no other content remains visible', () => {
    for (const hasViewer of [true, false]) {
      expect(fitWorkSplit({ ...state, chatCollapsed: true, viewerCollapsed: true, inspectorCollapsed: true }, width, hasViewer).chatCollapsed).toBe(false)
    }
  })
  it('uses the remaining canvas for the inspector when chat folds without a viewer', () => {
    const result = fitWorkSplit({ ...state, chatCollapsed: true }, width, false)
    expect(result.inspector).toBe(width)
    expect(result.chat + result.rail + result.viewer + result.inspector).toBe(width)
  })
  it.each(['content', 'inspector'] as const)('repeats 20 close/open cycles at the right edge for %s without leaving the viewport', boundary => {
    for (const left of [0, 280]) {
      const gesture: WorkSplitGesture = { x: left + 600, left, start: fitWorkSplit(state, width, true), width, boundary, hasViewer: true }
      let current = state
      for (let cycle = 0; cycle < 20; cycle++) {
        current = advanceWorkSplitGesture(gesture, current, left + width - 1)
        expect(current.inspectorCollapsed, `cycle ${cycle}`).toBe(true)
        current = advanceWorkSplitGesture(gesture, current, left + width - 31)
        expect(current.inspectorCollapsed, `cycle ${cycle}`).toBe(false)
      }
    }
  })
  it('can repeat chat folds near the left viewport edge', () => {
    const gesture: WorkSplitGesture = { x: 600, start: fitWorkSplit(state, width, true), width, boundary: 'content', hasViewer: true }
    let current = state
    for (let cycle = 0; cycle < 20; cycle++) {
      current = advanceWorkSplitGesture(gesture, current, 1)
      expect(current.chatCollapsed).toBe(true)
      current = advanceWorkSplitGesture(gesture, current, 31)
      expect(current.chatCollapsed).toBe(false)
    }
  })
})
