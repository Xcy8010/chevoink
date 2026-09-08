import { describe, expect, it } from 'vitest'
import { inspectSource } from '../../scripts/lib/source-inventory.js'

describe('engineering static inventory', () => {
  it('records literal routes and dynamic gaps without confusing map lookups with HTTP', () => {
    const result = inspectSource('api/routes/demo.ts', "import x from './a.js'; export { y } from './b.js'; router.get('/one', x); router.post(path, x); map.get('not-route'); import('./lazy.js');")
    expect(result.imports).toEqual(['./a.js', './b.js', './lazy.js'])
    expect(result.references).toEqual([
      { line: 1, kind: 'http:router.get', value: '/one' },
      { line: 1, kind: 'http:router.post', value: null },
    ])
  })
  it('records storage keys/call sites but never stored payloads', () => {
    const result = inspectSource('src/store.ts', "localStorage.setItem('draft-v1', 'private-body'); window.sessionStorage.getItem(key); localStorage.clear();")
    expect(result.references.map((item) => item.value)).toEqual(['draft-v1', null, null])
    expect(JSON.stringify(result)).not.toContain('private-body')
  })
  it('extracts only tool definitions and retains source line numbers', () => {
    const result = inspectSource('api/lib/agent/tools/demo.ts', "\nexport const tool: AgentTool<typeof args> = { name: 'chapter_read', input: { name: 'not-a-tool' }, execute: async () => {} }")
    expect(result.references).toEqual([{ line: 2, kind: 'agent-tool', value: 'chapter_read' }])
    expect(result.functions).toBe(1)
  })
  it('captures declared client paths and contract discriminants', () => {
    expect(inspectSource('src/app/route-config.tsx', "const routes = [{ path: '/studio', element: <Studio /> }]").references[0].value).toBe('/studio')
    expect(inspectSource('shared/contracts/events.ts', "type E = { type: 'tool.start'; id: string }").references[0].value).toBe('tool.start')
  })
  it('captures the actual defineTool factory syntax used by the registry', () => {
    const result = inspectSource('api/lib/agent/tools/search.ts', "export const search = defineTool({name: 'web_search', parameters: z.object({name: z.string()})})")
    expect(result.references).toEqual([{ line: 1, kind: 'agent-tool', value: 'web_search' }])
  })
})
