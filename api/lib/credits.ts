import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'

import { BUILT_IN_MODEL_TIERS } from '../../shared/contracts/index.js'
import type {
  CreditAccountSummary,
  CreditActivityPayload,
  CreditLedgerItem,
  CreditModelOption,
  CreditModelTier,
  CreditUsagePayload,
  ModelReasoningEffort,
  ReferralPayload,
} from '../../shared/contracts/index.js'
import { DataAccessError, prisma } from './prisma.js'
import { decryptSecret } from './secret-box.js'

export const CREDIT_MILLI = 1000
export const PUBLIC_BETA_DAILY_MILLI = 450 * CREDIT_MILLI
export const REFERRER_REWARD_MILLI = 300 * CREDIT_MILLI
export const REFEREE_REWARD_MILLI = 120 * CREDIT_MILLI
export const IMAGE_CALL_MILLI = 6 * CREDIT_MILLI
export const WEB_SEARCH_CALL_MILLI = 2 * CREDIT_MILLI

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_RESET_HOUR_UTC8 = 15
const GLOBAL_SETTING_ID = 'global'

const MODEL_FALLBACKS: CreditModelOption[] = [
  { tier: 'lite', label: '轻量', multiplier: 0, available: false, selectedByDefault: false, reasoningEfforts: ['low', 'high', 'max'], defaultReasoningEffort: 'high', visionEnabled: false },
  { tier: 'speed', label: '极速', multiplier: 1, available: true, selectedByDefault: true, reasoningEfforts: ['low', 'high', 'max'], defaultReasoningEffort: 'high', visionEnabled: false },
  { tier: 'standard', label: '标准', multiplier: 1.1, available: false, selectedByDefault: false, reasoningEfforts: ['high'], defaultReasoningEffort: 'high', visionEnabled: false },
  { tier: 'performance', label: '性能', multiplier: 1.8, available: false, selectedByDefault: false, reasoningEfforts: ['high'], defaultReasoningEffort: 'high', visionEnabled: false },
  { tier: 'ultimate', label: '极致', multiplier: 4.8, available: false, selectedByDefault: false, reasoningEfforts: ['high'], defaultReasoningEffort: 'high', visionEnabled: false },
]

const MODEL_REASONING_EFFORTS = new Set<ModelReasoningEffort>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

const CREDIT_ACTIVITY_MODEL_LABELS: Record<CreditModelTier, string> = {
  lite: '轻量',
  speed: '极速',
  standard: '标准',
  performance: '性能',
  ultimate: '极致',
  basic: '基础',
  custom: '自定义模型',
}

/** 个人资料属于用户侧产品界面，只显示产品档位，绝不返回供应商模型 ID。 */
export function getCreditActivityModelLabel(providerType: 'text' | 'image', modelTier: string | null): string {
  if (providerType === 'image') return '生图'
  return modelTier && modelTier in CREDIT_ACTIVITY_MODEL_LABELS
    ? CREDIT_ACTIVITY_MODEL_LABELS[modelTier as CreditModelTier]
    : '历史模型'
}

export type ModelCapabilities = {
  reasoningEfforts: ModelReasoningEffort[]
  defaultReasoningEffort: ModelReasoningEffort
  visionEnabled: boolean
  contextWindowTokens: number | null
}

export function parseModelCapabilities(metadata: Prisma.JsonValue | null | undefined, provider = ''): ModelCapabilities {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
  const declared = Array.isArray(record.reasoningEfforts)
    ? record.reasoningEfforts.filter((item): item is ModelReasoningEffort => typeof item === 'string' && MODEL_REASONING_EFFORTS.has(item as ModelReasoningEffort))
    : []
  const reasoningEfforts: ModelReasoningEffort[] = declared.length > 0
    ? [...new Set(declared)]
    : provider.toLowerCase() === 'deepseek' ? ['low', 'high', 'max'] : ['high']
  const configuredDefault = typeof record.defaultReasoningEffort === 'string' && MODEL_REASONING_EFFORTS.has(record.defaultReasoningEffort as ModelReasoningEffort)
    ? record.defaultReasoningEffort as ModelReasoningEffort
    : 'high'
  return {
    reasoningEfforts,
    defaultReasoningEffort: reasoningEfforts.includes(configuredDefault) ? configuredDefault : reasoningEfforts[0] ?? 'high',
    visionEnabled: record.visionEnabled === true,
    contextWindowTokens: typeof record.contextWindowTokens === 'number'
      && Number.isInteger(record.contextWindowTokens)
      && record.contextWindowTokens >= 16_000
      && record.contextWindowTokens <= 4_000_000
      ? record.contextWindowTokens
      : null,
  }
}

function isConfiguredBuiltIn(item: { tier: string | null; modelName: string; baseUrl: string | null; apiKeyCiphertext: string | null }): boolean {
  if (item.tier === 'speed') return item.modelName !== 'unconfigured'
  return item.modelName !== 'unconfigured' && Boolean(item.baseUrl && item.apiKeyCiphertext)
}

type CreditDb = Prisma.TransactionClient | typeof prisma

type CreditWindow = { startedAt: Date; endsAt: Date }

export function getCreditWindow(now = new Date(), resetHourUtc8 = DEFAULT_RESET_HOUR_UTC8): CreditWindow {
  const local = new Date(now.getTime() + UTC8_OFFSET_MS)
  let localResetMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    resetHourUtc8,
  )
  if (local.getTime() < localResetMs) localResetMs -= 24 * 60 * 60 * 1000
  return {
    startedAt: new Date(localResetMs - UTC8_OFFSET_MS),
    endsAt: new Date(localResetMs - UTC8_OFFSET_MS + 24 * 60 * 60 * 1000),
  }
}

function makeReferralCode(seed?: string): string {
  const source = seed ? createHash('sha256').update(seed).digest('base64url') : randomBytes(9).toString('base64url')
  return source.replace(/[-_]/g, '').toUpperCase().slice(0, 12)
}

async function getGlobalSetting(db: CreditDb) {
  return db.creditSystemSetting.upsert({
    where: { id: GLOBAL_SETTING_ID },
    create: {
      id: GLOBAL_SETTING_ID,
      globallyPaused: false,
      dailyAllowanceMilli: PUBLIC_BETA_DAILY_MILLI,
      resetHourUtc8: DEFAULT_RESET_HOUR_UTC8,
    },
    update: {},
  })
}

/**
 * 新账户默认值的唯一入口：全局暂停期间新账户必须继承暂停状态。
 * 所有建账点（注册事务、懒加载 ensure、管理端批量建账）都必须经过这里，
 * 结构性防止再出现遗漏 suspendedAt 而绕过门禁的新建账路径。
 */
export function buildNewCreditAccountData(
  userId: string,
  setting: { dailyAllowanceMilli: number; globallyPaused: boolean },
  window: CreditWindow,
  now = new Date(),
) {
  return {
    userId,
    dailyAllowanceMilli: setting.dailyAllowanceMilli,
    dailyUsedMilli: 0,
    bonusBalanceMilli: 0,
    periodStartedAt: window.startedAt,
    periodEndsAt: window.endsAt,
    suspendedAt: setting.globallyPaused ? now : null,
  }
}

async function ensureAccountWithDb(db: CreditDb, userId: string, now = new Date()) {
  const setting = await getGlobalSetting(db)
  const window = getCreditWindow(now, setting.resetHourUtc8)
  await db.creditAccount.upsert({
    where: { userId },
    create: buildNewCreditAccountData(userId, setting, window, now),
    update: {},
  })
  await db.creditAccount.updateMany({
    where: { userId, periodEndsAt: { lte: now } },
    data: {
      dailyAllowanceMilli: setting.dailyAllowanceMilli,
      dailyUsedMilli: 0,
      periodStartedAt: window.startedAt,
      periodEndsAt: window.endsAt,
    },
  })
  const account = await db.creditAccount.findUniqueOrThrow({ where: { userId } })
  return { account, setting }
}

export async function ensureCreditAccount(userId: string, now = new Date()) {
  return ensureAccountWithDb(prisma, userId, now)
}

async function listPublicModelOptions(): Promise<CreditModelOption[]> {
  const configs = await prisma.aiModelConfig.findMany({
    where: { ownerUserId: null, tier: { not: null } },
    select: { tier: true, provider: true, displayName: true, modelName: true, baseUrl: true, apiKeyCiphertext: true, multiplierBps: true, enabled: true, selectable: true, isDefault: true, metadata: true },
  })
  if (configs.length === 0) return MODEL_FALLBACKS
  return configs.flatMap((item) => {
    if (!item.tier || !['lite', 'speed', 'standard', 'performance', 'ultimate'].includes(item.tier)) return []
    const capabilities = parseModelCapabilities(item.metadata, item.provider)
    return [{
      tier: item.tier as CreditModelOption['tier'],
      label: item.displayName,
      multiplier: item.multiplierBps / 10000,
      available: item.enabled && item.selectable && isConfiguredBuiltIn(item),
      selectedByDefault: item.isDefault,
      ...capabilities,
    }]
  }).sort((left, right) => {
    const order = (tier: CreditModelTier) => {
      const index = BUILT_IN_MODEL_TIERS.indexOf(tier as typeof BUILT_IN_MODEL_TIERS[number])
      return index >= 0 ? index : BUILT_IN_MODEL_TIERS.length
    }
    return order(left.tier) - order(right.tier)
  })
}

function milliToCredits(value: number): number {
  return Math.round(value) / CREDIT_MILLI
}

function utc8DateKey(now = new Date()): string {
  return new Date(now.getTime() + UTC8_OFFSET_MS).toISOString().slice(0, 10)
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** 当前连续天数允许最后一次活动停在昨天，避免当天尚未使用时在 00:00 立即归零。 */
export function calculateCreditActivityStreaks(activityDates: string[], todayKey = utc8DateKey()): {
  current: number
  longest: number
} {
  const dates = [...new Set(activityDates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
  const active = new Set(dates)
  let longest = 0
  let running = 0
  let previous: string | null = null
  for (const date of dates) {
    running = previous && shiftDateKey(previous, 1) === date ? running + 1 : 1
    longest = Math.max(longest, running)
    previous = date
  }

  const yesterdayKey = shiftDateKey(todayKey, -1)
  let cursor = active.has(todayKey) ? todayKey : active.has(yesterdayKey) ? yesterdayKey : null
  let current = 0
  while (cursor && active.has(cursor)) {
    current += 1
    cursor = shiftDateKey(cursor, -1)
  }
  return { current, longest }
}

async function toCreditSummary(
  account: Awaited<ReturnType<typeof ensureAccountWithDb>>['account'],
  setting: Awaited<ReturnType<typeof getGlobalSetting>>,
): Promise<CreditAccountSummary> {
  const dailyRemainingMilli = Math.max(0, account.dailyAllowanceMilli - account.dailyUsedMilli)
  const totalRemainingMilli = dailyRemainingMilli + Math.max(0, account.bonusBalanceMilli)
  const usedPercent = account.dailyAllowanceMilli > 0
    ? Math.min(100, Math.round((account.dailyUsedMilli / account.dailyAllowanceMilli) * 1000) / 10)
    : 100
  return {
    plan: 'public_beta',
    planLabel: '公测版',
    dailyAllowance: milliToCredits(account.dailyAllowanceMilli),
    dailyUsed: milliToCredits(account.dailyUsedMilli),
    dailyRemaining: milliToCredits(dailyRemainingMilli),
    bonusRemaining: milliToCredits(account.bonusBalanceMilli),
    totalRemaining: milliToCredits(totalRemainingMilli),
    usedPercent,
    periodStartedAt: account.periodStartedAt.toISOString(),
    resetsAt: account.periodEndsAt.toISOString(),
    resetTimeZone: 'UTC+8',
    globallyPaused: setting.globallyPaused,
    suspended: Boolean(account.suspendedAt),
    models: await listPublicModelOptions(),
  }
}

export async function getCreditSummary(userId: string): Promise<CreditAccountSummary> {
  const { account, setting } = await ensureCreditAccount(userId)
  return toCreditSummary(account, setting)
}

export async function getCreditUsage(userId: string, take = 100): Promise<CreditUsagePayload> {
  const [account, entries] = await Promise.all([
    getCreditSummary(userId),
    prisma.creditLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 300),
    }),
  ])
  // 账本幂等键为 usage:{usageLogId}，据此精确关联用量日志补齐缓存命中字段（旧记录/非 token 条目为 null）
  const usageLogIds = entries
    .filter((entry) => entry.kind === 'usage' && entry.sourceType === 'model_tokens' && entry.idempotencyKey.startsWith('usage:'))
    .map((entry) => entry.idempotencyKey.slice('usage:'.length))
  const cacheByLogId = new Map<string, { hit: number; miss: number }>()
  if (usageLogIds.length > 0) {
    const usageLogs = await prisma.aiUsageLog.findMany({
      where: { id: { in: usageLogIds }, promptCacheHitTokens: { not: null } },
      select: { id: true, promptCacheHitTokens: true, promptCacheMissTokens: true },
    })
    for (const log of usageLogs) {
      cacheByLogId.set(log.id, { hit: log.promptCacheHitTokens ?? 0, miss: log.promptCacheMissTokens ?? 0 })
    }
  }
  const ledger: CreditLedgerItem[] = entries.map((entry) => ({
    id: entry.id,
    delta: milliToCredits(entry.deltaMilli),
    kind: entry.kind,
    sourceType: entry.sourceType,
    referenceId: entry.referenceId,
    modelTier: entry.modelTier as CreditModelTier | null,
    multiplier: entry.multiplierBps / 10000,
    requestTokens: entry.requestTokens,
    responseTokens: entry.responseTokens,
    promptCacheHitTokens: cacheByLogId.get(entry.idempotencyKey.slice('usage:'.length))?.hit ?? null,
    promptCacheMissTokens: cacheByLogId.get(entry.idempotencyKey.slice('usage:'.length))?.miss ?? null,
    createdAt: entry.createdAt.toISOString(),
  }))
  return { account, ledger }
}

type CreditActivityDbRow = {
  date: string
  spentMilli: bigint | number
  eventCount: bigint | number
}

/**
 * 个人资料页的真实 Credits/Agent 使用画像。
 * 日聚合在数据库完成，最多只把“一天一行”传回应用层，不随调用日志数量线性增长。
 */
export async function getCreditActivity(userId: string, now = new Date()): Promise<CreditActivityPayload> {
  const [account, dailyRows, earned, aiTotals, modelGroups, imageSpend, agentRuns] = await Promise.all([
    getCreditSummary(userId),
    prisma.$queryRaw<CreditActivityDbRow[]>`
      SELECT
        TO_CHAR(("created_at" + INTERVAL '8 hours')::date, 'YYYY-MM-DD') AS "date",
        SUM(-"delta_milli")::bigint AS "spentMilli",
        COUNT(*)::bigint AS "eventCount"
      FROM "credit_ledger_entries"
      WHERE "user_id" = ${userId} AND "delta_milli" < 0
      GROUP BY ("created_at" + INTERVAL '8 hours')::date
      ORDER BY ("created_at" + INTERVAL '8 hours')::date ASC
    `,
    prisma.creditLedgerEntry.aggregate({ where: { userId, deltaMilli: { gt: 0 } }, _sum: { deltaMilli: true } }),
    prisma.aiUsageLog.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { requestTokens: true, responseTokens: true, promptCacheHitTokens: true, promptCacheMissTokens: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ['providerType', 'modelTier'],
      where: { userId },
      _count: { _all: true },
      _sum: { requestTokens: true, responseTokens: true, creditChargeMilli: true },
    }),
    prisma.creditLedgerEntry.aggregate({
      where: { userId, sourceType: 'image_generation', deltaMilli: { lt: 0 } },
      _sum: { deltaMilli: true },
    }),
    prisma.agentRun.count({ where: { userId } }),
  ])

  const daily = dailyRows.map((row) => ({
    date: row.date,
    spentMilli: Number(row.spentMilli),
    eventCount: Number(row.eventCount),
  }))
  const todayKey = utc8DateKey(now)
  const activityStartedAt = shiftDateKey(todayKey, -364)
  const streaks = calculateCreditActivityStreaks(daily.map((row) => row.date), todayKey)
  const hitTokens = aiTotals._sum.promptCacheHitTokens ?? 0
  const missTokens = aiTotals._sum.promptCacheMissTokens ?? 0
  const cacheTokens = hitTokens + missTokens
  const imageSpentMilli = Math.max(0, -(imageSpend._sum.deltaMilli ?? 0))
  const modelUsageByLabel = new Map<string, { label: string; calls: number; creditsSpentMilli: number; tokens: number }>()
  for (const group of modelGroups) {
    const label = getCreditActivityModelLabel(group.providerType, group.modelTier)
    const current = modelUsageByLabel.get(label) ?? { label, calls: 0, creditsSpentMilli: 0, tokens: 0 }
    current.calls += group._count._all
    current.creditsSpentMilli += group.providerType === 'image' ? 0 : group._sum.creditChargeMilli ?? 0
    current.tokens += (group._sum.requestTokens ?? 0) + (group._sum.responseTokens ?? 0)
    modelUsageByLabel.set(label, current)
  }
  const imageUsage = modelUsageByLabel.get('生图')
  if (imageUsage) imageUsage.creditsSpentMilli = imageSpentMilli

  return {
    account,
    stats: {
      generatedAt: now.toISOString(),
      ledgerStartedAt: daily[0]?.date ?? null,
      activityStartedAt,
      activityEndsAt: todayKey,
      cumulativeSpent: milliToCredits(daily.reduce((sum, row) => sum + row.spentMilli, 0)),
      cumulativeEarned: milliToCredits(earned._sum.deltaMilli ?? 0),
      peakDailySpent: milliToCredits(daily.reduce((peak, row) => Math.max(peak, row.spentMilli), 0)),
      totalTokens: (aiTotals._sum.requestTokens ?? 0) + (aiTotals._sum.responseTokens ?? 0),
      totalModelCalls: aiTotals._count._all,
      agentRuns,
      activeDays: daily.length,
      currentStreakDays: streaks.current,
      longestStreakDays: streaks.longest,
      cacheHitRate: cacheTokens > 0 ? Math.round((hitTokens / cacheTokens) * 1000) / 10 : null,
      activity: daily
        .filter((row) => row.date >= activityStartedAt && row.date <= todayKey)
        .map((row) => ({ date: row.date, creditsSpent: milliToCredits(row.spentMilli), eventCount: row.eventCount })),
      modelUsage: [...modelUsageByLabel.values()]
        .map((group) => ({
          label: group.label,
          calls: group.calls,
          creditsSpent: milliToCredits(group.creditsSpentMilli),
          tokens: group.tokens,
        }))
        .sort((left, right) => right.calls - left.calls || right.tokens - left.tokens)
        .slice(0, 5),
    },
  }
}

export async function assertCreditAccess(userId: string, tier: CreditModelTier = 'speed', requireSelectable = true): Promise<void> {
  const { account, setting } = await ensureCreditAccount(userId)
  if (account.suspendedAt) {
    throw new DataAccessError(423, setting.globallyPaused ? 'CREDITS_GLOBALLY_PAUSED' : 'CREDITS_ACCOUNT_SUSPENDED', setting.globallyPaused ? '公测模型服务已由管理员暂停，请稍后再试。' : '当前账户的模型使用权限已暂停。')
  }
  if (tier === 'custom') return
  const remaining = Math.max(0, account.dailyAllowanceMilli - account.dailyUsedMilli) + account.bonusBalanceMilli
  if (remaining <= 0) {
    throw new DataAccessError(402, 'CREDITS_EXHAUSTED', '今日额度已用尽，可邀请好友获得额外额度。')
  }
  const model = await prisma.aiModelConfig.findFirst({
    where: { ownerUserId: null, tier, enabled: true, ...(requireSelectable ? { selectable: true } : {}) },
    select: { tier: true, modelName: true, baseUrl: true, apiKeyCiphertext: true },
  })
  if (!model || !isConfiguredBuiltIn(model)) {
    const configuredModels = await prisma.aiModelConfig.count({ where: { ownerUserId: null } })
    // 仅兼容迁移尚未应用的旧库；只要已有模型配置，就严格服从 enabled/selectable。
    if (tier === 'speed' && configuredModels === 0) return
    throw new DataAccessError(409, 'MODEL_TIER_UNAVAILABLE', '该模型档位尚未开放。')
  }
}

export async function getModelTierRuntime(tier: CreditModelTier = 'speed', userId?: string, customModelId?: string | null, requestedReasoningEffort?: ModelReasoningEffort): Promise<{
  tier: CreditModelTier
  multiplierBps: number
  provider: string
  modelName: string | null
  baseUrl: string | null
  apiKey: string | null
  reasoningEffort: ModelReasoningEffort
  reasoningEfforts: ModelReasoningEffort[]
  visionEnabled: boolean
  contextWindowTokens: number | null
}> {
  if (tier === 'custom') {
    if (!userId || !customModelId) throw new DataAccessError(400, 'CUSTOM_MODEL_REQUIRED', '请选择一个已配置的自定义模型。')
    const custom = await prisma.aiModelConfig.findFirst({
      where: { id: customModelId, ownerUserId: userId, enabled: true },
      select: { provider: true, modelName: true, baseUrl: true, apiKeyCiphertext: true, metadata: true },
    })
    if (!custom || !custom.baseUrl || !custom.apiKeyCiphertext) throw new DataAccessError(404, 'CUSTOM_MODEL_NOT_FOUND', '自定义模型不存在、未启用或配置不完整。')
    const capabilities = parseModelCapabilities(custom.metadata, custom.provider)
    const reasoningEffort = requestedReasoningEffort ?? capabilities.defaultReasoningEffort
    if (!capabilities.reasoningEfforts.includes(reasoningEffort)) throw new DataAccessError(400, 'REASONING_EFFORT_UNSUPPORTED', '该模型不支持所选推理强度。')
    return { tier, multiplierBps: 0, provider: custom.provider, modelName: custom.modelName, baseUrl: custom.baseUrl, apiKey: decryptSecret(custom.apiKeyCiphertext), reasoningEffort, ...capabilities }
  }
  const config = await prisma.aiModelConfig.findFirst({
    where: { ownerUserId: null, tier, enabled: true },
    select: { tier: true, provider: true, modelName: true, multiplierBps: true, baseUrl: true, apiKeyCiphertext: true, metadata: true },
  })
  if (!config) {
    const configuredModels = await prisma.aiModelConfig.count({ where: { ownerUserId: null } })
    if (tier === 'speed' && configuredModels === 0) return { tier, multiplierBps: 10000, provider: 'deepseek', modelName: null, baseUrl: null, apiKey: null, reasoningEffort: requestedReasoningEffort ?? 'high', reasoningEfforts: ['low', 'high', 'max'], visionEnabled: false, contextWindowTokens: null }
    // 基础模型档未建行/未启用时回退极速档：后台轻任务（关系网/导出建议）不因可选配置缺失而整体失败
    if (tier === 'basic') return getModelTierRuntime('speed', userId, customModelId, requestedReasoningEffort ?? 'low')
    throw new DataAccessError(409, 'MODEL_TIER_UNAVAILABLE', '该模型档位尚未开放。')
  }
  if (!isConfiguredBuiltIn(config)) {
    // 基础模型档存在但服务配置不完整时同样回退极速档；回退后计费也按极速档记录
    if (tier === 'basic') return getModelTierRuntime('speed', userId, customModelId, requestedReasoningEffort ?? 'low')
    throw new DataAccessError(409, 'MODEL_TIER_UNAVAILABLE', '该模型档位尚未完成服务配置。')
  }
  const capabilities = parseModelCapabilities(config.metadata, config.provider)
  const reasoningEffort = requestedReasoningEffort ?? capabilities.defaultReasoningEffort
  if (!capabilities.reasoningEfforts.includes(reasoningEffort)) throw new DataAccessError(400, 'REASONING_EFFORT_UNSUPPORTED', '该模型不支持所选推理强度。')
  return {
    tier,
    multiplierBps: config.multiplierBps,
    provider: config.provider,
    modelName: config.modelName === 'unconfigured' ? null : config.modelName,
    baseUrl: config.baseUrl,
    apiKey: config.apiKeyCiphertext ? decryptSecret(config.apiKeyCiphertext) : null,
    reasoningEffort,
    ...capabilities,
  }
}

export type ConsumeCreditInput = {
  userId: string
  amountMilli: number
  kind: string
  sourceType: string
  idempotencyKey: string
  referenceId?: string | null
  modelTier?: CreditModelTier | null
  multiplierBps?: number
  requestTokens?: number | null
  responseTokens?: number | null
  metadata?: Prisma.InputJsonValue
  /** Token 调用已发生时允许扣完剩余额度；固定价工具不可开启。 */
  allowPartialOnExhaustion?: boolean
}

export type CreditChargeResult = { chargedMilli: number; remainingMilli: number; exhausted: boolean }

export async function consumeCredits(input: ConsumeCreditInput): Promise<CreditChargeResult> {
  const amountMilli = Math.max(0, Math.ceil(input.amountMilli))
  if (amountMilli === 0) {
    const summary = await getCreditSummary(input.userId)
    return {
      chargedMilli: 0,
      remainingMilli: Math.round(summary.totalRemaining * CREDIT_MILLI),
      // 0 倍率免费档不消耗额度：额度为空也不报 exhausted，否则免费档在 quota 用尽后会被误拦
      exhausted: false,
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.creditLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
        if (existing) {
          const { account } = await ensureAccountWithDb(tx, input.userId)
          return {
            chargedMilli: Math.max(0, -existing.deltaMilli),
            remainingMilli: Math.max(0, account.dailyAllowanceMilli - account.dailyUsedMilli) + account.bonusBalanceMilli,
            exhausted: Math.max(0, account.dailyAllowanceMilli - account.dailyUsedMilli) + account.bonusBalanceMilli <= 0,
          }
        }

        const { account, setting } = await ensureAccountWithDb(tx, input.userId)
        if (account.suspendedAt) throw new DataAccessError(423, setting.globallyPaused ? 'CREDITS_GLOBALLY_PAUSED' : 'CREDITS_ACCOUNT_SUSPENDED', setting.globallyPaused ? '公测模型服务已由管理员暂停，请稍后再试。' : '当前账户的模型使用权限已暂停。')

        const dailyRemaining = Math.max(0, account.dailyAllowanceMilli - account.dailyUsedMilli)
        const totalRemaining = dailyRemaining + account.bonusBalanceMilli
        if (totalRemaining < amountMilli && !input.allowPartialOnExhaustion) {
          throw new DataAccessError(402, 'CREDITS_EXHAUSTED', '今日额度已用尽，可邀请好友获得额外额度。')
        }
        const actualCharge = Math.min(totalRemaining, amountMilli)
        const dailyCharge = Math.min(dailyRemaining, actualCharge)
        const bonusCharge = actualCharge - dailyCharge
        const updated = await tx.creditAccount.update({
          where: { userId: input.userId },
          data: {
            dailyUsedMilli: { increment: dailyCharge },
            bonusBalanceMilli: { decrement: bonusCharge },
          },
        })
        await tx.creditLedgerEntry.create({
          data: {
            id: randomUUID(),
            userId: input.userId,
            deltaMilli: -actualCharge,
            dailyDeltaMilli: -dailyCharge,
            bonusDeltaMilli: -bonusCharge,
            kind: input.kind,
            sourceType: input.sourceType,
            referenceId: input.referenceId ?? null,
            idempotencyKey: input.idempotencyKey,
            modelTier: input.modelTier ?? null,
            multiplierBps: input.multiplierBps ?? 10000,
            requestTokens: input.requestTokens ?? null,
            responseTokens: input.responseTokens ?? null,
            metadata: input.metadata ?? Prisma.JsonNull,
          },
        })
        return {
          chargedMilli: actualCharge,
          remainingMilli: Math.max(0, updated.dailyAllowanceMilli - updated.dailyUsedMilli) + updated.bonusBalanceMilli,
          exhausted: actualCharge < amountMilli || (
            Math.max(0, updated.dailyAllowanceMilli - updated.dailyUsedMilli) + updated.bonusBalanceMilli <= 0
          ),
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002') && attempt < 2) continue
      throw error
    }
  }
  throw new DataAccessError(409, 'CREDIT_CONCURRENCY_CONFLICT', '额度更新冲突，请重试。')
}

export async function refundCreditCharge(userId: string, originalIdempotencyKey: string, reason: string): Promise<void> {
  const refundKey = `refund:${originalIdempotencyKey}`
  await prisma.$transaction(async (tx) => {
    const existingRefund = await tx.creditLedgerEntry.findUnique({ where: { idempotencyKey: refundKey } })
    if (existingRefund) return
    const original = await tx.creditLedgerEntry.findFirst({ where: { userId, idempotencyKey: originalIdempotencyKey } })
    if (!original || original.deltaMilli >= 0) return
    const { account } = await ensureAccountWithDb(tx, userId)
    const dailyRefund = Math.max(0, -original.dailyDeltaMilli)
    const originalBelongsToCurrentWindow = original.createdAt >= account.periodStartedAt
      && original.createdAt < account.periodEndsAt
    // 跨过每日重置点后，旧周期的 dailyUsed 已经归零，不能再直接 decrement 成负数。
    // 这部分退款转入不随每日重置清空的 bonus，保证用户得到完整返还。
    const currentWindowDailyRefund = originalBelongsToCurrentWindow
      ? Math.min(account.dailyUsedMilli, dailyRefund)
      : 0
    const bonusRefund = Math.max(0, -original.bonusDeltaMilli) + (dailyRefund - currentWindowDailyRefund)
    await tx.creditAccount.update({
      where: { userId },
      data: {
        dailyUsedMilli: { decrement: currentWindowDailyRefund },
        bonusBalanceMilli: { increment: bonusRefund },
      },
    })
    await tx.creditLedgerEntry.create({
      data: {
        id: randomUUID(),
        userId,
        deltaMilli: -original.deltaMilli,
        dailyDeltaMilli: currentWindowDailyRefund,
        bonusDeltaMilli: bonusRefund,
        kind: 'refund',
        sourceType: original.sourceType,
        referenceId: original.referenceId,
        idempotencyKey: refundKey,
        modelTier: original.modelTier,
        multiplierBps: original.multiplierBps,
        metadata: { reason, originalEntryId: original.id },
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

/** 1 Credit 同时包含 10,000 输入 Token 与 1,000 输出 Token；按两池占用率较高者扣减。 */
export function calculateTokenChargeMilli(requestTokens: number, responseTokens: number, multiplierBps = 10000): number {
  const weightedTenths = Math.max(Math.max(0, requestTokens), Math.max(0, responseTokens) * 10)
  return Math.ceil((weightedTenths * Math.max(0, multiplierBps)) / 100000)
}

export async function consumeTokenCredits(input: {
  userId: string
  usageLogId: string
  requestTokens: number
  responseTokens: number
  modelTier?: CreditModelTier
  multiplierBps?: number
  referenceId?: string | null
}): Promise<CreditChargeResult> {
  const multiplierBps = input.multiplierBps ?? 10000
  return consumeCredits({
    userId: input.userId,
    amountMilli: calculateTokenChargeMilli(input.requestTokens, input.responseTokens, multiplierBps),
    kind: 'usage',
    sourceType: 'model_tokens',
    idempotencyKey: `usage:${input.usageLogId}`,
    referenceId: input.referenceId ?? input.usageLogId,
    modelTier: input.modelTier ?? 'speed',
    multiplierBps,
    requestTokens: input.requestTokens,
    responseTokens: input.responseTokens,
    allowPartialOnExhaustion: true,
  })
}

export async function initializeNewUserCredits(
  tx: Prisma.TransactionClient,
  userId: string,
  referralCode?: string | null,
): Promise<void> {
  const setting = await getGlobalSetting(tx)
  const now = new Date()
  const window = getCreditWindow(now, setting.resetHourUtc8)
  // 注册即建账：暂停期间注册的新用户必须继承全局暂停，否则将绕过计费门禁。
  await tx.creditAccount.create({ data: buildNewCreditAccountData(userId, setting, window, now) })
  await tx.referralCode.create({ data: { userId, code: makeReferralCode(userId) } })

  const normalizedCode = referralCode?.trim().toUpperCase()
  if (!normalizedCode) return
  const source = await tx.referralCode.findUnique({ where: { code: normalizedCode } })
  if (!source || source.userId === userId) {
    throw new DataAccessError(400, 'REFERRAL_INVALID', '邀请链接无效或已失效。')
  }
  await ensureAccountWithDb(tx, source.userId)
  await tx.referralRedemption.create({
    data: {
      id: randomUUID(),
      code: source.code,
      inviterUserId: source.userId,
      inviteeUserId: userId,
      inviterRewardMilli: REFERRER_REWARD_MILLI,
      inviteeRewardMilli: REFEREE_REWARD_MILLI,
    },
  })
  await tx.creditAccount.update({ where: { userId: source.userId }, data: { bonusBalanceMilli: { increment: REFERRER_REWARD_MILLI } } })
  await tx.creditAccount.update({ where: { userId }, data: { bonusBalanceMilli: { increment: REFEREE_REWARD_MILLI } } })
  await tx.creditLedgerEntry.createMany({
    data: [
      {
        id: randomUUID(), userId: source.userId, deltaMilli: REFERRER_REWARD_MILLI, bonusDeltaMilli: REFERRER_REWARD_MILLI,
        kind: 'reward', sourceType: 'referral_inviter', referenceId: userId, idempotencyKey: `referral:inviter:${userId}`,
      },
      {
        id: randomUUID(), userId, deltaMilli: REFEREE_REWARD_MILLI, bonusDeltaMilli: REFEREE_REWARD_MILLI,
        kind: 'reward', sourceType: 'referral_invitee', referenceId: source.userId, idempotencyKey: `referral:invitee:${userId}`,
      },
    ],
  })
}

async function ensureReferralCode(userId: string) {
  const existing = await prisma.referralCode.findUnique({ where: { userId } })
  if (existing) return existing
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.referralCode.create({ data: { userId, code: makeReferralCode() } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
      throw error
    }
  }
  throw new DataAccessError(500, 'REFERRAL_CODE_FAILED', '暂时无法生成邀请链接，请稍后重试。')
}

export async function getReferralPayload(userId: string, publicOrigin: string): Promise<ReferralPayload> {
  await ensureCreditAccount(userId)
  const code = await ensureReferralCode(userId)
  const [successfulInvites, rewards] = await Promise.all([
    prisma.referralRedemption.count({ where: { inviterUserId: userId } }),
    prisma.creditLedgerEntry.aggregate({ where: { userId, sourceType: 'referral_inviter' }, _sum: { deltaMilli: true } }),
  ])
  return {
    code: code.code,
    inviteUrl: `${publicOrigin.replace(/\/$/, '')}/register?ref=${encodeURIComponent(code.code)}`,
    inviterReward: 300,
    inviteeReward: 120,
    successfulInvites,
    totalEarned: milliToCredits(rewards._sum.deltaMilli ?? 0),
  }
}
