import { afterEach, describe, expect, it } from 'vitest'

import {
  countActiveRunsByUser,
  deregisterActiveRun,
  getActiveRun,
  getActiveRunIdBySession,
  hasActiveRunInSession,
  registerActiveRun,
  stopActiveRunsInSession,
  stopAgentRun,
  type ActiveRun,
} from '../../api/lib/agent/active-runs.js'
import type { RunEventBus } from '../../api/lib/agent/events.js'

/**
 * P3：active-runs 登记表护栏单测（纯 Map 逻辑）。
 * 覆盖注册/注销、按用户计数、会话查询、停止语义，防拆分回归。
 */

const registered: string[] = []

function makeRun(sessionId: string, userId: string): ActiveRun {
  return {
    controller: new AbortController(),
    bus: {} as RunEventBus,
    sessionId,
    userId,
  }
}

function register(runId: string, sessionId: string, userId: string): ActiveRun {
  const run = makeRun(sessionId, userId)
  registerActiveRun(runId, run)
  registered.push(runId)
  return run
}

afterEach(() => {
  for (const runId of registered.splice(0)) {
    deregisterActiveRun(runId)
  }
})

describe('active-runs 登记表', () => {
  it('注册后可按 runId 取回，注销后取不到', () => {
    const run = register('run-1', 's1', 'u1')
    expect(getActiveRun('run-1')).toBe(run)
    deregisterActiveRun('run-1')
    expect(getActiveRun('run-1')).toBeUndefined()
  })

  it('countActiveRunsByUser 只统计该用户的 run', () => {
    register('run-a', 's1', 'u1')
    register('run-b', 's2', 'u1')
    register('run-c', 's3', 'u2')
    expect(countActiveRunsByUser('u1')).toBe(2)
    expect(countActiveRunsByUser('u2')).toBe(1)
    expect(countActiveRunsByUser('nobody')).toBe(0)
  })

  it('hasActiveRunInSession / getActiveRunIdBySession 按会话精确命中', () => {
    register('run-x', 'session-x', 'u1')
    expect(hasActiveRunInSession('session-x')).toBe(true)
    expect(hasActiveRunInSession('session-y')).toBe(false)
    expect(getActiveRunIdBySession('session-x')).toBe('run-x')
    expect(getActiveRunIdBySession('session-y')).toBeNull()
  })

  it('stopAgentRun：存在的 run 触发 abort 并返回 true，不存在返回 false', () => {
    const run = register('run-stop', 's1', 'u1')
    expect(run.controller.signal.aborted).toBe(false)
    expect(stopAgentRun('run-stop')).toBe(true)
    expect(run.controller.signal.aborted).toBe(true)
    expect(stopAgentRun('run-missing')).toBe(false)
  })

  it('stopActiveRunsInSession：仅停止该会话内的 run 并返回数量', () => {
    const inSession = register('run-in-1', 'session-z', 'u1')
    const inSession2 = register('run-in-2', 'session-z', 'u1')
    const outside = register('run-out', 'session-other', 'u1')

    expect(stopActiveRunsInSession('session-z')).toBe(2)
    expect(inSession.controller.signal.aborted).toBe(true)
    expect(inSession2.controller.signal.aborted).toBe(true)
    expect(outside.controller.signal.aborted).toBe(false)
    expect(stopActiveRunsInSession('session-empty')).toBe(0)
  })
})
