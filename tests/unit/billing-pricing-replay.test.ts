import { describe, expect, it } from 'vitest'
import { evaluatePricingReplay, type PricingReplaySample } from '../../api/lib/billing/pricing-replay.js'

const sample = (promptTokens: number, completionTokens: number): PricingReplaySample => ({
  userKey: 'user', taskKey: 'task', modelTier: 'speed', promptTokens, completionTokens, cacheHitTokens: null, multiplierBps: 10000,
})
const rates = { speed: { inputNano: 100000, cacheNano: 100000, outputNano: 1000000 } }

describe('frozen candidate fee distribution', () => {
  it('does not approve activation from an equal-total replay', () => {
    const report = evaluatePricingReplay([sample(10000, 0)], rates)
    expect(report).toMatchObject({ oldMilli: 1000, newMilli: 1000, feeDistributionWithinLimits: true, activationApproved: false })
  })
  it('detects mixed input/output increases and never balance-caps them', () => {
    expect(evaluatePricingReplay([sample(10000, 1000)], rates)).toMatchObject({
      oldMilli: 1000, newMilli: 2000, totalDeviationPercent: 100, feeDistributionWithinLimits: false,
      task: { overFivePercentGroups: 1 },
    })
  })
  it('retains unknown/invalid samples in the failure denominator', () => {
    expect(evaluatePricingReplay([sample(10000, 0), { ...sample(0, 0), promptTokens: null }], rates))
      .toMatchObject({ samples: 2, invalidSamples: 1, feeDistributionWithinLimits: false })
    expect(evaluatePricingReplay([], rates).feeDistributionWithinLimits).toBe(false)
  })
  it('keeps task identities isolated by owner and rejects unknown cache for discounted input', () => {
    expect(evaluatePricingReplay([sample(10000, 0), { ...sample(10000, 0), userKey: 'second' }], rates).task.groups).toBe(2)
    expect(evaluatePricingReplay([sample(10000, 0)], { speed: { ...rates.speed, cacheNano: 10000 } }))
      .toMatchObject({ invalidSamples: 1, feeDistributionWithinLimits: false })
  })
})
