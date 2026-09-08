import { describe, expect, it } from 'vitest'
import { equalLegacyMetadata, prepareCreditRequest, readCreditFingerprint, type CreditRequest } from '../../api/lib/billing/credit-request.js'

const input: CreditRequest = {
  userId: 'user', idempotencyKey: 'operation', amountMilli: 2, kind: 'usage', sourceType: 'model_tokens',
}

describe('charge identity envelope', () => {
  it('canonicalizes defaults and object order without losing business metadata', () => {
    const request = prepareCreditRequest({ ...input, metadata: { b: { d: 2, c: 1 }, a: 3 } })
    const normalized = prepareCreditRequest({ ...input, referenceId: null, modelTier: null, multiplierBps: 10000,
      requestTokens: null, responseTokens: null, allowPartialOnExhaustion: false, metadata: { a: 3, b: { c: 1, d: 2 } } })
    expect(request.fingerprint).toBe(normalized.fingerprint)
    expect(request.metadata).toMatchObject({ a: 3, b: { c: 1, d: 2 } })
    expect(readCreditFingerprint(JSON.parse(JSON.stringify(request.metadata)))).toBe(request.fingerprint)
  })

  it('snapshots the input before async transactions so caller mutation cannot change the charge', () => {
    const mutable = { ...input, metadata: { nested: { query: 'original' } } }
    const request = prepareCreditRequest(mutable)
    mutable.amountMilli = 999
    mutable.metadata.nested.query = 'changed'
    expect(request.snapshot.amountMilli).toBe(2)
    expect(request.snapshot.metadata).toEqual({ nested: { query: 'original' } })
    expect(request.metadata.nested).toEqual({ query: 'original' })
  })

  it.each([
    { userId: 'other' }, { idempotencyKey: 'other' }, { amountMilli: 3 }, { kind: 'other' },
    { sourceType: 'other' }, { referenceId: 'other' }, { modelTier: 'other' }, { multiplierBps: 0 },
    { requestTokens: 0 }, { responseTokens: 0 }, { allowPartialOnExhaustion: true }, { metadata: { input: 'different' } },
  ])('binds request field %j', change => {
    expect(prepareCreditRequest({ ...input, ...change }).fingerprint).not.toBe(prepareCreditRequest(input).fingerprint)
  })

  it.each([
    { userId: '' }, { userId: ' user ' }, { idempotencyKey: 'a'.repeat(161) },
    { referenceId: 'a'.repeat(97) }, { modelTier: '' }, { amountMilli: -1 },
    { requestTokens: -1 }, { responseTokens: 0.5 }, { multiplierBps: NaN },
    { metadata: { __creditRequest: { version: 1 } } }, { metadata: { __creditOriginalMetadata: {} } },
    { metadata: { nonfinite: Infinity } }, { metadata: { tooLarge: 'x'.repeat(65537) } },
  ])('rejects invalid identity/metadata %j', change => {
    expect(() => prepareCreditRequest({ ...input, ...change })).toThrow()
  })

  it('limits nesting and refuses cycles rather than hashing an ambiguous truncated payload', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    expect(() => prepareCreditRequest({ ...input, metadata: cycle as CreditRequest['metadata'] })).toThrow()
  })

  it('supports JSON primitive/array metadata without confusing it with the receipt envelope', () => {
    for (const metadata of ['value', 123, true, [1, 2]]) {
      const request = prepareCreditRequest({ ...input, metadata })
      expect(request.metadata.__creditOriginalMetadata).toEqual(metadata)
    }
    expect(prepareCreditRequest({ ...input, metadata: [1, 2] }).fingerprint).not.toBe(prepareCreditRequest({ ...input, metadata: [2, 1] }).fingerprint)
  })

  it('distinguishes missing historical identity from malformed/newer identity', () => {
    expect(readCreditFingerprint(null)).toBeNull()
    expect(readCreditFingerprint({ query: 'old' })).toBeNull()
    expect(readCreditFingerprint({ __creditRequest: null })).toBe('invalid')
    expect(readCreditFingerprint({ __creditRequest: { version: 99, fingerprint: 'a'.repeat(64) } })).toBe('invalid')
    expect(equalLegacyMetadata({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true)
    expect(equalLegacyMetadata(null, undefined)).toBe(true)
    expect(equalLegacyMetadata({ a: 1 }, { a: 2 })).toBe(false)
  })
})
