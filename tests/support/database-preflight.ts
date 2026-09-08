import { assertTestDatabaseIdentity, type TestDatabaseIdentity } from './database-target.js'
import { loadTestEnvironment } from './test-environment.js'

export async function verifyTestDatabase(required: boolean): Promise<boolean> {
  const target = loadTestEnvironment()
  // Importing the generated Prisma module loads .env as a side effect. Pin the
  // validated test environment before that import, including before migrations.
  const { PrismaClient } = await import('@prisma/client')
  target.searchParams.set('connect_timeout', '3')
  const client = new PrismaClient({ datasourceUrl: target.href })
  try {
    try {
      await client.$connect()
    } catch {
      if (required) throw new Error('[test-guard] Required isolated test database is unavailable; refusing to skip integration coverage.')
      return false
    }
    let rows: TestDatabaseIdentity[]
    try {
      rows = await client.$queryRaw<TestDatabaseIdentity[]>`
        SELECT current_database() AS database, r.rolsuper AS superuser,
          r.rolcreatedb AS "createDatabase", r.rolcreaterole AS "createRole",
          r.rolreplication AS replication, r.rolbypassrls AS "bypassRls",
          EXISTS (
            SELECT 1 FROM pg_roles elevated
            WHERE (elevated.rolsuper OR elevated.rolcreatedb OR elevated.rolcreaterole
                   OR elevated.rolreplication OR elevated.rolbypassrls
                   OR (elevated.rolname LIKE 'pg_%' AND elevated.rolname <> 'pg_database_owner'))
              AND pg_has_role(current_user, elevated.oid, 'MEMBER')
          ) AS "elevatedMembership"
        FROM pg_roles r WHERE r.rolname = current_user
      `
    } catch {
      // A reachable server with an unverifiable role must NEVER degrade to local skip.
      throw new Error('[test-guard] Connected database privileges could not be verified; refusing to run tests.')
    }
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]) throw new Error('[test-guard] Could not verify the connected database identity.')
    assertTestDatabaseIdentity(rows[0], target)
    return true
  } finally {
    await client.$disconnect()
  }
}
