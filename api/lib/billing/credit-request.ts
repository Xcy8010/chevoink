import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { assertCreditInteger, BillingInputError } from './pricing.js'

const REQUEST_KEY = '__creditRequest'
const ORIGINAL_METADATA_KEY = '__creditOriginalMetadata'

/** Reject non-JSON/oversized values; object property order is not request identity. */
function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 16) throw new BillingInputError()
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${Array.from(value, item => canonicalJson(item, depth + 1)).join(',')}]`
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], depth + 1)}`).join(',')}}`
  }
  throw new BillingInputError()
}

function identity(value: unknown, max: number, nullable = false): void {
  if (nullable && value == null) return
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > max) throw new BillingInputError()
}

export type CreditRequest = {
  userId: string; amountMilli: number; kind: string; sourceType: string; idempotencyKey: string
  referenceId?: string | null; modelTier?: string | null; multiplierBps?: number
  requestTokens?: number | null; responseTokens?: number | null
  metadata?: Prisma.InputJsonValue; allowPartialOnExhaustion?: boolean
}

export function prepareCreditRequest<T extends CreditRequest>(input: T): { fingerprint: string; metadata: Prisma.InputJsonObject; snapshot: T } {
  identity(input.userId, 64)
  identity(input.idempotencyKey, 160)
  identity(input.kind, 32)
  identity(input.sourceType, 40)
  identity(input.referenceId, 96, true)
  identity(input.modelTier, 24, true)
  assertCreditInteger(input.amountMilli)
  assertCreditInteger(input.multiplierBps ?? 10000)
  if (input.requestTokens != null) assertCreditInteger(input.requestTokens)
  if (input.responseTokens != null) assertCreditInteger(input.responseTokens)
  if (input.allowPartialOnExhaustion !== undefined && typeof input.allowPartialOnExhaustion !== 'boolean') throw new BillingInputError()
  const encodedMetadata = canonicalJson(input.metadata ?? null)
  if (Buffer.byteLength(encodedMetadata, 'utf8') > 65536) throw new BillingInputError()
  const original: Prisma.JsonValue = JSON.parse(encodedMetadata)
  const object = original && typeof original === 'object' && !Array.isArray(original)
    ? original as Prisma.InputJsonObject : null
  if (object && (Object.prototype.hasOwnProperty.call(object, REQUEST_KEY) || Object.prototype.hasOwnProperty.call(object, ORIGINAL_METADATA_KEY))) throw new BillingInputError()
  const encoded = canonicalJson({
    userId: input.userId, idempotencyKey: input.idempotencyKey, amountMilli: input.amountMilli,
    kind: input.kind, sourceType: input.sourceType, referenceId: input.referenceId ?? null,
    modelTier: input.modelTier ?? null, multiplierBps: input.multiplierBps ?? 10000,
    requestTokens: input.requestTokens ?? null, responseTokens: input.responseTokens ?? null,
    allowPartialOnExhaustion: input.allowPartialOnExhaustion ?? false, metadata: original,
  })
  if (Buffer.byteLength(encoded, 'utf8') > 65536) throw new BillingInputError()
  const fingerprint = createHash('sha256').update(encoded).digest('hex')
  return {
    fingerprint,
    snapshot: { ...input, metadata: original ?? undefined },
    metadata: {
      ...(object ?? { [ORIGINAL_METADATA_KEY]: original }),
      [REQUEST_KEY]: { version: 1, fingerprint },
    },
  }
}

/** Presence with an invalid version is a conflict, never legacy fallback. */
export function readCreditFingerprint(metadata: Prisma.JsonValue | null): string | 'invalid' | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || !Object.prototype.hasOwnProperty.call(metadata, REQUEST_KEY)) return null
  const receipt = metadata[REQUEST_KEY]
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || receipt.version !== 1
    || typeof receipt.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.fingerprint)) return 'invalid'
  return receipt.fingerprint
}

export function equalLegacyMetadata(stored: Prisma.JsonValue | null, requested: Prisma.InputJsonValue | undefined): boolean {
  try { return canonicalJson(stored) === canonicalJson(requested ?? null) } catch { return false }
}
