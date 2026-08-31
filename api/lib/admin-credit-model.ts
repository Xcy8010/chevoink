import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'

import type { AdminCreditsManagementPayload, AdminModelManagementPayload } from '../../shared/contracts/index.js'
import type { ModelReasoningEffort } from '../../shared/contracts/index.js'
import { ensureCreditAccount, getCreditWindow, parseModelCapabilities } from './credits.js'
import { stopActiveRunsByUser, stopAllActiveRuns } from './agent/active-runs.js'
import { DataAccessError, prisma } from './prisma.js'
import { encryptSecret } from './secret-box.js'

const MILLI = 1000

async function ensureAllPublicBetaAccounts(setting: { dailyAllowanceMilli: number; resetHourUtc8: number }) {
  const now = new Date()
  const window = getCreditWindow(now, setting.resetHourUtc8)
  const users = await prisma.user.findMany({ select: { id: true } })
  if (users.length > 0) {
    await prisma.creditAccount.createMany({
      data: users.map((user) => ({
        userId: user.id,
        dailyAllowanceMilli: setting.dailyAllowanceMilli,
        dailyUsedMilli: 0,
        bonusBalanceMilli: 0,
        periodStartedAt: window.startedAt,
        periodEndsAt: window.endsAt,
      })),
      skipDuplicates: true,
    })
  }
  await prisma.creditAccount.updateMany({
    where: { periodEndsAt: { lte: now } },
    data: {
      dailyAllowanceMilli: setting.dailyAllowanceMilli,
      dailyUsedMilli: 0,
      periodStartedAt: window.startedAt,
      periodEndsAt: window.endsAt,
    },
  })
}

export async function getAdminCreditsManagement(): Promise<AdminCreditsManagementPayload> {
  const setting = await prisma.creditSystemSetting.upsert({
    where: { id: 'global' },
    create: { id: 'global', dailyAllowanceMilli: 450_000, resetHourUtc8: 15 },
    update: {},
  })
  // 公测上线前已存在的用户没有 CreditAccount；管理页必须覆盖“所有用户”，
  // 同时在读取前兑现已到期的 UTC+8 15:00 重置，避免显示昨日旧用量。
  await ensureAllPublicBetaAccounts(setting)
  const accounts = await prisma.creditAccount.findMany({
    include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
    orderBy: [{ dailyUsedMilli: 'desc' }, { updatedAt: 'desc' }],
  })
  const users = accounts.map((account) => {
    const dailyRemaining = Math.max(0, account.dailyAllowanceMilli - account.dailyUsedMilli)
    const totalRemaining = dailyRemaining + Math.max(0, account.bonusBalanceMilli)
    return {
      user: account.user,
      planLabel: '公测版' as const,
      dailyAllowance: account.dailyAllowanceMilli / MILLI,
      dailyUsed: account.dailyUsedMilli / MILLI,
      dailyRemaining: dailyRemaining / MILLI,
      bonusBalance: account.bonusBalanceMilli / MILLI,
      totalRemaining: totalRemaining / MILLI,
      usedPercent: account.dailyAllowanceMilli > 0 ? Math.min(100, Math.round(account.dailyUsedMilli / account.dailyAllowanceMilli * 1000) / 10) : 100,
      resetsAt: account.periodEndsAt.toISOString(),
      suspended: Boolean(account.suspendedAt),
    }
  })
  return {
    summary: {
      globallyPaused: setting.globallyPaused,
      users: users.length,
      dailyAllowance: users.reduce((sum, item) => sum + item.dailyAllowance, 0),
      dailyUsed: users.reduce((sum, item) => sum + item.dailyUsed, 0),
      bonusBalance: users.reduce((sum, item) => sum + item.bonusBalance, 0),
      exhaustedUsers: users.filter((item) => item.totalRemaining <= 0).length,
    },
    users,
  }
}

export async function resetAdminUserCredits(userId: string, adminId: string): Promise<{ stoppedRuns: number }> {
  const result = await resetAdminUsersCredits([userId], adminId)
  return { stoppedRuns: result.stoppedRuns }
}

export async function resetAdminUsersCredits(userIds: string[], adminId: string): Promise<{ users: number; stoppedRuns: number }> {
  const normalized = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))].slice(0, 200)
  if (normalized.length === 0) throw new DataAccessError(400, 'VALIDATION_ERROR', '请选择至少一个用户。')
  await Promise.all(normalized.map((userId) => ensureCreditAccount(userId)))
  await prisma.$transaction(async (tx) => {
    const setting = await tx.creditSystemSetting.findUnique({ where: { id: 'global' } })
    const window = getCreditWindow(new Date(), setting?.resetHourUtc8 ?? 15)
    const accounts = await tx.creditAccount.findMany({ where: { userId: { in: normalized } }, select: { userId: true, dailyUsedMilli: true } })
    await tx.creditAccount.updateMany({
      where: { userId: { in: normalized } },
      data: { dailyUsedMilli: 0, dailyAllowanceMilli: setting?.dailyAllowanceMilli ?? 450_000, periodStartedAt: window.startedAt, periodEndsAt: window.endsAt },
    })
    const charged = accounts.filter((account) => account.dailyUsedMilli > 0)
    if (charged.length > 0) {
      await tx.creditLedgerEntry.createMany({ data: charged.map((account) => ({
        id: randomUUID(), userId: account.userId, deltaMilli: account.dailyUsedMilli, dailyDeltaMilli: account.dailyUsedMilli,
        kind: 'admin_reset', sourceType: normalized.length === 1 ? 'admin_reset' : 'admin_reset_batch', referenceId: adminId,
        idempotencyKey: `admin-reset:${account.userId}:${randomUUID()}`,
      })) })
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  return { users: normalized.length, stoppedRuns: normalized.reduce((count, userId) => count + stopActiveRunsByUser(userId), 0) }
}

export async function setAdminUsersSuspended(userIds: string[], paused: boolean): Promise<{ users: number; paused: boolean; stoppedRuns: number }> {
  const normalized = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))].slice(0, 200)
  if (normalized.length === 0) throw new DataAccessError(400, 'VALIDATION_ERROR', '请选择至少一个用户。')
  await Promise.all(normalized.map((userId) => ensureCreditAccount(userId)))
  const updated = await prisma.creditAccount.updateMany({
    where: { userId: { in: normalized } },
    data: { suspendedAt: paused ? new Date() : null },
  })
  return {
    users: updated.count,
    paused,
    stoppedRuns: paused ? normalized.reduce((count, userId) => count + stopActiveRunsByUser(userId), 0) : 0,
  }
}

export async function resetAllAdminCredits(adminId: string): Promise<{ users: number; stoppedRuns: number }> {
  const setting = await prisma.creditSystemSetting.upsert({ where: { id: 'global' }, create: { id: 'global', dailyAllowanceMilli: 450_000, resetHourUtc8: 15 }, update: {} })
  await ensureAllPublicBetaAccounts(setting)
  const accounts = await prisma.creditAccount.findMany({ select: { userId: true, dailyUsedMilli: true } })
  const window = getCreditWindow(new Date(), setting.resetHourUtc8)
  await prisma.$transaction(async (tx) => {
    await tx.creditAccount.updateMany({ data: { dailyUsedMilli: 0, dailyAllowanceMilli: setting.dailyAllowanceMilli, periodStartedAt: window.startedAt, periodEndsAt: window.endsAt } })
    const chargedAccounts = accounts.filter((account) => account.dailyUsedMilli > 0)
    if (chargedAccounts.length > 0) {
      await tx.creditLedgerEntry.createMany({
        data: chargedAccounts.map((account) => ({
          id: randomUUID(), userId: account.userId, deltaMilli: Math.max(0, account.dailyUsedMilli), dailyDeltaMilli: Math.max(0, account.dailyUsedMilli),
          kind: 'admin_reset', sourceType: 'admin_reset_all', referenceId: adminId,
          idempotencyKey: `admin-reset-all:${account.userId}:${randomUUID()}`,
        })),
      })
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  return { users: accounts.length, stoppedRuns: stopAllActiveRuns() }
}

export async function setCreditsGloballyPaused(paused: boolean): Promise<{ paused: boolean; stoppedRuns: number }> {
  await prisma.creditSystemSetting.upsert({
    where: { id: 'global' },
    create: { id: 'global', globallyPaused: paused, dailyAllowanceMilli: 450_000, resetHourUtc8: 15 },
    update: { globallyPaused: paused },
  })
  return { paused, stoppedRuns: paused ? stopAllActiveRuns() : 0 }
}

export async function getAdminModelManagement(): Promise<AdminModelManagementPayload> {
  const [models, usage, recent] = await Promise.all([
    prisma.aiModelConfig.findMany({ where: { ownerUserId: null }, orderBy: { multiplierBps: 'asc' } }),
    prisma.aiUsageLog.groupBy({ by: ['modelTier'], where: { modelTier: { not: null } }, _sum: { requestTokens: true, responseTokens: true }, _count: { _all: true } }),
    prisma.aiUsageLog.findMany({ where: { createdAt: { gte: new Date(Date.now() - 13 * 86_400_000) } }, select: { createdAt: true, requestTokens: true, responseTokens: true } }),
  ])
  const usageMap = new Map(usage.map((item) => [item.modelTier, item]))
  const trendMap = new Map<string, { requests: number; totalTokens: number }>()
  for (const item of recent) {
    const date = new Date(item.createdAt.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
    const row = trendMap.get(date) ?? { requests: 0, totalTokens: 0 }
    row.requests += 1
    row.totalTokens += (item.requestTokens ?? 0) + (item.responseTokens ?? 0)
    trendMap.set(date, row)
  }
  return {
    models: models.map((model) => {
      const row = usageMap.get(model.tier)
      const capabilities = parseModelCapabilities(model.metadata, model.provider)
      const metadata = model.metadata && typeof model.metadata === 'object' && !Array.isArray(model.metadata) ? model.metadata as Record<string, unknown> : {}
      const modelKind = metadata.modelKind === 'image_generation' || metadata.modelKind === 'vision' || metadata.modelKind === 'web_search' ? metadata.modelKind : 'text'
      return {
        id: model.id, tier: model.tier, modelKind, provider: model.provider, displayName: model.displayName,
        modelName: model.modelName, baseUrl: model.baseUrl, multiplier: model.multiplierBps / 10_000,
        enabled: model.enabled, selectable: model.selectable, isDefault: model.isDefault,
        apiKeyConfigured: Boolean(model.apiKeyCiphertext), requestCount: row?._count._all ?? 0,
        requestTokens: row?._sum.requestTokens ?? 0, responseTokens: row?._sum.responseTokens ?? 0,
        reasoningEfforts: capabilities.reasoningEfforts, defaultReasoningEffort: capabilities.defaultReasoningEffort,
        visionEnabled: capabilities.visionEnabled,
        configurationReady: model.tier === 'speed' ? model.modelName !== 'unconfigured' : Boolean(model.modelName !== 'unconfigured' && model.baseUrl && model.apiKeyCiphertext),
        updatedAt: model.updatedAt.toISOString(),
      }
    }),
    trend: [...trendMap.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, ...value })),
  }
}

export type UpdateAdminModelInput = {
  provider?: string
  displayName?: string
  modelName?: string
  baseUrl?: string | null
  apiKey?: string
  multiplier?: number
  enabled?: boolean
  selectable?: boolean
  isDefault?: boolean
  reasoningEfforts?: ModelReasoningEffort[]
  defaultReasoningEffort?: ModelReasoningEffort
  visionEnabled?: boolean
}

const DEEPSEEK_REASONING_EFFORTS = new Set<ModelReasoningEffort>(['low', 'high', 'max'])

function assertProviderReasoningEfforts(provider: string, reasoningEfforts: ModelReasoningEffort[]): void {
  if (provider.trim().toLowerCase() !== 'deepseek') return
  if (reasoningEfforts.some((effort) => !DEEPSEEK_REASONING_EFFORTS.has(effort))) {
    throw new DataAccessError(400, 'REASONING_EFFORT_UNSUPPORTED', 'DeepSeek 仅支持 low、high 和 max 推理强度。')
  }
}

export async function updateAdminModel(modelId: string, input: UpdateAdminModelInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const model = await tx.aiModelConfig.findFirstOrThrow({ where: { id: modelId, ownerUserId: null } })
    const currentCapabilities = parseModelCapabilities(model.metadata, model.provider)
    const reasoningEfforts = input.reasoningEfforts ?? currentCapabilities.reasoningEfforts
    const defaultReasoningEffort = input.defaultReasoningEffort ?? currentCapabilities.defaultReasoningEffort
    assertProviderReasoningEfforts(input.provider ?? model.provider, reasoningEfforts)
    if (!reasoningEfforts.includes(defaultReasoningEffort)) throw new DataAccessError(400, 'VALIDATION_ERROR', '默认推理强度必须包含在模型支持档位中。')
    const nextModelName = input.modelName?.trim() || model.modelName
    const nextBaseUrl = input.baseUrl === undefined ? model.baseUrl : input.baseUrl?.trim() || null
    const nextHasApiKey = Boolean(input.apiKey?.trim() || model.apiKeyCiphertext)
    const nextEnabled = input.enabled ?? model.enabled
    const nextSelectable = input.selectable ?? model.selectable
    if (model.tier !== 'speed' && (nextEnabled || nextSelectable) && (nextModelName === 'unconfigured' || !nextBaseUrl || !nextHasApiKey)) {
      throw new DataAccessError(409, 'MODEL_CONFIG_INCOMPLETE', '该服务必须先完整配置模型 ID、Base URL 与 API Key，才能启用。')
    }
    if (input.isDefault) await tx.aiModelConfig.updateMany({ where: { ownerUserId: null, id: { not: model.id } }, data: { isDefault: false } })
    await tx.aiModelConfig.update({
      where: { id: model.id },
      data: {
        provider: input.provider?.trim() || undefined,
        displayName: input.displayName?.trim() || undefined,
        modelName: input.modelName?.trim() || undefined,
        baseUrl: input.baseUrl === undefined ? undefined : input.baseUrl?.trim() || null,
        apiKeyCiphertext: input.apiKey?.trim() ? encryptSecret(input.apiKey.trim()) : undefined,
        multiplierBps: input.multiplier === undefined ? undefined : Math.round(input.multiplier * 10_000),
        enabled: input.enabled,
        selectable: input.selectable,
        isDefault: input.isDefault,
        metadata: {
          ...(model.metadata && typeof model.metadata === 'object' && !Array.isArray(model.metadata) ? model.metadata : {}),
          reasoningEfforts,
          defaultReasoningEffort,
          visionEnabled: input.visionEnabled ?? currentCapabilities.visionEnabled,
        },
      },
    })
  })
}
