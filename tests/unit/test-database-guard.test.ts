import { describe, expect, it } from 'vitest'

import { assertTestDatabaseIdentity, assertTestDatabaseTarget, type TestDatabaseIdentity } from '../support/database-target.js'
import { resolveTestEnvironment } from '../support/test-environment.js'

describe('test database target guard', () => {
  it.each(['127.0.0.1', 'localhost', '[::1]', 'postgres'])('allows the explicit local/CI host %s', host => {
    expect(assertTestDatabaseTarget(`postgresql://${host}:5432/chevoink_test`).pathname).toBe('/chevoink_test')
  })
  it('allows namespaced isolated databases and supported driver options', () => {
    expect(assertTestDatabaseTarget('postgres://localhost/chevoink_test_worker_2?schema=public&connection_limit=2').hostname).toBe('localhost')
  })
  it.each([
    'postgresql://test:password@localhost/chevoink_prod',
    'postgresql://user:test-password@localhost/production',
    'postgresql://test-host.example/chevoink_test',
    'postgresql://localhost/contest',
    'postgresql://localhost/chevoink_test/other',
    'postgresql://localhost/%63hevoink_test',
    'postgresql://localhost/chevoink_test?host=production.example',
    'postgresql://localhost/chevoink_test?dbname=production',
    'postgresql://localhost/chevoink_test?schema=public&schema=other',
    'postgresql://localhost/chevoink_test#test',
    'https://localhost/chevoink_test',
    'not-a-database-url',
  ])('rejects misleading or overridden targets: %s', url => {
    expect(() => assertTestDatabaseTarget(url)).toThrow('[test-guard]')
  })
  it('requires exact opt-in for a remote isolated host', () => {
    expect(assertTestDatabaseTarget('postgresql://db.test.example/chevoink_test', 'db.test.example').hostname).toBe('db.test.example')
    expect(() => assertTestDatabaseTarget('postgresql://db.test.example/chevoink_test', '*.example')).toThrow('exact hostnames')
  })
  it('does not leak raw URLs, credentials or query values in errors', () => {
    const secret = 'fixture-sensitive-value'
    for (const url of [`postgresql://user:${secret}@localhost/production`, `postgresql://localhost/chevoink_test?password=${secret}`]) {
      let message = ''
      try { assertTestDatabaseTarget(url) } catch (error) { message = String(error) }
      expect(message).toContain('[test-guard]')
      expect(message).not.toContain(secret)
      expect(message).not.toContain('postgresql://')
    }
  })
})

describe('test environment and database identity', () => {
  const target = assertTestDatabaseTarget('postgresql://localhost/chevoink_test')
  const identity: TestDatabaseIdentity = {
    database: 'chevoink_test', superuser: false, createDatabase: false, createRole: false,
    replication: false, bypassRls: false, elevatedMembership: false,
  }
  it('accepts a dedicated role and rejects a mismatched actual database', () => {
    expect(() => assertTestDatabaseIdentity(identity, target)).not.toThrow()
    expect(() => assertTestDatabaseIdentity({ ...identity, database: 'production' }, target)).toThrow('does not match')
  })
  it.each(['superuser', 'createDatabase', 'createRole', 'replication', 'bypassRls', 'elevatedMembership'] as const)('rejects privilege %s', key => {
    expect(() => assertTestDatabaseIdentity({ ...identity, [key]: true }, target)).toThrow('dedicated role')
  })
  it('does not allow a local file to mask an unsafe inherited database', () => {
    expect(() => resolveTestEnvironment({ DATABASE_URL: 'postgresql://test@localhost/production' }, { DATABASE_URL: target.href }, '/test.env')).toThrow('Database name')
  })
  it('keeps explicit CI variables and pins DOTENV_PATH after parsing', () => {
    const result = resolveTestEnvironment({ DATABASE_URL: target.href }, { DATABASE_URL: 'postgresql://localhost/chevoink_test_other', DOTENV_PATH: '/production.env' }, '/test.env')
    expect(result.DATABASE_URL).toBe(target.href)
    expect(result.DOTENV_PATH).toBe('/test.env')
    expect(result.APP_ENV).toBe('test')
  })
  it('rejects non-test APP_ENV and alternate unsafe connections', () => {
    expect(() => resolveTestEnvironment({ APP_ENV: 'production' }, {}, '/test.env')).toThrow('APP_ENV')
    expect(() => resolveTestEnvironment({}, { DIRECT_URL: 'postgresql://localhost/prod' }, '/test.env')).toThrow('Database name')
  })
  it('pins unset provider secrets before Prisma can load development defaults', () => {
    const result = resolveTestEnvironment({}, { TEST_DATABASE_REQUIRED: 'true' }, '/test.env')
    expect(result.AI_TEXT_API_KEY).toBe('')
    expect(result.WEB_SEARCH_BOCHA_API_KEY).toBe('')
    expect(result.SMS_TENCENT_SECRET_KEY).toBe('')
    expect(result.TEST_DATABASE_REQUIRED).toBe('true')
    expect(resolveTestEnvironment({ AI_TEXT_API_KEY: 'explicit-fixture' }, {}, '/test.env').AI_TEXT_API_KEY).toBe('explicit-fixture')
  })
})
