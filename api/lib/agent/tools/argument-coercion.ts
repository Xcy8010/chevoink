const WRAPPER_KEYS = ['arguments', 'args', 'params', 'parameters', 'parameter', 'input', 'payload', 'tool_input'] as const
const WRAPPER_METADATA_KEYS = new Set(['name', 'tool', 'toolName', 'id', 'type'])

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function flattenNamedParameters(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const flattened: Record<string, unknown> = {}
  for (const item of value) {
    const entry = parseRecord(item)
    const key = typeof entry?.name === 'string' ? entry.name : typeof entry?.key === 'string' ? entry.key : ''
    if (!key) return null
    flattened[key] = entry?.value ?? entry?.content ?? entry?.text
  }
  return flattened
}

/**
 * 所有 Agent 工具共享的协议层兜底。兼容 OpenAI-compatible 网关偶发产生的
 * arguments/params 二次包装、字符串化 JSON、[{name,value}] 参数列表与顶层 null。
 * 只在根对象显然是协议信封时解包，不触碰工具本身合法的嵌套业务对象。
 */
export function coerceToolArgumentEnvelope(raw: unknown): unknown {
  const directList = flattenNamedParameters(raw)
  if (directList) return directList
  let source = parseRecord(raw)
  if (!source) return raw

  for (let depth = 0; depth < 2; depth += 1) {
    const current: Record<string, unknown> = source
    let unwrapped: Record<string, unknown> | null = null
    for (const key of WRAPPER_KEYS) {
      const named = flattenNamedParameters(current[key])
      const candidate: Record<string, unknown> | null = named ?? parseRecord(current[key])
      if (!candidate) continue
      const siblingKeys = Object.keys(current).filter((sibling) => sibling !== key && current[sibling] != null)
      const looksLikeEnvelope = siblingKeys.length === 0 || siblingKeys.every((sibling) => WRAPPER_METADATA_KEYS.has(sibling))
      if (looksLikeEnvelope) {
        unwrapped = candidate
        break
      }
    }
    if (!unwrapped) break
    source = unwrapped
  }

  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined) cleaned[key] = value
  }
  return cleaned
}

export function coerceStringList(value: unknown, separators = /[\n；;]+/): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? item.trim() : String(item ?? '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') return value.split(separators).map((item) => item.trim()).filter(Boolean)
  return value == null ? [] : [String(value).trim()].filter(Boolean)
}

export function firstDefined(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key]
  return undefined
}
