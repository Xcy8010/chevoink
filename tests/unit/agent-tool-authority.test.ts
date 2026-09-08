import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AgentWorkspaceToolPermission } from '../../shared/contracts/index.js'
import { applySessionToolPolicy, getAgentDefinition, getToolsForAgent } from '../../api/lib/agent/agents.js'
import { snapshotToolAuthority, intersectToolAuthority } from '../../api/lib/agent/tool-authority.js'
import type { AgentTool } from '../../api/lib/agent/tools/types.js'

function candidate(permission: AgentWorkspaceToolPermission = 'allow'): AgentTool {
  return {
    name: 'chapter_write', title: '写入正文', description: '', parameters: z.object({}), readOnly: false,
    permission: { plan: permission, build: permission, review: permission }, execute: vi.fn(),
  }
}

describe('server tool authority intersection', () => {
  const permissions: AgentWorkspaceToolPermission[] = ['allow', 'ask', 'deny']
  it.each(permissions.flatMap(parent => permissions.map(child => ({ parent, child }))))(
    'keeps the stricter parent=$parent and child=$child permission', ({ parent, child }) => {
      const authority = snapshotToolAuthority([candidate(parent)], 'build')
      const tools = intersectToolAuthority([candidate(child)], 'review', authority)
      if (parent === 'deny' || child === 'deny') expect(tools).toEqual([])
      else expect(tools[0].permission.review).toBe(parent === 'ask' || child === 'ask' ? 'ask' : 'allow')
    },
  )

  it('rejects absent names and preserves forced approval and dangerous flags', () => {
    const parent = { ...candidate(), dangerous: true, alwaysConfirm: true }
    const authority = snapshotToolAuthority([parent], 'build')
    const child = candidate()
    expect(intersectToolAuthority([{ ...child, name: 'memory_save' }], 'review', authority)).toEqual([])
    expect(intersectToolAuthority([child], 'review', authority)[0]).toMatchObject({
      dangerous: true, alwaysConfirm: true, permission: { review: 'ask' },
    })
    expect(child.permission.review).toBe('allow')
    expect(child.dangerous).toBeUndefined()
  })

  it('takes a value snapshot, not mutable registry permissions', () => {
    const parent = candidate('ask')
    const authority = snapshotToolAuthority([parent], 'build')
    parent.permission.build = 'allow'
    expect(intersectToolAuthority([candidate()], 'review', authority)[0].permission.review).toBe('ask')
  })

  it('rejects duplicate names instead of silently replacing a stricter entry', () => {
    expect(() => snapshotToolAuthority([candidate('deny'), candidate('allow')], 'build')).toThrow('Duplicate admitted tool')
  })

  it('does not widen a denied session policy just because sandbox is full_access', () => {
    const tools = getToolsForAgent(getAgentDefinition('orchestrator'), 'build')
    const admitted = applySessionToolPolicy(tools, 'build', { contentWrite: 'deny' }, 'full_access')
    const authority = snapshotToolAuthority(admitted, 'build')
    expect(authority.has('chapter_write')).toBe(false)
    expect(intersectToolAuthority([candidate()], 'review', authority)).toEqual([])
  })

  it('intersects real research role and read_only sandbox without excluding ordinary reads', () => {
    const tools = getToolsForAgent(getAgentDefinition('research'), 'review')
    const admitted = applySessionToolPolicy(tools, 'review', { contentWrite: 'allow' }, 'read_only')
    expect(admitted.some(tool => tool.name === 'chapter_read')).toBe(true)
    expect(admitted.every(tool => tool.readOnly)).toBe(true)
    expect(snapshotToolAuthority(admitted, 'review').has('chapter_write')).toBe(false)
  })
})
