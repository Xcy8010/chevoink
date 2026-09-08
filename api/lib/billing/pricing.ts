/** Current PostgreSQL Int columns, not a product token/context limit. */
export const MAX_CREDIT_STORAGE_INT = 2_147_483_647
export const V1_PRICING_VERSION = 'credits-v1-exact' as const
export const V2_PRICING_VERSION = 'credits-v2-itemized' as const

/** Frozen product rates, nano-Credits per token. They already include tier/calibration. */
export type ItemizedTokenRates = { inputNano: number; cacheNano: number; outputNano: number }

export class BillingInputError extends Error {
  constructor() {
    super('计费用量、金额或请求身份无效，需要核对后再结算。')
    this.name = 'BillingInputError'
  }
}

export function assertCreditInteger(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_CREDIT_STORAGE_INT) {
    throw new BillingInputError()
  }
}

/** Price-compatible V1. BigInt before multiplication; round once per operation. */
export function calculateV1ChargeMilli(promptTokens: number, completionTokens: number, multiplierBps = 10000): number {
  assertCreditInteger(promptTokens)
  assertCreditInteger(completionTokens)
  assertCreditInteger(multiplierBps)
  const input = BigInt(promptTokens)
  const output = BigInt(completionTokens) * 10n
  const amount = ((input > output ? input : output) * BigInt(multiplierBps) + 99999n) / 100000n
  if (amount > BigInt(MAX_CREDIT_STORAGE_INT)) throw new BillingInputError()
  return Number(amount)
}

export class BillingCacheUsageRequired extends BillingInputError {}

export function assertItemizedRates(rates: ItemizedTokenRates): void {
  for (const value of [rates.inputNano, rates.cacheNano, rates.outputNano]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new BillingInputError()
  }
  if (rates.cacheNano > rates.inputNano) throw new BillingInputError()
}

/** Plan30 §13.8.2/4: sum exact nano amounts, round once to wallet milli.
 * Missing cache is computable only for equal input/cache rates (d=1). */
export function calculateV2ChargeMilli(promptTokens: number, completionTokens: number, cacheHitTokens: number | null, rates: ItemizedTokenRates): number {
  assertCreditInteger(promptTokens)
  assertCreditInteger(completionTokens)
  assertItemizedRates(rates)
  if (cacheHitTokens !== null) {
    assertCreditInteger(cacheHitTokens)
    if (cacheHitTokens > promptTokens) throw new BillingInputError()
  } else if (promptTokens !== 0 && rates.inputNano !== rates.cacheNano) throw new BillingCacheUsageRequired()
  const hit = BigInt(cacheHitTokens ?? 0)
  const nano = (BigInt(promptTokens) - hit) * BigInt(rates.inputNano) + hit * BigInt(rates.cacheNano) + BigInt(completionTokens) * BigInt(rates.outputNano)
  const milli = (nano + 999999n) / 1000000n
  if (milli > BigInt(MAX_CREDIT_STORAGE_INT)) throw new BillingInputError()
  return Number(milli)
}
