import { describe, expect, it } from 'vitest'
import { recoverLegacyRunUsage, savedRunUsageSchema } from '../../api/lib/agent/checkpoint.js'
import { continuityRepairRounds } from '../../api/lib/agent/story-compiler.js'

describe('legacy resume budget receipts', () => {
  it('recovers all known consumption instead of granting a fresh budget', () => {
    expect(recoverLegacyRunUsage(2, [
      { turn: 1, requestTokens: 100, responseTokens: 20 },
      { turn: 2, requestTokens: 200, responseTokens: 30 },
      { turn: null, requestTokens: 10, responseTokens: 5 },
    ])).toEqual({ promptTokens: 310, completionTokens: 55, totalTokens: 365 })
  })
  it('refuses missing turns, unknown receipts and malformed saved budgets', () => {
    expect(recoverLegacyRunUsage(2, [{ turn: 2, requestTokens: 10, responseTokens: 2 }])).toBeNull()
    expect(recoverLegacyRunUsage(1, [{ turn: 1, requestTokens: null, responseTokens: 2 }])).toBeNull()
    expect(savedRunUsageSchema.safeParse({ promptTokens: 10, completionTokens: 2, totalTokens: 0 }).success).toBe(false)
  })
  it('counts retries as consumption without requiring unique turn receipts', () => {
    expect(recoverLegacyRunUsage(1, [
      { turn: 1, requestTokens: 10, responseTokens: 2 },
      { turn: 1, requestTokens: 10, responseTokens: 3 },
    ])?.totalTokens).toBe(25)
  })
})

describe('continuity repair budget survives revision changes', () => {
  it('does not reset the cap when a new revision is checked', () => {
    expect(continuityRepairRounds({ autoRepairRounds: 2, checkedRevision: 7 })).toBe(2)
    expect(continuityRepairRounds({ autoRepairRounds: 2, checkedRevision: 8 })).toBe(2)
    expect(continuityRepairRounds(null)).toBe(0)
  })
})
