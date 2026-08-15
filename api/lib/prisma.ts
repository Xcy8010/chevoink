import { Prisma, PrismaClient } from '@prisma/client'

declare global {
   
  var __chevoinkPrisma__: PrismaClient | undefined
}

const prismaClient =
  globalThis.__chevoinkPrisma__ ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__chevoinkPrisma__ = prismaClient
}

export const prisma = prismaClient

export class DataAccessError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'DataAccessError'
    this.status = status
    this.code = code
  }
}

function isDatabaseConfigError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError &&
    /Environment variable not found:\s*DATABASE_URL/i.test(error.message)
  )
}

function isConnectivityError(error: unknown): boolean {
  if (isDatabaseConfigError(error)) {
    return false
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P1000', 'P1001', 'P1002', 'P1008', 'P1017'].includes(error.code)
  }

  return false
}

export function normalizeDataAccessError(error: unknown, label: string): DataAccessError {
  if (error instanceof DataAccessError) {
    return error
  }

  if (isDatabaseConfigError(error)) {
    return new DataAccessError(
      500,
      'DATABASE_NOT_CONFIGURED',
      '本地数据库尚未配置，当前操作无法连接数据源。',
    )
  }

  if (isConnectivityError(error)) {
    return new DataAccessError(
      503,
      'DATABASE_UNAVAILABLE',
      '数据库暂时不可用，请稍后再试。',
    )
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return new DataAccessError(500, `PRISMA_${error.code}`, `${label} 失败`)
  }

  if (error instanceof Error) {
    return new DataAccessError(500, 'DATA_ACCESS_ERROR', error.message)
  }

  return new DataAccessError(500, 'DATA_ACCESS_ERROR', `${label} 失败`)
}
