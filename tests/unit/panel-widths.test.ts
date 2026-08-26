import { describe, expect, it } from 'vitest'

import { resizeLinkedPanels } from '../../src/features/studio/panel-widths'

describe('studio linked panel resize', () => {
  it('expands the inspector leftward by taking the same width from the open viewer', () => {
    expect(resizeLinkedPanels({
      requestedPrimaryWidth: 680,
      primaryStartWidth: 420,
      linkedStartWidth: 900,
      primaryMin: 260,
      linkedMin: 320,
    })).toEqual({ primaryWidth: 680, linkedWidth: 640, collapseLinked: false })
  })

  it('keeps both panels usable at either drag extreme', () => {
    expect(resizeLinkedPanels({
      requestedPrimaryWidth: 1200,
      primaryStartWidth: 420,
      linkedStartWidth: 900,
      primaryMin: 260,
      linkedMin: 320,
    })).toEqual({ primaryWidth: 1000, linkedWidth: 320, collapseLinked: true })

    expect(resizeLinkedPanels({
      requestedPrimaryWidth: 100,
      primaryStartWidth: 420,
      linkedStartWidth: 900,
      primaryMin: 260,
      linkedMin: 320,
    })).toEqual({ primaryWidth: 260, linkedWidth: 1060, collapseLinked: false })
  })

  it('collapses the viewer only after dragging past its minimum-width resistance', () => {
    expect(resizeLinkedPanels({
      requestedPrimaryWidth: 1100,
      primaryStartWidth: 420,
      linkedStartWidth: 900,
      primaryMin: 260,
      linkedMin: 320,
    }).collapseLinked).toBe(false)

    expect(resizeLinkedPanels({
      requestedPrimaryWidth: 1130,
      primaryStartWidth: 420,
      linkedStartWidth: 900,
      primaryMin: 260,
      linkedMin: 320,
    }).collapseLinked).toBe(true)
  })
})
