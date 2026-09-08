const DEFAULT_TEST_HOSTS = ['127.0.0.1', 'localhost', '[::1]', 'postgres']
const SAFE_QUERY_KEYS = new Set([
  'schema', 'connection_limit', 'pool_timeout', 'connect_timeout', 'socket_timeout',
  'sslmode', 'sslaccept', 'application_name',
])

/** Pure validation: never connect and never include credentials/raw input in an error. */
export function assertTestDatabaseTarget(databaseUrl: string, additionalHosts = ''): URL {
  const reject = (reason: string): never => { throw new Error(`[test-guard] ${reason}`) }
  let target: URL
  try { target = new URL(databaseUrl) } catch { return reject('Invalid PostgreSQL test database URL.') }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) reject('Only PostgreSQL test databases are allowed.')
  if (target.hash) reject('Database URL fragments are not allowed.')
  const hosts = new Set(DEFAULT_TEST_HOSTS)
  for (const entry of additionalHosts.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)) {
    if (!/^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*|\[::1\])$/.test(entry)) reject('Test host allowlist must contain exact hostnames, not URLs or wildcards.')
    hosts.add(entry)
  }
  if (!hosts.has(target.hostname.toLowerCase())) reject('Database host is not in the explicit test allowlist.')
  // Reject encoded paths rather than letting URL/driver/database decode them differently.
  if (!/^\/chevoink_test(?:_[a-z0-9]+)*$/.test(target.pathname) || target.pathname.length > 64) {
    reject('Database name must be chevoink_test or a namespaced chevoink_test_<suffix>.')
  }
  for (const key of target.searchParams.keys()) {
    if (!SAFE_QUERY_KEYS.has(key)) reject('Unsupported database URL query option; routing overrides are forbidden.')
    if (target.searchParams.getAll(key).length !== 1) reject('Duplicate database URL options are not allowed.')
  }
  return target
}

export type TestDatabaseIdentity = {
  database: string
  superuser: boolean
  createDatabase: boolean
  createRole: boolean
  replication: boolean
  bypassRls: boolean
  elevatedMembership: boolean
}

export function assertTestDatabaseIdentity(identity: TestDatabaseIdentity, target: URL): void {
  if (identity.database !== target.pathname.slice(1)) throw new Error('[test-guard] Connected database does not match the validated target.')
  const privileges = ['superuser', 'createDatabase', 'createRole', 'replication', 'bypassRls', 'elevatedMembership'] as const
  if (privileges.some(key => identity[key] !== false)) {
    throw new Error('[test-guard] Tests require a dedicated role without cluster administration or privileged role membership.')
  }
}
