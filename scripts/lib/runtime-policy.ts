type RuntimePolicy = {
  nodeVersion: string
  engines: { node?: string; npm?: string }
  packageManager: string
  lockEngines: { node?: string; npm?: string }
}

/** No ranges/latest aliases: CI and the future immutable release must use one candidate. */
export function validateRuntimePolicy(policy: RuntimePolicy, actual: { node: string; npm: string }): string[] {
  const errors: string[] = []
  const exact = /^\d+\.\d+\.\d+$/
  if (!exact.test(policy.nodeVersion) || !exact.test(policy.engines.npm ?? '')) {
    errors.push('Node and npm must be exact patch versions')
  }
  if (policy.engines.node !== policy.nodeVersion || policy.lockEngines.node !== policy.nodeVersion) {
    errors.push('.node-version, package engines and lockfile Node policy disagree')
  }
  if (policy.packageManager !== `npm@${policy.engines.npm}` || policy.lockEngines.npm !== policy.engines.npm) {
    errors.push('packageManager, package engines and lockfile npm policy disagree')
  }
  if (actual.node.replace(/^v/, '') !== policy.nodeVersion) errors.push(`Expected Node ${policy.nodeVersion}; received ${actual.node}`)
  if (actual.npm !== policy.engines.npm) errors.push(`Expected npm ${policy.engines.npm}; received ${actual.npm || 'unknown'}`)
  return errors
}
