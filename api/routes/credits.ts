import { randomUUID } from 'node:crypto'

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import { env } from '../config/env.js'
import { getCreditActivity, getCreditSummary, getCreditUsage, getReferralPayload, parseModelCapabilities } from '../lib/credits.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'
import { DataAccessError, prisma } from '../lib/prisma.js'
import { encryptSecret } from '../lib/secret-box.js'
import { parseBody } from '../lib/parse-body.js'

const router = Router()

const modelReasoningEffortSchema = z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

const customModelCreateSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(80),
  modelName: z.string().trim().min(1).max(160),
  baseUrl: z.string().trim().url().max(512),
  apiKey: z.string().trim().min(8).max(2_000),
  enabled: z.boolean().optional(),
  reasoningEfforts: z.array(modelReasoningEffortSchema).min(1).max(7).optional(),
  defaultReasoningEffort: modelReasoningEffortSchema.optional(),
  visionEnabled: z.boolean().optional(),
})
const customModelUpdateSchema = customModelCreateSchema.partial()
const DEEPSEEK_REASONING_EFFORTS = new Set(['low', 'high', 'max'])

function assertProviderReasoningEfforts(provider: string, reasoningEfforts: string[]): void {
  if (provider.trim().toLowerCase() !== 'deepseek') return
  if (reasoningEfforts.some((effort) => !DEEPSEEK_REASONING_EFFORTS.has(effort))) {
    throw new DataAccessError(400, 'REASONING_EFFORT_UNSUPPORTED', 'DeepSeek 仅支持 low、high 和 max 推理强度。')
  }
}

router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    res.status(200).json(buildSuccess(requestId, await getCreditSummary(userId)))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/usage', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const take = typeof req.query.take === 'string' ? Number.parseInt(req.query.take, 10) : 100
    res.status(200).json(buildSuccess(requestId, await getCreditUsage(userId, Number.isFinite(take) ? take : 100)))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/activity', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    res.status(200).json(buildSuccess(requestId, await getCreditActivity(userId)))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/referral', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    // 邀请链接使用受信任的站点配置，避免 Host / X-Forwarded-* 被伪造后生成钓鱼链接。
    res.status(200).json(buildSuccess(requestId, await getReferralPayload(userId, env.webUrl)))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/models', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const models = await prisma.aiModelConfig.findMany({ where: { ownerUserId: userId }, orderBy: { updatedAt: 'desc' } })
    res.status(200).json(buildSuccess(requestId, {
      models: models.map((model) => ({
        ...parseModelCapabilities(model.metadata, model.provider),
        id: model.id,
        provider: model.provider,
        displayName: model.displayName,
        modelName: model.modelName,
        baseUrl: model.baseUrl,
        apiKeyConfigured: Boolean(model.apiKeyCiphertext),
        enabled: model.enabled,
        createdAt: model.createdAt.toISOString(),
        updatedAt: model.updatedAt.toISOString(),
      })),
    }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/models', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(customModelCreateSchema, req.body, '请完整填写自定义模型配置。')
    const reasoningEfforts = body.reasoningEfforts ?? (body.provider.trim().toLowerCase() === 'deepseek' ? ['low', 'high', 'max'] : ['high'])
    const defaultReasoningEffort = body.defaultReasoningEffort ?? 'high'
    assertProviderReasoningEfforts(body.provider, reasoningEfforts)
    if (!reasoningEfforts.includes(defaultReasoningEffort)) {
      throw new DataAccessError(400, 'VALIDATION_ERROR', '默认推理强度必须包含在模型支持档位中。')
    }
    const count = await prisma.aiModelConfig.count({ where: { ownerUserId: userId } })
    if (count >= 10) throw new DataAccessError(409, 'CUSTOM_MODEL_LIMIT', '每个账户最多保存 10 个自定义模型。')
    const model = await prisma.aiModelConfig.create({
      data: {
        ownerUserId: userId,
        key: `user:${userId}:${randomUUID()}`,
        provider: body.provider,
        displayName: body.displayName,
        modelName: body.modelName,
        baseUrl: body.baseUrl.replace(/\/$/, ''),
        apiKeyCiphertext: encryptSecret(body.apiKey),
        tier: null,
        multiplierBps: 0,
        enabled: body.enabled ?? true,
        selectable: true,
        metadata: {
          reasoningEfforts,
          defaultReasoningEffort,
          visionEnabled: body.visionEnabled ?? false,
        },
      },
    })
    res.status(201).json(buildSuccess(requestId, { id: model.id }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/models/:modelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(customModelUpdateSchema, req.body, '自定义模型配置格式不正确。')
    const target = await prisma.aiModelConfig.findFirst({ where: { id: req.params.modelId, ownerUserId: userId } })
    if (!target) throw new DataAccessError(404, 'CUSTOM_MODEL_NOT_FOUND', '自定义模型不存在。')
    const currentCapabilities = parseModelCapabilities(target.metadata, target.provider)
    const nextReasoningEfforts = body.reasoningEfforts ?? currentCapabilities.reasoningEfforts
    const nextDefaultReasoningEffort = body.defaultReasoningEffort ?? currentCapabilities.defaultReasoningEffort
    assertProviderReasoningEfforts(body.provider ?? target.provider, nextReasoningEfforts)
    if (!nextReasoningEfforts.includes(nextDefaultReasoningEffort)) {
      throw new DataAccessError(400, 'VALIDATION_ERROR', '默认推理强度必须包含在模型支持档位中。')
    }
    await prisma.aiModelConfig.update({
      where: { id: target.id },
      data: {
        provider: body.provider,
        displayName: body.displayName,
        modelName: body.modelName,
        baseUrl: body.baseUrl?.replace(/\/$/, ''),
        apiKeyCiphertext: body.apiKey ? encryptSecret(body.apiKey) : undefined,
        enabled: body.enabled,
        metadata: {
          ...(target.metadata && typeof target.metadata === 'object' && !Array.isArray(target.metadata) ? target.metadata : {}),
          reasoningEfforts: nextReasoningEfforts,
          defaultReasoningEffort: nextDefaultReasoningEffort,
          visionEnabled: body.visionEnabled ?? currentCapabilities.visionEnabled,
        },
      },
    })
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/models/:modelId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const deleted = await prisma.aiModelConfig.deleteMany({ where: { id: req.params.modelId, ownerUserId: userId } })
    if (deleted.count === 0) throw new DataAccessError(404, 'CUSTOM_MODEL_NOT_FOUND', '自定义模型不存在。')
    res.status(200).json(buildSuccess(requestId, { ok: true }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
