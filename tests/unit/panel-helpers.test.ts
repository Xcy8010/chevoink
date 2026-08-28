import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assistantHasParts,
  formatSessionTime,
  getMessageText,
  phaseLabel,
  shouldKeepLiveSessionMessages,
} from '../../src/features/studio/agent/lib/panel-helpers.js'
import type { AgentMessagePart, AgentUIMessage } from '../../shared/contracts/index.js'

/**
 * P4：panel-helpers 护栏单测（自 AgentPanel.tsx 抽取的模块级纯声明）。
 * 锚定阶段文案映射与纯函数行为，防抽取回归。
 */

function makeMessage(role: AgentUIMessage['role'], runId: string, parts: AgentMessagePart[] = []): AgentUIMessage {
  return { id: `m-${runId}-${role}`, runId, role, parts, createdAt: new Date().toISOString() }
}

describe('phaseLabel', () => {
  it('阶段文案映射逐字锚定', () => {
    expect(phaseLabel).toEqual({
      starting: '启动中',
      running: '运行中',
      awaiting_approval: '等待确认',
      awaiting_input: '等待回答',
      paused: '已暂停',
      succeeded: '已完成',
      failed: '已失败',
      cancelled: '已取消',
    })
  })
})

describe('getMessageText', () => {
  it('仅拼接 text 分部并以空行分隔', () => {
    const parts: AgentMessagePart[] = [
      { type: 'text', text: '第一段' },
      { type: 'reasoning', text: '思考内容不计入' },
      { type: 'text', text: '第二段' },
    ]
    expect(getMessageText(parts)).toBe('第一段\n\n第二段')
  })

  it('空分部返回空字符串', () => {
    expect(getMessageText([])).toBe('')
  })
})

describe('formatSessionTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('非法时间返回空字符串；当天显示时分，非当天显示月日', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T10:00:00'))
    expect(formatSessionTime('not-a-date')).toBe('')
    expect(formatSessionTime('2025-06-15T08:30:00')).toContain(':')
    const otherDay = formatSessionTime('2024-01-05T08:30:00')
    expect(otherDay).not.toContain(':')
    expect(otherDay).toMatch(/\d/)
  })
})

describe('assistantHasParts', () => {
  it('无 runId 一律 false', () => {
    expect(assistantHasParts([makeMessage('assistant', 'r1', [{ type: 'text', text: 'x' }])], null)).toBe(false)
  })

  it('最近一条匹配 run 的助手消息已有分部时为 true', () => {
    const messages = [
      makeMessage('user', 'r1'),
      makeMessage('assistant', 'r1', [{ type: 'text', text: '回复' }]),
    ]
    expect(assistantHasParts(messages, 'r1')).toBe(true)
  })

  it('匹配的助手消息分部为空或无匹配 run 时为 false', () => {
    expect(assistantHasParts([makeMessage('assistant', 'r1')], 'r1')).toBe(false)
    expect(assistantHasParts([makeMessage('assistant', 'r1', [{ type: 'text', text: 'x' }])], 'r2')).toBe(false)
  })
})

describe('shouldKeepLiveSessionMessages', () => {
  it('同一会话已有直播 run 时拒绝用迟到的空历史覆盖首条提示词', () => {
    expect(shouldKeepLiveSessionMessages('run-1', 'running', 'session-1', 'session-1')).toBe(true)
    expect(shouldKeepLiveSessionMessages('run-1', 'succeeded', 'session-1', 'session-1')).toBe(false)
    expect(shouldKeepLiveSessionMessages('run-1', 'running', 'session-2', 'session-1')).toBe(false)
  })
})
