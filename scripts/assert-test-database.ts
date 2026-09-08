import { verifyTestDatabase } from '../tests/support/database-preflight.js'

try {
  await verifyTestDatabase(true)
  console.log('[test-guard] Isolated database target and non-privileged test role verified.')
} catch (error) {
  console.error(error instanceof Error ? error.message : '[test-guard] Database verification failed.')
  process.exitCode = 1
}
