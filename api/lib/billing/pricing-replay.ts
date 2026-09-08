import { calculateV1ChargeMilli, calculateV2ChargeMilli, type ItemizedTokenRates } from './pricing.js'

export type PricingReplaySample = {
  userKey: string; taskKey: string; modelTier: string
  promptTokens: number | null; completionTokens: number | null; cacheHitTokens: number | null
  multiplierBps: number
}

/** Replays the same confirmed usage against a frozen candidate. Never reads a
 * wallet, clips to balances, fits a price to validation data, or writes a charge. */
export function evaluatePricingReplay(samples: PricingReplaySample[], rates: Record<string, ItemizedTokenRates>, ceilings: Record<string, number> = {}) {
  const groups = new Map<string, { kind: 'user' | 'task' | 'tier'; oldMilli: number; newMilli: number }>()
  let invalidSamples = 0, oldMilli = 0, newMilli = 0
  for (const sample of samples) {
    try {
      if (!sample.userKey || !sample.taskKey || sample.promptTokens === null || sample.completionTokens === null
        || !Object.prototype.hasOwnProperty.call(rates, sample.modelTier)) throw new Error('Unconfirmed sample')
      const oldAmount = calculateV1ChargeMilli(sample.promptTokens, sample.completionTokens, sample.multiplierBps)
      const newAmount = calculateV2ChargeMilli(sample.promptTokens, sample.completionTokens, sample.cacheHitTokens, rates[sample.modelTier], ceilings[sample.modelTier])
      if (!Number.isSafeInteger(oldMilli + oldAmount) || !Number.isSafeInteger(newMilli + newAmount)) throw new Error('Unsafe total')
      oldMilli += oldAmount; newMilli += newAmount
      for (const [kind, key] of [['user', sample.userKey], ['task', JSON.stringify([sample.userKey, sample.taskKey])], ['tier', sample.modelTier]] as const) {
        const id = JSON.stringify([kind, key])
        const group = groups.get(id) ?? { kind, oldMilli: 0, newMilli: 0 }
        group.oldMilli += oldAmount; group.newMilli += newAmount
        groups.set(id, group)
      }
    } catch { invalidSamples += 1 }
  }
  const deviation = (oldValue: number, newValue: number) => oldValue === 0 ? (newValue === 0 ? 0 : null) : (newValue - oldValue) / oldValue * 100
  const summarize = (kind: 'user' | 'task' | 'tier') => {
    const selected = [...groups.values()].filter(group => group.kind === kind)
    const differences = selected.map(group => deviation(group.oldMilli, group.newMilli))
    const absolute = differences.filter((value): value is number => value !== null).map(Math.abs).sort((a, b) => a - b)
    return { groups: selected.length, p95AbsoluteDeviationPercent: absolute.length ? absolute[Math.ceil(absolute.length * 0.95) - 1] : null,
      maximumAbsoluteDeviationPercent: absolute.at(-1) ?? null,
      changedFromZeroGroups: differences.filter(value => value === null).length,
      overFivePercentGroups: differences.filter(value => value === null || Math.abs(value) > 5).length,
      maximumAbsoluteMilliChange: selected.reduce((maximum, group) => Math.max(maximum, Math.abs(group.newMilli - group.oldMilli)), 0) }
  }
  const user = summarize('user'), task = summarize('task'), tier = summarize('tier')
  const totalDeviationPercent = deviation(oldMilli, newMilli)
  return { samples: samples.length, invalidSamples, oldMilli, newMilli, totalDeviationPercent, user, task, tier,
    feeDistributionWithinLimits: samples.length > 0 && invalidSamples === 0 && oldMilli > 0 && totalDeviationPercent !== null
      && Math.abs(totalDeviationPercent) <= 3 && [user, task].every(group => group.p95AbsoluteDeviationPercent !== null
        && group.p95AbsoluteDeviationPercent <= 5 && group.changedFromZeroGroups === 0) && tier.overFivePercentGroups === 0,
    // This numerical replay alone cannot establish observation duration, cash
    // costs, quality, independent holdout data or publication approval.
    activationApproved: false as const }
}
