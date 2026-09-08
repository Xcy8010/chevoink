import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('../../api/lib/prisma.js', () => ({
  prisma: { $transaction: mocks.transaction },
  DataAccessError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
}))
import { runtimeTransaction } from '../../api/lib/agent/runtime-common.js'

beforeEach(() => { mocks.transaction.mockReset() })
const known = (code: string, sqlState?: string) => new Prisma.PrismaClientKnownRequestError('fixture failure', { code, clientVersion: 'test', meta: { code: sqlState } })

describe('DB-only runtime transaction retries', () => {
  it.each([['P2034', undefined], ['P2002', undefined], ['P2010', '40001'], ['P2010', '40P01']])('retries %s / %s with a fresh transaction', async (code, sqlState) => {
    mocks.transaction.mockRejectedValueOnce(known(code!, sqlState)).mockResolvedValueOnce('committed')
    expect(await runtimeTransaction(async () => 'committed')).toBe('committed')
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    expect(mocks.transaction.mock.calls[1][1]).toMatchObject({ isolationLevel: 'Serializable', timeout: 10000 })
  })
  it.each([known('P2010', '42501'), known('P2010', '23514'), known('P2010', '57014'), new Error('40001 serialization failed'), { code: 'P2010', meta: { code: '40001' } }])('does not retry other errors %#', async error => {
    mocks.transaction.mockRejectedValue(error)
    await expect(runtimeTransaction(async () => undefined)).rejects.toBe(error)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })
  it('stops after three conflict attempts without claiming a commit', async () => {
    const error = known('P2010', '40001')
    mocks.transaction.mockRejectedValue(error)
    await expect(runtimeTransaction(async () => undefined)).rejects.toBe(error)
    expect(mocks.transaction).toHaveBeenCalledTimes(3)
  })
})
