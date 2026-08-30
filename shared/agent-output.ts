/**
 * 清理模型供应商偶发泄漏到正文信道的工具协议标记。
 * 这些标记不是作者内容，也不代表工具已经真实执行。
 */
const PROTOCOL_BLOCK_PATTERNS = [
  /<\s*(?:invoke|tool_call|tool-call|function_call|function-call)\b[^>]*>[\s\S]*?<\s*\/\s*(?:invoke|tool_call|tool-call|function_call|function-call)\s*>/gi,
  /<\s*\|\s*\|\s*DSML\s*\|\s*\|\s*tool_calls?\b[^>]*>[\s\S]*?<\s*\/\s*\|\s*\|\s*DSML\s*\|\s*\|\s*tool_calls?\s*>/gi,
]

const PROTOCOL_TOKEN_PATTERNS = [
  /<\s*\/?\s*(?:invoke|tool_call|tool-call|function_call|function-call|tool_calls|tool-calls|parameter|parameters)\b[^>]*>/gi,
  /<\s*\/?\s*\|\s*\|\s*DSML\s*\|\s*\|\s*(?:invoke|tool_calls?|parameter|parameters)\b[^>]*>/gi,
  /<\|[^>\n]*(?:tool|function|invoke)[^>\n]*\|>/gi,
  /^\s*\[\/?(?:tool[_ -]?calls?|function[_ -]?calls?|invoke)\]\s*$/gim,
]

const PROTOCOL_INVOCATION_PATTERNS = [
  /<\s*(?:invoke|tool_call|tool-call|function_call|function-call|parameter|parameters)\b[^>]*>/i,
  /<\s*\|\s*\|\s*DSML\s*\|\s*\|\s*(?:invoke|tool_calls?|parameter|parameters)\b[^>]*>/i,
  /<\|[^>\n]*(?:tool|function|invoke)[^>\n]*(?:begin|start|call)[^>\n]*\|>/i,
  /^\s*\[(?:tool[_ -]?calls?|function[_ -]?calls?|invoke)\]\s*$/im,
]

export type RecoveredAgentToolCall = {
  name: string
  arguments: string
}

function decodeProtocolEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function parseProtocolScalar(raw: string, forceString: boolean): unknown {
  const value = decodeProtocolEntities(raw.trim())
  if (forceString) return value
  if (!value) return ''
  try {
    return JSON.parse(value)
  } catch {
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
    if (/^(?:true|false)$/i.test(value)) return value.toLowerCase() === 'true'
    if (/^null$/i.test(value)) return null
    return value
  }
}

/**
 * 部分 OpenAI 兼容供应商会把原生 function call 降级成 DSML/XML 文本。
 * 这里只恢复结构完整、参数名明确的调用；残缺协议仍交给循环重试，绝不把文本视为已执行。
 */
export function recoverAgentProtocolToolCalls(text: string): RecoveredAgentToolCall[] {
  const calls: RecoveredAgentToolCall[] = []
  const invokePattern = /<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?invoke\b([^>]*)>([\s\S]*?)<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?invoke\s*>/gi
  let invocation: RegExpExecArray | null
  while ((invocation = invokePattern.exec(text)) && calls.length < 8) {
    const name = /\bname\s*=\s*["']([^"']+)["']/i.exec(invocation[1])?.[1]?.trim()
    if (!name || !/^[a-z][a-z0-9_]{1,63}$/i.test(name)) continue
    const args: Record<string, unknown> = {}
    const parameterPattern = /<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?parameter\b([^>]*)>([\s\S]*?)<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?parameter\s*>/gi
    let parameter: RegExpExecArray | null
    while ((parameter = parameterPattern.exec(invocation[2]))) {
      const parameterName = /\bname\s*=\s*["']([^"']+)["']/i.exec(parameter[1])?.[1]?.trim()
      if (!parameterName || !/^[a-z][a-z0-9_]{0,63}$/i.test(parameterName)) continue
      const forceString = /\bstring\s*=\s*["']true["']/i.test(parameter[1])
      args[parameterName] = parseProtocolScalar(parameter[2], forceString)
    }
    calls.push({ name, arguments: JSON.stringify(args) })
  }
  return calls
}

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
  return cleaned
    .replace(/\uFFFD+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
