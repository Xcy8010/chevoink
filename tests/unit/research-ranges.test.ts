import { describe, expect, it } from 'vitest'
import { mergeResearchRanges } from '../../api/lib/agent/research-ranges.js'

describe('versioned research window coverage', () => {
  it('unions overlapping, repeated and adjacent windows without hiding gaps', () => {
    expect(mergeResearchRanges([{ start: 5, end: 10 }, { start: 0, end: 6 }, { start: 0, end: 6 },
      { start: 12, end: 15 }, { start: 15, end: 20 }], 20)).toEqual([{ start: 0, end: 10 }, { start: 12, end: 20 }])
    expect(mergeResearchRanges([], 20)).toEqual([])
  })
  it.each([{ start: 1, end: 1 }, { start: -1, end: 4 }, { start: 0, end: 21 }, { start: 1.1, end: 3 }])('rejects invalid ranges %j', range => {
    expect(() => mergeResearchRanges([range], 20)).toThrow()
  })
})
