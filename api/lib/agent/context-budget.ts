import type { ChatMessage, OpenAIToolDefinition } from '../ai-service.js'

const IMAGE_INPUT_ESTIMATE_TOKENS = 1_024
const MESSAGE_OVERHEAD_TOKENS = 4
const LONG_TOOL_PAYLOAD_CHARS = 600
const TOOL_OUTPUT_EXCERPT_CHARS = 300

/**
 * OpenAI-compatible providers tokenize Chinese and ASCII very differently. This
 * deliberately conservative estimator mirrors the billing fallback in
 * ai-service.ts: non-ASCII code points count as one token, ASCII as 1/4 token.
 * Provider-reported usage remains the accounting source of truth.
 */
export function estimateTextTokens(value: string): number {
  if (!value) return 0
  let ascii = 0
  let nonAscii = 0
  for (const character of value) {
    if (character.codePointAt(0)! <= 0x7f) ascii += 1
    else nonAscii += 1
  }
  return Math.ceil(ascii / 4 + nonAscii)
}

export function estimateChatMessageTokens(message: ChatMessage): number {
  let tokens = MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.role)
  if (message.role === 'user' && Array.isArray(message.content)) {
    for (const part of message.content) {
      tokens += part.type === 'text' ? estimateTextTokens(part.text) : IMAGE_INPUT_ESTIMATE_TOKENS
    }
    return tokens
  }
  if (typeof message.content === 'string') tokens += estimateTextTokens(message.content)
  if (message.role === 'assistant') {
    tokens += estimateTextTokens(message.reasoning ?? '')
    for (const call of message.toolCalls ?? []) {
      tokens += estimateTextTokens(call.id) + estimateTextTokens(call.name) + estimateTextTokens(call.arguments) + MESSAGE_OVERHEAD_TOKENS
    }
  } else if (message.role === 'tool') {
    tokens += estimateTextTokens(message.toolCallId)
  }
  return tokens
}

export function estimateChatMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateChatMessageTokens(message), 0)
}

export function estimateToolDefinitionTokens(tools: OpenAIToolDefinition[]): number {
  return estimateTextTokens(JSON.stringify(tools))
}

export type AgentContextBudget = {
  contextWindowTokens: number
  warningTokens: number
  compactAtTokens: number
  hardRequestTokens: number
}

export function resolveAgentContextBudget(contextWindowTokens: number, maxOutputTokens: number): AgentContextBudget {
  const normalizedWindow = Math.max(16_000, Math.floor(contextWindowTokens))
  const outputReserve = Math.min(Math.max(4_096, Math.floor(maxOutputTokens)), Math.floor(normalizedWindow * 0.25))
  const safetyReserve = Math.max(2_048, Math.floor(normalizedWindow * 0.05))
  const hardRequestTokens = Math.max(8_000, normalizedWindow - outputReserve - safetyReserve)
  return {
    contextWindowTokens: normalizedWindow,
    warningTokens: Math.min(hardRequestTokens, Math.floor(normalizedWindow * 0.65)),
    compactAtTokens: Math.min(hardRequestTokens, Math.floor(normalizedWindow * 0.72)),
    hardRequestTokens,
  }
}

function summarizeArgumentValue(value: unknown, depth = 0): unknown {
  if (depth >= 2) {
    if (Array.isArray(value)) return `[数组 ${value.length} 项]`
    if (value && typeof value === 'object') return '[嵌套对象已压缩]'
  }
  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 120)}…（原 ${value.length} 字）` : value
  }
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => summarizeArgumentValue(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 24).map(([key, item]) => [key, summarizeArgumentValue(item, depth + 1)]))
  }
  return value
}

function compactToolArguments(argumentsText: string): string {
  try {
    const parsed = JSON.parse(argumentsText) as unknown
    return JSON.stringify({
      _contextCompacted: true,
      originalChars: argumentsText.length,
      arguments: summarizeArgumentValue(parsed),
    })
  } catch {
    return JSON.stringify({
      _contextCompacted: true,
      originalChars: argumentsText.length,
      excerpt: `${argumentsText.slice(0, 160)}${argumentsText.length > 160 ? '…' : ''}`,
    })
  }
}

export type InRunCompactionResult = {
  beforeTokens: number
  afterTokens: number
  compactedToolArguments: number
  compactedToolOutputs: number
  collapsedToolRounds: number
}

/**
 * First-stage, protocol-preserving compaction. Old tool-call arguments remain
 * valid JSON and call IDs are untouched; matching tool outputs become bounded
 * receipts. Recent tool pairs remain byte-for-byte intact.
 */
export function compactEarlyToolPayloads(messages: ChatMessage[], keepRecentToolOutputs = 8): InRunCompactionResult {
  const beforeTokens = estimateChatMessagesTokens(messages)
  const toolMessages = messages.flatMap((message, index) => message.role === 'tool' ? [{ message, index }] : [])
  const protectedCallIds = new Set(toolMessages.slice(-keepRecentToolOutputs).map(({ message }) => message.toolCallId))
  let compactedToolArguments = 0
  let compactedToolOutputs = 0

  for (const { message } of toolMessages.slice(0, Math.max(0, toolMessages.length - keepRecentToolOutputs))) {
    if (message.content.length <= LONG_TOOL_PAYLOAD_CHARS || message.content.startsWith('[工具输出已压缩]')) continue
    message.content = `[工具输出已压缩] ${message.content.slice(0, TOOL_OUTPUT_EXCERPT_CHARS)}…（原 ${message.content.length} 字，内容已落库，需要时重新调用读取工具获取）`
    compactedToolOutputs += 1
  }

  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue
    for (const call of message.toolCalls) {
      if (protectedCallIds.has(call.id) || call.arguments.length <= LONG_TOOL_PAYLOAD_CHARS || call.arguments.includes('"_contextCompacted":true')) continue
      call.arguments = compactToolArguments(call.arguments)
      compactedToolArguments += 1
    }
  }

  return {
    beforeTokens,
    afterTokens: estimateChatMessagesTokens(messages),
    compactedToolArguments,
    compactedToolOutputs,
    collapsedToolRounds: 0,
  }
}

/**
 * Second-stage compaction used only when the request still exceeds the hard
 * safety budget. Completed old assistant/tool protocol pairs are replaced by
 * a deterministic receipt; recent pairs are retained for near-term reasoning.
 */
export function collapseEarlyToolRounds(messages: ChatMessage[], keepRecentToolOutputs = 8): InRunCompactionResult {
  const beforeTokens = estimateChatMessagesTokens(messages)
  const toolMessages = messages.filter((message): message is Extract<ChatMessage, { role: 'tool' }> => message.role === 'tool')
  const protectedCallIds = new Set(toolMessages.slice(-keepRecentToolOutputs).map((message) => message.toolCallId))
  const toolByCallId = new Map(toolMessages.map((message) => [message.toolCallId, message]))
  const remove = new Set<ChatMessage>()
  let collapsedToolRounds = 0

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue
    if (message.toolCalls.some((call) => protectedCallIds.has(call.id) || !toolByCallId.has(call.id))) continue
    const receipts = message.toolCalls.map((call) => {
      const toolResult = toolByCallId.get(call.id)!
      remove.add(toolResult)
      const excerpt = toolResult.content.replace(/^\[工具输出已压缩\]\s*/, '').slice(0, 180)
      return `${call.name}：${excerpt}${toolResult.content.length > 180 ? '…' : ''}`
    })
    messages[index] = {
      role: 'assistant',
      content: `[早前工具轮已压缩；操作结果已落库，需要细节请重新读取]\n${receipts.join('\n')}`,
    }
    collapsedToolRounds += 1
  }

  if (remove.size > 0) {
    const kept = messages.filter((message) => !remove.has(message))
    messages.splice(0, messages.length, ...kept)
  }

  return {
    beforeTokens,
    afterTokens: estimateChatMessagesTokens(messages),
    compactedToolArguments: 0,
    compactedToolOutputs: 0,
    collapsedToolRounds,
  }
}
