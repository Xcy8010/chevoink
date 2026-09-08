import { verifyTestDatabase } from './support/database-preflight.js'
import { loadTestEnvironment } from './support/test-environment.js'
import { isTestDatabaseRequired } from './support/database-availability.js'

export default async function setup() {
  loadTestEnvironment()
  const ready = await verifyTestDatabase(isTestDatabaseRequired())
  if (!ready) console.warn('[test-guard] Local test DB unavailable: integration suites may skip; this is not release evidence.')
}
