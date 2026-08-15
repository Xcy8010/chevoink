import { Router, type Request, type Response } from 'express'

import type {
  CreateAgentSessionRequest,
  ResolveAgentApprovalRequest,
    ResolveAgentQuestionRequest,
  StartAgentLoopRunRequest,
  UpdateAgentSessionRequest,
  UploadAgentAttachmentRequest,
} from '../../shared/contracts/index.js'
import { storeAgentAttachment } from '../lib/agent-attachment-storage.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { stopActiveRunsInSession } from '../lib/agent/loop.js'
import {
  continueLoopRun,
  createAgentSessionData,
  createNovelPlanArtifact,
  deleteAgentSessionData,
  deleteLoopSessionMessage,
  listAgentSessionHistoryData,
  listAgentSessionsData,
  listLoopSessionMessages,
  listNovelPlanArtifacts,
  resolveLoopRunApproval,
  resolveLoopRunQuestion,
  rollbackLoopSessionFromMessage,
  startLoopRun,
  stopLoopRun,
  streamLoopRun,
  updateAgentSessionData,
  updateNovelPlanArtifact,
} from '../lib/agent/run-service.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

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
  const body = (req.body ?? {}) as Partial<CreateAgentSessionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

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
  const body = (req.body ?? {}) as Partial<UpdateAgentSessionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.title?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供会话标题。'))
      return
    }

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
    const body = (req.body ?? {}) as Partial<UploadAgentAttachmentRequest>
    if (!body.kind || !body.name?.trim() || !body.dataUrl?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '附件参数不完整。'))
      return
    }

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
  const body = (req.body ?? {}) as Partial<StartAgentLoopRunRequest>

  try {
    const userId = requireSessionUserId(req)

    if (!body.sessionId || !body.novelId || !body.mode || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完整填写运行参数。'))
      return
    }

    const payload = await startLoopRun(userId, {
      sessionId: body.sessionId,
      novelId: body.novelId,
      chapterId: body.chapterId ?? null,
      // 全权限产品决策：模式选择 UI 已下线，后端恒 build 兜底（mode 管道保留，回退只需还原 UI）
      mode: 'build',
      prompt: body.prompt.trim(),
      selection: body.selection ?? null,
      attachments: body.attachments ?? [],
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
  const body = (req.body ?? {}) as Partial<ResolveAgentApprovalRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.callId || typeof body.approved !== 'boolean') {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供 callId 与 approved。'))
      return
    }

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
  const body = (req.body ?? {}) as Partial<ResolveAgentQuestionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.callId || typeof body.answer !== 'string' || !body.answer.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供 callId 与回答内容。'))
      return
    }

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
  const body = (req.body ?? {}) as { novelId?: unknown; title?: unknown }

  try {
    const userId = requireSessionUserId(req)
    const novelId = typeof body.novelId === 'string' ? body.novelId.trim() : ''
    if (!novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

    const payload = await createNovelPlanArtifact(
      userId,
      novelId,
      typeof body.title === 'string' ? body.title : undefined,
    )
    res.status(201).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

// 计划文件夹：改名/改正文，saved=false 从文件夹移除
router.patch('/plans/:artifactId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as { title?: unknown; content?: unknown; saved?: unknown }

  try {
    const userId = requireSessionUserId(req)
    const patch: { title?: string; content?: string; saved?: boolean } = {}
    if (typeof body.title === 'string') {
      patch.title = body.title
    }
    if (typeof body.content === 'string') {
      patch.content = body.content
    }
    if (typeof body.saved === 'boolean') {
      patch.saved = body.saved
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供需要更新的字段。'))
      return
    }

    const payload = await updateNovelPlanArtifact(userId, req.params.artifactId, patch)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
