import { describe, expect, it } from 'vitest'

import {
  calculateTokenChargeMilli,
  getCreditWindow,
} from '../../api/lib/credits.js'

describe('Credits token pricing', () => {
  it('charges 1 Credit for 10,000 input tokens', () => {
    expect(calculateTokenChargeMilli(10_000, 0)).toBe(1_000)
  })

  it('charges 1 Credit for 1,000 output tokens', () => {
    expect(calculateTokenChargeMilli(0, 1_000)).toBe(1_000)
  })

  it('bundles input and output pools into one Credit', () => {
    expect(calculateTokenChargeMilli(10_000, 1_000)).toBe(1_000)
  })

  it('applies model multipliers and rounds up to the smallest billable milli-credit', () => {
    expect(calculateTokenChargeMilli(10_000, 0, 11_000)).toBe(1_100)
    expect(calculateTokenChargeMilli(10_000, 0, 18_000)).toBe(1_800)
    expect(calculateTokenChargeMilli(10_000, 0, 48_000)).toBe(4_800)
    expect(calculateTokenChargeMilli(1, 0)).toBe(1)
  })
})

describe('Credits UTC+8 reset window', () => {
  it('keeps a request before 15:00 UTC+8 in the previous daily window', () => {
    const window = getCreditWindow(new Date('2026-08-31T06:59:59.000Z'))
    expect(window.startedAt.toISOString()).toBe('2026-08-30T07:00:00.000Z')
    expect(window.endsAt.toISOString()).toBe('2026-08-31T07:00:00.000Z')
  })

  it('starts a new window exactly at 15:00 UTC+8', () => {
    const window = getCreditWindow(new Date('2026-08-31T07:00:00.000Z'))
    expect(window.startedAt.toISOString()).toBe('2026-08-31T07:00:00.000Z')
    expect(window.endsAt.toISOString()).toBe('2026-09-01T07:00:00.000Z')
  })
})
