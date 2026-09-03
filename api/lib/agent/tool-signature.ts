/**
 * plan/18 P0 重复工具调用熔断：调用签名 = 工具名 + 归一化参数哈希。
 * 参数归一化规则（保证「实质相同」判定稳定）：
 * - 对象键排序：键顺序不同不影响签名；
 * - 字符串超 200 字符只取前 200 字符：重复再生成同一段正文（开头几乎一样、长度微变）仍算同一签名，
 *   熔断不被长度波动绕过；正常连续写作每次 append 的正文开头不同，不会误判；
 * - 数组截前 20 项、嵌套限深 4 层：防超大参数拖慢哈希。
 */
function normalizeForSignature(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.slice(0, 200)
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => normalizeForSignature(item, depth + 1))
  }
  if (value && typeof value === 'object' && depth < 4) {
    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeForSignature(record[key], depth + 1)
        return acc
      }, {})
  }
  return value
}

/** djb2 字符串哈希：签名只用于同 run 内存滑窗比对，无加密需求 */
function hashString(input: string): string {
  let hash = 5381
  for (let index = 0; index < input.length; index++) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) | 0
  }
  return (hash >>> 0).toString(36)
}

/** 计算一次工具调用的签名（参数为原始 JSON 字符串；解析失败时按截断原文参与哈希） */
export function toolSignature(toolName: string, args: string | null | undefined): string {
  let normalized = ''
  if (args) {
    try {
      normalized = JSON.stringify(normalizeForSignature(JSON.parse(args)))
    } catch {
      normalized = args.slice(0, 2000)
    }
  }
  return `${toolName}:${hashString(normalized)}`
}
