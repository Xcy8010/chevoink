import { Router, type Request, type Response } from 'express'
import { z } from 'zod'

import {
  resolveAgentApprovalSchema,
  resolveAgentQuestionSchema,
  startAgentLoopRunSchema,
  uploadAgentAttachmentSchema,
} from '../../shared/contracts/index.js'
import { storeAgentAttachment } from '../lib/agent-attachment-storage.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { getStoredExport } from '../lib/export-store.js'
import { stopActiveRunsInSession } from '../lib/agent/active-runs.js'
import {
  createNovelPlanArtifact,
  listNovelPlanArtifacts,
  updateNovelPlanArtifact,
} from '../lib/agent/plan-artifacts.js'
import {
  continueLoopRun,
  createAgentSessionData,
  deleteAgentSessionData,
  listAgentSessionHistoryData,
  listAgentSessionsData,
  resolveLoopRunApproval,
  resolveLoopRunQuestion,
  startLoopRun,
  stopLoopRun,
  streamLoopRun,
  updateAgentSessionData,
} from '../lib/agent/run-service.js'
import {
  deleteLoopSessionMessage,
  listLoopSessionMessages,
  rollbackLoopSessionFromMessage,
} from '../lib/agent/session-messages.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { parseBody } from '../lib/parse-body.js'
import { DataAccessError, prisma } from '../lib/prisma.js'
import { sendRouteError } from '../lib/route-error.js'
import { compactSessionContext, getContextState, listActiveDirectives } from '../lib/agent/context-engine.js'
import { getMemoryGraph, listMemoryReviewInbox, resolveMemoryReview, syncNovelMemoryProjection } from '../lib/agent/story-memory.js'
import { requireAgent2Feature } from '../lib/agent2-feature-flags.js'
import {
  createNovelSkillDraft,
  createNovelSkillVersion,
  deleteNovelSkill,
  getNovelSkillDetail,
  importThirdPartyNovelSkill,
  listNovelSkills,
  publishNovelSkillVersion,
  testNovelSkill,
  updateNovelSkill,
} from '../lib/agent/skills/service.js'
import { getQualityReport, recordQualityFindingFeedback } from '../lib/agent/humanity-quality.js'
import {
  extractAuthorStyleProfile,
  getAuthorStyleProfile,
  readRetrievalTrace,
  revokeCorpusSource,
} from '../lib/agent/craft-library.js'
import { styleSampleRequestSchema } from '../../shared/contracts/index.js'
import { agentDataControlPatchSchema } from '../../shared/contracts/index.js'
import { acceptSkillShareInviteSchema, createSkillShareInviteSchema } from '../../shared/contracts/index.js'
import { getResearchWorkbench, updateAgentDataControl } from '../lib/agent/research-dossier.js'
import { acceptSkillShareInvite, createSkillShareInvite, declineSkillShareInvite, listSkillShareInvites } from '../lib/agent/skills/sharing.js'

const router = Router()

/* ---------------- 请求体校验 schema（文案与历史提示保持一致） ---------------- */

const createAgentSessionSchema = z.object({
  novelId: z.string().min(1),
  title: z.string().optional(),
})

const updateAgentSessionSchema = z.object({
  title: z.string().refine((value) => value.trim().length > 0),
})

const createAgentPlanSchema = z.object({
  novelId: z.string().refine((value) => value.trim().length > 0),
  title: z.string().optional(),
})

/** 计划改名/改正文：至少携带一个可更新字段（strip 后空对象拒绝） */
const updateAgentPlanSchema = z
  .object({
    title: z.string().optional(),
    content: z.string().optional(),
    saved: z.boolean().optional(),
    position: z.number().int().positive().optional(),
  })
  .refine((patch) => patch.title !== undefined || patch.content !== undefined || patch.saved !== undefined || patch.position !== undefined)

const resolveMemoryReviewSchema = z.object({ accepted: z.boolean() })
const updateNovelSkillSchema = z
  .object({
    enabled: z.boolean().optional(),
    lockedVersion: z.string().trim().min(1).nullable().optional(),
  })
  .refine((patch) => patch.enabled !== undefined || patch.lockedVersion !== undefined)

const skillIntentSchema = z.enum(['plan', 'write', 'revise', 'review', 'structure', 'global_transform'])
const skillModeSchema = z.enum(['plan', 'build', 'review'])
const skillPhaseSchema = z.enum(['research', 'plan', 'scene', 'draft', 'critique', 'revision', 'commit'])
const skillDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  intents: z.array(skillIntentSchema).min(1).max(6),
  modes: z.array(skillModeSchema).min(1).max(3),
  phases: z.array(skillPhaseSchema).min(1).max(7),
  triggerPhrases: z.array(z.string().trim().min(1).max(80)).min(1).max(24),
  negativeTriggerPhrases: z.array(z.string().trim().min(1).max(80)).min(1).max(24),
  instructions: z.object({
    research: z.string().max(12_000).optional(),
    plan: z.string().max(12_000).optional(),
    scene: z.string().max(12_000).optional(),
    draft: z.string().max(12_000).optional(),
    critique: z.string().max(12_000).optional(),
    revision: z.string().max(12_000).optional(),
    commit: z.string().max(12_000).optional(),
  }),
  tokenBudget: z.number().int().min(100).max(1_500).optional(),
  priority: z.number().int().min(0).max(150).optional(),
})
const createSkillVersionSchema = skillDraftSchema.extend({
  version: z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i).max(32),
})
const importThirdPartySkillSchema = skillDraftSchema.extend({
  license: z.enum(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'Unlicense']),
  attribution: z.string().trim().min(1).max(500),
  sourcePackage: z.string().trim().min(1).max(240).regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:@[a-f0-9_.-]+)?$/i),
})
const testSkillSchema = z.object({
  version: z.string().trim().max(32).optional(),
  prompt: z.string().trim().min(1).max(4_000),
  intent: skillIntentSchema,
  mode: skillModeSchema,
  phase: skillPhaseSchema,
  expectMatch: z.boolean(),
})
const publishSkillSchema = z.object({ version: z.string().trim().min(1).max(32) })
const qualityFindingFeedbackSchema = z.object({ accepted: z.boolean(), reason: z.string().trim().max(500).optional() })
const revokePrivateStyleSourceSchema = z.object({ reason: z.string().trim().min(1).max(500) })

router.get('/sessions', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const novelId = typeof req.query.novelId === 'string' ? req.query.novelId : undefined
    const payload = await listAgentSessionsData(userId, novelId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(createAgentSessionSchema, req.body, '请提供作品 ID。')

    const payload = await createAgentSessionData(userId, {
      novelId: body.novelId,
      title: body.title,
    })
    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/sessions/:sessionId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(updateAgentSessionSchema, req.body, '请提供会话标题。')

    const payload = await updateAgentSessionData(userId, req.params.sessionId, {
      title: body.title,
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/sessions/:sessionId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    // 删除前先停止会话内进行中的任务，避免孤儿 run 阻塞删除或继续写库
    stopActiveRunsInSession(req.params.sessionId)
    const payload = await deleteAgentSessionData(userId, req.params.sessionId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/sessions/:sessionId/history', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await listAgentSessionHistoryData(userId, req.params.sessionId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/sessions/:sessionId/context-state', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const payload = await getContextState(userId, req.params.sessionId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/sessions/:sessionId/compact', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const checkpoint = await compactSessionContext(userId, req.params.sessionId, true)
    const state = await getContextState(userId, req.params.sessionId)
    res.status(200).json(buildSuccess(requestId, { checkpoint, state }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/sessions/:sessionId/directives', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    const session = await prisma.agentSession.findFirst({ where: { id: req.params.sessionId, userId }, select: { novelId: true } })
    if (!session) throw new Error('Agent 会话不存在。')
    const items = await listActiveDirectives(userId, session.novelId)
    res.status(200).json(buildSuccess(requestId, { items }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId/memory-review', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('memory2', userId)
    const items = await listMemoryReviewInbox(userId, req.params.novelId)
    res.status(200).json(buildSuccess(requestId, { items }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId/memory-graph', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('memory2', userId)
    const graph = await getMemoryGraph(userId, req.params.novelId)
    res.status(200).json(buildSuccess(requestId, { graph }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/memory-graph/sync', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('memory2', userId)
    const force = Boolean(req.body && typeof req.body === 'object' && !Array.isArray(req.body) && (req.body as { force?: unknown }).force === true)
    const projection = await syncNovelMemoryProjection(userId, req.params.novelId, { force })
    const graph = await getMemoryGraph(userId, req.params.novelId)
    res.status(200).json(buildSuccess(requestId, { graph, projection }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/memory/:memoryId/review', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('memory2', userId)
    const body = parseBody(resolveMemoryReviewSchema, req.body, '请明确接受或拒绝该记忆候选。')
    const memory = await resolveMemoryReview(userId, req.params.memoryId, body.accepted)
    res.status(200).json(buildSuccess(requestId, { memory }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/quality-findings/:findingId/feedback', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('humanityQuality', userId)
    const body = parseBody(qualityFindingFeedbackSchema, req.body, '请明确接受或拒绝该质量建议。')
    const finding = await recordQualityFindingFeedback({ userId, findingId: req.params.findingId, accepted: body.accepted, reason: body.reason })
    res.status(200).json(buildSuccess(requestId, { finding }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/quality-reports/:reportId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('humanityQuality', userId)
    const reportOwner = await prisma.chapterQualityReport.findFirst({ where: { id: req.params.reportId, userId }, select: { novelId: true } })
    if (!reportOwner) throw new DataAccessError(404, 'QUALITY_REPORT_NOT_FOUND', '质量报告不存在或不属于当前用户。')
    const report = await getQualityReport(userId, reportOwner.novelId, req.params.reportId)
    res.status(200).json(buildSuccess(requestId, {
      report: {
        id: report.id, chapterId: report.chapterId, chapterRevision: report.chapterRevision, status: report.status, repairRound: report.repairRound,
        findings: report.findings.map((finding) => ({ id: finding.id, disposition: finding.disposition, authorFeedback: finding.authorFeedback })),
      },
    }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId/style-profile', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('craftLibrary', userId)
    const profile = await getAuthorStyleProfile(userId, req.params.novelId)
    res.status(200).json(buildSuccess(requestId, { profile }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId/research-workbench', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('researchDossier', userId)
    const workbench = await getResearchWorkbench(userId, req.params.novelId)
    res.status(200).json(buildSuccess(requestId, { workbench }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/novels/:novelId/agent-data-control', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('feedbackFlywheel', userId)
    const patch = parseBody(agentDataControlPatchSchema, req.body, '请提供有效的数据使用设置。')
    const dataControl = await updateAgentDataControl(userId, req.params.novelId, patch)
    res.status(200).json(buildSuccess(requestId, { dataControl }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/style-profile', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('craftLibrary', userId)
    const body = parseBody(styleSampleRequestSchema, req.body, '请选择自己的样章并明确同意仅用于当前作品 Style DNA。')
    const profile = await extractAuthorStyleProfile({
      userId,
      novelId: req.params.novelId,
      title: body.title,
      chapterIds: body.chapterIds,
      uploadedFile: body.uploadedFile,
    })
    res.status(201).json(buildSuccess(requestId, { profile }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId/retrieval-traces/:traceId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('craftLibrary', userId)
    const trace = await readRetrievalTrace(userId, req.params.novelId, req.params.traceId)
    res.status(200).json(buildSuccess(requestId, { trace }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/novels/:novelId/corpus-sources/:sourceId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('craftLibrary', userId)
    const body = parseBody(revokePrivateStyleSourceSchema, req.body, '请填写撤回原因。')
    const receipt = await revokeCorpusSource({
      actorUserId: userId, sourceId: req.params.sourceId, novelId: req.params.novelId, admin: false, reason: body.reason,
    })
    res.status(200).json(buildSuccess(requestId, { receipt }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId/skills', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const payload = await listNovelSkills(userId, req.params.novelId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.patch('/novels/:novelId/skills/:skillId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const patch = parseBody(updateNovelSkillSchema, req.body, '请提供有效的技能设置。')
    const payload = await updateNovelSkill(userId, req.params.novelId, req.params.skillId, patch)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/novels/:novelId/skills/:skillId/detail', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const version = typeof req.query.version === 'string' && req.query.version.trim() ? req.query.version.trim() : undefined
    const detail = await getNovelSkillDetail(userId, req.params.novelId, req.params.skillId, version)
    res.status(200).json(buildSuccess(requestId, { detail }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/skills', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const body = parseBody(skillDraftSchema, req.body, '请完整填写技能名称、触发条件、禁用条件和阶段说明。')
    const payload = await createNovelSkillDraft(userId, req.params.novelId, { ...body, source: 'user' })
    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/skills/import', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const body = parseBody(importThirdPartySkillSchema, req.body, '导入第三方技能必须提供受支持许可证、归属说明和固定来源包。')
    const payload = await importThirdPartyNovelSkill(userId, req.params.novelId, body)
    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/skills/:skillId/versions', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const body = parseBody(createSkillVersionSchema, req.body, '请提供有效的新版本内容与语义版本号。')
    const payload = await createNovelSkillVersion(userId, req.params.novelId, req.params.skillId, body)
    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/skills/:skillId/test', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const body = parseBody(testSkillSchema, req.body, '请提供测试提示词、任务类型、阶段和预期结果。')
    const result = await testNovelSkill(userId, req.params.novelId, req.params.skillId, body)
    res.status(200).json(buildSuccess(requestId, { result }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/skills/:skillId/publish', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const body = parseBody(publishSkillSchema, req.body, '请选择要发布的技能版本。')
    const payload = await publishNovelSkillVersion(userId, req.params.novelId, req.params.skillId, body.version)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/novels/:novelId/skills/:skillId/share-invites', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skillSharing', userId)
    const body = parseBody(createSkillShareInviteSchema, req.body, '请提供接收账号和要共享的技能版本。')
    const invite = await createSkillShareInvite({ userId, novelId: req.params.novelId, skillId: req.params.skillId, ...body })
    res.status(201).json(buildSuccess(requestId, { invite }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/skill-share-invites', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skillSharing', userId)
    const payload = await listSkillShareInvites(userId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/skill-share-invites/:inviteId/accept', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skillSharing', userId)
    const body = parseBody(acceptSkillShareInviteSchema, req.body, '请选择安装技能的目标作品。')
    await acceptSkillShareInvite(userId, req.params.inviteId, body.destinationNovelId)
    const [skills, invites] = await Promise.all([listNovelSkills(userId, body.destinationNovelId), listSkillShareInvites(userId)])
    res.status(200).json(buildSuccess(requestId, { skills, invites }))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/skill-share-invites/:inviteId/decline', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skillSharing', userId)
    await declineSkillShareInvite(userId, req.params.inviteId)
    const invites = await listSkillShareInvites(userId)
    res.status(200).json(buildSuccess(requestId, invites))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.delete('/novels/:novelId/skills/:skillId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  try {
    const userId = requireSessionUserId(req)
    requireAgent2Feature('skill2', userId)
    const payload = await deleteNovelSkill(userId, req.params.novelId, req.params.skillId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 新链路：会话消息（parts 结构），用于历史恢复与切换会话
router.get('/sessions/:sessionId/messages', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await listLoopSessionMessages(userId, req.params.sessionId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 删除某轮对话：按消息所属 run 整轮删除（级联删消息与事件），不恢复已写入内容
router.delete('/sessions/:sessionId/messages/:messageId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await deleteLoopSessionMessage(userId, req.params.sessionId, req.params.messageId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 回退到某轮对话之前：逆序恢复写操作快照，并删除该轮及之后的所有 run
router.post('/sessions/:sessionId/messages/:messageId/rollback', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await rollbackLoopSessionFromMessage(userId, req.params.sessionId, req.params.messageId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/attachments', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    // 上传端点仅要求登录态：requireSessionUserId 的鉴权副作用即可
    requireSessionUserId(req)
    const body = parseBody(uploadAgentAttachmentSchema, req.body, '附件参数不完整。')

    const payload = await storeAgentAttachment({
      kind: body.kind,
      name: body.name.trim(),
      dataUrl: body.dataUrl.trim(),
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/runs', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(startAgentLoopRunSchema, req.body, '请完整填写运行参数。')

    const payload = await startLoopRun(userId, {
      sessionId: body.sessionId,
      novelId: body.novelId,
      chapterId: body.chapterId ?? null,
      // 全权限产品决策：模式选择 UI 已下线，后端恒 build 兜底（mode 管道保留，回退只需还原 UI）
      mode: 'build',
      prompt: body.prompt.trim(),
      selection: body.selection ?? null,
      attachments: body.attachments ?? [],
      creativeFreedom: body.creativeFreedom ?? 'balanced',
      qualityMode: body.qualityMode ?? 'premium',
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/runs/:runId/stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireSessionUserId(req)

    // live/replay 同源事件流，支持 Last-Event-ID 续传
    const lastEventId = req.headers['last-event-id']
    const sinceQuery = typeof req.query.since === 'string' ? req.query.since : ''
    const sinceSeq = Number.parseInt(
      (typeof lastEventId === 'string' ? lastEventId : lastEventId?.[0]) ?? sinceQuery,
      10,
    )

    await streamLoopRun(userId, req.params.runId, Number.isFinite(sinceSeq) ? sinceSeq : 0, res)
  } catch (error) {
    const requestId = createRequestId()
    sendRouteError(res, requestId, error)
  }
})

// 新链路：工具审批批复
router.post('/runs/:runId/approvals', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(resolveAgentApprovalSchema, req.body, '请提供 callId 与 approved。')

    const payload = await resolveLoopRunApproval(
      userId,
      req.params.runId,
      body.callId,
      body.approved,
      body.alwaysAllow ?? false,
    )
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 新链路：ask_user 提问批复（作者作答后唤醒挂起的工具）
router.post('/runs/:runId/questions', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(resolveAgentQuestionSchema, req.body, '请提供 callId 与回答内容。')

    const payload = await resolveLoopRunQuestion(userId, req.params.runId, body.callId, body.answer.trim())
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 新链路：优雅停止（abort + 落库 paused）
router.post('/runs/:runId/stop', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await stopLoopRun(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 新链路：从 paused/failed 恢复循环
router.post('/runs/:runId/continue', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await continueLoopRun(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 计划文件夹：作品维度拉取已存入的创作计划（跨会话聚合）
router.get('/plans', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const novelId = typeof req.query.novelId === 'string' ? req.query.novelId.trim() : ''
    if (!novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

    const payload = await listNovelPlanArtifacts(userId, novelId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 计划文件夹：作者手工新建一份空白计划
router.post('/plans', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const body = parseBody(createAgentPlanSchema, req.body, '请提供作品 ID。')

    const payload = await createNovelPlanArtifact(userId, body.novelId, body.title)
    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 计划文件夹：改名/改正文，saved=false 从文件夹移除
router.patch('/plans/:artifactId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const patch = parseBody(updateAgentPlanSchema, req.body, '请提供需要更新的字段。')

    const payload = await updateNovelPlanArtifact(userId, req.params.artifactId, patch)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 一键导出产物下载：内存仓库 TTL 15 分钟，校验会话归属
router.get('/exports/:exportId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const stored = getStoredExport(req.params.exportId, userId)

    if (!stored) {
      res.status(404).json(buildError(requestId, 'EXPORT_NOT_FOUND', '导出文件不存在或已过期，请重新导出。'))
      return
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(stored.fileName)}`)
    res.status(200).send(stored.buffer)
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
