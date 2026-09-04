import { describe, expect, it } from 'vitest'

import { isAfterCheckpointBoundary } from '../../api/lib/agent/context-engine.js'

describe('上下文检查点边界', () => {
  const timestamp = new Date('2026-09-04T12:00:00.000Z')

  it('同毫秒消息使用 id 作为稳定次序，不会静默漏掉边界后的消息', () => {
    const boundary = { createdAt: timestamp, messageId: 'message-b' }
    expect(isAfterCheckpointBoundary({ id: 'message-a', createdAt: timestamp }, boundary)).toBe(false)
    expect(isAfterCheckpointBoundary({ id: 'message-b', createdAt: timestamp }, boundary)).toBe(false)
    expect(isAfterCheckpointBoundary({ id: 'message-c', createdAt: timestamp }, boundary)).toBe(true)
  })

  it('兼容旧检查点无末条消息 id 的时间边界', () => {
    const boundary = { createdAt: timestamp, messageId: null }
    expect(isAfterCheckpointBoundary({ id: 'message-z', createdAt: timestamp }, boundary)).toBe(false)
    expect(isAfterCheckpointBoundary({ id: 'message-a', createdAt: new Date(timestamp.getTime() + 1) }, boundary)).toBe(true)
  })
})
