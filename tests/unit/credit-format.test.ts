import { describe, expect, it } from 'vitest'

import { formatCreditAmount, roundCreditAmount } from '../../src/features/account/credit-format.js'

describe('user-visible Credits formatting', () => {
  it('never exposes fractional Credits', () => {
    expect(roundCreditAmount(12.49)).toBe(12)
    expect(roundCreditAmount(12.5)).toBe(13)
    expect(formatCreditAmount(1234.56)).toBe('1,235')
  })

  it('normalizes invalid and negative-zero values', () => {
    expect(roundCreditAmount(Number.NaN)).toBe(0)
    expect(Object.is(roundCreditAmount(-0.1), -0)).toBe(false)
  })
})
