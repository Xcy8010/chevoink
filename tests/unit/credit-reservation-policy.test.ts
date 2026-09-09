import { describe, expect, it } from 'vitest'
import { fallbackUsageEvidenceSchema, priceTokenEvidence, tokenReservationMilli } from '../../api/lib/billing/reservation-policy.js'

const price = { version: 'credits-v2-itemized' as const, modelTier: 'speed' as const, multiplierBps: 10000, rateCardId: 'test',
  rates: { inputNano: 100000, cacheNano: 25000, outputNano: 1000000 } }
describe('bounded token reservation and truthful fallback evidence', () => {
  it('limits one hold by quote, 25 Credits, quarter balance and actually available funds', () => {
    expect(tokenReservationMilli(price, 1000, 100000, 450000, 450000)).toBe(25000)
    expect(tokenReservationMilli(price, 1000, 100000, 10000, 10000)).toBe(2500)
    expect(tokenReservationMilli(price, 1000, 100000, 10000, 20)).toBe(20)
    expect(tokenReservationMilli(price, 1000, 100, 10000, 10000)).toBe(200)
  })
  it('prices only retained token evidence with the frozen rate and cache concession', () => {
    expect(priceTokenEvidence(price, 1000, 40)).toBe(65)
    expect(priceTokenEvidence({ ...price, v1CeilingBps: 1000 }, 1000, 40)).toBe(10)
    expect(() => priceTokenEvidence(price, -1, 40)).toThrow()
  })
  it('does not accept arbitrary or incomplete evidence as the approved estimate policy', () => {
    expect(fallbackUsageEvidenceSchema.safeParse({ responseObserved: true }).success).toBe(false)
    expect(fallbackUsageEvidenceSchema.safeParse({ policy: 'observed-output-estimate-2026-09-09', inputEstimate: 10, outputEstimate: -1, responseObserved: true }).success).toBe(false)
  })
})
