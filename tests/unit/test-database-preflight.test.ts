import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), disconnect: vi.fn(), load: vi.fn() }))
vi.mock('../support/test-environment.js', () => ({ loadTestEnvironment: state.load }))
vi.mock('@prisma/client', () => ({ PrismaClient: class {
  $connect = state.connect
  $queryRaw = state.query
  $disconnect = state.disconnect
} }))

import { verifyTestDatabase } from '../support/database-preflight.js'

describe('test database preflight is fail closed after connecting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.load.mockReturnValue(new URL('postgresql://localhost/chevoink_test'))
    state.connect.mockResolvedValue(undefined)
    state.disconnect.mockResolvedValue(undefined)
    state.query.mockResolvedValue([{
      database: 'chevoink_test', superuser: false, createDatabase: false, createRole: false,
      replication: false, bypassRls: false, elevatedMembership: false,
    }])
  })
  it('validates the target before opening a connection', async () => {
    state.load.mockImplementation(() => { throw new Error('[test-guard] invalid target') })
    await expect(verifyTestDatabase(false)).rejects.toThrow('invalid target')
    expect(state.connect).not.toHaveBeenCalled()
  })
  it('allows unavailable DB only for explicitly optional local runs', async () => {
    state.connect.mockRejectedValue(new Error('unavailable'))
    await expect(verifyTestDatabase(false)).resolves.toBe(false)
    await expect(verifyTestDatabase(true)).rejects.toThrow('refusing to skip')
    expect(state.query).not.toHaveBeenCalled()
    expect(state.disconnect).toHaveBeenCalledTimes(2)
  })
  it('does not treat a failed privilege query as an unavailable local DB', async () => {
    state.query.mockRejectedValue(new Error('provider error with secret fixture'))
    await expect(verifyTestDatabase(false)).rejects.toThrow('privileges could not be verified')
    expect(state.disconnect).toHaveBeenCalledOnce()
  })
  it.each([
    { rows: [] }, { rows: [{ database: 'chevoink_test' }] },
    { rows: [{ database: 'production' }] }, { rows: undefined },
  ])('rejects unverifiable identity rows: $rows', async ({ rows }) => {
    state.query.mockResolvedValue(rows)
    await expect(verifyTestDatabase(false)).rejects.toThrow('[test-guard]')
  })
  it('verifies the dedicated role and closes its preflight connection', async () => {
    await expect(verifyTestDatabase(true)).resolves.toBe(true)
    expect(state.disconnect).toHaveBeenCalledOnce()
  })
})
