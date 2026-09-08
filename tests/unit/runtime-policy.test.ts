import { describe, expect, it } from 'vitest'
import { validateRuntimePolicy } from '../../scripts/lib/runtime-policy.js'

const policy = {
  nodeVersion: '22.23.2', engines: { node: '22.23.2', npm: '10.9.8' },
  packageManager: 'npm@10.9.8', lockEngines: { node: '22.23.2', npm: '10.9.8' },
}
const actual = { node: 'v22.23.2', npm: '10.9.8' }
describe('runtime admission policy', () => {
  it('accepts the pinned candidate', () => expect(validateRuntimePolicy(policy, actual)).toEqual([]))
  it.each(['v20.20.2', 'v22.23.1', 'v24.12.0'])('rejects runtime drift: %s', (node) => {
    expect(validateRuntimePolicy(policy, { ...actual, node })).not.toEqual([])
  })
  it.each(['', '11.6.2'])('rejects unknown/different npm: %s', (npm) => {
    expect(validateRuntimePolicy(policy, { ...actual, npm })).not.toEqual([])
  })
  it('rejects floating versions', () => {
    expect(validateRuntimePolicy({ ...policy, nodeVersion: '22', engines: { node: '22', npm: '^10' } }, actual)).not.toEqual([])
  })
  it('rejects stale lock metadata', () => {
    expect(validateRuntimePolicy({ ...policy, lockEngines: {} }, actual)).not.toEqual([])
  })
  it('rejects package manager disagreement', () => {
    expect(validateRuntimePolicy({ ...policy, packageManager: 'npm@11.6.2' }, actual)).not.toEqual([])
  })
})
