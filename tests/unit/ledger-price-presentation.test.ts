import { describe, expect, it } from 'vitest'
import { presentLedgerPrice } from '../../api/lib/billing/ledger-presentation.js'

describe('V2 original-price public presentation', () => {
  it('uses original integer rates and an explicit public allowlist', () => {
    expect(presentLedgerPrice({ pricingVersion: 'credits-v2-itemized', rateCardId: 'version-id', rates: { inputNano: 100000, cacheNano: 20000, outputNano: 1000000 },
      cacheHitTokens: 50, cacheMissTokens: null, apiKey: 'never-public', provider: 'never-public' })).toEqual({
      pricing: { version: 'credits-v2-itemized', rateCardId: 'version-id', inputPerMillion: 100, cachePerMillion: 20, outputPerMillion: 1000 }, hit: 50, miss: null,
    })
  })
  it.each([null, {}, { pricingVersion: 'future-version' }, { pricingVersion: 'credits-v2-itemized', rates: {} }])('does not invent a V2 price for %j', value => {
    expect(presentLedgerPrice(value)).toEqual({ pricing: null, hit: null, miss: null })
  })
})
