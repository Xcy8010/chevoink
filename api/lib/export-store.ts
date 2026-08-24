import { randomUUID } from 'node:crypto'

/** Agent 一键导出产物的临时下载仓库：内存 Map + TTL，重启即清空属预期 */

type StoredExport = {
  userId: string
  buffer: Buffer
  fileName: string
  expiresAt: number
}

const EXPORT_TTL_MS = 15 * 60 * 1000
const MAX_STORED_EXPORTS = 20

const storedExports = new Map<string, StoredExport>()

function pruneExpired() {
  const now = Date.now()

  for (const [id, item] of storedExports) {
    if (item.expiresAt <= now) {
      storedExports.delete(id)
    }
  }
}

/** 登记一份导出产物，返回下载 id（TTL 15 分钟） */
export function createStoredExport(userId: string, buffer: Buffer, fileName: string): string {
  pruneExpired()

  if (storedExports.size >= MAX_STORED_EXPORTS) {
    const oldest = storedExports.keys().next().value
    if (oldest) {
      storedExports.delete(oldest)
    }
  }

  const id = randomUUID()
  storedExports.set(id, { userId, buffer, fileName, expiresAt: Date.now() + EXPORT_TTL_MS })

  return id
}

/** 取导出产物：校验归属与有效期，未命中返回 null */
export function getStoredExport(id: string, userId: string): { buffer: Buffer; fileName: string } | null {
  const item = storedExports.get(id)

  if (!item || item.userId !== userId || item.expiresAt <= Date.now()) {
    return null
  }

  return { buffer: item.buffer, fileName: item.fileName }
}

/**
 * 取导出产物（匿名）：仅校验有效期，不校验归属。
 * 用于 APP 壳外跳系统浏览器下载的场景——系统浏览器没有壳内会话 Cookie，
 * token 本身为 randomUUID + 15 分钟 TTL，作为短期访问凭证已足够。
 */
export function getStoredExportByToken(id: string): { buffer: Buffer; fileName: string } | null {
  const item = storedExports.get(id)

  if (!item || item.expiresAt <= Date.now()) {
    return null
  }

  return { buffer: item.buffer, fileName: item.fileName }
}
