import { describe, expect, it } from 'vitest'
import { calculateTokenChargeMilli } from '../../api/lib/credits.js'
import { calculateV2ChargeMilli, calculateV2UserChargeMilli, BillingCacheUsageRequired } from '../../api/lib/billing/pricing.js'

const MAX_DB_INT = 2_147_483_647

describe('V2 itemized integer pricing', () => {
  const rates = { inputNano: 100000, cacheNano: 20000, outputNano: 1000000 }
  it('discounts unknown cache without changing reported-cache prices or bypassing validation', () => {
    expect(calculateV2UserChargeMilli(10000, 1000, null, rates)).toBe(1200)
    expect(calculateV2UserChargeMilli(10000, 1000, 0, rates)).toBe(2000)
    expect(calculateV2UserChargeMilli(10000, 1000, 5000, rates)).toBe(1600)
    expect(calculateV2UserChargeMilli(10000, 1000, null, rates, 10000)).toBeLessThanOrEqual(calculateTokenChargeMilli(10000, 1000))
    expect(() => calculateV2UserChargeMilli(-1, 0, null, rates)).toThrow()
    expect(() => calculateV2UserChargeMilli(10, 0, null, { ...rates, cacheNano: rates.inputNano + 1 })).toThrow()
  })
  it('caps the discounted sum at the frozen V1 charge, including output-heavy requests', () => {
    const quarter = { inputNano: 110000, cacheNano: 27500, outputNano: 1100000 }
    expect(calculateV2ChargeMilli(10000, 1000, 0, quarter, 11000)).toBe(1100)
    expect(calculateV2ChargeMilli(10000, 0, 10000, quarter, 11000)).toBe(275)
    expect(calculateV2ChargeMilli(10000, 5000, 10000, quarter, 11000)).toBe(5500)
    expect(() => calculateV2ChargeMilli(100, 0, null, quarter, 11000)).toThrow(BillingCacheUsageRequired)
    for (let i = 0; i < 1000; i++) {
      const p = i * 103, o = i % 43, hit = Math.floor(p * (i % 11) / 10)
      expect(calculateV2ChargeMilli(p, o, hit, quarter, 11000)).toBeLessThanOrEqual(calculateTokenChargeMilli(p, o, 11000))
    }
  })
  it('sums input/cache/output once, with no second tier multiplier', () => {
    expect(calculateV2ChargeMilli(10000, 1000, 5000, rates)).toBe(1600)
    expect(calculateV2ChargeMilli(10000, 1000, 0, rates)).toBe(2000)
    expect(calculateV2ChargeMilli(0, 0, null, rates)).toBe(0)
    expect(calculateV2ChargeMilli(1, 0, 0, rates)).toBe(1)
  })
  it('preserves unknown cache rather than assuming an expensive miss', () => {
    expect(() => calculateV2ChargeMilli(10000, 0, null, rates)).toThrow(BillingCacheUsageRequired)
    expect(calculateV2ChargeMilli(10000, 0, null, { ...rates, cacheNano: rates.inputNano })).toBe(1000)
  })
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects malformed usage/rates %s', invalid => {
    expect(() => calculateV2ChargeMilli(invalid, 0, 0, rates)).toThrow()
    expect(() => calculateV2ChargeMilli(100, invalid, 0, rates)).toThrow()
    expect(() => calculateV2ChargeMilli(100, 0, invalid, rates)).toThrow()
    expect(() => calculateV2ChargeMilli(100, 0, 0, { ...rates, inputNano: invalid })).toThrow()
  })
  it('rejects impossible cache splits and wallet overflow', () => {
    expect(() => calculateV2ChargeMilli(1, 0, 2, rates)).toThrow()
    expect(() => calculateV2ChargeMilli(1, 0, 0, { ...rates, cacheNano: 100001 })).toThrow()
    expect(() => calculateV2ChargeMilli(MAX_DB_INT, MAX_DB_INT, 0, rates)).toThrow()
  })
})

describe('V1 exact pricing through the existing credits facade', () => {
  it.each([
    [0, 0, 10000, 0], [1, 0, 10000, 1], [9, 0, 10000, 1],
    [10, 0, 10000, 1], [11, 0, 10000, 2], [10000, 1000, 10000, 1000],
    [10000, 1000, 11000, 1100], [10000, 1000, 48000, 4800],
    [100000, 10000, 0, 0], [MAX_DB_INT, 0, 100000, MAX_DB_INT],
  ])('P=%i O=%i b=%i produces %i milli', (p, o, b, expected) => {
    expect(calculateTokenChargeMilli(p, o, b)).toBe(expected)
  })

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, MAX_DB_INT + 1])(
    'rejects invalid/out-of-storage-range input %s instead of clamping or rounding', value => {
      expect(() => calculateTokenChargeMilli(value, 0)).toThrow()
      expect(() => calculateTokenChargeMilli(0, value)).toThrow()
      expect(() => calculateTokenChargeMilli(1, 0, value)).toThrow()
      expect(() => calculateTokenChargeMilli(value, 0, 0)).toThrow()
    },
  )

  it('rejects a valid integer calculation that cannot fit the current ledger column', () => {
    expect(() => calculateTokenChargeMilli(MAX_DB_INT, MAX_DB_INT, 10001)).toThrow()
    expect(() => calculateTokenChargeMilli(MAX_DB_INT, MAX_DB_INT, MAX_DB_INT)).toThrow()
  })

  it('matches an integer oracle across deterministic samples and the maximum admissible amount', () => {
    let seed = 73
    for (let i = 0; i < 5000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const p = seed % 20_000_000
      const o = (seed >>> 4) % 100_000
      const b = [0, 1, 9999, 10000, 11000, 18000, 48000][i % 7]
      const weighted = BigInt(p) > BigInt(o) * 10n ? BigInt(p) : BigInt(o) * 10n
      expect(calculateTokenChargeMilli(p, o, b)).toBe(Number((weighted * BigInt(b) + 99999n) / 100000n))
    }
    // Maximum admitted multiplier still fits when the token count gives an Int-sized charge.
    expect(calculateTokenChargeMilli(100000, 0, MAX_DB_INT)).toBe(MAX_DB_INT)
  })
})
