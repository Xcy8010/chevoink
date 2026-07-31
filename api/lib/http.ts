import { randomUUID } from 'node:crypto'

import type { ApiFailure, ApiSuccess } from '../../shared/contracts/index.js'

export function createRequestId(): string {
  return randomUUID()
}

export function buildSuccess<T>(requestId: string, data: T): ApiSuccess<T> {
  return {
    success: true,
    data,
    requestId,
  }
}

export function buildError(
  requestId: string,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): ApiFailure {
  return {
    success: false,
    error: {
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
    requestId,
  }
}

export function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

export function paginate<T>(items: T[], page = 1, pageSize = 10) {
  const safePage = Math.max(page, 1)
  const safePageSize = Math.max(pageSize, 1)
  const startIndex = (safePage - 1) * safePageSize
  const pagedItems = items.slice(startIndex, startIndex + safePageSize)

  return {
    items: pagedItems,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: items.length,
      hasMore: startIndex + safePageSize < items.length,
    },
  }
}
