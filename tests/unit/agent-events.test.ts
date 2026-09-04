import { describe, expect, it } from 'vitest'

import { RunEventBus } from '../../api/lib/agent/events.js'
import type { AgentStreamEvent } from '../../shared/contracts/index.js'

describe('Agent run event bus', () => {
  it('isolates a failed listener while replaying in-memory history', () => {
    const bus = new RunEventBus('run-replay')
    const event: AgentStreamEvent = {
      seq: 1,
      runId: 'run-replay',
      ts: new Date(0).toISOString(),
      type: 'run.paused',
      reason: 'user_stop',
    }

    ;(bus as unknown as { history: AgentStreamEvent[] }).history = [event]

    expect(() => bus.subscribe(() => {
      throw new Error('response already closed')
    })).not.toThrow()
  })
})
