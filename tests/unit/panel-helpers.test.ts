import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  shouldShowProcessingHint,
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

describe('shouldShowProcessingHint', () => {
  const text = makeMessage('assistant', 'r1', [{ type: 'text', text: '开始构建场景。' }])
  const thinking = makeMessage('assistant', 'r1', [{ type: 'reasoning', text: '分析场景' }])
  const tool: AgentMessagePart = { type: 'tool-call', callId: 'c', toolName: 'scene_task_build', title: '构建场景任务', args: null, status: 'running' }
  it('启动与正文后的参数生成阶段持续显示，不依赖参数增量是否创建了工具卡', () => {
    expect(shouldShowProcessingHint([], 'r1', 'starting', [])).toBe(true)
    expect(shouldShowProcessingHint([text], 'r1', 'running', [])).toBe(true)
    expect(shouldShowProcessingHint([text], 'r1', 'running', [text.id])).toBe(true)
  })
  it('仅当前动态思考隐藏通用提示；已定稿思考和旧 run 不抑制它', () => {
    expect(shouldShowProcessingHint([thinking], 'r1', 'running', [])).toBe(false)
    expect(shouldShowProcessingHint([thinking], 'r1', 'running', [thinking.id])).toBe(true)
    expect(shouldShowProcessingHint([thinking], 'r2', 'starting', [])).toBe(true)
  })
  it('执行动画与等待提示交接：工具完成或失败后恢复，后续轮次也能恢复', () => {
    expect(shouldShowProcessingHint([makeMessage('assistant', 'r1', [tool])], 'r1', 'running', [])).toBe(false)
    for (const status of ['success', 'failed', 'denied'] as const) {
      expect(shouldShowProcessingHint([makeMessage('assistant', 'r1', [{ ...tool, status }])], 'r1', 'running', [])).toBe(true)
    }
    expect(shouldShowProcessingHint([thinking, { ...text, id: 'next-turn' }], 'r1', 'running', [])).toBe(true)
    expect(shouldShowProcessingHint([makeMessage('assistant', 'old', [tool]), text], 'r1', 'running', [])).toBe(true)
  })
  it.each(['idle', 'paused', 'succeeded', 'failed', 'cancelled', 'awaiting_approval', 'awaiting_input'])('在 %s 阶段不显示', phase => {
    expect(shouldShowProcessingHint([text], 'r1', phase, [])).toBe(false)
  })
  it('无运行归属或已有待回答/待审批状态时不显示', () => {
    expect(shouldShowProcessingHint([text], null, 'running', [])).toBe(false)
    expect(shouldShowProcessingHint([text], 'r1', 'running', [], true)).toBe(false)
  })
})

describe('shouldKeepLiveSessionMessages', () => {
  it('同一会话已有直播 run 时拒绝用迟到的空历史覆盖首条提示词', () => {
    expect(shouldKeepLiveSessionMessages('run-1', 'running', 'session-1', 'session-1')).toBe(true)
    expect(shouldKeepLiveSessionMessages('run-1', 'succeeded', 'session-1', 'session-1')).toBe(false)
    expect(shouldKeepLiveSessionMessages('run-1', 'running', 'session-2', 'session-1')).toBe(false)
  })
})
