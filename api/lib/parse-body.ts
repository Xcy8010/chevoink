import { z } from 'zod'

import { DataAccessError } from './prisma.js'

/**
 * 路由层请求体校验：zod schema 解析失败时抛出标准 VALIDATION_ERROR（400），
 * 由 sendRouteError 统一转为错误响应。fallbackMessage 保持各路由原有中文提示文案。
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown, fallbackMessage: string): z.output<T> {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    throw new DataAccessError(400, 'VALIDATION_ERROR', fallbackMessage)
  }
  return result.data
}
