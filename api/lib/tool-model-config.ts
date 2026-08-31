import { prisma } from './prisma.js'
import { decryptSecret } from './secret-box.js'

export type ToolModelKey = 'tool:image-generation' | 'tool:image-vision' | 'tool:web-search'
export type ToolModelRuntime = { provider: string; modelName: string; baseUrl: string; apiKey: string }

const cache = new Map<ToolModelKey, { expiresAt: number; value: ToolModelRuntime | null }>()

/** 管理端工具模型配置；未启用或配置不完整时返回 null，让现有环境变量继续作为安全回退。 */
export async function getToolModelRuntime(key: ToolModelKey): Promise<ToolModelRuntime | null> {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const record = await prisma.aiModelConfig.findFirst({ where: { key, ownerUserId: null, enabled: true } }).catch(() => null)
  const value = record && record.modelName !== 'unconfigured' && record.baseUrl && record.apiKeyCiphertext
    ? { provider: record.provider, modelName: record.modelName, baseUrl: record.baseUrl, apiKey: decryptSecret(record.apiKeyCiphertext) }
    : null
  cache.set(key, { expiresAt: Date.now() + 30_000, value })
  return value
}
