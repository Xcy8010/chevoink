import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('production API interpreter', () => {
  it('starts the API directly rather than pinning only an npm wrapper', () => {
    const module = { exports: {} as { apps: Array<Record<string, unknown>> } }
    runInNewContext(readFileSync('ecosystem.config.cjs', 'utf8'), { module,
      process: { env: { CHEVOINK_NODE_BINARY: '/opt/pinned/bin/node', PATH: '/opt/pinned/bin:/usr/bin' }, execPath: '/usr/bin/node' } })
    expect(module.exports.apps[0]).toMatchObject({ script: 'api/server.ts', interpreter: '/opt/pinned/bin/node',
      node_args: ['--import', 'tsx'], env: { PATH: '/opt/pinned/bin:/usr/bin' } })
    expect(module.exports.apps[0].args).toEqual([])
  })
})
