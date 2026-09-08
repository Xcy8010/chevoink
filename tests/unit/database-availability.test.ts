import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTestDatabaseUnavailable, isTestDatabaseRequired } from '../support/database-availability.js'
import { databaseUrlWithUtcSession } from '../../api/lib/prisma.js'

afterEach(() => vi.unstubAllEnvs())

describe('integration database availability policy', () => {
  it('preserves connection settings while overriding a non-UTC session option', () => {
    const url = new URL(databaseUrlWithUtcSession('postgresql://fixture:secret@localhost/test?schema=public&connection_limit=3&options=-c%20statement_timeout%3D5000%20-c%20timezone%3DAsia%2FShanghai')!)
    expect(url.searchParams.get('schema')).toBe('public')
    expect(url.searchParams.get('connection_limit')).toBe('3')
    expect(url.password).toBe('secret')
    expect(url.searchParams.get('options')).toBe('-c statement_timeout=5000 -c timezone=Asia/Shanghai -c timezone=UTC')
    expect(databaseUrlWithUtcSession(undefined)).toBeUndefined()
    expect(databaseUrlWithUtcSession('invalid')).toBe('invalid')
  })
  it.each([{ CI: 'true' }, { CI: '1' }, { TEST_DATABASE_REQUIRED: 'true' }])('requires DB for %j', (env) => {
    expect(isTestDatabaseRequired(env)).toBe(true)
  })

  it('allows explicit local development without DB', () => {
    vi.stubEnv('CI', '')
    vi.stubEnv('TEST_DATABASE_REQUIRED', '')
    expect(handleTestDatabaseUnavailable(new Error('connection refused'))).toBe(false)
  })

  it('does not skip a required suite when its probe fails after preflight', () => {
    vi.stubEnv('TEST_DATABASE_REQUIRED', 'true')
    const failure = new Error('postgresql://private-secret@host/db')
    expect(() => handleTestDatabaseUnavailable(failure)).toThrow('refusing to skip')
    expect(() => handleTestDatabaseUnavailable(failure)).not.toThrow('private-secret')
  })
})
