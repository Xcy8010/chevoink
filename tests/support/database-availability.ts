export function isTestDatabaseRequired(environment: NodeJS.ProcessEnv = process.env): boolean {
  return ['1', 'true'].includes(environment.CI ?? '') || environment.TEST_DATABASE_REQUIRED === 'true'
}

/** Never turn a required DB outage (including after global preflight) into a green skip. */
export function handleTestDatabaseUnavailable(_error: unknown): false {
  if (isTestDatabaseRequired()) {
    throw new Error('[test-guard] Required integration database became unavailable; refusing to skip tests.')
  }
  return false
}
