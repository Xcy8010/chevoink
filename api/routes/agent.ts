import { Router, type Request, type Response } from 'express'

import type {
  ApplyAgentArtifactRequest,
  ContinueChapterRequest,
  CreateAgentRunRequest,
  CreateAgentSessionRequest,
  DraftChapterRequest,
  ExecuteWorkspaceAgentRequest,
  GenerateAgentCoverPromptRequest,
  PlanChapterRequest,
  PolishSelectionRequest,
  ResolveAgentApprovalRequest,
    ResolveAgentQuestionRequest,
  ReviewContinuityRequest,
  RewriteSelectionRequest,
  StartAgentLoopRunRequest,
  UpdateAgentSessionRequest,
  UploadAgentAttachmentRequest,
} from '../../shared/contracts/index.js'
import { storeAgentAttachment } from '../lib/agent-attachment-storage.js'
import { requireSessionUserId } from '../lib/auth-session.js'
import { stopActiveRunsInSession } from '../lib/agent/loop.js'
import {
  continueLoopRun,
  createNovelPlanArtifact,
  deleteLoopSessionMessage,
  getRunEngine,
  listLoopSessionMessages,
  listNovelPlanArtifacts,
  resolveLoopRunApproval,
  resolveLoopRunQuestion,
  rollbackLoopSessionFromMessage,
  startLoopRun,
  stopLoopRun,
  streamLoopRun,
  updateNovelPlanArtifact,
} from '../lib/agent/run-service.js'
import {
  applyAgentArtifactData,
  createAgentRunData,
  createAgentSessionData,
  deleteAgentSessionData,
  deleteAgentRunData,
  executeAgentActionData,
  executeWorkspaceAgentData,
  getAgentRunData,
  listAgentArtifactsData,
  listAgentSessionHistoryData,
  listAgentSessionsData,
  rollbackAgentRunData,
  streamAgentRunData,
  updateAgentSessionData,
} from '../lib/agent-service.js'
import { buildError, buildSuccess, createRequestId } from '../lib/http.js'
import { sendRouteError } from '../lib/route-error.js'

const router = Router()

function writeSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
  ;(res as Response & { flush?: () => void }).flush?.()
}

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
  const body = (req.body ?? {}) as Partial<CreateAgentRunRequest & StartAgentLoopRunRequest>

  try {
    const userId = requireSessionUserId(req)

    // 新链路：不带 action（模型自主决策），入参 { sessionId, novelId, chapterId?, mode, prompt, selection? }
    if (!body.action) {
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
      return
    }

    if (!body.sessionId || !body.mode || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请完整填写运行参数。'))
      return
    }

    const payload = await createAgentRunData(userId, {
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      mode: body.mode,
      action: body.action,
      prompt: body.prompt.trim(),
      selectedText: body.selectedText,
      metadata: body.metadata,
      runtimeContext: body.runtimeContext,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/runs/:runId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await getAgentRunData(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.get('/runs/:runId/stream', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireSessionUserId(req)

    // 新链路：live/replay 同源，支持 Last-Event-ID 续传
    if ((await getRunEngine(userId, req.params.runId)) === 'loop') {
      const lastEventId = req.headers['last-event-id']
      const sinceQuery = typeof req.query.since === 'string' ? req.query.since : ''
      const sinceSeq = Number.parseInt(
        (typeof lastEventId === 'string' ? lastEventId : lastEventId?.[0]) ?? sinceQuery,
        10,
      )

      await streamLoopRun(userId, req.params.runId, Number.isFinite(sinceSeq) ? sinceSeq : 0, res)
      return
    }

    const events = await streamAgentRunData(userId, req.params.runId)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    for (const event of events) {
      writeSse(res, String(event.stage ?? 'message'), event)
    }

    res.end()
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

router.get('/runs/:runId/artifacts', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await listAgentArtifactsData(userId, req.params.runId)
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

router.delete('/runs/:runId', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await deleteAgentRunData(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/runs/:runId/rollback', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()

  try {
    const userId = requireSessionUserId(req)
    const payload = await rollbackAgentRunData(userId, req.params.runId)
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/artifacts/:artifactId/apply', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ApplyAgentArtifactRequest>

  try {
    const userId = requireSessionUserId(req)
    const payload = await applyAgentArtifactData(userId, req.params.artifactId, {
      strategy: body.strategy,
      chapterId: body.chapterId,
    })
    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/plan-chapter', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<PlanChapterRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和任务说明。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'planChapter',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      title: body.title,
      prompt: body.prompt.trim(),
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/draft-chapter', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<DraftChapterRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和任务说明。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'draftChapter',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      title: body.title,
      prompt: body.prompt.trim(),
      selectedText: body.selectedText,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/continue-chapter', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ContinueChapterRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'continueChapter',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      title: body.title,
      prompt: body.prompt,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/rewrite-selection', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<RewriteSelectionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.chapterId || !body.selectedText?.trim() || !body.instruction?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供完整的改写参数。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'rewriteSelection',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      selectedText: body.selectedText.trim(),
      instruction: body.instruction.trim(),
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/polish-selection', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<PolishSelectionRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.chapterId || !body.selectedText?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供完整的润色参数。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'polishSelection',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      selectedText: body.selectedText.trim(),
      prompt: body.prompt,
      instruction: body.instruction,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/review-continuity', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ReviewContinuityRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和审查要求。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'reviewContinuity',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      prompt: body.prompt.trim(),
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/generate-cover-prompt', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<GenerateAgentCoverPromptRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID。'))
      return
    }

    const payload = await executeAgentActionData(userId, {
      kind: 'generateCoverPrompt',
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      prompt: body.prompt,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    })

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

router.post('/actions/execute', async (req: Request, res: Response): Promise<void> => {
  const requestId = createRequestId()
  const body = (req.body ?? {}) as Partial<ExecuteWorkspaceAgentRequest>

  try {
    const userId = requireSessionUserId(req)
    if (!body.novelId || !body.prompt?.trim()) {
      res.status(400).json(buildError(requestId, 'VALIDATION_ERROR', '请提供作品 ID 和 Agent 指令。'))
      return
    }

    const acceptsEventStream = String(req.headers.accept ?? '').includes('text/event-stream')

    if (acceptsEventStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders?.()
    }

    const payload = await executeWorkspaceAgentData(userId, {
      novelId: body.novelId,
      sessionId: body.sessionId,
      chapterId: body.chapterId,
      prompt: body.prompt.trim(),
      selectedText: body.selectedText,
      actionHint: body.actionHint,
      novelTitle: body.novelTitle,
      novelSummary: body.novelSummary,
      chapterTitle: body.chapterTitle,
      chapterSummary: body.chapterSummary,
      chapterContent: body.chapterContent,
      genre: body.genre,
      protagonist: body.protagonist,
      tone: body.tone,
      stylePreference: body.stylePreference,
    }, acceptsEventStream
      ? {
          onProgress: (event) => {
            writeSse(res, String(event.stage ?? 'status'), {
              type: event.type ?? 'status',
              stage: event.stage,
              message: event.message,
              runId: event.runId ?? null,
              createdAt: event.createdAt,
              data: event.data ?? {},
            })
          },
        }
      : undefined)

    if (acceptsEventStream) {
      writeSse(res, 'result', {
        type: 'result',
        ...payload,
      })
      writeSse(res, 'done', {
        type: 'done',
      })
      res.end()
      return
    }

    res.status(200).json(buildSuccess(requestId, payload))
  } catch (error) {
    sendRouteError(res, requestId, error)
  }
})

export default router
