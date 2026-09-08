import { describe, expect, it } from 'vitest'
import type { AgentUIMessage } from '../../shared/contracts/index.js'
import { projectMessages } from '../../src/features/studio/agent/lib/message-projection.js'

const message = (id: string, role: AgentUIMessage['role'], parts: AgentUIMessage['parts'] = []): AgentUIMessage => ({
  id, role, parts, runId: 'run', createdAt: '2026-09-08T00:00:00Z',
})

describe('message presentation projection', () => {
  it('handles empty conversations without inventing a last assistant', () => {
    expect(projectMessages([])).toEqual({ blockInfoById: new Map(), recentConversationText: '', lastAssistantId: undefined })
  })

  it('preserves consecutive assistant blocks and excludes text from operation counts', () => {
    const messages = [
      message('u1', 'user'),
      message('a1', 'assistant', [{ type: 'reasoning', text: 'thinking' }]),
      message('a2', 'assistant', [{ type: 'text', text: 'answer' }]),
      message('u2', 'user'),
      message('a3', 'assistant'),
    ]
    const before = structuredClone(messages)
    const result = projectMessages(messages)
    expect([...result.blockInfoById]).toEqual([
      ['a1', { firstId: 'a1', lastId: 'a2', ops: 1 }],
      ['a2', { firstId: 'a1', lastId: 'a2', ops: 1 }],
      ['a3', { firstId: 'a3', lastId: 'a3', ops: 0 }],
    ])
    expect(result.lastAssistantId).toBe('a3')
    expect(messages).toEqual(before)
  })

  it('uses the latest nonempty visible text, not reasoning, with bounded preview', () => {
    const result = projectMessages([
      message('a', 'assistant', [{ type: 'text', text: 'old' }]),
      message('u', 'user', [{ type: 'text', text: `  new\n ${'字'.repeat(1100)}` }]),
      message('r', 'assistant', [{ type: 'reasoning', text: 'private' }]),
    ])
    expect(result.recentConversationText).toBe(`new ${'字'.repeat(996)}`)
    expect(result.lastAssistantId).toBe('r')
  })
})
