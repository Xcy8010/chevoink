/**
 * 清理模型供应商偶发泄漏到正文信道的工具协议标记。
 * 这些标记不是作者内容，也不代表工具已经真实执行。
 */
const PROTOCOL_BLOCK_PATTERNS = [
  /<\s*(?:invoke|tool_call|tool-call|function_call|function-call)\b[^>]*>[\s\S]*?<\s*\/\s*(?:invoke|tool_call|tool-call|function_call|function-call)\s*>/gi,
]

const PROTOCOL_TOKEN_PATTERNS = [
  /<\s*\/?\s*(?:invoke|tool_call|tool-call|function_call|function-call|tool_calls|tool-calls)\b[^>]*>/gi,
  /<\|[^>\n]*(?:tool|function|invoke)[^>\n]*\|>/gi,
  /^\s*\[\/?(?:tool[_ -]?calls?|function[_ -]?calls?|invoke)\]\s*$/gim,
]

const PROTOCOL_INVOCATION_PATTERNS = [
  /<\s*(?:invoke|tool_call|tool-call|function_call|function-call)\b[^>]*>/i,
  /<\|[^>\n]*(?:tool|function|invoke)[^>\n]*(?:begin|start|call)[^>\n]*\|>/i,
  /^\s*\[(?:tool[_ -]?calls?|function[_ -]?calls?|invoke)\]\s*$/im,
]

export function containsAgentProtocolArtifact(text: string): boolean {
  return PROTOCOL_BLOCK_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(text)
  }) || PROTOCOL_TOKEN_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
}

/**
 * 判断正文是否在尝试发起工具调用，而不把孤立的关闭标签当成重试依据。
 * 例如供应商偶发附加的 `</invoke>` 只需清洗；若因此重跑工具，反而可能重复写入。
 */
export function containsAgentProtocolInvocation(text: string): boolean {
  return PROTOCOL_INVOCATION_PATTERNS.some((pattern) => pattern.test(text))
}

export function stripAgentProtocolArtifacts(text: string): string {
  let cleaned = text
  for (const pattern of PROTOCOL_BLOCK_PATTERNS) {
    pattern.lastIndex = 0
    cleaned = cleaned.replace(pattern, '')
  }
  for (const pattern of PROTOCOL_TOKEN_PATTERNS) {
    pattern.lastIndex = 0
    cleaned = cleaned.replace(pattern, '')
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim()
}
