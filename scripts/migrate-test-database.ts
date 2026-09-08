import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { verifyTestDatabase } from '../tests/support/database-preflight.js'

try {
  await verifyTestDatabase(true)
  // Inherit this process's validated target, not a different shell's .env on the next command.
  const cli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url))
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { env: { ...process.env }, stdio: 'inherit' })
  if (result.error) throw new Error('[test-guard] Could not start the isolated database migration.')
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : '[test-guard] Isolated migration refused.')
  process.exitCode = 1
}
