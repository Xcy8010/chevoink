import { z } from 'zod'
import { itemizedRatesSchema } from './token-price.js'
import type { CreditLedgerItem } from '../../../shared/contracts/credits.js'

const schema = z.object({ pricingVersion: z.literal('credits-v2-itemized'), rateCardId: z.string().min(1), rates: itemizedRatesSchema,
  v1CeilingBps: z.number().int().nonnegative().optional(),
  cacheHitTokens: z.number().int().nonnegative().nullable().optional(), cacheMissTokens: z.number().int().nonnegative().nullable().optional() })

/** Copy only the original public pricing fields onto an associated refund. */
export function readLedgerPriceMetadata(metadata: unknown) {
  const parsed = schema.safeParse(metadata)
  return parsed.success ? parsed.data : null
}

/** Explicit public allowlist: no provider/model IDs, internal keys or free-form metadata. */
export function presentLedgerPrice(metadata: unknown): { pricing: CreditLedgerItem['pricing']; hit: number | null; miss: number | null } {
  const parsed = schema.safeParse(metadata)
  if (!parsed.success) return { pricing: null, hit: null, miss: null }
  const value = parsed.data
  return { pricing: { version: 'credits-v2-itemized', rateCardId: value.rateCardId,
    inputPerMillion: value.rates.inputNano / 1000, cachePerMillion: value.rates.cacheNano / 1000, outputPerMillion: value.rates.outputNano / 1000,
    ...(value.v1CeilingBps !== undefined ? { v1CeilingMultiplier: value.v1CeilingBps / 10000 } : {}) },
  hit: value.cacheHitTokens ?? null, miss: value.cacheMissTokens ?? null }
}
