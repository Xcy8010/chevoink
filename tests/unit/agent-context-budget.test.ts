import { describe, expect, it } from 'vitest'

import type { ChatMessage, OpenAIToolDefinition } from '../../api/lib/ai-service.js'
import {
  collapseEarlyToolRounds,
  compactEarlyToolPayloads,
  estimateChatMessagesTokens,
  estimateTextTokens,
  estimateToolDefinitionTokens,
  resolveAgentContextBudget,
} from '../../api/lib/agent/context-budget.js'

function buildToolRound(id: string, argumentText: string, outputText: string): ChatMessage[] {
  return [
    { role: 'assistant', content: null, reasoning: `正在执行 ${id}`, toolCalls: [{ id, name: 'chapter_write', arguments: argumentText }] },
    { role: 'tool', toolCallId: id, content: outputText },
  ]
}

describe('Agent 运行中上下文预算与压缩', () => {
  it('中文按保守口径估算，并统计工具 schema、参数、推理与输出', () => {
    expect(estimateTextTokens('中文测试')).toBe(4)
    expect(estimateTextTokens('abcdefgh')).toBe(2)

    const tools: OpenAIToolDefinition[] = [{
      type: 'function',
      function: { name: 'chapter_write', description: '写入章节正文', parameters: { type: 'object', properties: { content: { type: 'string' } } } },
    }]
    const messages: ChatMessage[] = [
      { role: 'system', content: '系统规则' },
      ...buildToolRound('old', JSON.stringify({ content: '正文'.repeat(1_000) }), '写入成功'.repeat(500)),
    ]
    const visibleTextOnly = estimateTextTokens('系统规则') + estimateTextTokens('写入成功'.repeat(500))
    expect(estimateChatMessagesTokens(messages)).toBeGreaterThan(visibleTextOnly)
    expect(estimateToolDefinitionTokens(tools)).toBeGreaterThan(0)
  })

  it('只压缩久远工具参数与输出，保留最近工具对且参数仍为合法 JSON', () => {
    const oldArguments = JSON.stringify({ chapterId: 'chapter-1', content: '旧正文'.repeat(1_000), expectedRevision: 3 })
    const recentArguments = JSON.stringify({ chapterId: 'chapter-2', content: '新正文'.repeat(1_000), expectedRevision: 4 })
    const recentOutput = '最新写入结果'.repeat(500)
    const messages: ChatMessage[] = [
      { role: 'system', content: '规则' },
      ...buildToolRound('old', oldArguments, '旧写入结果'.repeat(500)),
      ...buildToolRound('recent', recentArguments, recentOutput),
    ]

    const result = compactEarlyToolPayloads(messages, 1)
    const oldAssistant = messages[1] as Extract<ChatMessage, { role: 'assistant' }>
    const oldTool = messages[2] as Extract<ChatMessage, { role: 'tool' }>
    const recentAssistant = messages[3] as Extract<ChatMessage, { role: 'assistant' }>
    const recentTool = messages[4] as Extract<ChatMessage, { role: 'tool' }>

    expect(result.compactedToolArguments).toBe(1)
    expect(result.compactedToolOutputs).toBe(1)
    expect(JSON.parse(oldAssistant.toolCalls![0].arguments)).toMatchObject({ _contextCompacted: true })
    expect(oldTool.content).toContain('[工具输出已压缩]')
    expect(recentAssistant.toolCalls![0].arguments).toBe(recentArguments)
    expect(recentTool.content).toBe(recentOutput)
    expect(result.afterTokens).toBeLessThan(result.beforeTokens)
  })

  it('硬预算仍超限时把完整旧工具轮折叠为收据，不留下孤立 tool 消息', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: '规则' },
      ...buildToolRound('old', JSON.stringify({ content: '正文'.repeat(1_000) }), '结果'.repeat(1_000)),
      ...buildToolRound('recent', JSON.stringify({ content: '近期正文' }), '近期结果'),
    ]
    const result = collapseEarlyToolRounds(messages, 1)

    expect(result.collapsedToolRounds).toBe(1)
    expect(messages.some((message) => message.role === 'tool' && message.toolCallId === 'old')).toBe(false)
    expect(messages.some((message) => message.role === 'assistant' && String(message.content).includes('早前工具轮已压缩'))).toBe(true)
    expect(messages.some((message) => message.role === 'tool' && message.toolCallId === 'recent')).toBe(true)
    expect(result.afterTokens).toBeLessThan(result.beforeTokens)
  })

  it('为模型输出和误差预留安全空间', () => {
    const budget = resolveAgentContextBudget(128_000, 8_192)
    expect(budget.warningTokens).toBe(83_200)
    expect(budget.compactAtTokens).toBe(92_160)
    expect(budget.hardRequestTokens).toBeLessThan(128_000)
    expect(budget.hardRequestTokens).toBeGreaterThan(budget.compactAtTokens)
  })
})
